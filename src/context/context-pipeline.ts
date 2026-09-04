import * as fs from 'fs';
import * as path from 'path';
import type { HarnessConfig, Stage, ContextFile, AgentProvider } from '../types.js';
import type { ContextOptimizationMetrics, ContextDocument, ContextOptimizationMeasurementBasis } from './types.js';
import { ContextScanner } from './context-scanner.js';
import { ContextPolicyEngine } from './context-policy-engine.js';
import { TokenCounter } from '../tokenization/token-counter.js';
import { NativeCompressionProvider } from '../compression/native-compression-provider.js';
import { ValidationPipeline } from '../validation/validation-pipeline.js';
import type { ValidationResult } from '../validation/validation-pipeline.js';
import { ContextCache } from '../cache/context-cache.js';
import { ProtectedSpanExtractor } from '../compression/protected-span-extractor.js';
import { ContextRecoveryRegistry } from './context-recovery-registry.js';
import { SemanticGrader } from '../validation/semantic-grader.js';
import { ContextDeduplicator } from './context-deduplicator.js';
import * as crypto from 'crypto';

export interface PreparedContextDelivery {
  sourcePath: string;
  strategy: 'attached' | 'path_reference';
  optimized: boolean;
  recoveryHandle?: string;
}

export interface PreparedContext {
  files: ContextFile[];
  contextFiles: ContextFile[];
  inputHashes: Record<string, string>;
  metrics: ContextOptimizationMetrics;
  delivery: PreparedContextDelivery[];
}

export interface ContextPipeline {
  prepare(input: {
    stage: Stage;
    runId: string;
    attempt: number;
    cwd: string;
    runDir: string;
  }): Promise<PreparedContext>;
}

export class ContextPipelineImpl implements ContextPipeline {
  private config: HarnessConfig;
  private agentProvider: AgentProvider;
  private cache: ContextCache;
  private recoveryRegistry: ContextRecoveryRegistry;
  private grader: SemanticGrader;

  constructor(config: HarnessConfig, agentProvider: AgentProvider) {
    this.config = config;
    this.agentProvider = agentProvider;
    this.cache = new ContextCache(process.cwd());
    this.recoveryRegistry = new ContextRecoveryRegistry(process.cwd());
    this.grader = new SemanticGrader(agentProvider);
  }

  public async prepare(input: {
    stage: Stage;
    runId: string;
    attempt: number;
    cwd: string;
    runDir: string;
  }): Promise<PreparedContext> {
    const { stage, runId, attempt, cwd, runDir } = input;
    const optConfig = this.config.context_optimization;

    const metrics = createEmptyOptimizationMetrics();

    const contextFiles: ContextFile[] = [];
    const inputHashes: Record<string, string> = {};
    const delivery: PreparedContextDelivery[] = [];

    // 1. Identify context files for the current stage
    const candidatePaths: string[] = [];
    
    const globalRulesPath = path.join(cwd, '.codex', 'global-rules.md');
    if (fs.existsSync(globalRulesPath)) candidatePaths.push(globalRulesPath);

    const agentsMdPath = path.join(cwd, 'AGENTS.md');
    if (fs.existsSync(agentsMdPath)) candidatePaths.push(agentsMdPath);

    if (stage === 'implementing' || stage === 'testing' || stage === 'reviewing') {
      const planPath = path.join(runDir, 'plan.md');
      if (fs.existsSync(planPath)) candidatePaths.push(planPath);
    }
    if (stage === 'testing' || stage === 'reviewing') {
      const implPath = path.join(runDir, 'implementation.md');
      if (fs.existsSync(implPath)) candidatePaths.push(implPath);
    }
    if (stage === 'reviewing') {
      const testResultsPath = path.join(runDir, 'test-results.md');
      if (fs.existsSync(testResultsPath)) candidatePaths.push(testResultsPath);
    }

    if (candidatePaths.length === 0) {
      return { files: contextFiles, contextFiles, inputHashes, metrics, delivery };
    }

    const scanner = new ContextScanner(cwd);
    const policyEngine = new ContextPolicyEngine(optConfig);
    const compressor = new NativeCompressionProvider(this.agentProvider);

    const documents = scanner.scan(candidatePaths);

    // Pre-calculate total original tokens to make budget-based decisions
    let totalOriginalTokens = 0;
    const docTokens = new Map<string, number>();
    for (const doc of documents) {
      const tokens = TokenCounter.countTokens(doc.content);
      docTokens.set(doc.hash, tokens);
      totalOriginalTokens += tokens;
    }

    const STAGE_TO_AGENT: Record<Stage, string> = {
      planning:     'planner',
      implementing: 'implementer',
      testing:      'tester',
      reviewing:    'reviewer',
    };
    const agentName = STAGE_TO_AGENT[stage];
    const agentConfig = this.config.agents[agentName as keyof HarnessConfig['agents']];
    const budget = agentConfig?.context_budget;
    const exceedsBudget = !!(budget && totalOriginalTokens > budget);
    const deduplicator = new ContextDeduplicator();

    for (const doc of documents) {
      inputHashes[doc.relativePath] = doc.hash;
      const originalTokens = docTokens.get(doc.hash) || TokenCounter.countTokens(doc.content);
      metrics.sourceTokens += originalTokens;
      metrics.originalTokens += originalTokens;

      // Check if optimization is enabled and applicable
      const decision = policyEngine.getDecision(doc);
      let treatment = decision.treatment;

      if (exceedsBudget && treatment !== 'pass_through' && treatment !== 'exclude') {
        if (treatment === 'light') {
          treatment = 'standard';
        } else if (treatment === 'standard') {
          treatment = 'aggressive';
        }
      }

      if (
        !optConfig ||
        !optConfig.enabled ||
        treatment === 'pass_through' ||
        treatment === 'exclude' ||
        originalTokens < optConfig.minimum_tokens
      ) {
        const finalContent = deduplicator.deduplicateDocument(doc.content);
        contextFiles.push({
          path: doc.path,
          content: finalContent,
        });
        delivery.push({
          sourcePath: doc.path,
          strategy: 'attached',
          optimized: finalContent !== doc.content,
        });
        continue;
      }

      // We should optimize this document
      let finalContent = doc.content;
      let finalTokens = originalTokens;
      let usedCache = false;

      const cacheKey = this.cache.computeKey(
        doc.content,
        compressor.name,
        treatment,
        'v1.0' // prompt version
      );

      // Check Cache
      if (optConfig.cache_enabled) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          const snapshot = deduplicator.snapshot();
          const deduplicatedContent = deduplicator.deduplicateDocument(cached.compressedContent);
          const valResult = await ValidationPipeline.validateAsync(
            doc,
            deduplicatedContent,
            optConfig.minimum_savings_percent,
            optConfig.semantic_validation,
            this.grader
          );
          applyValidationUsage(metrics, valResult);

          if (valResult.valid) {
            finalContent = deduplicatedContent;
            finalTokens = TokenCounter.countTokens(finalContent);
            metrics.cacheHits++;
            usedCache = true;
            this.recoveryRegistry.register(crypto.createHash('sha256').update(finalContent).digest('hex'), doc.path);
          } else if (optConfig.fail_open) {
            deduplicator.restore(snapshot);
            metrics.fallbacks++;
            finalContent = doc.content;
            finalTokens = originalTokens;
            usedCache = true;
          } else {
            deduplicator.restore(snapshot);
            throw new Error(
              `Cached context optimization validation failed for ${doc.relativePath}: ${valResult.errors.join(', ')}`
            );
          }
        }
      }

      if (!usedCache) {
        metrics.cacheMisses++;
        metrics.providerCalls++;

        // Perform compression
        const protectedSpans = ProtectedSpanExtractor.extract(doc.content);
        const compResult = await compressor.compress({
          document: doc,
          mode: treatment as any,
          protectedSpans,
        });

        if (compResult.usage) {
          metrics.compressionInputTokens += compResult.usage.inputTokens;
          metrics.compressionOutputTokens += compResult.usage.outputTokens;
          metrics.measurementBasis = mergeMeasurementBasis(metrics.measurementBasis, compResult.usage.measurementBasis);
        }

        if (compResult.status === 'compressed') {
          const snapshot = deduplicator.snapshot();
          const candidateContent = deduplicator.deduplicateDocument(compResult.content);
          const candidateTokens = TokenCounter.countTokens(candidateContent);
          const valResult = await ValidationPipeline.validateAsync(
            doc,
            candidateContent,
            optConfig.minimum_savings_percent,
            optConfig.semantic_validation,
            this.grader
          );
          applyValidationUsage(metrics, valResult);

          if (valResult.valid) {
            finalContent = candidateContent;
            finalTokens = candidateTokens;
            this.recoveryRegistry.register(crypto.createHash('sha256').update(finalContent).digest('hex'), doc.path);

            // Save to Cache
            if (optConfig.cache_enabled) {
              this.cache.set(
                cacheKey,
                {
                  sourceHash: doc.hash,
                  provider: compressor.name,
                  policy: treatment,
                  promptVersion: 'v1.0',
                  originalTokens,
                  compressedTokens: finalTokens,
                  createdAt: new Date().toISOString(),
                },
                finalContent
              );
            }
          } else {
            deduplicator.restore(snapshot);
            metrics.fallbacks++;
            if (optConfig.fail_open) {
              finalContent = doc.content;
              finalTokens = originalTokens;
            } else {
              throw new Error(
                `Context optimization validation failed for ${doc.relativePath}: ${valResult.errors.join(', ')}`
              );
            }
          }
        } else {
          // Compression failed, fall back
          metrics.fallbacks++;
          if (optConfig.fail_open) {
            finalContent = doc.content;
            finalTokens = originalTokens;
          } else {
            throw new Error(`Context optimization failed for ${doc.relativePath}: ${compResult.diagnostics.join(', ')}`);
          }
        }
      }

      contextFiles.push({
        path: doc.path,
        content: finalContent,
      });
      delivery.push({
        sourcePath: doc.path,
        strategy: 'attached',
        optimized: finalContent !== doc.content,
      });
    }

    metrics.deliveredTokens = contextFiles.reduce(
      (total, file) => total + TokenCounter.countTokens(file.content),
      0
    );
    metrics.grossTokensSaved = metrics.sourceTokens - metrics.deliveredTokens;
    metrics.optimizationOverheadTokens =
      metrics.compressionInputTokens +
      metrics.compressionOutputTokens +
      metrics.validationInputTokens +
      metrics.validationOutputTokens;
    metrics.netTokensSaved = metrics.grossTokensSaved - metrics.optimizationOverheadTokens;
    metrics.netSavingsPercent = metrics.sourceTokens > 0
      ? (metrics.netTokensSaved / metrics.sourceTokens) * 100
      : 0;
    metrics.breakEvenUses = Math.ceil(
      metrics.optimizationOverheadTokens / Math.max(metrics.grossTokensSaved, 1)
    );
    metrics.originalTokens = metrics.sourceTokens;
    metrics.optimizedTokens = metrics.deliveredTokens;
    metrics.savedTokens = metrics.grossTokensSaved;
    metrics.savingsPercent = metrics.sourceTokens > 0 
      ? (metrics.grossTokensSaved / metrics.sourceTokens) * 100 
      : 0;

    return {
      files: contextFiles,
      contextFiles,
      inputHashes,
      metrics,
      delivery,
    };
  }
}

function createEmptyOptimizationMetrics(): ContextOptimizationMetrics {
  return {
    sourceTokens: 0,
    deliveredTokens: 0,
    grossTokensSaved: 0,
    compressionInputTokens: 0,
    compressionOutputTokens: 0,
    validationInputTokens: 0,
    validationOutputTokens: 0,
    optimizationOverheadTokens: 0,
    netTokensSaved: 0,
    netSavingsPercent: 0,
    cacheHits: 0,
    cacheMisses: 0,
    providerCalls: 0,
    fallbacks: 0,
    measurementBasis: 'tokenizer',
    breakEvenUses: 0,
    originalTokens: 0,
    optimizedTokens: 0,
    savedTokens: 0,
    savingsPercent: 0,
  };
}

function applyValidationUsage(metrics: ContextOptimizationMetrics, result: ValidationResult): void {
  metrics.providerCalls += result.providerCalls;
  if (!result.usage) {
    return;
  }

  metrics.validationInputTokens += result.usage.inputTokens;
  metrics.validationOutputTokens += result.usage.outputTokens;
  metrics.measurementBasis = mergeMeasurementBasis(metrics.measurementBasis, result.usage.measurementBasis);
}

function mergeMeasurementBasis(
  current: ContextOptimizationMeasurementBasis,
  next: ContextOptimizationMeasurementBasis
): ContextOptimizationMeasurementBasis {
  if (current === 'estimate' || next === 'estimate') {
    return 'estimate';
  }

  if (current === 'provider_reported' || next === 'provider_reported') {
    return 'provider_reported';
  }

  return 'tokenizer';
}

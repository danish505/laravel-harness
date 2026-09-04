import * as fs from 'fs';
import * as path from 'path';
import type { HarnessConfig, Stage, ContextFile, AgentProvider } from '../types.js';
import type { ContextOptimizationMetrics, ContextDocument } from './types.js';
import { ContextScanner } from './context-scanner.js';
import { ContextPolicyEngine } from './context-policy-engine.js';
import { TokenCounter } from '../tokenization/token-counter.js';
import { NativeCompressionProvider } from '../compression/native-compression-provider.js';
import { ValidationPipeline } from '../validation/validation-pipeline.js';
import { ContextCache } from '../cache/context-cache.js';
import { ProtectedSpanExtractor } from '../compression/protected-span-extractor.js';
import { ContextRecoveryRegistry } from './context-recovery-registry.js';
import { SemanticGrader } from '../validation/semantic-grader.js';
import { ContextDeduplicator } from './context-deduplicator.js';
import * as crypto from 'crypto';

export interface ContextPipeline {
  prepare(input: {
    stage: Stage;
    runId: string;
    attempt: number;
    cwd: string;
    runDir: string;
  }): Promise<{
    contextFiles: ContextFile[];
    inputHashes: Record<string, string>;
    metrics: ContextOptimizationMetrics;
  }>;
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
  }): Promise<{
    contextFiles: ContextFile[];
    inputHashes: Record<string, string>;
    metrics: ContextOptimizationMetrics;
  }> {
    const { stage, runId, attempt, cwd, runDir } = input;
    const optConfig = this.config.context_optimization;

    const metrics: ContextOptimizationMetrics = {
      originalTokens: 0,
      optimizedTokens: 0,
      savedTokens: 0,
      savingsPercent: 0,
      cacheHits: 0,
      cacheMisses: 0,
      providerCalls: 0,
      fallbacks: 0,
    };

    const contextFiles: ContextFile[] = [];
    const inputHashes: Record<string, string> = {};

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
      return { contextFiles, inputHashes, metrics };
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

    for (const doc of documents) {
      inputHashes[doc.relativePath] = doc.hash;
      const originalTokens = docTokens.get(doc.hash) || TokenCounter.countTokens(doc.content);
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
        // Pass-through verbatim
        contextFiles.push({
          path: doc.path,
          content: doc.content,
        });
        metrics.optimizedTokens += originalTokens;
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
          finalContent = cached.compressedContent;
          finalTokens = cached.compressedTokens;
          metrics.cacheHits++;
          usedCache = true;
          this.recoveryRegistry.register(crypto.createHash('sha256').update(finalContent).digest('hex'), doc.path);
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

        if (compResult.status === 'compressed') {
          // Validate
          const valResult = await ValidationPipeline.validateAsync(
            doc,
            compResult.content,
            optConfig.minimum_savings_percent,
            optConfig.semantic_validation,
            this.grader
          );

          if (valResult.valid) {
            finalContent = compResult.content;
            finalTokens = compResult.compressedTokens;
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
            // Validation failed, record fallback
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
      metrics.optimizedTokens += finalTokens;
    }

    metrics.savedTokens = metrics.originalTokens - metrics.optimizedTokens;
    metrics.savingsPercent = metrics.originalTokens > 0 
      ? (metrics.savedTokens / metrics.originalTokens) * 100 
      : 0;

    // Deduplicate duplicate blocks/instructions across prepared context files
    const deduplicator = new ContextDeduplicator();
    const deduplicatedFiles = contextFiles.map((file) => ({
      path: file.path,
      content: deduplicator.deduplicateDocument(file.content),
    }));

    return {
      contextFiles: deduplicatedFiles,
      inputHashes,
      metrics,
    };
  }
}

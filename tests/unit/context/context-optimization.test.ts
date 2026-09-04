import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TokenCounter } from '../../../src/tokenization/token-counter.js';
import { ContextScanner } from '../../../src/context/context-scanner.js';
import { ContextPolicyEngine } from '../../../src/context/context-policy-engine.js';
import { ProtectedSpanExtractor } from '../../../src/compression/protected-span-extractor.js';
import { ValidationPipeline } from '../../../src/validation/validation-pipeline.js';
import { ContextCache } from '../../../src/cache/context-cache.js';
import { NativeCompressionProvider } from '../../../src/compression/native-compression-provider.js';
import { FakeProvider } from '../../../src/providers/fake-provider.js';
import { ContextRecoveryRegistry } from '../../../src/context/context-recovery-registry.js';
import { SemanticGrader } from '../../../src/validation/semantic-grader.js';
import { ContextDeduplicator } from '../../../src/context/context-deduplicator.js';
import { ContextPipelineImpl } from '../../../src/context/context-pipeline.js';
import type { AgentProvider, HarnessConfig } from '../../../src/types.js';
import type { ContextDocument } from '../../../src/context/types.js';

describe('Context Optimization (Phase 1 & 2)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-context-opt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('TokenCounter', () => {
    it('correctly counts tokens in text and code blocks', () => {
      const text = 'Hello world, this is a plain prose string.';
      const tokens = TokenCounter.countTokens(text);
      expect(tokens).toBeGreaterThan(0);

      const withCode = 'Prose before\n```php\necho "hello";\n```\nProse after';
      const tokensWithCode = TokenCounter.countTokens(withCode);
      expect(tokensWithCode).toBeGreaterThan(tokens);
    });
  });

  describe('ContextScanner & PolicyEngine', () => {
    it('correctly scans files and assigns default policies', () => {
      const rulesPath = path.join(tempDir, 'global-rules.md');
      fs.writeFileSync(rulesPath, '# Rules\nAlways do X.\nNever run migrations in production.', 'utf8');

      const scanner = new ContextScanner(tempDir);
      const doc = scanner.loadFile(rulesPath);

      expect(doc).not.toBeNull();
      expect(doc!.type).toBe('conventions');
      expect(doc!.sizeBytes).toBeGreaterThan(0);

      const policyEngine = new ContextPolicyEngine({
        enabled: true,
        provider: 'native',
        mode: 'standard',
        minimum_tokens: 500,
        minimum_savings_percent: 20,
        maximum_file_size_kb: 500,
        fail_open: true,
        semantic_validation: true,
        cache_enabled: true,
        retain_original_reference: true,
      });

      const decision = policyEngine.getDecision(doc!);
      expect(decision.treatment).toBe('light');
    });

    it('respects frontmatter overrides', () => {
      const overridePath = path.join(tempDir, 'override.md');
      fs.writeFileSync(
        overridePath,
        '---\ncontext:\n  compression: aggressive\n---\n# Architecture\nVerbose description.',
        'utf8'
      );

      const scanner = new ContextScanner(tempDir);
      const doc = scanner.loadFile(overridePath);

      expect(doc).not.toBeNull();
      expect(doc!.frontmatter).toBeDefined();
      expect(doc!.frontmatter!.context.compression).toBe('aggressive');

      const policyEngine = new ContextPolicyEngine({
        enabled: true,
        provider: 'native',
        mode: 'standard',
        minimum_tokens: 500,
        minimum_savings_percent: 20,
        maximum_file_size_kb: 500,
        fail_open: true,
        semantic_validation: true,
        cache_enabled: true,
        retain_original_reference: true,
      });

      const decision = policyEngine.getDecision(doc!);
      expect(decision.treatment).toBe('aggressive');
    });
  });

  describe('ProtectedSpanExtractor', () => {
    it('identifies headings, code blocks, inline code, and safety rules', () => {
      const text = [
        '# Main Heading',
        'Check out `config.yaml` and /app/Http/Controllers/ExampleController.php.',
        'Please run `vendor/bin/phpunit`.',
        '```typescript',
        'const x = 42;',
        '```',
      ].join('\n');

      const spans = ProtectedSpanExtractor.extract(text);

      const headingSpan = spans.find((s) => s.type === 'heading');
      const inlineCodeSpan = spans.find((s) => s.type === 'inline_code');
      const codeBlockSpan = spans.find((s) => s.type === 'code_block');
      const pathSpan = spans.find((s) => s.type === 'path');

      expect(headingSpan).toBeDefined();
      expect(headingSpan!.text).toBe('# Main Heading');

      expect(inlineCodeSpan).toBeDefined();
      expect(inlineCodeSpan!.text).toBe('`config.yaml`');

      expect(pathSpan).toBeDefined();
      expect(pathSpan!.text).toBe('/app/Http/Controllers/ExampleController.php');

      expect(codeBlockSpan).toBeDefined();
      expect(codeBlockSpan!.text).toContain('```typescript');
    });
  });

  describe('ValidationPipeline', () => {
    const originalDoc: ContextDocument = {
      path: '/mock/rules.md',
      relativePath: 'rules.md',
      content: [
        '# Global Rules',
        'Never run migrations in production.',
        'Please use `/app/Models/User.php`.',
        '```php',
        'echo "hello";',
        '```',
      ].join('\n'),
      hash: 'hash123',
      sizeBytes: 150,
      type: 'conventions',
    };

    it('passes when headings and critical spans are preserved in smaller output', () => {
      const verboseDoc: ContextDocument = {
        ...originalDoc,
        content: [
          originalDoc.content,
          'This explanatory filler is intentionally verbose and removable. '.repeat(20),
        ].join('\n'),
      };
      const goodCompressed = [
        '# Global Rules',
        'Never run migrations in production.',
        'Use `/app/Models/User.php`.',
        '```php',
        'echo "hello";',
        '```',
      ].join('\n');

      const result = ValidationPipeline.validate(verboseDoc, goodCompressed, 5);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when optimized output is larger or unchanged', () => {
      const unchanged = ValidationPipeline.validate(originalDoc, originalDoc.content, 0);
      const larger = ValidationPipeline.validate(originalDoc, `${originalDoc.content}\nExtra content that makes this larger.`, 0);

      expect(unchanged.valid).toBe(false);
      expect(unchanged.errors).toContain('Optimized output is not smaller than original');
      expect(larger.valid).toBe(false);
      expect(larger.errors).toContain('Optimized output is not smaller than original');
    });

    it('fails when token savings are below the configured threshold', () => {
      const verboseDoc: ContextDocument = {
        ...originalDoc,
        content: `${originalDoc.content}\n${'Removable filler. '.repeat(10)}`,
      };
      const slightlySmaller = `${originalDoc.content}\n${'Removable filler. '.repeat(6)}`;

      const result = ValidationPipeline.validate(verboseDoc, slightlySmaller, 50);
      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes('did not meet minimum threshold'))).toBe(true);
    });

    it('fails when headings are removed', () => {
      const badCompressed = [
        'Never run migrations in production.',
        'Use `/app/Models/User.php`.',
        '```php',
        'echo "hello";',
        '```',
      ].join('\n');

      const result = ValidationPipeline.validate(originalDoc, badCompressed, 5);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Heading structural loss');
    });

    it('fails when negation constraint word count decreases', () => {
      const badCompressed = [
        '# Global Rules',
        'Run migrations in production.',
        'Use `/app/Models/User.php`.',
        '```php',
        'echo "hello";',
        '```',
      ].join('\n');

      const result = ValidationPipeline.validate(originalDoc, badCompressed, 5);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Constraint violation'))).toBe(true);
    });
  });

  describe('ContextCache', () => {
    it('sets and retrieves cache entries content-addressably', () => {
      const cache = new ContextCache(tempDir);
      const key = cache.computeKey('source contents', 'native', 'standard', 'v1.0');

      const entry = {
        sourceHash: 'source_hash_abc',
        provider: 'native',
        policy: 'standard',
        promptVersion: 'v1.0',
        originalTokens: 100,
        compressedTokens: 60,
        createdAt: new Date().toISOString(),
      };

      cache.set(key, entry, '# Compressed output');

      const retrieved = cache.get(key);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.compressedContent).toBe('# Compressed output');
      expect(retrieved!.originalTokens).toBe(100);
      expect(retrieved!.compressedTokens).toBe(60);
    });
  });

  describe('NativeCompressionProvider', () => {
    it('produces deterministic compressed output in test/fake environments', async () => {
      const doc: ContextDocument = {
        path: '/mock/doc.md',
        relativePath: 'doc.md',
        content: '# Heading\n' + 'a'.repeat(60) + '\n- [ ] criterion\n' + 'b'.repeat(60),
        hash: 'hash999',
        sizeBytes: 130,
        type: 'conventions',
      };

      const fakeAgent = new FakeProvider();
      const provider = new NativeCompressionProvider(fakeAgent);

      const result = await provider.compress({
        document: doc,
        mode: 'standard',
        protectedSpans: [],
      });

      expect(result.status).toBe('compressed');
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeGreaterThan(0);
      expect(result.content).toContain('[compressed]');
    });
  });

  describe('ContextRecoveryRegistry', () => {
    it('registers and retrieves original paths', () => {
      const registry = new ContextRecoveryRegistry(tempDir);
      
      registry.register('comp_hash_123', '/absolute/path/to/original.md');
      
      const retrieved = registry.getOriginalPath('comp_hash_123');
      expect(retrieved).toBe('/absolute/path/to/original.md');
    });

    it('returns null for unregistered hashes', () => {
      const registry = new ContextRecoveryRegistry(tempDir);
      
      const retrieved = registry.getOriginalPath('unknown_hash');
      expect(retrieved).toBeNull();
    });
  });

  describe('SemanticGrader & validateAsync', () => {
    const originalDoc: ContextDocument = {
      path: '/mock/rules.md',
      relativePath: 'rules.md',
      content: [
        '# Global Rules',
        'Never run migrations in production.',
      ].join('\n'),
      hash: 'hash123',
      sizeBytes: 150,
      type: 'conventions',
    };

    it('grades semantic equivalence correctly in test environment', async () => {
      const fakeAgent = new FakeProvider();
      const grader = new SemanticGrader(fakeAgent);

      const res = await grader.grade(originalDoc, '# Global Rules\nNever run migrations.');
      expect(res.score).toBe(9);
      expect(res.reasoning).toContain('Mock semantic grader approved');
    });

    it('runs validateAsync successfully', async () => {
      const fakeAgent = new FakeProvider();
      const grader = new SemanticGrader(fakeAgent);
      const verboseDoc: ContextDocument = {
        ...originalDoc,
        content: `${originalDoc.content}\n${'Removable details. '.repeat(20)}`,
      };

      const goodCompressed = [
        '# Global Rules',
        'Never run migrations in production.',
      ].join('\n');

      const result = await ValidationPipeline.validateAsync(verboseDoc, goodCompressed, 5, true, grader);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('ContextPipeline metrics', () => {
    function optimizationConfig(): HarnessConfig {
      return {
        version: 2,
        profile: 'generic',
        context_optimization: {
          enabled: true,
          provider: 'native',
          mode: 'standard',
          minimum_tokens: 1,
          minimum_savings_percent: 1,
          maximum_file_size_kb: 500,
          fail_open: true,
          semantic_validation: false,
          cache_enabled: false,
          retain_original_reference: true,
        },
        workflow: { max_attempts: 1, plan_approval: 'automatic', review_approval: 'automatic' },
        agents: {},
        quality_gates: { require_tests: true, require_clean_secrets_scan: true, max_changed_files: 25 },
        budget: { max_runtime_minutes: 45, max_estimated_cost_usd: 10 },
        provider: 'fake',
      };
    }

    it('reports gross, overhead, and net token savings separately', async () => {
      const provider = new FakeProvider();
      fs.writeFileSync(
        path.join(tempDir, 'AGENTS.md'),
        `# Rules\n\n${'This removable explanatory sentence is intentionally verbose and repetitive. '.repeat(40)}`,
        'utf8'
      );

      const pipeline = new ContextPipelineImpl(optimizationConfig(), provider);
      const result = await pipeline.prepare({
        stage: 'planning',
        runId: 'run-1',
        attempt: 1,
        cwd: tempDir,
        runDir: tempDir,
      });

      expect(result.metrics.sourceTokens).toBeGreaterThan(0);
      expect(result.metrics.deliveredTokens).toBeGreaterThan(0);
      expect(result.metrics.grossTokensSaved).toBe(result.metrics.sourceTokens - result.metrics.deliveredTokens);
      expect(result.metrics.optimizationOverheadTokens).toBe(0);
      expect(result.metrics.netTokensSaved).toBe(result.metrics.grossTokensSaved);
      expect(result.metrics.originalTokens).toBe(result.metrics.sourceTokens);
      expect(result.metrics.savedTokens).toBe(result.metrics.grossTokensSaved);
    });

    it('reports negative net savings when compression overhead exceeds gross savings', async () => {
      class CostlyCompressionProvider implements AgentProvider {
        async execute() {
          return {
            status: 'success' as const,
            content: '# Rules\n\nShort.',
            usage: { inputTokens: 1000, outputTokens: 500 },
          };
        }
      }

      fs.writeFileSync(
        path.join(tempDir, 'AGENTS.md'),
        `# Rules\n\n${'This removable explanatory sentence is intentionally verbose and repetitive. '.repeat(40)}`,
        'utf8'
      );

      const pipeline = new ContextPipelineImpl(optimizationConfig(), new CostlyCompressionProvider());
      const result = await pipeline.prepare({
        stage: 'planning',
        runId: 'run-1',
        attempt: 1,
        cwd: tempDir,
        runDir: tempDir,
      });

      expect(result.metrics.grossTokensSaved).toBeGreaterThan(0);
      expect(result.metrics.optimizationOverheadTokens).toBe(1500);
      expect(result.metrics.netTokensSaved).toBeLessThan(0);
      expect(result.metrics.measurementBasis).toBe('provider_reported');
    });
  });

  describe('ContextDeduplicator', () => {
    it('does not collide punctuation-sensitive instructions', () => {
      const allowForce = 'Run `php artisan migrate --force` only after explicit approval and documented rollback review.';
      const denyForce = 'Run `php artisan migrate --no-force` only after explicit approval and documented rollback review.';
      const dedup = new ContextDeduplicator();

      const dedup1 = dedup.deduplicateDocument(allowForce);
      const dedup2 = dedup.deduplicateDocument(denyForce);

      expect(dedup1).toContain('--force');
      expect(dedup2).toContain('--no-force');
    });

    it('removes repeated duplicate blocks but keeps headings and checklist items', () => {
      const doc1 = [
        '# Global Guidelines',
        'Always make minimal surgical changes that fully address requirements.',
        '- [ ] Implement the feature',
      ].join('\n\n');

      const doc2 = [
        '# Global Guidelines', // heading: keep
        'Always make minimal surgical changes that fully address requirements.', // duplicate paragraph: omit
        '- [ ] Implement the feature', // checkbox: keep
      ].join('\n\n');

      const dedup = new ContextDeduplicator();
      const dedup1 = dedup.deduplicateDocument(doc1);
      const dedup2 = dedup.deduplicateDocument(doc2);

      expect(dedup1).toContain('Always make minimal');
      expect(dedup2).toContain('# Global Guidelines');
      expect(dedup2).not.toContain('Always make minimal surgical changes that fully address requirements.');
      expect(dedup2).toContain('- [ ] Implement the feature');
    });
  });
});

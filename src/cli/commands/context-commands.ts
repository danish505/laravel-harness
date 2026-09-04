import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, findConfigPath } from '../../config/loader.js';
import { ContextCache } from '../../cache/context-cache.js';
import { ContextRecoveryRegistry } from '../../context/context-recovery-registry.js';
import { ContextScanner } from '../../context/context-scanner.js';
import { ContextPolicyEngine } from '../../context/context-policy-engine.js';
import { NativeCompressionProvider } from '../../compression/native-compression-provider.js';
import { FakeProvider } from '../../providers/fake-provider.js';
import { TokenCounter } from '../../tokenization/token-counter.js';
import { HARNESS_DIR_NAME } from '../../constants.js';

export function contextClearCommand(cwd: string): void {
  const cache = new ContextCache(cwd);
  cache.clear();

  // Also clear recovery registry
  const registryFile = path.join(cwd, HARNESS_DIR_NAME, 'cache', 'context', 'recovery-registry.json');
  if (fs.existsSync(registryFile)) {
    fs.unlinkSync(registryFile);
  }

  console.log('✅ Context cache and recovery registry cleared successfully.');
}

export function contextStatusCommand(cwd: string): void {
  const configPath = findConfigPath(cwd);
  const { config } = loadConfig(configPath);
  const optConfig = config.context_optimization;

  const cacheDir = path.join(cwd, HARNESS_DIR_NAME, 'cache', 'context');
  const manifestsDir = path.join(cacheDir, 'manifests');
  const artifactsDir = path.join(cacheDir, 'artifacts');

  let manifestCount = 0;
  let artifactCount = 0;
  let totalCachedBytes = 0;

  if (fs.existsSync(manifestsDir)) {
    manifestCount = fs.readdirSync(manifestsDir).filter(f => f.endsWith('.json')).length;
  }
  if (fs.existsSync(artifactsDir)) {
    const artifacts = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.md'));
    artifactCount = artifacts.length;
    for (const art of artifacts) {
      const stat = fs.statSync(path.join(artifactsDir, art));
      totalCachedBytes += stat.size;
    }
  }

  const registry = new ContextRecoveryRegistry(cwd);
  const registryFile = path.join(cwd, HARNESS_DIR_NAME, 'cache', 'context', 'recovery-registry.json');
  let registeredCount = 0;
  if (fs.existsSync(registryFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      registeredCount = Object.keys(data).length;
    } catch {
      // ignore
    }
  }

  console.log(`\n📊 Largentic Context Optimization Status`);
  console.log(`────────────────────────────────────────`);
  console.log(`Global Enabled     : ${optConfig?.enabled ? 'Yes' : 'No'}`);
  console.log(`Active Provider    : ${optConfig?.provider || 'native'}`);
  console.log(`Aggressiveness Mode: ${optConfig?.mode || 'standard'}`);
  console.log(`Cached Manifests   : ${manifestCount}`);
  console.log(`Cached Artifacts   : ${artifactCount} (${(totalCachedBytes / 1024).toFixed(1)} KB)`);
  console.log(`Recovery Mappings  : ${registeredCount} active linkages\n`);
}

export async function contextCompressCommand(cwd: string, filePath: string | undefined, options: { all?: boolean }): Promise<void> {
  const configPath = findConfigPath(cwd);
  const { config } = loadConfig(configPath);
  const optConfig = config.context_optimization;

  const scanner = new ContextScanner(cwd);
  const policyEngine = new ContextPolicyEngine(optConfig);
  
  // Use FakeProvider for CLI compression unless configured otherwise (to be safe in manual runs)
  const fakeAgent = new FakeProvider();
  const compressor = new NativeCompressionProvider(fakeAgent);

  const candidateFiles = options.all 
    ? [
        '.codex/global-rules.md',
        'AGENTS.md',
        '.largentic/task.md',
      ].filter(f => fs.existsSync(path.join(cwd, f)))
    : filePath ? [filePath] : [];

  if (candidateFiles.length === 0) {
    console.log('❌ No files specified for compression. Specify a path or use --all.');
    return;
  }

  console.log(`\n⚡ Compressing ${candidateFiles.length} context file(s)...`);

  for (const fp of candidateFiles) {
    const doc = scanner.loadFile(fp);
    if (!doc) {
      console.log(`  ⚠ File not found: ${fp}`);
      continue;
    }

    const decision = policyEngine.getDecision(doc);
    const originalTokens = TokenCounter.countTokens(doc.content);

    const result = await compressor.compress({
      document: doc,
      mode: decision.treatment as any,
      protectedSpans: [],
    });

    if (result.status === 'compressed') {
      const pct = (((originalTokens - result.compressedTokens) / originalTokens) * 100).toFixed(1);
      console.log(`\n✓ Compressed ${doc.relativePath}:`);
      console.log(`  Original tokens: ${originalTokens}`);
      console.log(`  Optimized tokens: ${result.compressedTokens} (Saved ${pct}%)`);
      console.log(`\nPreview:`);
      console.log(`────────────────────────────────────────`);
      console.log(result.content.slice(0, 400) + (result.content.length > 400 ? '\n... [truncated] ...' : ''));
      console.log(`────────────────────────────────────────`);
    } else {
      console.log(`  ❌ Compression failed for ${doc.relativePath}: ${result.diagnostics.join(', ')}`);
    }
  }
}

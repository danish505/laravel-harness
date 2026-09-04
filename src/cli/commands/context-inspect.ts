import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, findConfigPath } from '../../config/loader.js';
import { ContextScanner } from '../../context/context-scanner.js';
import { ContextPolicyEngine } from '../../context/context-policy-engine.js';
import { TokenCounter } from '../../tokenization/token-counter.js';

export function contextInspectCommand(cwd: string): void {
  const configPath = findConfigPath(cwd);
  const { config } = loadConfig(configPath);
  const optConfig = config.context_optimization;

  const scanner = new ContextScanner(cwd);
  const policyEngine = new ContextPolicyEngine(optConfig);

  // Common files to inspect
  const candidateFiles = [
    '.codex/global-rules.md',
    'AGENTS.md',
    '.codex/agents/planner.toml',
    '.codex/agents/implementer.toml',
    '.codex/agents/tester.toml',
    '.codex/agents/reviewer.toml',
    '.largentic/task.md',
  ];

  // Also include any md files in current directory or children (excluding node_modules)
  const globMarkdownFiles = (dir: string): string[] => {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          results = results.concat(globMarkdownFiles(filePath));
        }
      } else if (file.endsWith('.md')) {
        results.push(filePath);
      }
    }
    return results;
  };

  const mdFiles = globMarkdownFiles(cwd).map(p => path.relative(cwd, p));
  const uniqueCandidates = Array.from(new Set([...candidateFiles, ...mdFiles]));

  const documents = scanner.scan(uniqueCandidates);

  if (documents.length === 0) {
    console.log('No context documents found to inspect.');
    return;
  }

  console.log(`\n🔍 Context Optimization Inspection`);
  console.log(`──────────────────────────────────`);
  console.log(`Enabled:             ${optConfig?.enabled ? 'Yes' : 'No'}`);
  console.log(`Provider:            ${optConfig?.provider || 'native'}`);
  console.log(`Mode:                ${optConfig?.mode || 'standard'}`);
  console.log(`Min Tokens trigger:  ${optConfig?.minimum_tokens || 500}`);
  console.log(`Min Savings %:       ${optConfig?.minimum_savings_percent || 20}%`);
  console.log(`Max File Size:       ${optConfig?.maximum_file_size_kb || 500} KB\n`);

  console.log(
    `${'File Path'.padEnd(35)} | ${'Type'.padEnd(20)} | ${'Size'.padEnd(10)} | ${'Tokens'.padEnd(8)} | ${'Treatment'.padEnd(12)} | Reason`
  );
  console.log(`─`.repeat(120));

  let totalOriginalTokens = 0;

  for (const doc of documents) {
    const decision = policyEngine.getDecision(doc);
    const tokens = TokenCounter.countTokens(doc.content);
    totalOriginalTokens += tokens;

    const sizeStr = doc.sizeBytes > 1024 
      ? `${(doc.sizeBytes / 1024).toFixed(1)} KB` 
      : `${doc.sizeBytes} B`;

    const displayPath = doc.relativePath.length > 35 
      ? `...${doc.relativePath.slice(-32)}` 
      : doc.relativePath;

    console.log(
      `${displayPath.padEnd(35)} | ` +
      `${doc.type.padEnd(20)} | ` +
      `${sizeStr.padEnd(10)} | ` +
      `${String(tokens).padEnd(8)} | ` +
      `${decision.treatment.padEnd(12)} | ` +
      `${decision.reason}`
    );
  }

  console.log(`─`.repeat(120));
  console.log(`Total scanned files: ${documents.length}`);
  console.log(`Total estimated input tokens: ${totalOriginalTokens}\n`);
}

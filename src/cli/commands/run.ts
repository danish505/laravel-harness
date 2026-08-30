import * as fs from 'fs';
import * as path from 'path';
import { RunManager } from '../../engine/run-manager.js';
import { StateStore } from '../../state/state-store.js';
import { EventLogger } from '../../telemetry/event-logger.js';
import { WorkflowEngine } from '../../engine/workflow-engine.js';
import { FakeProvider } from '../../providers/fake-provider.js';
import { loadConfig, findConfigPath } from '../../config/loader.js';
import { statusToExitCode } from '../exit-codes.js';
import { execSync } from 'child_process';

export async function runCommand(task: string, cwd: string, options: { autoApprove?: boolean } = {}): Promise<void> {
  const configPath = findConfigPath(cwd);
  const { config, valid, errors } = loadConfig(configPath);

  if (!valid) {
    console.error('❌ Invalid config:\n' + errors.join('\n'));
    console.error('  Run "lh init" or "lh config validate" for details.');
    process.exitCode = 5;
    return;
  }

  // Gather git context
  let gitBranch: string | undefined;
  let gitCommit: string | undefined;
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
    gitCommit = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim();
  } catch { /* not a git repo or no commits */ }

  const manager = new RunManager(cwd);
  const { runId, paths, manifest } = manager.create(task, {
    profile: config.profile,
    provider: config.provider,
    gitBranch,
    gitCommit,
  });

  console.log(`\n🚀 Laravel Harness V2`);
  console.log(`   Run ID : ${runId}`);
  console.log(`   Task   : ${task}`);
  console.log(`   Profile: ${config.profile}`);
  console.log(`   Provider: ${config.provider}\n`);

  const provider = config.provider === 'fake'
    ? new FakeProvider()
    : new FakeProvider(); // CodexProvider will replace this in Phase 3

  if (config.provider !== 'fake') {
    console.log('⚠️  Codex provider not yet implemented — using FakeProvider.\n');
  }

  const engine = new WorkflowEngine({
    config,
    provider,
    runId,
    paths,
    task,
    autoApprove: options.autoApprove,
  });

  const finalState = await engine.run();

  const icons: Record<string, string> = {
    approved: '✅',
    failed: '❌',
    cancelled: '🚫',
    blocked: '🔒',
  };
  const icon = icons[finalState.status] ?? '⏹';
  console.log(`\n${icon} Run ${finalState.status.toUpperCase()}`);
  console.log(`   Run ID: ${runId}`);
  if (finalState.failure_reason) console.log(`   Reason: ${finalState.failure_reason}`);
  console.log(`\n  lh report ${runId}   — to view the full report`);
  console.log(`  lh inspect ${runId}  — to inspect artifacts\n`);

  process.exitCode = statusToExitCode(finalState.status);
}

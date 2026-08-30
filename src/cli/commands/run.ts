import { RunManager } from '../../engine/run-manager.js';
import { WorkflowEngine } from '../../engine/workflow-engine.js';
import { FakeProvider } from '../../providers/fake-provider.js';
import { CodexProvider } from '../../providers/codex-provider.js';
import { getCodexCliAvailabilityError } from '../../providers/codex-cli.js';
import { loadConfig, findConfigPath } from '../../config/loader.js';
import type { AgentProvider, HarnessConfig } from '../../types.js';
import { statusToExitCode } from '../exit-codes.js';
import { execSync } from 'child_process';

export async function runCommand(
  task: string,
  cwd: string,
  options: { autoApprove?: boolean; provider?: string } = {}
): Promise<void> {
  const configPath = findConfigPath(cwd);
  const { config, valid, errors } = loadConfig(configPath);

  if (!valid) {
    console.error('❌ Invalid config:\n' + errors.join('\n'));
    console.error('  Run "lh init" or "lh config validate" for details.');
    process.exitCode = 5;
    return;
  }

  const providerName = resolveProviderName(config.provider, options.provider);
  if (!providerName) {
    console.error(`❌ Unsupported provider "${options.provider}". Use "codex" or "fake".`);
    process.exitCode = 5;
    return;
  }

  if (providerName === 'codex') {
    const codexError = getCodexCliAvailabilityError(cwd);
    if (codexError) {
      console.error(`❌ ${codexError}`);
      process.exitCode = 1;
      return;
    }
  }

  // Gather git context
  let gitBranch: string | undefined;
  let gitCommit: string | undefined;
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    gitCommit = execSync('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* not a git repo or no commits */ }

  const manager = new RunManager(cwd);
  const { runId, paths } = manager.create(task, {
    profile: config.profile,
    provider: providerName,
    gitBranch,
    gitCommit,
  });

  console.log(`\n🚀 Laravel Harness V2`);
  console.log(`   Run ID : ${runId}`);
  console.log(`   Task   : ${task}`);
  console.log(`   Profile: ${config.profile}`);
  console.log(`   Provider: ${providerName}\n`);

  const provider = createProvider(providerName, cwd);

  const engine = new WorkflowEngine({
    config: { ...config, provider: providerName },
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

function resolveProviderName(
  configProvider: HarnessConfig['provider'],
  override?: string
): HarnessConfig['provider'] | null {
  if (!override) {
    return configProvider;
  }

  if (override === 'codex' || override === 'fake') {
    return override;
  }

  return null;
}

function createProvider(providerName: HarnessConfig['provider'], cwd: string): AgentProvider {
  if (providerName === 'fake') {
    return new FakeProvider();
  }

  return new CodexProvider({ cwd });
}

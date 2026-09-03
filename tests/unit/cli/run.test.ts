import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../../../src/cli/commands/run.js';
import { FakeProvider } from '../../../src/providers/fake-provider.js';

const {
  workflowEngineCtor,
  workflowEngineRun,
  codexProviderCtor,
  codexAvailabilityMock,
  codexPreflightMock,
} = vi.hoisted(() => ({
  workflowEngineCtor: vi.fn(),
  workflowEngineRun: vi.fn(),
  codexProviderCtor: vi.fn(),
  codexAvailabilityMock: vi.fn(),
  codexPreflightMock: vi.fn(),
}));

vi.mock('../../../src/engine/workflow-engine.js', () => ({
  WorkflowEngine: class MockWorkflowEngine {
    constructor(opts: unknown) {
      workflowEngineCtor(opts);
    }

    run() {
      return workflowEngineRun();
    }
  },
}));

vi.mock('../../../src/providers/codex-provider.js', () => ({
  CodexProvider: class MockCodexProvider {
    constructor(opts: unknown) {
      codexProviderCtor(opts);
    }
  },
}));

vi.mock('../../../src/providers/codex-cli.js', () => ({
  getCodexCliAvailabilityError: codexAvailabilityMock,
}));

vi.mock('../../../src/providers/codex-preflight.js', () => ({
  getCodexProjectConfigError: codexPreflightMock,
}));

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-run-command-test-'));
}

function writeConfig(dir: string, content: object): void {
  const harnessDir = path.join(dir, '.largentic');
  fs.mkdirSync(path.join(harnessDir, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(harnessDir, 'config.yaml'), yaml.dump(content), 'utf8');
}

describe('runCommand', () => {
  let tmpDir: string;
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    tmpDir = makeTmpDir();
    workflowEngineCtor.mockReset();
    workflowEngineRun.mockReset();
    workflowEngineRun.mockResolvedValue({ status: 'approved' });
    codexProviderCtor.mockReset();
    codexAvailabilityMock.mockReset();
    codexAvailabilityMock.mockReturnValue(null);
    codexPreflightMock.mockReset();
    codexPreflightMock.mockReturnValue(null);
    process.exitCode = undefined;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    delete process.env.LH_PROVIDER;
  });

  it('uses CodexProvider when the effective provider is codex', async () => {
    writeConfig(tmpDir, { version: 2, provider: 'codex' });

    await runCommand('Implement feature', tmpDir, { autoApprove: true });

    expect(codexAvailabilityMock).toHaveBeenCalledWith(tmpDir);
    expect(codexProviderCtor).toHaveBeenCalledWith({ cwd: tmpDir });

    const engineOptions = workflowEngineCtor.mock.calls[0][0] as { provider: unknown; cwd: string };
    expect(engineOptions.provider).toBeInstanceOf(Object);
    expect(engineOptions.provider).not.toBeInstanceOf(FakeProvider);
    expect(engineOptions.cwd).toBe(tmpDir);
  });

  it('uses FakeProvider when provider override is fake', async () => {
    writeConfig(tmpDir, { version: 2, provider: 'codex' });

    await runCommand('Implement feature', tmpDir, { autoApprove: true, provider: 'fake' });

    expect(codexAvailabilityMock).not.toHaveBeenCalled();

    const engineOptions = workflowEngineCtor.mock.calls[0][0] as { provider: unknown };
    expect(engineOptions.provider).toBeInstanceOf(FakeProvider);
  });

  it('fails early when codex is selected but unavailable', async () => {
    writeConfig(tmpDir, { version: 2, provider: 'codex' });
    codexAvailabilityMock.mockReturnValue('Codex CLI is not available.');

    await runCommand('Implement feature', tmpDir, { autoApprove: true });

    expect(workflowEngineCtor).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Codex CLI is not available.');
    expect(process.exitCode).toBe(1);
  });

  it('fails early when codex project config is missing', async () => {
    writeConfig(tmpDir, { version: 2, provider: 'codex' });
    codexPreflightMock.mockReturnValue('Missing .codex/config.toml');

    await runCommand('Implement feature', tmpDir, { autoApprove: true });

    expect(codexPreflightMock).toHaveBeenCalledWith(tmpDir);
    expect(workflowEngineCtor).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Native-agent mode cannot start.');
    expect(process.exitCode).toBe(5);
  });

  it('loads and passes initialPlan when a valid planFile is provided inside the configured exports dir', async () => {
    writeConfig(tmpDir, {
      version: 2,
      provider: 'fake',
      workflow: { plan_export_directory: '.largentic/exports' }
    });

    const exportsDir = path.join(tmpDir, '.largentic', 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const planFilePath = path.join(exportsDir, 'plan-abc.md');
    const planContent = '## Plan content';
    fs.writeFileSync(planFilePath, planContent, 'utf8');

    await runCommand('Implement feature', tmpDir, {
      autoApprove: true,
      planFile: planFilePath,
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(workflowEngineCtor).toHaveBeenCalled();
    const engineOptions = workflowEngineCtor.mock.calls[0][0] as { initialPlan?: string };
    expect(engineOptions.initialPlan).toBe(planContent);
    expect(process.exitCode).not.toBe(5);
  });

  it('fails early with exit code 5 when the planFile does not exist', async () => {
    writeConfig(tmpDir, {
      version: 2,
      provider: 'fake',
    });

    const nonExistentPath = path.join(tmpDir, '.largentic', 'exports', 'does-not-exist.md');

    await runCommand('Implement feature', tmpDir, {
      autoApprove: true,
      planFile: nonExistentPath,
    });

    expect(workflowEngineCtor).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Plan file not found'));
    expect(process.exitCode).toBe(5);
  });

  it('fails early with exit code 5 when the planFile is outside the configured exports dir', async () => {
    writeConfig(tmpDir, {
      version: 2,
      provider: 'fake',
      workflow: { plan_export_directory: '.largentic/exports' }
    });

    // Create a plan file in the tmpDir root (outside .largentic/exports)
    const planFilePath = path.join(tmpDir, 'outside-plan.md');
    fs.writeFileSync(planFilePath, '## Outside Plan', 'utf8');

    await runCommand('Implement feature', tmpDir, {
      autoApprove: true,
      planFile: planFilePath,
    });

    expect(workflowEngineCtor).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Plan file must be inside the configured plan export directory'));
    expect(process.exitCode).toBe(5);
  });
});

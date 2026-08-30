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
} = vi.hoisted(() => ({
  workflowEngineCtor: vi.fn(),
  workflowEngineRun: vi.fn(),
  codexProviderCtor: vi.fn(),
  codexAvailabilityMock: vi.fn(),
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

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-run-command-test-'));
}

function writeConfig(dir: string, content: object): void {
  const harnessDir = path.join(dir, '.laravel-harness');
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

    const engineOptions = workflowEngineCtor.mock.calls[0][0] as { provider: unknown };
    expect(engineOptions.provider).toBeInstanceOf(Object);
    expect(engineOptions.provider).not.toBeInstanceOf(FakeProvider);
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
});

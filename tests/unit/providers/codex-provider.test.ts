import * as fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexProvider } from '../../../src/providers/codex-provider.js';
import type { AgentRequest } from '../../../src/types.js';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

function makeRequest(): AgentRequest {
  return {
    stage: 'planning',
    runId: 'run-123',
    attempt: 1,
    systemPrompt: 'You are the planner agent.',
    userMessage: 'Plan the task.',
    contextFiles: [],
  };
}

function createChildProcess(result: { exitCode: number | null; signal?: NodeJS.Signals | null; stdout?: string; stderr?: string }) {
  let stdoutHandler: ((chunk: string) => void) | undefined;
  let stderrHandler: ((chunk: string) => void) | undefined;
  let closeHandler: ((exitCode: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  let errorHandler: ((error: Error) => void) | undefined;

  return {
    stdout: {
      on: vi.fn((event: string, handler: (chunk: string) => void) => {
        if (event === 'data') stdoutHandler = handler;
      }),
    },
    stderr: {
      on: vi.fn((event: string, handler: (chunk: string) => void) => {
        if (event === 'data') stderrHandler = handler;
      }),
    },
    stdin: {
      end: vi.fn(() => {
        if (result.stdout) stdoutHandler?.(result.stdout);
        if (result.stderr) stderrHandler?.(result.stderr);
        closeHandler?.(result.exitCode, result.signal ?? null);
      }),
    },
    on: vi.fn((event: string, handler: ((error: Error) => void) | ((exitCode: number | null, signal: NodeJS.Signals | null) => void)) => {
      if (event === 'error') errorHandler = handler as (error: Error) => void;
      if (event === 'close') closeHandler = handler as (exitCode: number | null, signal: NodeJS.Signals | null) => void;
    }),
    kill: vi.fn(),
    emitError(error: Error) {
      errorHandler?.(error);
    },
  };
}

describe('CodexProvider', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('returns success with parsed usage when Codex completes', async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      fs.writeFileSync(outputPath, '## Plan\n\nReady.', 'utf8');
      return createChildProcess({
        exitCode: 0,
        stdout: [
          '{"type":"thread.started","thread_id":"thread-1"}',
          '{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":34}}',
        ].join('\n'),
      });
    });

    const provider = new CodexProvider({ cwd: process.cwd() });
    const result = await provider.execute(makeRequest());

    expect(result).toEqual(
      expect.objectContaining({
        status: 'success',
        content: '## Plan\n\nReady.',
        usage: { inputTokens: 12, outputTokens: 34 },
      })
    );
  });

  it('returns blocked when Codex reports an authentication failure', async () => {
    spawnMock.mockImplementation(() =>
      createChildProcess({
        exitCode: 1,
        stdout: '{"type":"error","message":"Authentication required. Please login."}',
      })
    );

    const provider = new CodexProvider({ cwd: process.cwd() });
    const result = await provider.execute(makeRequest());

    expect(result.status).toBe('blocked');
    expect(result.failureClassification).toBe('infrastructure');
    expect(result.content).toContain('Authentication required');
  });

  it('returns failure when Codex exits successfully without a final message', async () => {
    spawnMock.mockImplementation(() =>
      createChildProcess({
        exitCode: 0,
        stdout: '{"type":"turn.completed","usage":{"input_tokens":8,"output_tokens":13}}',
      })
    );

    const provider = new CodexProvider({ cwd: process.cwd() });
    const result = await provider.execute(makeRequest());

    expect(result.status).toBe('failure');
    expect(result.failureClassification).toBe('invalid_output');
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 13 });
  });

  it('returns infrastructure failure when the CLI exits with a non-zero code', async () => {
    spawnMock.mockImplementation(() =>
      createChildProcess({
        exitCode: 2,
        stderr: 'unexpected transport error',
      })
    );

    const provider = new CodexProvider({ cwd: process.cwd() });
    const result = await provider.execute(makeRequest());

    expect(result.status).toBe('failure');
    expect(result.failureClassification).toBe('infrastructure');
    expect(result.content).toContain('unexpected transport error');
  });
});

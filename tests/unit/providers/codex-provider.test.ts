import * as fs from 'fs';
import { PassThrough } from 'stream';
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

function createChildProcess(result: {
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
}) {
  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();
  const stdinStream = new PassThrough();

  let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  let errorHandler: ((err: Error) => void) | undefined;

  const child = {
    stdout: stdoutStream,
    stderr: stderrStream,
    stdin: {
      end: vi.fn((data?: string) => {
        void data;
        // Push stdout/stderr then trigger close
        if (result.stdout) stderrStream.emit('data', ''); // ensure stderr handler attached
        setImmediate(() => {
          if (result.stdout) stdoutStream.push(result.stdout);
          stdoutStream.push(null);
          if (result.stderr) stderrStream.push(result.stderr);
          stderrStream.push(null);
          setImmediate(() => closeHandler?.(result.exitCode, result.signal ?? null));
        });
      }),
    },
    on: vi.fn((event: string, handler: unknown) => {
      if (event === 'error') errorHandler = handler as (err: Error) => void;
      if (event === 'close') closeHandler = handler as (code: number | null, signal: NodeJS.Signals | null) => void;
    }),
    kill: vi.fn(),
    emitError(error: Error) { errorHandler?.(error); },
  };

  return child;
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

  it('serializes each attached context file once', async () => {
    let prompt = '';
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      fs.writeFileSync(outputPath, 'Ready.', 'utf8');
      const child = createChildProcess({ exitCode: 0 });
      child.stdin.end = vi.fn((data?: string) => {
        prompt = String(data ?? '');
        setImmediate(() => {
          fs.writeFileSync(outputPath, 'Ready.', 'utf8');
          child.stdout.push(null);
          child.stderr.push(null);
          setImmediate(() => {
            const closeCall = child.on.mock.calls.find(([event]) => event === 'close');
            const closeHandler = closeCall?.[1] as ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
            closeHandler?.(0, null);
          });
        });
      });
      return child;
    });

    const provider = new CodexProvider({ cwd: process.cwd() });
    await provider.execute({
      ...makeRequest(),
      contextFiles: [{ path: '/tmp/plan.md', content: '## Plan\n\nAttached once.' }],
    });

    expect(prompt.match(/Path: \/tmp\/plan\.md/g)).toHaveLength(1);
    expect(prompt.match(/Attached once\./g)).toHaveLength(1);
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

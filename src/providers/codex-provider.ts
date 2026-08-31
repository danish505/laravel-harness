import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import type { AgentProvider, AgentRequest, AgentResult, FailureClassification } from '../types.js';
import type { CodexLiveEvent } from '../ui/progress-reporter.js';

export type CodexEventCallback = (event: CodexLiveEvent) => void;

interface CodexProviderOptions {
  cwd: string;
  timeoutMs?: number;
  onEvent?: CodexEventCallback;
}

interface CodexProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface CodexThreadUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export class CodexProvider implements AgentProvider {
  private cwd: string;
  private timeoutMs: number;
  private onEvent: CodexEventCallback | undefined;

  constructor(options: CodexProviderOptions) {
    this.cwd = options.cwd;
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    this.onEvent = options.onEvent;
  }

  /** Attach a live-event callback after construction (used by WorkflowEngine). */
  setOnEvent(cb: CodexEventCallback): void {
    this.onEvent = cb;
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const outputFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lh-codex-provider-')),
      'last-message.md'
    );

    try {
      const result = await this.runCodex(request, outputFile);
      const content = this.readOutputFile(outputFile);
      const usage = this.parseUsage(result.stdout);
      const providerError = this.parseProviderError(result.stdout) ?? result.stderr.trim();
      const rawOutput = this.buildRawOutput(result.stdout, result.stderr);

      if (result.timedOut) {
        return {
          status: 'failure',
          content: 'Codex CLI timed out before returning a final response.',
          failureClassification: 'timeout',
          rawOutput,
        };
      }

      if (result.exitCode === 0) {
        if (!content) {
          return {
            status: 'failure',
            content: providerError || 'Codex CLI exited successfully but did not produce a final message.',
            failureClassification: 'invalid_output',
            usage,
            rawOutput,
          };
        }

        return {
          status: 'success',
          content,
          usage,
          rawOutput,
        };
      }

      const failureClassification = this.classifyFailure(providerError, result.signal);

      return {
        status: this.isBlockedFailure(providerError) ? 'blocked' : 'failure',
        content:
          content ||
          providerError ||
          `Codex CLI exited with code ${result.exitCode ?? 'unknown'} before producing a final response.`,
        failureClassification,
        usage,
        rawOutput,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'failure',
        content: `Failed to execute Codex CLI: ${message}`,
        failureClassification: 'infrastructure',
        rawOutput: message,
      };
    } finally {
      fs.rmSync(path.dirname(outputFile), { recursive: true, force: true });
    }
  }

  private async runCodex(request: AgentRequest, outputFile: string): Promise<CodexProcessResult> {
    return new Promise((resolve, reject) => {
      // --approve-for-me implicitly uses the workspace-write sandbox,
      // so --sandbox must not be passed alongside it.
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--approve-for-me',
        '--cd',
        this.cwd,
        '--output-last-message',
        outputFile,
        '-',
      ];

      const child = spawn('codex', args, {
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, this.timeoutMs);

      // Stream-parse stdout line by line so we can emit live events
      // while also accumulating the raw output for post-processing.
      const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

      rl.on('line', (line) => {
        stdout += line + '\n';
        if (this.onEvent) {
          this.dispatchLiveEvent(line);
        }
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        rl.close();
        reject(error);
      });

      child.on('close', (exitCode, signal) => {
        clearTimeout(timer);
        rl.close();
        resolve({ exitCode, signal, stdout, stderr, timedOut });
      });

      child.stdin.end(this.buildPrompt(request));
    });
  }

  private dispatchLiveEvent(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    const cb = this.onEvent!;

    if (parsed.type === 'item.started' || parsed.type === 'item.updated' || parsed.type === 'item.completed') {
      const item = parsed.item as Record<string, unknown> | undefined;
      if (!item) return;

      const details = item.details as Record<string, unknown> | undefined;
      if (!details) return;

      const itemType = details.type as string | undefined;

      if (itemType === 'command_execution') {
        const cmd = (details.command as string | undefined) ?? '';
        if (cmd) cb({ type: 'command', detail: `running: ${cmd}` });
        return;
      }

      if (itemType === 'file_change') {
        const changes = details.changes as Array<Record<string, unknown>> | undefined;
        const p = changes?.[0]?.path as string | undefined;
        if (p) cb({ type: 'patch', detail: `patching: ${p}` });
        return;
      }

      if (itemType === 'agent_message') {
        cb({ type: 'message', detail: 'agent is responding…' });
        return;
      }
    }

    if (parsed.type === 'turn.started') {
      cb({ type: 'thinking', detail: 'new turn started' });
    }
  }

  private buildPrompt(request: AgentRequest): string {
    const contextFiles = request.contextFiles.length === 0
      ? 'None.'
      : request.contextFiles
          .map((file) => `Path: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
          .join('\n\n');

    return [
      request.systemPrompt,
      '',
      `Stage: ${request.stage}`,
      `Run ID: ${request.runId}`,
      `Attempt: ${request.attempt}`,
      '',
      request.userMessage,
      '',
      'Context files:',
      contextFiles,
      '',
      'Return a single final Markdown message suitable for the Laravel Harness stage artifact.',
    ].join('\n');
  }

  private readOutputFile(outputFile: string): string {
    if (!fs.existsSync(outputFile)) {
      return '';
    }

    return fs.readFileSync(outputFile, 'utf8').trim();
  }

  private buildRawOutput(stdout: string, stderr: string): string {
    const sections: string[] = [];

    if (stdout.trim()) {
      sections.push(`stdout:\n${stdout.trim()}`);
    }

    if (stderr.trim()) {
      sections.push(`stderr:\n${stderr.trim()}`);
    }

    return sections.join('\n\n');
  }

  private parseUsage(stdout: string): AgentResult['usage'] | undefined {
    const events = this.parseJsonLines(stdout);
    let lastUsage: CodexThreadUsage | undefined;

    for (const event of events) {
      if (event.type === 'turn.completed' && this.isUsage(event.usage)) {
        lastUsage = event.usage;
      }
    }

    if (!lastUsage) {
      return undefined;
    }

    return {
      inputTokens: lastUsage.input_tokens ?? 0,
      outputTokens: lastUsage.output_tokens ?? 0,
    };
  }

  private parseProviderError(stdout: string): string | null {
    const events = this.parseJsonLines(stdout);
    let lastError: string | null = null;

    for (const event of events) {
      if (event.type === 'error' && typeof event.message === 'string') {
        lastError = event.message;
      }

      if (
        event.type === 'turn.failed' &&
        event.error &&
        typeof event.error === 'object' &&
        typeof (event.error as Record<string, unknown>).message === 'string'
      ) {
        lastError = (event.error as Record<string, string>).message;
      }

      if (this.isErrorItemEvent(event)) {
        lastError = event.item.details.message;
      }
    }

    return lastError;
  }

  private classifyFailure(message: string, signal: NodeJS.Signals | null): FailureClassification {
    if (signal === 'SIGTERM' && /timed out/i.test(message)) {
      return 'timeout';
    }

    if (signal === 'SIGTERM' && message.length === 0) {
      return 'timeout';
    }

    if (/timed out/i.test(message)) {
      return 'timeout';
    }

    return 'infrastructure';
  }

  private isBlockedFailure(message: string): boolean {
    return /(login|sign in|authentication|unauthorized|forbidden|permission denied|config)/i.test(message);
  }

  private parseJsonLines(stdout: string): Array<Record<string, unknown>> {
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as unknown;
          return this.isRecord(parsed) ? [parsed] : [];
        } catch {
          return [];
        }
      });
  }

  private isUsage(value: unknown): value is CodexThreadUsage {
    return this.isRecord(value);
  }

  private isErrorItemEvent(
    event: Record<string, unknown>
  ): event is Record<string, unknown> & { item: { details: { message: string } } } {
    if (!this.isRecord(event.item)) {
      return false;
    }

    const item = event.item;
    if (!this.isRecord(item.details)) {
      return false;
    }

    return item.details.type === 'error' && typeof item.details.message === 'string';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
  }
}

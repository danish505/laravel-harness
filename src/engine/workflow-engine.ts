import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  AgentProvider,
  HarnessConfig,
  Stage,
  StageResult,
  RunState,
} from '../types.js';
import { EventLogger } from '../telemetry/event-logger.js';
import { StateStore } from '../state/state-store.js';
import { RunLock } from '../state/run-lock.js';
import { ApprovalGate } from './approval-gate.js';
import {
  getNextStageStatus,
  isTerminal,
} from './state-machine.js';
import type { RunPaths } from './run-manager.js';
import type { ProgressReporter } from '../ui/progress-reporter.js';

export interface WorkflowEngineOptions {
  config: HarnessConfig;
  provider: AgentProvider;
  runId: string;
  paths: RunPaths;
  task: string;
  /** If true, auto-approve plan (skips interactive prompt). Used in tests. */
  autoApprove?: boolean;
  /** Optional live progress reporter — omit for silent/test mode. */
  reporter?: ProgressReporter;
}

const STAGE_ORDER: Stage[] = ['planning', 'implementing', 'testing', 'reviewing'];

const STAGE_TO_ARTIFACT: Record<Stage, string> = {
  planning:     'plan.md',
  implementing: 'implementation.md',
  testing:      'test-results.md',
  reviewing:    'review.md',
};

export class WorkflowEngine {
  private opts: WorkflowEngineOptions;
  private store: StateStore;
  private lock: RunLock;
  private logger: EventLogger;
  private gate: ApprovalGate;

  constructor(opts: WorkflowEngineOptions) {
    this.opts   = opts;
    this.store  = new StateStore(opts.paths.runDir);
    this.lock   = new RunLock(opts.paths.runDir);
    this.logger = new EventLogger(opts.paths.eventsFile);
    this.gate   = new ApprovalGate();
  }

  async run(): Promise<RunState> {
    this.lock.acquire();
    try {
      return await this.execute();
    } finally {
      this.lock.release();
    }
  }

  private async execute(): Promise<RunState> {
    const { config, provider, runId, task } = this.opts;
    let state = this.store.read();

    // ── Planning ──────────────────────────────────────────────────────────────
    if (!['implementing', 'testing', 'testing_failed', 'reviewing', 'review_rejected'].includes(state.status)) {
      state = this.enterStage('planning', state, runId);
      const planResult = await this.runStage('planning', state, provider, task);

      if (planResult.status !== 'success') {
        state = this.store.transition('failed', { actor: 'planner', failureReason: planResult.failure_classification ?? 'planning failed' });
        this.logger.termination(runId, 'Planning failed', 'failed');
        return state;
      }

      this.writeArtifact('planning', state, planResult);
      this.logger.stageComplete(runId, 'planning', state.attempt + 1, planResult.summary);
      state = this.store.transition('awaiting_plan_approval', { actor: 'planner' });

      if (config.workflow.plan_approval === 'required' && !this.opts.autoApprove) {
        this.logger.approvalRequest(runId, 'planning');
        const plan = this.readArtifact(STAGE_TO_ARTIFACT['planning']);
        if (this.opts.reporter) {
          this.opts.reporter.approvalBanner(plan);
        } else {
          process.stdout.write(`\n  ✋ Plan requires approval.\n`);
          process.stdout.write(`Plan:\n${'─'.repeat(60)}\n${plan}\n${'─'.repeat(60)}\n`);
        }
        const decision = await this.gate.requestApproval('');
        this.logger.approvalDecision(runId, decision, 'human');

        if (decision !== 'approved') {
          state = this.store.transition('cancelled', { actor: 'human', failureReason: decision === 'rejected' ? 'Plan rejected by user' : 'User cancelled' });
          this.logger.termination(runId, `Plan ${decision} by user`, 'cancelled');
          return state;
        }
      }

      state = this.store.transition('implementing', { actor: 'system' });
    }

    // ── Implement → Test → Review repair loop ────────────────────────────────
    for (let attempt = state.attempt; attempt < config.workflow.max_attempts; attempt++) {
      // Implementing
      if (!['testing', 'testing_failed', 'reviewing', 'review_rejected'].includes(state.status)) {
        state = this.enterStage('implementing', state, runId);
        const implResult = await this.runStage('implementing', state, provider, task);
        this.writeArtifact('implementing', state, implResult);

        if (implResult.status !== 'success') {
          this.logger.stageFailed(runId, 'implementing', attempt + 1, implResult.failure_classification ?? 'unknown', implResult.failure_details ?? implResult.summary);
          if (attempt + 1 >= config.workflow.max_attempts) {
            state = this.store.transition('failed', { actor: 'system', failureReason: `Max attempts (${config.workflow.max_attempts}) reached at implementing` });
            this.logger.termination(runId, 'Max attempts reached at implementing', 'failed');
            return state;
          }
          this.logger.retry(runId, 'implementing failed', attempt + 2);
          this.opts.reporter?.retrying('implementing', attempt + 2);
          continue;
        }
        this.logger.stageComplete(runId, 'implementing', attempt + 1, implResult.summary);
        state = this.store.transition('testing', { actor: 'system' });
      }

      // Testing
      if (!['reviewing', 'review_rejected'].includes(state.status)) {
        state = this.enterStage('testing', state, runId);
        const testResult = await this.runStage('testing', state, provider, task);
        this.writeArtifact('testing', state, testResult);

        if (testResult.status !== 'success') {
          this.logger.stageFailed(runId, 'testing', attempt + 1, testResult.failure_classification ?? 'unknown', testResult.failure_details ?? testResult.summary);
          if (attempt + 1 >= config.workflow.max_attempts) {
            state = this.store.transition('testing_failed', { actor: 'tester' });
            state = this.store.transition('failed', { actor: 'system', failureReason: `Max attempts (${config.workflow.max_attempts}) reached at testing` });
            this.logger.termination(runId, 'Max attempts reached at testing', 'failed');
            return state;
          }
          this.logger.retry(runId, 'testing failed — retrying implementing', attempt + 2);
          this.opts.reporter?.retrying('testing', attempt + 2);
          state = this.store.transition('testing_failed', { actor: 'tester' });
          state = this.store.transition('implementing', { actor: 'system' });
          continue;
        }
        this.logger.stageComplete(runId, 'testing', attempt + 1, testResult.summary);
        state = this.store.transition('reviewing', { actor: 'system' });
      }

      // Reviewing
      state = this.enterStage('reviewing', state, runId);
      const reviewResult = await this.runStage('reviewing', state, provider, task);
      this.writeArtifact('reviewing', state, reviewResult);

      if (reviewResult.status !== 'success') {
        this.logger.stageFailed(runId, 'reviewing', attempt + 1, reviewResult.failure_classification ?? 'unknown', reviewResult.failure_details ?? reviewResult.summary);
        if (attempt + 1 >= config.workflow.max_attempts) {
          state = this.store.transition('review_rejected', { actor: 'reviewer' });
          state = this.store.transition('failed', { actor: 'system', failureReason: `Max attempts (${config.workflow.max_attempts}) reached at reviewing` });
          this.logger.termination(runId, 'Max attempts reached at reviewing', 'failed');
          return state;
        }
        this.logger.retry(runId, 'review rejected — retrying implementing', attempt + 2);
        this.opts.reporter?.retrying('reviewing', attempt + 2);
        state = this.store.transition('review_rejected', { actor: 'reviewer' });
        state = this.store.transition('implementing', { actor: 'system' });
        continue;
      }

      this.logger.stageComplete(runId, 'reviewing', attempt + 1, reviewResult.summary);
      state = this.store.transition('approved', { actor: 'reviewer' });
      return state;
    }

    // Should not reach here, but guard anyway
    if (!isTerminal(state.status)) {
      state = this.store.transition('failed', { actor: 'system', failureReason: 'Workflow loop exhausted' });
    }
    return state;
  }

  private enterStage(stage: Stage, state: RunState, runId: string): RunState {
    const enterStatus = stageToEnterStatus(stage);
    let next = state;
    if (state.status !== enterStatus) {
      next = this.store.transition(enterStatus, { actor: 'system' });
      this.logger.stateTransition(runId, state.status, enterStatus, 'system');
    }
    this.logger.stageStart(runId, stage, next.attempt + 1);
    this.opts.reporter?.stageStarted(stage, next.attempt + 1);
    return next;
  }

  private async runStage(
    stage: Stage,
    state: RunState,
    provider: AgentProvider,
    task: string
  ): Promise<StageResult> {
    const started_at = new Date().toISOString();

    const systemPrompt = buildSystemPrompt(stage);
    const userMessage  = buildUserMessage(stage, task, state.attempt + 1);

    this.logger.log('agent_call_start', { run_id: state.run_id, stage, attempt: state.attempt + 1 });

    // Attach live event callback when provider supports it (CodexProvider)
    const reporter = this.opts.reporter;
    if (reporter && 'setOnEvent' in provider && typeof (provider as Record<string, unknown>).setOnEvent === 'function') {
      (provider as { setOnEvent: (cb: (e: unknown) => void) => void }).setOnEvent(
        (e) => reporter.codexEvent(e as Parameters<typeof reporter.codexEvent>[0])
      );
    }

    const agentResult = await provider.execute({
      stage,
      runId: state.run_id,
      attempt: state.attempt + 1,
      systemPrompt,
      userMessage,
      contextFiles: [],
    });

    this.logger.log('agent_call_complete', { run_id: state.run_id, stage, status: agentResult.status });

    if (agentResult.status === 'success') {
      reporter?.stageCompleted(stage);
    } else {
      reporter?.stageFailed(stage, agentResult.failureClassification ?? 'unknown');
    }

    return {
      schema_version: '2.0',
      run_id: state.run_id,
      attempt: state.attempt + 1,
      stage,
      status: agentResult.status,
      agent_id: stage,
      provider: this.opts.config.provider,
      input_hashes: {},
      output_files: [],
      summary: agentResult.content.slice(0, 200),
      content: agentResult.content,
      next_action: agentResult.status === 'success' ? 'advance' : 'retry',
      failure_classification: agentResult.failureClassification ?? null,
      failure_details: agentResult.status !== 'success' ? agentResult.content : undefined,
      usage: agentResult.usage
        ? {
            input_tokens: agentResult.usage.inputTokens,
            output_tokens: agentResult.usage.outputTokens,
            estimated_cost_usd: 0,
          }
        : undefined,
      started_at,
      completed_at: new Date().toISOString(),
    };
  }

  private handleFailure(state: RunState, stage: Stage, result: StageResult): RunState {
    const next = getNextStageStatus(
      stage === 'testing' ? 'testing' : stage === 'reviewing' ? 'reviewing' : 'implementing',
      result.status as 'failure' | 'blocked'
    );
    const newState = this.store.transition(next, {
      actor: stage,
      failureReason: result.failure_classification ?? undefined,
    });
    this.logger.stateTransition(state.run_id, state.status, next, stage);
    return newState;
  }

  private writeArtifact(stage: Stage, state: RunState, result: StageResult): void {
    const attemptDir = this.opts.paths.attemptDir(state.attempt + 1);
    fs.mkdirSync(attemptDir, { recursive: true });

    const artifactName = STAGE_TO_ARTIFACT[stage];
    const artifactPath = path.join(attemptDir, artifactName);
    fs.writeFileSync(artifactPath, result.content, 'utf8');

    // Also write to run root for easy access
    fs.writeFileSync(path.join(this.opts.paths.runDir, artifactName), result.content, 'utf8');

    // Write stage result JSON
    const resultPath = path.join(attemptDir, `${stage}-result.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  }

  private readArtifact(filename: string): string {
    const p = path.join(this.opts.paths.runDir, filename);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(not found)';
  }

  private resolveStartStage(state: RunState): Stage {
    switch (state.status) {
      case 'created':
      case 'planning':
        return 'planning';
      case 'awaiting_plan_approval':
      case 'implementing':
        return 'implementing';
      case 'testing':
      case 'testing_failed':
        return 'testing';
      case 'reviewing':
      case 'review_rejected':
        return 'reviewing';
      default:
        return 'planning';
    }
  }
}

function stageToEnterStatus(stage: Stage): RunState['status'] {
  switch (stage) {
    case 'planning':     return 'planning';
    case 'implementing': return 'implementing';
    case 'testing':      return 'testing';
    case 'reviewing':    return 'reviewing';
  }
}

function buildSystemPrompt(stage: Stage): string {
  switch (stage) {
    case 'planning':
      return [
        'You are the planner agent for Laravel Harness V2.',
        '',
        'Produce a structured plan in Markdown with exactly these sections in this order:',
        '',
        '## Ask',
        'Restate the task in your own words. Confirm what is in scope and what is explicitly out of scope.',
        '',
        '## Assumptions',
        'List every assumption you are making about the codebase, environment, or requirements.',
        'Flag anything that could invalidate the plan if wrong.',
        '',
        '## Acceptance Criteria',
        'List concrete, testable criteria that must be true for this task to be considered done.',
        'Use checkbox format: `- [ ] criterion`',
        '',
        '## Implementation Strategy',
        'Describe the files, classes, and methods to create or change.',
        'List steps in execution order. Be specific enough for the implementer to act without guessing.',
        '',
        '## Test Strategy',
        'Describe what to test: unit tests, feature tests, edge cases.',
        'Specify the test command (e.g. `vendor/bin/phpunit --no-coverage --filter SomeTest`).',
        'Note any fakes or stubs needed.',
        '',
        'Do not include any text outside these five sections.',
        'Do not start implementing — output only the plan.',
      ].join('\n');

    case 'implementing':
      return [
        'You are the implementer agent for Laravel Harness V2.',
        'Read the plan (plan.md) carefully and apply the smallest safe patch that satisfies all acceptance criteria.',
        'Check git status before editing. Do not touch unrelated dirty files.',
        'Write a brief implementation summary when done.',
      ].join('\n');

    case 'testing':
      return [
        'You are the tester agent for Laravel Harness V2.',
        'Run the tests specified in the plan\'s Test Strategy section.',
        'Report pass/fail with exact command output. Classify any failures clearly.',
      ].join('\n');

    case 'reviewing':
      return [
        'You are the reviewer agent for Laravel Harness V2.',
        'Review the implementation and test results against the plan\'s Acceptance Criteria.',
        'Either output "✅ APPROVED" with a brief rationale, or "❌ REJECTED" with specific, actionable feedback.',
      ].join('\n');
  }
}

function buildUserMessage(stage: Stage, task: string, attempt: number): string {
  const attemptNote = attempt > 1 ? `\n\nAttempt: ${attempt} (previous attempt failed — see failure details above)` : '';

  switch (stage) {
    case 'planning':
      return `Task: ${task}${attemptNote}`;

    default:
      return `Task: ${task}\n\nAttempt: ${attempt}`;
  }
}

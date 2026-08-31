import type { Stage } from '../types.js';
import { Spinner } from './spinner.js';

const STAGE_LABEL: Record<Stage, string> = {
  planning:     'planning',
  implementing: 'implementing',
  testing:      'testing',
  reviewing:    'reviewing',
};

export interface CodexLiveEvent {
  type: 'command' | 'patch' | 'message' | 'thinking';
  detail: string;
}

export class ProgressReporter {
  private spinner: Spinner;
  private currentStage: Stage | null = null;
  private currentAttempt = 0;

  constructor(spinner?: Spinner) {
    this.spinner = spinner ?? new Spinner();
  }

  stageStarted(stage: Stage, attempt: number): void {
    this.currentStage = stage;
    this.currentAttempt = attempt;
    const label = this.stageSpinnerLabel(stage, attempt);
    this.spinner.start(label);
  }

  stageCompleted(stage: Stage): void {
    const label = `\x1b[32m[${STAGE_LABEL[stage]}]\x1b[0m done`;
    this.spinner.stop('✅', label);
  }

  stageFailed(stage: Stage, classification: string): void {
    const label = `\x1b[31m[${STAGE_LABEL[stage]}]\x1b[0m failed \x1b[2m— ${classification}\x1b[0m`;
    this.spinner.stop('❌', label);
  }

  retrying(stage: Stage, nextAttempt: number): void {
    process.stdout.write(`  \x1b[33m↩\x1b[0m  retrying \x1b[33m[${STAGE_LABEL[stage]}]\x1b[0m — attempt ${nextAttempt}\n`);
  }

  codexEvent(event: CodexLiveEvent): void {
    const icon = this.eventIcon(event.type);
    const truncated = event.detail.length > 80 ? event.detail.slice(0, 77) + '…' : event.detail;
    this.spinner.printSubLine(`${icon} ${truncated}`);
  }

  approvalBanner(plan: string): void {
    process.stdout.write('\n');
    process.stdout.write(`  \x1b[33m✋  Plan ready — review before proceeding\x1b[0m\n`);
    process.stdout.write(`  ${'─'.repeat(60)}\n`);
    const lines = plan.split('\n');
    for (const line of lines) {
      process.stdout.write(`  ${line}\n`);
    }
    process.stdout.write(`  ${'─'.repeat(60)}\n\n`);
  }

  private stageSpinnerLabel(stage: Stage, attempt: number): string {
    const attemptSuffix = attempt > 1 ? ` \x1b[2m(attempt ${attempt})\x1b[0m` : '';
    return `\x1b[36m[${STAGE_LABEL[stage]}]\x1b[0m${attemptSuffix} Codex is working…`;
  }

  private eventIcon(type: CodexLiveEvent['type']): string {
    switch (type) {
      case 'command':  return '·';
      case 'patch':    return '~';
      case 'message':  return '»';
      case 'thinking': return '…';
    }
  }
}

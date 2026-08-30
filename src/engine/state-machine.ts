import type { RunStatus } from '../types.js';

type TransitionMap = Partial<Record<RunStatus, RunStatus[]>>;

const TRANSITIONS: TransitionMap = {
  created:                 ['planning', 'cancelled'],
  planning:                ['awaiting_plan_approval', 'blocked', 'failed', 'cancelled'],
  awaiting_plan_approval:  ['implementing', 'cancelled'],
  implementing:            ['testing', 'blocked', 'failed', 'cancelled'],
  testing:                 ['reviewing', 'testing_failed', 'failed', 'cancelled'],
  testing_failed:          ['implementing', 'failed', 'cancelled'],
  reviewing:               ['approved', 'review_rejected', 'failed', 'cancelled'],
  review_rejected:         ['implementing', 'failed', 'cancelled'],
};

const TERMINAL: Set<RunStatus> = new Set(['approved', 'cancelled', 'failed', 'blocked']);

export function isValidTransition(from: RunStatus, to: RunStatus): boolean {
  if (TERMINAL.has(from)) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.has(status);
}

export function assertValidTransition(from: RunStatus, to: RunStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(
      `Invalid state transition: ${from} → ${to}. ` +
        `Allowed from ${from}: [${(TRANSITIONS[from] ?? []).join(', ')}]`
    );
  }
}

export function getNextStageStatus(
  currentStatus: RunStatus,
  stageOutcome: 'success' | 'failure' | 'blocked'
): RunStatus {
  if (stageOutcome === 'blocked') return 'blocked';
  if (stageOutcome === 'failure') {
    if (currentStatus === 'testing')   return 'testing_failed';
    if (currentStatus === 'reviewing') return 'review_rejected';
    return 'failed';
  }
  // success
  switch (currentStatus) {
    case 'planning':        return 'awaiting_plan_approval';
    case 'implementing':    return 'testing';
    case 'testing':         return 'reviewing';
    case 'reviewing':       return 'approved';
    default:                return 'failed';
  }
}

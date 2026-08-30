import * as fs from 'fs';
import * as path from 'path';
import type { RunState, RunStatus } from '../types.js';
import { assertValidTransition } from '../engine/state-machine.js';

const SCHEMA_VERSION = '2.0' as const;

export class StateStore {
  private stateFile: string;
  private tmpFile: string;

  constructor(runDir: string) {
    this.stateFile = path.join(runDir, 'state.json');
    this.tmpFile   = path.join(runDir, 'state.json.tmp');
  }

  read(): RunState {
    const raw = fs.readFileSync(this.stateFile, 'utf8');
    return JSON.parse(raw) as RunState;
  }

  /** Atomically write new state after validating the transition. */
  transition(
    to: RunStatus,
    options: { actor?: string; failureReason?: string } = {}
  ): RunState {
    const current = this.read();
    assertValidTransition(current.status, to);

    const next: RunState = {
      ...current,
      status: to,
      attempt: this.incrementAttempt(current.status, to, current.attempt),
      updated_at: new Date().toISOString(),
      transition_actor: options.actor ?? 'system',
      failure_reason: options.failureReason,
    };

    this.atomicWrite(next);
    return next;
  }

  /** Write initial state (no transition check). */
  initialize(runId: string): RunState {
    const state: RunState = {
      schema_version: SCHEMA_VERSION,
      run_id: runId,
      status: 'created',
      attempt: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.atomicWrite(state);
    return state;
  }

  private atomicWrite(state: RunState): void {
    fs.writeFileSync(this.tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(this.tmpFile, this.stateFile);
  }

  /** Increment attempt counter only when entering a retry cycle. */
  private incrementAttempt(
    from: RunStatus,
    to: RunStatus,
    current: number
  ): number {
    const retryEntry = to === 'implementing' &&
      (from === 'testing_failed' || from === 'review_rejected');
    return retryEntry ? current + 1 : current;
  }
}

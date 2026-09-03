import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  isTerminal,
  assertValidTransition,
  getNextStageStatus,
} from '../../../src/engine/state-machine.js';
import type { RunStatus } from '../../../src/types.js';

describe('state-machine', () => {
  describe('isValidTransition', () => {
    it('allows created → planning', () => {
      expect(isValidTransition('created', 'planning')).toBe(true);
    });

    it('allows created → implementing', () => {
      expect(isValidTransition('created', 'implementing')).toBe(true);
    });

    it('allows planning → awaiting_plan_approval', () => {
      expect(isValidTransition('planning', 'awaiting_plan_approval')).toBe(true);
    });

    it('allows awaiting_plan_approval → implementing', () => {
      expect(isValidTransition('awaiting_plan_approval', 'implementing')).toBe(true);
    });

    it('allows awaiting_plan_approval → planning', () => {
      expect(isValidTransition('awaiting_plan_approval', 'planning')).toBe(true);
    });

    it('allows testing → testing_failed', () => {
      expect(isValidTransition('testing', 'testing_failed')).toBe(true);
    });

    it('allows testing_failed → implementing (retry)', () => {
      expect(isValidTransition('testing_failed', 'implementing')).toBe(true);
    });

    it('allows review_rejected → implementing (retry)', () => {
      expect(isValidTransition('review_rejected', 'implementing')).toBe(true);
    });

    it('rejects created → approved (skipping stages)', () => {
      expect(isValidTransition('created', 'approved')).toBe(false);
    });

    it('rejects approved → planning (terminal cannot transition)', () => {
      expect(isValidTransition('approved', 'planning')).toBe(false);
    });

    it('rejects failed → implementing (terminal cannot transition)', () => {
      expect(isValidTransition('failed', 'implementing')).toBe(false);
    });

    it('rejects testing → planning (backwards)', () => {
      expect(isValidTransition('testing', 'planning')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    const terminals: RunStatus[] = ['approved', 'cancelled', 'failed', 'blocked'];
    const nonTerminals: RunStatus[] = ['created', 'planning', 'implementing', 'testing'];

    terminals.forEach((s) => {
      it(`${s} is terminal`, () => expect(isTerminal(s)).toBe(true));
    });

    nonTerminals.forEach((s) => {
      it(`${s} is not terminal`, () => expect(isTerminal(s)).toBe(false));
    });
  });

  describe('assertValidTransition', () => {
    it('does not throw for valid transition', () => {
      expect(() => assertValidTransition('created', 'planning')).not.toThrow();
    });

    it('throws for invalid transition with helpful message', () => {
      expect(() => assertValidTransition('approved', 'planning')).toThrowError(
        /Invalid state transition: approved → planning/
      );
    });
  });

  describe('getNextStageStatus', () => {
    it('planning success → awaiting_plan_approval', () => {
      expect(getNextStageStatus('planning', 'success')).toBe('awaiting_plan_approval');
    });

    it('implementing success → testing', () => {
      expect(getNextStageStatus('implementing', 'success')).toBe('testing');
    });

    it('testing success → reviewing', () => {
      expect(getNextStageStatus('testing', 'success')).toBe('reviewing');
    });

    it('reviewing success → approved', () => {
      expect(getNextStageStatus('reviewing', 'success')).toBe('approved');
    });

    it('testing failure → testing_failed', () => {
      expect(getNextStageStatus('testing', 'failure')).toBe('testing_failed');
    });

    it('reviewing failure → review_rejected', () => {
      expect(getNextStageStatus('reviewing', 'failure')).toBe('review_rejected');
    });

    it('any blocked → blocked', () => {
      expect(getNextStageStatus('implementing', 'blocked')).toBe('blocked');
    });
  });
});

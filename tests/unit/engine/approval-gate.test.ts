import { describe, it, expect, vi } from 'vitest';
import * as readline from 'readline';
import { ApprovalGate } from '../../../src/engine/approval-gate.js';

vi.mock('readline', () => ({
  createInterface: vi.fn(),
}));

function mockAnswers(answers: string[]): void {
  let callIndex = 0;
  (readline.createInterface as ReturnType<typeof vi.fn>).mockReturnValue({
    question: vi.fn((_prompt: string, callback: (answer: string) => void) => {
      callback(answers[callIndex++] ?? '');
    }),
    close: vi.fn(),
  });
}

describe('ApprovalGate', () => {
  it('resolves approved for "a" and "approve"', async () => {
    const gate = new ApprovalGate();

    mockAnswers(['a']);
    await expect(gate.requestApproval('')).resolves.toBe('approved');

    mockAnswers(['approve']);
    await expect(gate.requestApproval('')).resolves.toBe('approved');
  });

  it('resolves rejected for "r" and "reject"', async () => {
    const gate = new ApprovalGate();

    mockAnswers(['r']);
    await expect(gate.requestApproval('')).resolves.toBe('rejected');

    mockAnswers(['reject']);
    await expect(gate.requestApproval('')).resolves.toBe('rejected');
  });

  it('resolves exported for "e" and "export"', async () => {
    const gate = new ApprovalGate();

    mockAnswers(['e']);
    await expect(gate.requestApproval('')).resolves.toBe('exported');

    mockAnswers(['export']);
    await expect(gate.requestApproval('')).resolves.toBe('exported');
  });

  it('resolves cancelled for "c" and "cancel"', async () => {
    const gate = new ApprovalGate();

    mockAnswers(['c']);
    await expect(gate.requestApproval('')).resolves.toBe('cancelled');

    mockAnswers(['cancel']);
    await expect(gate.requestApproval('')).resolves.toBe('cancelled');
  });

  it('re-prompts on invalid input until a valid choice is given', async () => {
    const gate = new ApprovalGate();
    mockAnswers(['x', 'maybe', 'a']);

    await expect(gate.requestApproval('')).resolves.toBe('approved');
  });
});

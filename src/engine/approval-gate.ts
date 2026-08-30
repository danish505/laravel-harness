import * as readline from 'readline';
import type { ApprovalDecision } from '../types.js';

export class ApprovalGate {
  /** If `prompt` is non-empty it is printed before asking. Pass empty string when
   *  the caller (e.g. ProgressReporter) has already printed the plan. */
  async requestApproval(prompt: string): Promise<ApprovalDecision> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const question = prompt
        ? `\n${prompt}\n  [a]pprove / [r]eject / [c]ancel: `
        : '  [a]pprove / [r]eject / [c]ancel: ';

      rl.question(question, (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'a' || a === 'approve') resolve('approved');
        else if (a === 'r' || a === 'reject') resolve('rejected');
        else resolve('cancelled');
      });
    });
  }
}

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

    const baseQuestion = prompt
      ? `\n${prompt}\n  [a]pprove / [r]eject / [e]xport / [c]ancel: `
      : '  [a]pprove / [r]eject / [e]xport / [c]ancel: ';

    return new Promise((resolve) => {
      const ask = (question: string): void => {
        rl.question(question, (answer) => {
          const a = answer.trim().toLowerCase();
          if (a === 'a' || a === 'approve') {
            rl.close();
            resolve('approved');
          } else if (a === 'r' || a === 'reject') {
            rl.close();
            resolve('rejected');
          } else if (a === 'e' || a === 'export') {
            rl.close();
            resolve('exported');
          } else if (a === 'c' || a === 'cancel') {
            rl.close();
            resolve('cancelled');
          } else {
            process.stdout.write('  Invalid choice. Please enter a, r, e, or c.\n');
            ask('  [a]pprove / [r]eject / [e]xport / [c]ancel: ');
          }
        });
      };

      ask(baseQuestion);
    });
  }
}

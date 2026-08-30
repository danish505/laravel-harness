import * as readline from 'readline';
import type { ApprovalDecision } from '../types.js';

export class ApprovalGate {
  async requestApproval(prompt: string): Promise<ApprovalDecision> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`\n${prompt}\n  [a]pprove / [r]eject / [c]ancel: `, (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'a' || a === 'approve') resolve('approved');
        else if (a === 'r' || a === 'reject') resolve('rejected');
        else resolve('cancelled');
      });
    });
  }
}

import * as fs from 'fs';
import * as path from 'path';

const LOCK_FILE = '.lock';
const LOCK_TIMEOUT_MS = 30_000;

export class RunLock {
  private lockPath: string;

  constructor(runDir: string) {
    this.lockPath = path.join(runDir, LOCK_FILE);
  }

  /** Acquire the lock. Throws if another process holds it for > LOCK_TIMEOUT_MS. */
  acquire(): void {
    if (fs.existsSync(this.lockPath)) {
      const stat = fs.statSync(this.lockPath);
      const age = Date.now() - stat.mtimeMs;
      if (age < LOCK_TIMEOUT_MS) {
        const pid = fs.readFileSync(this.lockPath, 'utf8').trim();
        throw new Error(
          `Run is locked by process ${pid} (${Math.round(age / 1000)}s ago). ` +
            `Use 'lh cancel <run-id>' if the process is gone.`
        );
      }
      // Stale lock — remove it
      fs.unlinkSync(this.lockPath);
    }
    fs.writeFileSync(this.lockPath, String(process.pid), 'utf8');
  }

  release(): void {
    if (fs.existsSync(this.lockPath)) {
      fs.unlinkSync(this.lockPath);
    }
  }

  isLocked(): boolean {
    return fs.existsSync(this.lockPath);
  }
}

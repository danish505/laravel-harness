const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export class Spinner {
  private label = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private startedAt = 0;
  private readonly isTTY: boolean;

  constructor(isTTY = process.stdout.isTTY ?? false) {
    this.isTTY = isTTY;
  }

  start(label: string): void {
    this.label = label;
    this.startedAt = Date.now();
    this.frameIndex = 0;

    if (!this.isTTY) {
      process.stdout.write(`  → ${label}\n`);
      return;
    }

    this.render();
    this.timer = setInterval(() => this.render(), INTERVAL_MS);
  }

  updateLabel(label: string): void {
    this.label = label;
  }

  /** Stop the spinner and print a final status line. */
  stop(icon: string, finalLabel: string): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);

    if (this.isTTY) {
      this.clearLine();
      process.stdout.write(`  ${icon} ${finalLabel} \x1b[2m(${elapsed}s)\x1b[0m\n`);
    } else {
      process.stdout.write(`  ${icon} ${finalLabel} (${elapsed}s)\n`);
    }
  }

  /** Print an indented sub-line beneath the spinner without interrupting it. */
  printSubLine(text: string): void {
    if (!this.isTTY) {
      process.stdout.write(`      ${text}\n`);
      return;
    }
    this.clearLine();
    process.stdout.write(`      \x1b[2m${text}\x1b[0m\n`);
    this.render();
  }

  private render(): void {
    const frame = FRAMES[this.frameIndex % FRAMES.length];
    this.frameIndex++;
    this.clearLine();
    process.stdout.write(`  \x1b[36m${frame}\x1b[0m ${this.label}`);
  }

  private clearLine(): void {
    process.stdout.write('\r\x1b[2K');
  }
}

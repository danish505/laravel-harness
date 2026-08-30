import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressReporter } from '../../../src/ui/progress-reporter.js';
import { Spinner } from '../../../src/ui/spinner.js';

function makeSpySpinner() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    updateLabel: vi.fn(),
    printSubLine: vi.fn(),
  } as unknown as Spinner;
}

describe('ProgressReporter', () => {
  let spinner: ReturnType<typeof makeSpySpinner>;
  let reporter: ProgressReporter;

  beforeEach(() => {
    spinner = makeSpySpinner();
    reporter = new ProgressReporter(spinner);
  });

  it('starts spinner with stage label on stageStarted', () => {
    reporter.stageStarted('planning', 1);
    expect(spinner.start).toHaveBeenCalledOnce();
    const label = (spinner.start as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(label).toContain('planning');
  });

  it('includes attempt number in label when attempt > 1', () => {
    reporter.stageStarted('testing', 2);
    const label = (spinner.start as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(label).toContain('attempt 2');
  });

  it('stops spinner with success icon on stageCompleted', () => {
    reporter.stageStarted('implementing', 1);
    reporter.stageCompleted('implementing');
    const [icon, label] = (spinner.stop as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(icon).toBe('✅');
    expect(label).toContain('implementing');
  });

  it('stops spinner with failure icon on stageFailed', () => {
    reporter.stageStarted('testing', 1);
    reporter.stageFailed('testing', 'test_failure');
    const [icon, label] = (spinner.stop as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(icon).toBe('❌');
    expect(label).toContain('testing');
    expect(label).toContain('test_failure');
  });

  it('prints sub-line for command codex events', () => {
    reporter.stageStarted('implementing', 1);
    reporter.codexEvent({ type: 'command', detail: 'php artisan migrate' });
    expect(spinner.printSubLine).toHaveBeenCalledOnce();
    const line = (spinner.printSubLine as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(line).toContain('php artisan migrate');
  });

  it('truncates long sub-lines to 80 chars', () => {
    reporter.stageStarted('implementing', 1);
    reporter.codexEvent({ type: 'command', detail: 'x'.repeat(100) });
    const line = (spinner.printSubLine as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // icon + space + 80 visible chars
    expect(line.length).toBeLessThanOrEqual(85);
    expect(line).toContain('…');
  });

  it('prints retrying message to stdout', () => {
    const writes: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string) => { writes.push(s); return true; }) as typeof process.stdout.write;

    reporter.retrying('testing', 2);

    process.stdout.write = origWrite;
    const combined = writes.join('');
    expect(combined).toContain('retrying');
    expect(combined).toContain('attempt 2');
  });
});

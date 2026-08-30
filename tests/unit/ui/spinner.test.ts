import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Spinner } from '../../../src/ui/spinner.js';

function makeMockStdout() {
  const written: string[] = [];
  return {
    write: vi.fn((s: string) => { written.push(s); return true; }),
    written,
  };
}

describe('Spinner (TTY mode)', () => {
  it('renders a frame on start', () => {
    vi.useFakeTimers();
    const out = makeMockStdout();
    const spinner = new Spinner(true);
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = out.write as typeof process.stdout.write;

    spinner.start('working…');

    expect(out.written.some((s) => s.includes('working…'))).toBe(true);

    spinner.stop('✅', 'done');
    process.stdout.write = origWrite;
    vi.useRealTimers();
  });

  it('prints final status line on stop', () => {
    const out = makeMockStdout();
    const spinner = new Spinner(true);
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = out.write as typeof process.stdout.write;

    spinner.start('running');
    spinner.stop('❌', 'failed');

    const combined = out.written.join('');
    expect(combined).toContain('failed');

    process.stdout.write = origWrite;
  });
});

describe('Spinner (non-TTY / CI mode)', () => {
  it('writes a plain text line on start without ANSI or intervals', () => {
    const out = makeMockStdout();
    const spinner = new Spinner(false);
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = out.write as typeof process.stdout.write;

    spinner.start('building…');

    expect(out.written.some((s) => s.includes('building…'))).toBe(true);
    // No ANSI escape codes in non-TTY mode
    const combined = out.written.join('');
    expect(combined).not.toContain('\x1b[');

    spinner.stop('✅', 'done');
    process.stdout.write = origWrite;
  });
});

import { spawnSync } from 'child_process';

export function getCodexCliAvailabilityError(cwd: string): string | null {
  const result = spawnSync('codex', ['--version'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) {
    return `Codex CLI is not available: ${result.error.message}. Install Codex CLI and run "lh doctor".`;
  }

  if (result.status !== 0) {
    const details = [result.stderr, result.stdout]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .trim();

    return details
      ? `Codex CLI check failed: ${details}`
      : `Codex CLI check failed with exit code ${result.status}.`;
  }

  return null;
}

export function isCodexCliAvailable(cwd: string): boolean {
  return getCodexCliAvailabilityError(cwd) === null;
}

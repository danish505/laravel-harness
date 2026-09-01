import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCodexProjectConfigError, REQUIRED_CODEX_FILES } from '../../../src/providers/codex-preflight.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-codex-preflight-test-'));
}

describe('getCodexProjectConfigError', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when all required files exist', () => {
    const codexDir = path.join(tmpDir, '.codex');
    const agentsDir = path.join(codexDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    for (const relativePath of REQUIRED_CODEX_FILES) {
      fs.writeFileSync(path.join(codexDir, relativePath), '', 'utf8');
    }

    expect(getCodexProjectConfigError(tmpDir)).toBeNull();
  });

  it('returns an error listing missing files', () => {
    const error = getCodexProjectConfigError(tmpDir);

    expect(error).not.toBeNull();
    expect(error).toContain('.codex/config.toml');
    expect(error).toContain('.codex/global-rules.md');
    expect(error).toContain('.codex/agents/planner.toml');
    expect(error).toContain('lh init');
  });

  it('reports a file that exists but is unreadable', () => {
    const codexDir = path.join(tmpDir, '.codex');
    const agentsDir = path.join(codexDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    for (const relativePath of REQUIRED_CODEX_FILES) {
      const filePath = path.join(codexDir, relativePath);
      fs.writeFileSync(filePath, '', 'utf8');
    }

    fs.chmodSync(path.join(codexDir, 'global-rules.md'), 0o000);

    const error = getCodexProjectConfigError(tmpDir);
    expect(error).toContain('.codex/global-rules.md');

    fs.chmodSync(path.join(codexDir, 'global-rules.md'), 0o644);
  });
});

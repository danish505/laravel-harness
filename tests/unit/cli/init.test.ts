import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCommand } from '../../../src/cli/commands/init.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-init-command-test-'));
}

describe('initCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates harness config and deploys Codex setup files', () => {
    initCommand(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, '.largentic', 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.largentic', 'task.md'))).toBe(true);

    expect(fs.existsSync(path.join(tmpDir, '.codex', 'config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.codex', 'global-rules.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.codex', 'agents', 'planner.toml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.codex', 'agents', 'implementer.toml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.codex', 'agents', 'tester.toml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.codex', 'agents', 'reviewer.toml'))).toBe(true);
  });

  it('does not overwrite existing Codex files', () => {
    const codexDir = path.join(tmpDir, '.codex');
    const agentsDir = path.join(codexDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, 'global-rules.md'), 'custom rules', 'utf8');
    fs.writeFileSync(path.join(agentsDir, 'planner.toml'), 'custom planner', 'utf8');

    initCommand(tmpDir);

    expect(fs.readFileSync(path.join(codexDir, 'global-rules.md'), 'utf8')).toBe('custom rules');
    expect(fs.readFileSync(path.join(agentsDir, 'planner.toml'), 'utf8')).toBe('custom planner');
    expect(fs.existsSync(path.join(agentsDir, 'implementer.toml'))).toBe(true);
  });

  it('is a no-op when config already exists', () => {
    const harnessDir = path.join(tmpDir, '.largentic');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'config.yaml'), 'version: 2\n', 'utf8');

    initCommand(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, '.codex', 'config.toml'))).toBe(false);
  });
});

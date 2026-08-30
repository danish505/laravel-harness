import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { loadConfig } from '../../../src/config/loader.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-config-test-'));
}

function writeConfig(dir: string, content: object): string {
  const harnessDir = path.join(dir, '.laravel-harness');
  fs.mkdirSync(harnessDir, { recursive: true });
  const configPath = path.join(harnessDir, 'config.yaml');
  fs.writeFileSync(configPath, yaml.dump(content), 'utf8');
  return configPath;
}

describe('config loader', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('returns defaults when config file does not exist', () => {
    const missing = path.join(tmpDir, '.laravel-harness', 'config.yaml');
    const { config, valid } = loadConfig(missing);
    expect(valid).toBe(false);
    expect(config.workflow.max_attempts).toBe(3);
  });

  it('validates a minimal valid config', () => {
    const configPath = writeConfig(tmpDir, { version: 2 });
    const { valid, errors } = loadConfig(configPath);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it('merges partial config with defaults', () => {
    const configPath = writeConfig(tmpDir, {
      version: 2,
      workflow: { max_attempts: 5 },
    });
    const { config, valid } = loadConfig(configPath);
    expect(valid).toBe(true);
    expect(config.workflow.max_attempts).toBe(5);
    expect(config.workflow.plan_approval).toBe('required'); // default preserved
  });

  it('rejects config with wrong version', () => {
    const configPath = writeConfig(tmpDir, { version: 1 });
    const { valid, errors } = loadConfig(configPath);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects config with invalid profile', () => {
    const configPath = writeConfig(tmpDir, { version: 2, profile: 'django' });
    const { valid, errors } = loadConfig(configPath);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('profile'))).toBe(true);
  });

  it('rejects max_attempts below 1', () => {
    const configPath = writeConfig(tmpDir, {
      version: 2,
      workflow: { max_attempts: 0 },
    });
    const { valid, errors } = loadConfig(configPath);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('max_attempts'))).toBe(true);
  });

  it('applies LH_PROVIDER env override', () => {
    const configPath = writeConfig(tmpDir, { version: 2, provider: 'codex' });
    process.env.LH_PROVIDER = 'fake';
    const { config } = loadConfig(configPath);
    delete process.env.LH_PROVIDER;
    expect(config.provider).toBe('fake');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StateStore } from '../../../src/state/state-store.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-test-'));
}

describe('StateStore', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('initializes state with created status', () => {
    const store = new StateStore(tmpDir);
    const state = store.initialize('test-run-1');
    expect(state.status).toBe('created');
    expect(state.run_id).toBe('test-run-1');
    expect(state.attempt).toBe(0);
    expect(state.schema_version).toBe('2.0');
  });

  it('writes state atomically (no .tmp file left behind)', () => {
    const store = new StateStore(tmpDir);
    store.initialize('test-run-2');
    store.transition('planning');
    expect(fs.existsSync(path.join(tmpDir, 'state.json.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'state.json'))).toBe(true);
  });

  it('persists state across store instances', () => {
    const store1 = new StateStore(tmpDir);
    store1.initialize('test-run-3');
    store1.transition('planning');

    const store2 = new StateStore(tmpDir);
    expect(store2.read().status).toBe('planning');
  });

  it('increments attempt on retry transitions', () => {
    const store = new StateStore(tmpDir);
    store.initialize('test-run-4');
    store.transition('planning');
    store.transition('awaiting_plan_approval');
    store.transition('implementing');
    store.transition('testing');
    store.transition('testing_failed');
    const state = store.transition('implementing');
    expect(state.attempt).toBe(1);
  });

  it('does not increment attempt on normal forward transitions', () => {
    const store = new StateStore(tmpDir);
    store.initialize('test-run-5');
    store.transition('planning');
    const state = store.transition('awaiting_plan_approval');
    expect(state.attempt).toBe(0);
  });

  it('throws on invalid transition', () => {
    const store = new StateStore(tmpDir);
    store.initialize('test-run-6');
    expect(() => store.transition('approved')).toThrowError(/Invalid state transition/);
  });

  it('throws on transition from terminal state', () => {
    const store = new StateStore(tmpDir);
    store.initialize('test-run-7');
    store.transition('cancelled');
    expect(() => store.transition('planning')).toThrowError(/Invalid state transition/);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RunManager } from '../../../src/engine/run-manager.js';
import { WorkflowEngine } from '../../../src/engine/workflow-engine.js';
import { FakeProvider } from '../../../src/providers/fake-provider.js';
import { StateStore } from '../../../src/state/state-store.js';
import type { HarnessConfig, AgentResult } from '../../../src/types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lh-workflow-test-'));
}

function defaultConfig(): HarnessConfig {
  return {
    version: 2,
    profile: 'generic',
    workflow: { max_attempts: 3, plan_approval: 'automatic', review_approval: 'automatic' },
    agents: {},
    quality_gates: { require_tests: true, require_clean_secrets_scan: true, max_changed_files: 25 },
    budget: { max_runtime_minutes: 45, max_estimated_cost_usd: 10 },
    provider: 'fake',
  };
}

describe('WorkflowEngine — integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Write minimal config
    const harnessDir = path.join(tmpDir, '.laravel-harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'config.yaml'), yaml.dump({ version: 2 }));
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('completes a full successful workflow', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Add rate limiting', {
      profile: 'generic',
      provider: 'fake',
    });

    const engine = new WorkflowEngine({
      config: defaultConfig(),
      provider: new FakeProvider(),
      runId,
      paths,
      task: 'Add rate limiting',
      autoApprove: true,
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');

    // All four artifact files should exist
    for (const artifact of ['plan.md', 'implementation.md', 'test-results.md', 'review.md']) {
      expect(fs.existsSync(path.join(paths.runDir, artifact))).toBe(true);
    }

    // events.jsonl should have events
    const events = fs
      .readFileSync(paths.eventsFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(events.length).toBeGreaterThan(4);
    expect(events.some((e: { type: string }) => e.type === 'stage_complete')).toBe(true);
  });

  it('retries when tester fails and succeeds on second attempt', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Fix bug', { profile: 'generic', provider: 'fake' });

    const failResult: AgentResult = {
      status: 'failure',
      content: 'Test failed: expected 200 got 500',
      failureClassification: 'test_failure',
    };

    let testCallCount = 0;
    const provider = new FakeProvider({
      testing: failResult, // will be overridden after first call
    });

    // Override to succeed on second call
    const originalExecute = provider.execute.bind(provider);
    provider.execute = async (req) => {
      if (req.stage === 'testing') {
        testCallCount++;
        if (testCallCount === 1) return failResult;
        return { status: 'success', content: 'All tests passed.', usage: { inputTokens: 100, outputTokens: 50 } };
      }
      return originalExecute(req);
    };

    const engine = new WorkflowEngine({
      config: defaultConfig(),
      provider,
      runId,
      paths,
      task: 'Fix bug',
      autoApprove: true,
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');
    expect(testCallCount).toBe(2);
  });

  it('reaches failed state when max_attempts exceeded', async () => {
    const config = defaultConfig();
    config.workflow.max_attempts = 2;

    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Always failing task', { profile: 'generic', provider: 'fake' });

    const provider = new FakeProvider({
      testing: {
        status: 'failure',
        content: 'Tests always fail',
        failureClassification: 'test_failure',
      },
    });

    const engine = new WorkflowEngine({
      config,
      provider,
      runId,
      paths,
      task: 'Always failing task',
      autoApprove: true,
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('failed');
    expect(finalState.failure_reason).toMatch(/Max attempts/);
  });

  it('resumes from last completed stage without repeating it', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Resume test', { profile: 'generic', provider: 'fake' });

    // Manually advance state to 'implementing' (simulating planning already done)
    const store = new StateStore(paths.runDir);
    store.transition('planning');
    store.transition('awaiting_plan_approval');
    store.transition('implementing');
    fs.writeFileSync(path.join(paths.runDir, 'plan.md'), '## Plan\n\nAlready planned.', 'utf8');

    const provider = new FakeProvider();
    const callLog: string[] = [];
    const originalExecute = provider.execute.bind(provider);
    provider.execute = async (req) => {
      callLog.push(req.stage);
      return originalExecute(req);
    };

    const engine = new WorkflowEngine({
      config: defaultConfig(),
      provider,
      runId,
      paths,
      task: 'Resume test',
      autoApprove: true,
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');
    // Planning should NOT have been called — we resumed from implementing
    expect(callLog).not.toContain('planning');
    expect(callLog).toContain('implementing');
  });

  it('writes all transitions to events.jsonl', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Events test', { profile: 'generic', provider: 'fake' });

    const engine = new WorkflowEngine({
      config: defaultConfig(),
      provider: new FakeProvider(),
      runId,
      paths,
      task: 'Events test',
      autoApprove: true,
    });

    await engine.run();

    const lines = fs.readFileSync(paths.eventsFile, 'utf8').split('\n').filter(Boolean);
    const events = lines.map((l) => JSON.parse(l));
    const types = events.map((e: { type: string }) => e.type);

    expect(types).toContain('stage_start');
    expect(types).toContain('stage_complete');
    expect(types).toContain('agent_call_start');
    expect(types).toContain('agent_call_complete');
  });

  it('does not advance state after malformed agent result', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Malformed test', { profile: 'generic', provider: 'fake' });

    const config = defaultConfig();
    config.workflow.max_attempts = 1;

    const provider = new FakeProvider({
      implementing: {
        status: 'failure',
        content: 'Internal error',
        failureClassification: 'infrastructure',
      },
      testing: {
        status: 'failure',
        content: 'Always fails',
        failureClassification: 'test_failure',
      },
    });

    const engine = new WorkflowEngine({
      config,
      provider,
      runId,
      paths,
      task: 'Malformed test',
      autoApprove: true,
    });

    const finalState = await engine.run();
    // Should not be approved with failures
    expect(finalState.status).not.toBe('approved');
  });
});

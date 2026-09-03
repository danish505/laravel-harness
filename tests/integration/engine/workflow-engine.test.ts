import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RunManager } from '../../../src/engine/run-manager.js';
import { WorkflowEngine } from '../../../src/engine/workflow-engine.js';
import { ApprovalGate } from '../../../src/engine/approval-gate.js';
import { FakeProvider } from '../../../src/providers/fake-provider.js';
import { StateStore } from '../../../src/state/state-store.js';
import type { HarnessConfig, AgentResult, ApprovalDecision } from '../../../src/types.js';

function makeGate(decisions: ApprovalDecision[], updateNotes: string[] = []): ApprovalGate {
  let index = 0;
  let updateIndex = 0;
  return {
    requestApproval: async () => decisions[index++] ?? 'cancelled',
    requestPlanUpdate: async () => updateNotes[updateIndex++] ?? 'Test update notes',
  } as ApprovalGate;
}

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
    const harnessDir = path.join(tmpDir, '.largentic');
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
      cwd: tmpDir,
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
      cwd: tmpDir,
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
      cwd: tmpDir,
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
      cwd: tmpDir,
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
      cwd: tmpDir,
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
      cwd: tmpDir,
      autoApprove: true,
    });

    const finalState = await engine.run();
    // Should not be approved with failures
    expect(finalState.status).not.toBe('approved');
  });

  it('passes conductor context to each stage', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Conductor test', { profile: 'generic', provider: 'fake' });

    const provider = new FakeProvider();
    const requests: Array<{ stage: string; systemPrompt: string; userMessage: string }> = [];
    const originalExecute = provider.execute.bind(provider);
    provider.execute = async (req) => {
      requests.push({ stage: req.stage, systemPrompt: req.systemPrompt, userMessage: req.userMessage });
      return originalExecute(req);
    };

    const engine = new WorkflowEngine({
      config: defaultConfig(),
      provider,
      runId,
      paths,
      task: 'Conductor test',
      cwd: tmpDir,
      autoApprove: true,
    });

    await engine.run();

    expect(requests).toHaveLength(4);

    const planning = requests.find((r) => r.stage === 'planning');
    expect(planning).toBeDefined();
    expect(planning!.systemPrompt).toContain('Selected agent: planner');
    expect(planning!.systemPrompt).toContain(`.codex/global-rules.md`);
    expect(planning!.systemPrompt).toContain(runId);
    expect(planning!.systemPrompt).toContain(paths.runDir);

    const implementing = requests.find((r) => r.stage === 'implementing');
    expect(implementing).toBeDefined();
    expect(implementing!.systemPrompt).toContain('Selected agent: implementer');
    expect(implementing!.systemPrompt).toContain(path.join(paths.runDir, 'plan.md'));
    expect(implementing!.systemPrompt).toContain(path.join(paths.runDir, 'implementation.md'));

    const testing = requests.find((r) => r.stage === 'testing');
    expect(testing).toBeDefined();
    expect(testing!.systemPrompt).toContain('Selected agent: tester');
    expect(testing!.systemPrompt).toContain(path.join(paths.runDir, 'implementation.md'));

    const reviewing = requests.find((r) => r.stage === 'reviewing');
    expect(reviewing).toBeDefined();
    expect(reviewing!.systemPrompt).toContain('Selected agent: reviewer');
    expect(reviewing!.systemPrompt).toContain(path.join(paths.runDir, 'test-results.md'));
  });

  it('exports the plan to the default directory and then approves', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Export then approve', { profile: 'generic', provider: 'fake' });

    const config = defaultConfig();
    config.workflow.plan_approval = 'required';

    const engine = new WorkflowEngine({
      config,
      provider: new FakeProvider(),
      runId,
      paths,
      task: 'Export then approve',
      cwd: tmpDir,
      approvalGate: makeGate(['exported', 'approved']),
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');

    const exportPath = path.join(tmpDir, '.largentic', 'exports', `plan-${runId}.md`);
    expect(fs.existsSync(exportPath)).toBe(true);
    expect(fs.readFileSync(exportPath, 'utf8')).toBe(fs.readFileSync(path.join(paths.runDir, 'plan.md'), 'utf8'));
  });

  it('exports the plan to a configured directory', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Export to custom dir', { profile: 'generic', provider: 'fake' });

    const config = defaultConfig();
    config.workflow.plan_approval = 'required';
    config.workflow.plan_export_directory = 'docs/plans';

    const engine = new WorkflowEngine({
      config,
      provider: new FakeProvider(),
      runId,
      paths,
      task: 'Export to custom dir',
      cwd: tmpDir,
      approvalGate: makeGate(['exported', 'approved']),
    });

    await engine.run();

    const exportPath = path.join(tmpDir, 'docs', 'plans', `plan-${runId}.md`);
    expect(fs.existsSync(exportPath)).toBe(true);
  });

  it('does not advance state when export fails', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Export failure', { profile: 'generic', provider: 'fake' });

    const config = defaultConfig();
    config.workflow.plan_approval = 'required';
    config.workflow.plan_export_directory = path.join(paths.runDir, 'plan.md'); // file, not directory

    const engine = new WorkflowEngine({
      config,
      provider: new FakeProvider(),
      runId,
      paths,
      task: 'Export failure',
      cwd: tmpDir,
      approvalGate: makeGate(['exported', 'approved']),
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');
  });

  it('cancels the run when plan is rejected after export', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Export then reject', { profile: 'generic', provider: 'fake' });

    const config = defaultConfig();
    config.workflow.plan_approval = 'required';

    const engine = new WorkflowEngine({
      config,
      provider: new FakeProvider(),
      runId,
      paths,
      task: 'Export then reject',
      cwd: tmpDir,
      approvalGate: makeGate(['exported', 'rejected']),
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('cancelled');
    expect(finalState.failure_reason).toBe('Plan rejected by user');
  });

  it('allows updating plan and re-invoking planner before approving', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Add update test', {
      profile: 'generic',
      provider: 'fake',
    });

    const config = defaultConfig();
    config.workflow.plan_approval = 'required';

    const provider = new FakeProvider();
    const calls: any[] = [];
    const originalExecute = provider.execute.bind(provider);
    provider.execute = async (req) => {
      calls.push(req);
      return originalExecute(req);
    };

    // First, user updates, then user approves
    const gate = makeGate(['update', 'approved'], ['My custom note to planner']);

    const engine = new WorkflowEngine({
      config,
      provider,
      runId,
      paths,
      task: 'Add update test',
      cwd: tmpDir,
      approvalGate: gate,
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');

    // Planning should have been called TWICE
    const planningCalls = calls.filter((c) => c.stage === 'planning');
    expect(planningCalls.length).toBe(2);

    // First call shouldn't have previousPlan/planUpdateNotes since it's initial planning
    expect(planningCalls[0].systemPrompt).not.toContain('REVISION REQUEST');

    // Second call should have previousPlan/planUpdateNotes
    expect(planningCalls[1].systemPrompt).toContain('REVISION REQUEST');
    expect(planningCalls[1].userMessage).toContain('My custom note to planner');
    expect(planningCalls[1].userMessage).toContain('Previous Plan:');
  });

  it('skips planning stage and starts from implementing when initialPlan is provided', async () => {
    const manager = new RunManager(tmpDir);
    const { runId, paths } = manager.create('Direct implement test', { profile: 'generic', provider: 'fake' });

    const provider = new FakeProvider();
    const callLog: string[] = [];
    const originalExecute = provider.execute.bind(provider);
    provider.execute = async (req) => {
      callLog.push(req.stage);
      return originalExecute(req);
    };

    const initialPlanText = '## Predefined Plan\n\nCustom instruction details';

    const engine = new WorkflowEngine({
      config: defaultConfig(),
      provider,
      runId,
      paths,
      task: 'Direct implement test',
      cwd: tmpDir,
      autoApprove: true,
      initialPlan: initialPlanText,
    });

    const finalState = await engine.run();
    expect(finalState.status).toBe('approved');

    // Planning should NOT have been called via provider
    expect(callLog).not.toContain('planning');
    expect(callLog).toContain('implementing');

    // plan.md artifact must have been written with the custom plan text
    const planPath = path.join(paths.runDir, 'plan.md');
    expect(fs.existsSync(planPath)).toBe(true);
    expect(fs.readFileSync(planPath, 'utf8')).toBe(initialPlanText);
  });
});

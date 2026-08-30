import type { AgentProvider, AgentRequest, AgentResult, Stage } from '../types.js';

type FixtureMap = Partial<Record<Stage, AgentResult>>;

const DEFAULT_FIXTURES: Record<Stage, AgentResult> = {
  planning: {
    status: 'success',
    content: '## Plan\n\nTask understood. Will modify the relevant files.\n\n## Files to Change\n- app/Http/Controllers/ExampleController.php\n\n## Steps\n1. Implement the change.\n2. Write tests.\n\n## Handoff to Implementer\nProceed with implementation.',
    usage: { inputTokens: 120, outputTokens: 280 },
  },
  implementing: {
    status: 'success',
    content: '## Implementation\n\nChanges applied to ExampleController.php.\n\n## Summary\nAdded the requested feature. Tests updated.',
    usage: { inputTokens: 200, outputTokens: 350 },
  },
  testing: {
    status: 'success',
    content: '## Test Results\n\nAll tests passed.\n\n```\nOK (12 tests, 24 assertions)\n```',
    usage: { inputTokens: 180, outputTokens: 120 },
  },
  reviewing: {
    status: 'success',
    content: '## Review\n\n✅ APPROVED\n\nThe implementation is correct and well-tested. No blocking findings.',
    usage: { inputTokens: 300, outputTokens: 200 },
  },
};

export class FakeProvider implements AgentProvider {
  private fixtures: Record<Stage, AgentResult>;
  private callLog: Array<{ request: AgentRequest; result: AgentResult }> = [];

  constructor(overrides: FixtureMap = {}) {
    this.fixtures = { ...DEFAULT_FIXTURES, ...overrides };
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    // Simulate small async delay
    await new Promise((r) => setTimeout(r, 10));
    const result = this.fixtures[request.stage] ?? {
      status: 'failure' as const,
      content: `No fixture defined for stage: ${request.stage}`,
      failureClassification: 'invalid_output' as const,
    };
    this.callLog.push({ request, result });
    return result;
  }

  /** Override the result for a specific stage (e.g., simulate test failure on attempt 1). */
  setFixture(stage: Stage, result: AgentResult): void {
    this.fixtures[stage] = result;
  }

  getCallLog(): Array<{ request: AgentRequest; result: AgentResult }> {
    return [...this.callLog];
  }

  clearCallLog(): void {
    this.callLog = [];
  }
}

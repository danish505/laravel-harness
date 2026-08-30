# ADR-003: Codex-First with a Stable Provider Adapter Interface

**Status:** Accepted  
**Date:** 2026-08-30

## Context

V2 needs to call AI agents (planner, implementer, tester, reviewer). The current V1 workflow is built around the Codex CLI. V2 should not hard-code Codex calls throughout the engine, but launching with multiple providers adds integration surface and complexity.

Alternatives considered:
- **Codex-only, no abstraction** — simplest but makes future provider swaps expensive.
- **Multi-provider at launch** — correct long-term but requires designing auth, output parsing, and rate-limit handling for N providers before V2.0.
- **Codex-first with adapter interface** — one real implementation now, stable contract for future providers.

## Decision

Define a **stable `AgentProvider` interface** in `src/providers/provider-interface.ts`:

```typescript
interface AgentRequest {
  stage: Stage;
  runId: string;
  attempt: number;
  systemPrompt: string;
  userMessage: string;
  contextFiles: ContextFile[];
}

interface AgentResult {
  status: 'success' | 'failure' | 'blocked';
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  failureClassification?: string;
  rawOutput?: string;
}

interface AgentProvider {
  execute(request: AgentRequest): Promise<AgentResult>;
}
```

Ship two implementations at launch:
1. **`CodexProvider`** — wraps the Codex CLI, parses stdout, maps to `AgentResult`.
2. **`FakeProvider`** — returns deterministic results from fixtures; used in all automated tests.

Future providers (Claude, OpenAI Responses API, local models) implement the same interface without touching the engine.

## Consequences

- All engine code depends only on the interface, never on Codex-specific details.
- `FakeProvider` makes CI fully deterministic without API keys.
- Adding a new provider is a single file that implements `AgentProvider`.
- The Codex CLI must be installed for production runs; `lh doctor` checks and reports this.

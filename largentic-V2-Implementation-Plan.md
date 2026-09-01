# Laravel Harness V2 — Implementation Plan

> Derived from `laravel-harness-V2-Project-Plan.md`.  
> One developer, ~10–15 hours/week. Target: 14–18 weeks to `2.0.0`.

---

## Pre-Implementation Decisions to Confirm

Before writing code, lock these down:

1. **Provider strategy** — Codex-first with an adapter interface (recommended). No multi-provider complexity at launch.
2. **Approval UX** — Interactive terminal prompt (stdin) for V2.0; defer web/Slack hooks to V2.x.
3. **V1 compatibility boundary** — V1 `harness/` directory is preserved untouched. `lh migrate` generates V2 config alongside it.
4. **State storage** — JSON files in `.laravel-harness/runs/<run-id>/`. No SQLite or external DB at launch.

---

## Repository Structure to Build Toward

```text
laravel-harness/
├── src/
│   ├── cli/            # Commands and output formatting
│   ├── config/         # Config loader, validator, merger
│   ├── engine/         # Workflow engine, state machine, run manager
│   ├── providers/      # Codex adapter + fake provider
│   ├── policies/       # Command policy, budget, security
│   ├── profiles/       # Generic + Laravel profile loader
│   ├── state/          # Atomic state writes, locking
│   ├── artifacts/      # Read/write/hash helpers
│   ├── telemetry/      # Event log, metrics, token tracking
│   └── reporting/      # Report generator (Markdown + JSON)
├── schemas/            # JSON Schema: config, state, stage-result
├── profiles/
│   ├── generic/
│   └── laravel/
├── templates/          # Init templates (config.yaml, prompts)
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docs/
│   ├── architecture/   # ADRs
│   ├── guides/
│   └── reference/
├── examples/
├── harness/            # V1 — preserved during migration
└── package.json
```

---

## Phase 0 — Specification and Baselines (Week 1)

**Goal:** Freeze scope, record architecture decisions, establish test fixtures.

### Tasks

| # | Task | Output |
|---|------|--------|
| 0.1 | Write ADR-001: TypeScript + Node.js LTS rationale | `docs/architecture/ADR-001-typescript.md` |
| 0.2 | Write ADR-002: JSON file-based state storage | `docs/architecture/ADR-002-state-storage.md` |
| 0.3 | Write ADR-003: Codex-first with adapter interface | `docs/architecture/ADR-003-provider-strategy.md` |
| 0.4 | Inventory V1 config keys and file paths (for migration map) | `docs/architecture/v1-compatibility-inventory.md` |
| 0.5 | Create three reference tasks (bug fix, feature, refactor) against a fixture Laravel repo | `tests/fixtures/` |
| 0.6 | Measure V1 baseline: completion rate, retries, manual steps | `docs/architecture/v1-baseline-metrics.md` |
| 0.7 | Set up TypeScript project: `tsconfig.json`, `eslint`, `vitest`, `package.json` scripts | repo root |

### Exit Criteria
- [ ] All ADRs written and committed.
- [ ] `npm test` runs (zero tests, no errors).
- [ ] Three fixture tasks exist.

---

## Phase 1 — CLI and Configuration Foundation (Weeks 2–3)

**Goal:** Developer can `lh init` a project, validate config, and run diagnostics.

### Tasks

| # | Task | Files |
|---|------|-------|
| 1.1 | Define `schemas/config.schema.json` (YAML v2 config shape) | `schemas/` |
| 1.2 | Implement config loader: read `config.yaml`, merge env vars, validate against schema | `src/config/` |
| 1.3 | Implement `lh init` — scaffold `.laravel-harness/config.yaml` and `profiles/` from templates | `src/cli/commands/init.ts` |
| 1.4 | Implement `lh inspect` — check Node version, Git presence, provider CLI available, config valid | `src/cli/commands/inspect.ts` |
| 1.5 | Implement `lh config validate` and `lh config show` | `src/cli/commands/config.ts` |
| 1.6 | Implement `lh migrate` — read V1 `harness/harness.config.example.json`, write V2 `config.yaml` | `src/cli/commands/migrate.ts` |
| 1.7 | Laravel and generic project auto-detection (check `composer.json`, `artisan`, `package.json`) | `src/profiles/` |
| 1.8 | Unit tests: config merging, schema validation, error messages, env-var overrides | `tests/unit/config/` |
| 1.9 | Wire up CLI entry point (`bin/lh`) with command router | `src/cli/index.ts` |

### Config Schema Key Fields
```yaml
version: 2
profile: laravel | generic
workflow:
  max_attempts: 3
  plan_approval: required | automatic
  review_approval: required | automatic
agents:
  planner: { provider, reasoning }
  implementer: { provider, reasoning }
  tester: { provider, reasoning }
  reviewer: { provider, reasoning }
quality_gates:
  require_tests: true
  require_clean_secrets_scan: true
  max_changed_files: 25
budget:
  max_runtime_minutes: 45
  max_estimated_cost_usd: 10
```

### Exit Criteria
- [ ] `lh init` produces valid config on a clean dir.
- [ ] `lh inspect` prints pass/fail for each check with remediation steps.
- [ ] `lh config validate` rejects malformed YAML with actionable errors.
- [ ] All unit tests pass on macOS and Linux.

---

## Phase 2 — Workflow Engine and Durable State (Weeks 4–6)

**Goal:** Runs are created, tracked, and resumable. State machine enforces valid transitions.

### Tasks

| # | Task | Files |
|---|------|-------|
| 2.1 | Define `schemas/state.schema.json` and `schemas/stage-result.schema.json` | `schemas/` |
| 2.2 | Implement Run Manager: `lh run` creates `.laravel-harness/runs/<run-id>/manifest.json` with unique ID, timestamp, task | `src/engine/run-manager.ts` |
| 2.3 | Implement atomic state writer (write to `.tmp`, rename) | `src/state/state-store.ts` |
| 2.4 | Implement run locking (`.laravel-harness/runs/<run-id>/lock`) | `src/state/run-lock.ts` |
| 2.5 | Implement state machine with transition table (see below) | `src/engine/state-machine.ts` |
| 2.6 | Implement Stage Executor: assemble input context, call provider, validate output schema | `src/engine/stage-executor.ts` |
| 2.7 | Implement `lh status <run-id>` — print current state, stage, attempt, elapsed time | `src/cli/commands/status.ts` |
| 2.8 | Implement `lh resume <run-id>` — load last valid state and continue from that stage | `src/cli/commands/resume.ts` |
| 2.9 | Implement `lh cancel <run-id>` — write `cancelled` state, release lock, leave artifacts intact | `src/cli/commands/cancel.ts` |
| 2.10 | Implement `lh inspect <run-id>` — print manifest, events, and artifacts list | `src/cli/commands/inspect.ts` |
| 2.11 | Implement timeout enforcement per stage | `src/engine/stage-executor.ts` |
| 2.12 | Create attempt-specific artifact directories (`runs/<id>/attempts/<n>/`) | `src/artifacts/artifact-store.ts` |
| 2.13 | Integration tests: full sequential run, interrupted resume, invalid transition, malformed handoff | `tests/integration/engine/` |

### State Machine Transition Table

```
created          -> planning
planning         -> awaiting_plan_approval | blocked | failed
awaiting_plan_approval -> implementing | cancelled
implementing     -> testing | blocked | failed
testing          -> reviewing | testing_failed
testing_failed   -> implementing (retry) | failed (max attempts)
reviewing        -> approved | review_rejected
review_rejected  -> implementing (retry) | failed (max attempts)
approved         -> (terminal)
any              -> cancelled | failed
```

### Stage Result Schema (key fields)
```json
{
  "schema_version": "2.0",
  "run_id": "...",
  "attempt": 1,
  "stage": "planning",
  "status": "success | failure | blocked",
  "agent_id": "...",
  "provider": "codex",
  "input_hashes": {},
  "output_files": [],
  "summary": "...",
  "next_action": "...",
  "failure_classification": null,
  "started_at": "...",
  "completed_at": "..."
}
```

### Exit Criteria
- [ ] An interrupted run resumes without repeating a completed stage.
- [ ] Invalid transitions are rejected with an error.
- [ ] Malformed stage results fail safely (no state advance).
- [ ] `lh status` reflects current state accurately after resume.

---

## Phase 3 — Codex Adapter and Automated Loops (Weeks 7–8)

**Goal:** One real command executes the full workflow end-to-end with bounded repair loops.

### Tasks

| # | Task | Files |
|---|------|-------|
| 3.1 | Define `AgentProvider` interface: `execute(request) -> AgentResult` | `src/providers/provider-interface.ts` |
| 3.2 | Implement `FakeProvider` — returns deterministic outputs per stage (used in all automated tests) | `src/providers/fake-provider.ts` |
| 3.3 | Implement `CodexProvider` — wrap Codex CLI, parse output, map to `AgentResult` | `src/providers/codex-provider.ts` |
| 3.4 | Implement tester failure → structured failure packet → implementer retry routing | `src/engine/workflow-engine.ts` |
| 3.5 | Implement reviewer rejection → only blocking findings → implementer retry routing | `src/engine/workflow-engine.ts` |
| 3.6 | Implement repeated-failure detection (identical failure hash across N attempts) → early termination | `src/engine/retry-policy.ts` |
| 3.7 | Implement human plan approval gate: prompt user in terminal, block until input | `src/engine/approval-gate.ts` |
| 3.8 | Implement `lh run "<task>"` fully: create run, execute all stages, handle terminal states | `src/cli/commands/run.ts` |
| 3.9 | Map all terminal states to exit codes (0=approved, 1=review_rejected, 2=blocked, 3=cancelled, 4=failed) | `src/cli/exit-codes.ts` |
| 3.10 | Unit tests: retry policy, repeated-failure detection, approval gate, exit codes | `tests/unit/engine/` |
| 3.11 | Integration tests: `FakeProvider` full workflow, test failure repair, reviewer rejection, attempt limit | `tests/integration/` |

### Exit Criteria
- [ ] `lh run "task"` completes a full fake workflow in one command.
- [ ] A test failure causes up to `max_attempts` retries, then terminates with exit code 4.
- [ ] Plan approval blocks execution until user responds.
- [ ] Each attempt writes artifacts to its own directory.

---

## Phase 4 — Quality Gates and Git Safety (Weeks 9–11)

**Goal:** Risky operations are blocked by policy; the user's worktree is never corrupted.

### Tasks

| # | Task | Files |
|---|------|-------|
| 4.1 | Implement Quality Gate runner: execute gates in order, collect pass/fail/block results | `src/policies/gate-runner.ts` |
| 4.2 | Gate: required test command passes (run PHPUnit/npm test, check exit code) | `src/policies/gates/test-gate.ts` |
| 4.3 | Gate: required build/lint command passes | `src/policies/gates/build-gate.ts` |
| 4.4 | Gate: reviewer approved | `src/policies/gates/review-gate.ts` |
| 4.5 | Gate: diff size ≤ `max_changed_files` | `src/policies/gates/diff-size-gate.ts` |
| 4.6 | Gate: no unrelated dirty files modified (compare worktree snapshot before/after) | `src/policies/gates/worktree-integrity-gate.ts` |
| 4.7 | Gate: secret scan — detect high-entropy strings and known secret patterns in patch and artifacts | `src/policies/gates/secret-scan-gate.ts` |
| 4.8 | Implement Command Policy: allowlist/denylist/require-approval patterns per role; per-command timeouts | `src/policies/command-policy.ts` |
| 4.9 | Implement Tool Runner: execute shell commands via policy, enforce timeout, capture stdout/stderr | `src/policies/tool-runner.ts` |
| 4.10 | Implement worktree snapshot: record dirty files at run start; protect them from modification | `src/engine/worktree-snapshot.ts` |
| 4.11 | Implement isolated worktree mode: `git worktree add` for task branch, merge only after approval | `src/engine/worktree-manager.ts` |
| 4.12 | Laravel profile: define profile-specific commands (PHPUnit, artisan, composer), compatibility rules | `profiles/laravel/index.ts` |
| 4.13 | Generic profile: minimal project detection, no framework-specific commands | `profiles/generic/index.ts` |
| 4.14 | Integration tests: dirty worktree preserved, blocked command rejected, secret found blocks advance | `tests/integration/gates/` |

### Exit Criteria
- [ ] A command matching the deny pattern is blocked with an error.
- [ ] Pre-existing dirty files remain unmodified after a full integration run.
- [ ] A patch containing a fake secret fails the secret scan gate.
- [ ] Laravel profile commands are selectable from config.

---

## Phase 5 — Observability, Budgets, and Reporting (Weeks 12–13)

**Goal:** Every run produces a complete, auditable report. Budgets terminate runaway runs.

### Tasks

| # | Task | Files |
|---|------|-------|
| 5.1 | Implement Event Logger: append-only `events.jsonl` per run, structured event types | `src/telemetry/event-logger.ts` |
| 5.2 | Event types to log: stage_start, stage_complete, stage_failed, state_transition, agent_call, command_exec, gate_result, approval_request, approval_decision, retry, termination | `src/telemetry/event-types.ts` |
| 5.3 | Implement runtime budget: check elapsed time before each stage; terminate if over limit | `src/policies/budget-policy.ts` |
| 5.4 | Implement cost budget: accumulate estimated token cost; terminate if over `max_estimated_cost_usd` | `src/policies/budget-policy.ts` |
| 5.5 | Token/cost tracking: parse Codex output for token usage, compute cost estimate | `src/telemetry/usage-tracker.ts` |
| 5.6 | Implement console progress output: human-readable stage/attempt/status updates | `src/cli/output/progress.ts` |
| 5.7 | Implement output modes: `--output human` (default), `--output quiet`, `--output json` | `src/cli/output/formatter.ts` |
| 5.8 | Implement Markdown report generator: outcome, timeline, files changed, gates, review findings, cost | `src/reporting/markdown-reporter.ts` |
| 5.9 | Implement JSON report generator: machine-readable version of same data | `src/reporting/json-reporter.ts` |
| 5.10 | Implement `lh report <run-id>` — print or write the consolidated report | `src/cli/commands/report.ts` |
| 5.11 | Implement `lh clean [--older-than <days>]` — remove old run directories | `src/cli/commands/clean.ts` |
| 5.12 | Unit tests: event log format, budget enforcement, report content | `tests/unit/telemetry/`, `tests/unit/reporting/` |

### Consolidated Report Sections
1. Task and final outcome
2. Timeline (per stage, per attempt, with duration)
3. Files changed (diff summary)
4. Quality gate results
5. Review findings (blocking vs. informational)
6. Runtime and cost summary
7. Remaining risks and recommended manual follow-ups

### Exit Criteria
- [ ] `lh report <run-id>` produces a complete Markdown report.
- [ ] A run exceeding `max_runtime_minutes` terminates early with `failed` state and a report.
- [ ] `events.jsonl` contains every state transition and agent call.
- [ ] `--output json` emits valid JSON to stdout.

---

## Phase 6 — Hardening and V2 Release (Weeks 14–16)

**Goal:** Production-ready, documented, cross-platform, security-reviewed release.

### Tasks

| # | Task | Files |
|---|------|-------|
| 6.1 | Platform integration tests: run full suite on macOS and Linux (GitHub Actions matrix) | `.github/workflows/ci.yml` |
| 6.2 | Failure injection tests: kill after every state write, malformed output, timeout, missing tool | `tests/integration/failure-injection/` |
| 6.3 | Reliability tests: verify retries never exceed limits; no stage advances after failed mandatory gate | `tests/integration/reliability/` |
| 6.4 | Security review: threat model, command injection audit, secret redaction audit, path traversal | `docs/architecture/security-threat-model.md` |
| 6.5 | Secret redaction: strip known patterns from all log output, prompts, and report content | `src/policies/secret-redactor.ts` |
| 6.6 | Write upgrade guide: V1 → V2 directory changes, command renames, config migration | `docs/guides/upgrade-v1-to-v2.md` |
| 6.7 | Write architecture overview doc | `docs/architecture/overview.md` |
| 6.8 | Write troubleshooting guide (top 10 failure modes with fixes) | `docs/guides/troubleshooting.md` |
| 6.9 | Write contributor guide: dev setup, test commands, ADR process, profile authoring | `CONTRIBUTING.md` (update) |
| 6.10 | End-to-end tests against three real Laravel repositories (bug fix, feature, refactor) | `tests/e2e/` |
| 6.11 | Release checklist and `2.0.0` tag | `docs/reference/release-checklist.md` |

### Release Checklist (abridged)
- [ ] All P0 features implemented and tested.
- [ ] `lh init` → `lh run` works on a fresh macOS and Linux install.
- [ ] No critical or high-severity unresolved security issues.
- [ ] ≥ 90% reference task success rate on fixture suite.
- [ ] All stage handoffs schema-valid.
- [ ] Upgrade guide reviewed by a second developer.
- [ ] CHANGELOG.md updated.

---

## Phase 7 — V2.x Expansion (Weeks 17+)

Prioritized by production feedback. Do not start until `2.0.0` ships.

| Priority | Feature | Notes |
|----------|---------|-------|
| 1 | Read-only parallel specialized reviewers (security, compatibility, architecture) | Section 5.14 |
| 2 | Next.js framework profile | Section 5.8 |
| 3 | Plugin SDK with versioned manifest | Section 5.15 |
| 4 | Local read-only dashboard | Section 5.16 |
| 5 | CI non-interactive mode (`--ci` flag, no approval prompts) | Section 5 |
| 6 | Declarative workflow YAML (`stages:` config) | Section 5.13 |

---

## Sprint 1 Backlog (First Two Weeks)

This sprint proves the architecture before expanding features. It maps to Phase 0 + Phase 1 + the skeleton of Phase 2.

**Sprint goal:** One command creates and completes a fake four-stage workflow using a durable state machine.

| # | Task |
|---|------|
| S1 | Write ADR-001, ADR-002, ADR-003 |
| S2 | `npm init`, TypeScript, vitest, eslint, `bin/lh` entry point |
| S3 | Define `config.schema.json`, `state.schema.json`, `stage-result.schema.json` |
| S4 | `lh init`, `lh inspect`, `lh config validate` |
| S5 | Run creation with unique IDs, atomic state writes, run locking |
| S6 | State machine transition table |
| S7 | `FakeProvider` with deterministic per-stage results |
| S8 | Sequential planner → implementer → tester → reviewer execution |
| S9 | Tests: success path, invalid transition, malformed output, interrupted resume |
| S10 | `README` section: how to run the vertical slice |

**Sprint acceptance criteria:**
- `lh run "test task"` creates and completes a fake run.
- Every transition appears in `events.jsonl`.
- Kill after a completed stage → resume does not repeat that stage.
- Invalid config and malformed results fail with actionable errors.
- `npm test` passes on macOS and Linux.

---

## Key Dependencies and Risk Mitigations

| Risk | Phase | Mitigation |
|------|-------|------------|
| Codex CLI output format changes | 3 | Adapter contract test with captured golden output; FakeProvider keeps CI independent |
| Resume creates duplicate side effects | 2 | Artifact hash check before stage execution; idempotency key in manifest |
| Secret leaked in log or report | 5–6 | Redaction layer applied before any file write or console output |
| Worktree isolation fails on edge cases | 4 | Integration tests with pre-dirtied worktrees; abort rather than proceed on lock failure |
| Scope creep into general agent platform | All | P0 freeze enforced; V2.x features tracked separately; no parallel write agents in V2.0 |
| Framework rules bleed into engine | 1–4 | Profile interface defined in Phase 1; engine imports profiles only through the registry |

---

## Tracking

Use GitHub Issues with the following label taxonomy:

| Label | Meaning |
|-------|---------|
| `phase/0` – `phase/7` | Phase the issue belongs to |
| `type/adr` | Architecture decision record |
| `type/feature` | New capability |
| `type/test` | Test-only work |
| `type/docs` | Documentation |
| `type/security` | Security-related |
| `p0` / `p1` / `p2` | Priority tier from product plan |

Milestones: `2.0.0-alpha` (Phase 1–3), `2.0.0-beta` (Phase 4–5), `2.0.0` (Phase 6).

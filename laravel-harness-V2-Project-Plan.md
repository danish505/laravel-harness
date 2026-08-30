# Laravel harness V2 Project Plan

## 1. Product Vision

laravel-harness V2 will evolve from a documented, file-based Codex workflow into an executable and extensible AI software-engineering harness.

V1 establishes the core pattern:

```text
planner -> implementer -> tester -> reviewer
```

V2 will preserve file-based handoffs while adding a CLI orchestrator, durable workflow state, configurable agents, automated retry and approval gates, structured observability, security controls, and support for projects beyond one fixed Laravel/PHP version.

### V2 value proposition

> Give an engineering task to laravel-harness, execute a controlled multi-agent workflow, inspect every decision and artifact, resume interrupted runs, and receive a verified result without losing human control.

## 2. Current-State Assessment

### V1 strengths

- Clear separation of planner, implementer, tester, and reviewer roles.
- Durable file-based handoffs instead of chat-only context.
- Focused test philosophy for Laravel and PHPUnit.
- Playwright support for browser verification.
- Reviewer-driven evaluator/optimizer retry concept.
- Simple installation with few dependencies.
- Safety guidance for dirty Git worktrees and secrets.

### Gaps V2 should address

- The workflow is described in prompts but is not controlled by an executable orchestrator.
- Run state is manually updated and has no validated schema or transition rules.
- Retry behavior, retry limits, timeouts, and failure classifications are not enforced.
- Agent definitions are tied directly to Laravel 7 and PHP 7.4.
- There is no run history, metrics, token/cost tracking, or consolidated summary.
- File handoffs are Markdown conventions rather than validated contracts.
- Configuration is path-specific and lacks project auto-detection.
- Parallel analysis and specialized reviews are documented as future ideas only.
- There is no plugin/provider interface for models, tools, frameworks, or custom agents.
- Security checks, command permissions, and secret redaction are guidance rather than runtime policy.

## 3. V2 Goals and Non-Goals

### Goals

1. Run the full harness through one CLI command.
2. Make every run deterministic, inspectable, resumable, and cancellable.
3. Enforce typed handoffs and valid workflow transitions.
4. Support approval gates and configurable retry loops.
5. Separate the core engine from framework-specific profiles.
6. Support multiple agent/model providers behind a common adapter.
7. Capture useful logs, timing, token usage, estimated cost, and outcomes.
8. Protect the repository through command policies, worktree isolation, and secret redaction.
9. Keep installation and first-run setup simple.
10. Preserve backward compatibility with the V1 file workflow where practical.

### Non-goals for the initial V2 release

- A hosted SaaS control plane.
- A full graphical workflow designer.
- Autonomous deployment to production.
- Unlimited arbitrary agent-generated shell execution.
- Supporting every language and framework at launch.
- Distributed execution across multiple machines.

## 4. Target Users

### Primary

- Senior developers using coding agents on real repositories.
- Laravel/PHP teams that want repeatable planning, implementation, testing, and review.
- Solo developers who want agent automation without losing visibility or approval control.

### Secondary

- Maintainers who want to create custom framework profiles.
- Teams evaluating agent quality, reliability, runtime, and cost.
- Developers experimenting with specialized security, performance, or architecture reviewers.

## 5. V2 Feature Priorities

### P0 — Required for V2 core

#### 5.1 CLI orchestrator

Provide a single executable entry point:

```bash
lh init
lh inspect
lh run "Add rate limiting to the login endpoint"
lh status <run-id>
lh resume <run-id>
lh cancel <run-id>
lh report <run-id>
```

Responsibilities:

- Load and validate configuration.
- Detect repository and framework context.
- Create a unique run directory and manifest.
- Execute agents in workflow order.
- Validate each output before continuing.
- Pause at configured approval gates.
- Apply retry and termination policies.
- Return meaningful exit codes for success, rejection, block, cancellation, or internal error.

#### 5.2 Workflow state machine

Replace loosely coordinated steps with explicit states:

```text
created
  -> planning
  -> awaiting_plan_approval
  -> implementing
  -> testing
  -> reviewing
  -> approved
```

Failure paths:

```text
testing_failed -> implementing
review_rejected -> implementing
any_state -> blocked | cancelled | failed
```

Requirements:

- Atomic state updates.
- State transition validation.
- Maximum attempt and timeout enforcement.
- Run locking to prevent two processes from mutating the same run.
- Resume from the last completed valid stage.
- Record who or what caused every transition.

#### 5.3 Structured run storage and typed handoffs

Retain readable Markdown reports, but add machine-readable JSON metadata validated against schemas.

Recommended layout:

```text
.laravel-harness/
├── config.yaml
├── profiles/
└── runs/
    └── <run-id>/
        ├── manifest.json
        ├── state.json
        ├── task.md
        ├── plan.md
        ├── implementation.md
        ├── test-results.md
        ├── review.md
        ├── events.jsonl
        ├── artifacts/
        └── logs/
```

Each stage output should include:

- Schema version.
- Run ID and attempt number.
- Agent and provider identity.
- Input artifact hashes.
- Status and timestamps.
- Summary and next action.
- Produced files and command results.
- Failure classification when unsuccessful.

#### 5.4 Configuration system

Move from one fixed JSON example to versioned YAML configuration with environment-variable overrides.

```yaml
version: 2
profile: laravel

workflow:
  max_attempts: 3
  plan_approval: required
  review_approval: automatic

agents:
  planner:
    provider: codex
    reasoning: high
  implementer:
    provider: codex
    reasoning: medium

quality_gates:
  require_tests: true
  require_clean_secrets_scan: true
  max_changed_files: 25

budget:
  max_runtime_minutes: 45
  max_estimated_cost_usd: 10
```

Support:

- Global defaults plus project overrides.
- JSON Schema validation and actionable error messages.
- Environment variables for secrets and provider credentials.
- `laravel-harness config validate` and `laravel-harness config show`.
- Migration from V1 configuration.

#### 5.5 Automated retry and repair loop

- Tester failure returns a structured failure packet to the implementer.
- Reviewer rejection returns only blocking findings and relevant context.
- Retry count is configurable and enforced.
- Identical repeated failures trigger early termination.
- Infrastructure failures are distinguished from product/test failures.
- Each attempt produces its own diff and reports instead of overwriting history.
- The final report explains why the run stopped.

#### 5.6 Quality gates

Create configurable gates that decide whether a stage can advance:

- Required test command passed.
- Reviewer approved.
- No uncommitted unrelated files were modified.
- No secrets detected in the patch or artifacts.
- Diff size and changed-file limits respected.
- Required static analysis, lint, or build commands passed.
- Framework and runtime compatibility preserved.
- Optional human approval obtained.

Gate results must be machine-readable and visible in the final report.

### P1 — High-value scale features

#### 5.7 Provider and agent adapter layer

Define stable interfaces such as:

```text
AgentProvider.execute(request) -> AgentResult
ToolRunner.run(command, policy) -> CommandResult
ArtifactStore.write/read/list(...)
ApprovalProvider.request(...) -> ApprovalDecision
```

Initial provider:

- Codex CLI adapter.

Later providers can be added without changing the workflow engine. Agent definitions should be declarative and overrideable per project.

#### 5.8 Framework profiles

Extract Laravel-specific rules into a profile:

```text
profiles/
├── generic/
├── laravel/
├── nextjs/
└── custom/
```

A profile defines:

- Project detection rules.
- Runtime compatibility constraints.
- Suggested commands.
- Test, lint, build, and browser strategies.
- Reviewer checklists.
- Framework-specific context collection.

Launch V2 with `generic` and `laravel`. Treat Next.js as the first post-V2 reference profile.

#### 5.9 Observability and run reports

Capture an append-only event stream for:

- Stage transitions.
- Agent start and completion.
- Commands and exit status.
- Approval decisions.
- Retries and failure categories.
- Runtime, token usage, and estimated cost when available.

Generate a consolidated report containing:

- Task and outcome.
- Timeline by agent and attempt.
- Files changed.
- Tests and quality gates.
- Review findings.
- Runtime and cost summary.
- Remaining risks and manual follow-ups.

Console output should support human-readable, quiet, verbose, and JSON modes.

#### 5.10 Git and worktree isolation

- Record the starting branch, commit, and dirty files.
- Prefer an isolated Git worktree or temporary task branch.
- Never overwrite pre-existing user changes.
- Capture a patch for every implementation attempt.
- Detect out-of-scope modifications.
- Provide optional commit creation only after approval.
- Never push or open a pull request without an explicit user action.

#### 5.11 Security and execution policy

- Allow, deny, or require approval for command patterns.
- Set per-command and per-stage timeouts.
- Redact secrets from logs, prompts, and reports.
- Restrict readable/writable paths by role.
- Detect risky or destructive shell commands.
- Store credentials only through environment variables or OS-managed secret sources.
- Include prompt-injection defenses when agents inspect repository content.
- Maintain an audit record of commands and approvals without storing secret values.

#### 5.12 Context management

- Build a concise context bundle per agent rather than sharing every prior log.
- Track artifact hashes to avoid stale handoffs.
- Include Git diff and only relevant files.
- Summarize earlier attempts while retaining raw artifacts separately.
- Enforce configurable context-size limits.

### P2 — Advanced V2.x capabilities

#### 5.13 Declarative workflows

Allow workflows to be expressed as configuration rather than hard-coded stages:

```yaml
stages:
  - id: plan
    agent: planner
  - id: implement
    agent: implementer
    needs: [plan]
  - id: test
    agent: tester
    needs: [implement]
  - id: review
    agent: reviewer
    needs: [test]
```

Support conditional stages, human gates, retry edges, and stage-level timeouts.

#### 5.14 Safe parallelization

Start with read-only parallel work:

- Security review.
- Compatibility review.
- Test-quality review.
- Architecture/performance review.

Aggregate findings through a deterministic policy such as "any blocking finding rejects." Avoid parallel write agents until isolated worktree merging is reliable.

#### 5.15 Plugin system

Plugins may contribute:

- Framework profiles.
- Agents and prompts.
- Quality gates.
- Provider adapters.
- Report renderers.
- Context collectors.

Require a versioned manifest, compatibility range, explicit permissions, and plugin validation command.

#### 5.16 Local dashboard

A read-only local dashboard can visualize run state, attempts, reports, diffs, gates, timing, and cost. Approval actions may be added after CLI approval behavior is proven reliable.

## 6. Proposed Architecture

```text
CLI
 |
 v
Run Manager -> Workflow Engine -> Stage Executor -> Agent Provider
     |               |                  |
     |               |                  +-> Tool/Command Runner
     |               +-> Policy and Quality Gates
     +-> State Store + Artifact Store + Event Log
                                      |
                                      +-> Reports / Metrics
```

### Core modules

| Module | Responsibility |
| --- | --- |
| CLI | Commands, flags, output modes, exit codes |
| Run Manager | Run creation, locking, resume, cancellation, cleanup |
| Workflow Engine | State transitions, stage ordering, retries, conditions |
| Stage Executor | Input assembly, agent call, output validation |
| Provider Adapter | Communication with Codex or another supported provider |
| Tool Runner | Controlled shell execution with policy and timeouts |
| Policy Engine | Permissions, budgets, approvals, safety rules |
| Quality Gates | Tests, review, compatibility, diff and security checks |
| State Store | Atomic current state and attempt history |
| Artifact Store | Plans, patches, reports, logs, hashes |
| Event Logger | Append-only structured audit and telemetry events |
| Profile Registry | Framework detection and framework-specific behavior |
| Reporter | Console, Markdown, and JSON run summaries |

### Technology recommendation

Use TypeScript on a current Node.js LTS release for the V2 engine because the current project already uses Node for Playwright, TypeScript supports strong contracts for state and provider interfaces, and it enables a cross-platform CLI. Keep shell scripts only as thin compatibility wrappers.

Recommended libraries should remain minimal:

- CLI parsing.
- YAML and JSON Schema validation.
- Structured logging.
- Process execution with timeout and cancellation support.
- Test runner.

Select exact packages during Phase 1 through a short architectural decision record rather than coupling the plan to package names.

## 7. Delivery Roadmap

Assumption: one developer working approximately 10–15 focused hours per week. Estimated duration: 14–18 weeks.

### Phase 0 — V2 specification and baselines (Week 1)

Deliverables:

- V2 product requirements and non-goals.
- Architecture decision record for TypeScript and storage format.
- V1 compatibility inventory.
- Example golden repository and three reference tasks.
- Baseline measurements for completion rate, retries, and manual steps.

Exit criteria:

- V2 scope is frozen for the P0 milestone.
- Success metrics and fixtures are committed.

### Phase 1 — CLI and configuration foundation (Weeks 2–3)

Deliverables:

- TypeScript CLI scaffold.
- `init`, `doctor`, `config validate`, and `config show`.
- V2 configuration schema.
- Laravel and generic project detection.
- V1 config migration command.
- Unit tests for config resolution and validation.

Exit criteria:

- A new project can initialize and pass diagnostics without manual file copying.

### Phase 2 — Workflow engine and durable state (Weeks 4–6)

Deliverables:

- Run IDs, manifests, atomic state writes, and locking.
- Explicit transition model.
- Sequential planner-to-reviewer execution.
- Typed stage result schemas.
- Cancellation, timeouts, and resume.
- Attempt-specific artifact directories.

Exit criteria:

- An interrupted reference run resumes without repeating a completed valid stage.
- Invalid transitions and malformed handoffs are rejected safely.

### Phase 3 — Codex adapter and automated loops (Weeks 7–8)

Deliverables:

- Codex CLI provider adapter.
- Agent request/result contract.
- Automatic tester and reviewer feedback routing.
- Maximum attempts and repeated-failure detection.
- Human approval after planning.
- Clear terminal states and exit codes.

Exit criteria:

- One command executes the full workflow and a failed test causes a bounded repair loop.

### Phase 4 — Quality gates and Git safety (Weeks 9–11)

Deliverables:

- Test, build, lint, review, diff-size, and changed-file gates.
- Secret scanning/redaction gate.
- Starting-worktree snapshot and unrelated-change protection.
- Isolated worktree mode.
- Command policy, timeouts, and approval rules.
- Laravel profile commands and compatibility rules.

Exit criteria:

- Risky commands are blocked or paused by policy.
- Existing dirty files remain untouched across integration tests.

### Phase 5 — Observability, budgets, and reporting (Weeks 12–13)

Deliverables:

- Structured event log.
- Runtime, attempts, token, and cost fields.
- Runtime/cost budget enforcement.
- Console progress plus JSON output mode.
- Consolidated Markdown and JSON reports.
- Log retention and cleanup command.

Exit criteria:

- A user can explain what happened, why the run stopped, what it cost, and what remains to do from one report.

### Phase 6 — Hardening and V2 release (Weeks 14–16)

Deliverables:

- macOS and Linux integration coverage.
- Failure injection tests for crashes, malformed output, timeouts, and unavailable tools.
- Security review and threat model.
- Upgrade guide, architecture docs, examples, and troubleshooting guide.
- Release candidate tested against at least three Laravel repositories.
- V2.0.0 release and migration notes.

Exit criteria:

- All P0 requirements pass the release checklist.
- No critical or high-severity unresolved security issues.
- Reference task reliability meets the target metrics.

### Phase 7 — V2.x expansion (Weeks 17+)

Prioritized after production feedback:

1. Read-only parallel specialized reviewers.
2. Next.js framework profile.
3. Plugin SDK and example plugin.
4. Local read-only dashboard.
5. CI non-interactive mode.

## 8. Epics and Key User Stories

### Epic A — Setup and diagnostics

- As a developer, I can initialize laravel-harness without copying templates manually.
- As a developer, I can run diagnostics and receive exact remediation steps.
- As a maintainer, I can migrate a V1 configuration to V2.

### Epic B — Reliable execution

- As a developer, I can start the workflow with one command.
- As a developer, I can safely stop and resume a run.
- As a developer, I can see the current stage and attempt.
- As a developer, I can set time, attempt, and cost limits.

### Epic C — Human control

- As a developer, I can approve or reject the plan before code changes.
- As a developer, I can configure which commands require approval.
- As a developer, I can cancel a run without leaving corrupt state.

### Epic D — Quality and safety

- As a developer, I can require tests and review before approval.
- As a developer, I can prevent changes outside an allowed scope.
- As a developer, I can isolate agent changes from my dirty worktree.
- As a developer, I can verify that secrets are not persisted in artifacts.

### Epic E — Extensibility

- As a maintainer, I can add a framework profile without modifying the engine.
- As a maintainer, I can add a provider through a stable adapter.
- As a team, I can customize agent instructions and gates per repository.

### Epic F — Observability

- As a developer, I can inspect every stage, command result, attempt, and decision.
- As a developer, I can view total runtime and estimated cost.
- As a developer, I can export a report for a pull request or audit.

## 9. Testing Strategy

### Unit tests

- Configuration merging and schema validation.
- State transitions and invalid transition rejection.
- Retry, repeated-failure, timeout, and budget policies.
- Artifact hashing and stale-input detection.
- Secret redaction.
- Provider and profile contracts.
- Exit-code mapping.

### Integration tests

- Full successful workflow with a fake provider.
- Test failure followed by successful repair.
- Reviewer rejection followed by repair.
- Attempt limit reached.
- Process interruption and resume.
- Cancellation during agent or command execution.
- Dirty worktree preservation.
- Command rejection and approval.
- Malformed agent result.
- Missing runtime or unavailable provider.

### End-to-end tests

- Small Laravel bug fix.
- Laravel validation feature with PHPUnit tests.
- UI change requiring build and Playwright.
- Generic non-Laravel repository task.

### Compatibility matrix

At V2 launch:

- macOS and Linux.
- Current Node.js LTS.
- Laravel profile covering legacy PHP 7.4/Laravel 7 and a supported modern Laravel fixture.
- Git repositories with clean and dirty worktrees.

### Reliability testing

- Inject crashes between every state write and stage completion.
- Kill and resume processes repeatedly.
- Simulate corrupt or partial artifacts.
- Verify retries never exceed configured limits.
- Verify no stage advances after a failed mandatory gate.

## 10. Success Metrics

### Release targets

- At least 90% of reference runs reach the correct terminal state without manual state repair.
- 100% of completed stages have schema-valid handoffs.
- 100% of retries respect configured attempt limits.
- 100% of interrupted test scenarios resume from a valid checkpoint.
- Zero modifications to pre-existing unrelated dirty files in the integration suite.
- Every run produces a consolidated report and structured event history.
- Initial setup to successful diagnostic run takes under 10 minutes for the documented environment.

### Ongoing product metrics

- Run success and blocked rates by stage.
- Average attempts per successful run.
- Median runtime and estimated cost per task.
- Human approval wait time.
- Most frequent test and review failure categories.
- Resume success rate.
- Percentage of generated changes accepted without another manual repair cycle.

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| V2 scope grows into a general agent platform | Release delay | Freeze P0; move workflow DSL, dashboard, and broad plugins to V2.x |
| Agent output is inconsistent | Invalid state or bad handoff | Schema validation, repair prompt, and safe stage failure |
| Shell execution damages a repository | Data loss | Worktree isolation, command policies, path restrictions, approvals |
| Resume repeats side effects | Duplicate or conflicting changes | Idempotency keys, artifact hashes, stage checkpoints, Git snapshots |
| Logs expose secrets | Security incident | Redaction, secret scanning, minimal context, retention controls |
| Framework rules remain coupled to core | Poor extensibility | Profile interface and generic core from Phase 1 |
| Parallel agents create conflicting edits | Unstable output | Parallelize read-only analysis first; defer concurrent writes |
| Provider changes break execution | Reliability regression | Adapter contract tests and fake provider integration suite |
| Costs become unpredictable | User distrust | Per-run time/token/cost budgets and early termination |
| Legacy support blocks modern design | Maintenance burden | Keep PHP/Laravel compatibility inside profiles, not the TypeScript engine |

## 12. Release Strategy

### Versioning

- `2.0.0-alpha`: CLI, configuration, and sequential engine.
- `2.0.0-beta`: retries, gates, Git isolation, and observability.
- `2.0.0-rc`: documentation, migrations, cross-platform validation.
- `2.0.0`: stable P0 release.
- `2.1`: parallel reviewers and CI mode.
- `2.2`: plugin SDK and another framework profile.

### Backward compatibility

- Continue reading V1-style Markdown handoffs during migration where safe.
- Provide `laravel-harness migrate` to generate V2 configuration and preserve existing files.
- Document breaking directory and command changes.
- Do not silently rewrite a user's V1 setup.

## 13. Recommended Repository Structure

```text
laravel-harness/
├── src/
│   ├── cli/
│   ├── config/
│   ├── engine/
│   ├── providers/
│   ├── policies/
│   ├── profiles/
│   ├── state/
│   ├── artifacts/
│   ├── telemetry/
│   └── reporting/
├── schemas/
├── profiles/
│   ├── generic/
│   └── laravel/
├── templates/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docs/
│   ├── architecture/
│   ├── guides/
│   └── reference/
├── examples/
├── harness/                  # V1 compatibility during migration
└── package.json
```

## 14. Definition of Done for V2.0

V2.0 is complete when:

- A developer can initialize, diagnose, run, inspect, cancel, and resume through the CLI.
- The four-stage workflow is controlled by an explicit, tested state machine.
- Every stage produces schema-valid, attempt-specific artifacts.
- Test and review failures produce bounded automated repair loops.
- Human plan approval, command policy, and budget controls work.
- Runs are isolated from unrelated Git changes.
- The generic and Laravel profiles are separated from the engine.
- A consolidated report includes outcome, timeline, attempts, gates, tests, changes, risks, and cost data when available.
- Upgrade, troubleshooting, security, and contributor documentation is complete.
- The release meets the reliability and safety targets in this plan.

## 15. Recommended First Sprint

The first two-week sprint should prove the architecture before expanding features.

### Sprint goal

Create a CLI that initializes a V2 project and executes a fake four-stage workflow using a durable state machine.

### Sprint backlog

1. Record the TypeScript and state-storage architecture decisions.
2. Create the CLI package and test setup.
3. Define `config.schema.json`, `state.schema.json`, and `stage-result.schema.json`.
4. Implement `laravel-harness init`, `doctor`, and `config validate`.
5. Implement run creation, IDs, atomic state writes, and locking.
6. Implement the legal state-transition table.
7. Add a fake provider that returns deterministic stage results.
8. Execute planner, implementer, tester, and reviewer sequentially.
9. Add tests for success, invalid transition, malformed output, and interrupted resume.
10. Document how to run the vertical slice.

### Sprint acceptance criteria

- One command creates and completes a fake run.
- Every transition is written to `events.jsonl`.
- Killing the process after a completed stage and resuming does not repeat that stage.
- Invalid configuration and malformed results fail with actionable errors.
- Unit and integration tests pass on macOS and Linux.

## 16. Product Decisions to Confirm Before Implementation

1. Should V2 remain Codex-first with an adapter interface, or launch with multiple providers?
2. Should isolated Git worktrees be the default or an opt-in mode?
3. Should plan approval remain mandatory by default?
4. Is CI/non-interactive execution required in V2.0 or acceptable for V2.1?
5. Should the initial package be distributed through npm, a standalone installer, or both?

Recommended defaults: Codex-first, worktree isolation enabled, plan approval required, CI mode in V2.1, and npm distribution first.

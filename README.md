# Largentic

A file-based multi-agent harness for using Codex with Laravel projects.

The harness uses a structured workflow:

```text
planner -> implementer -> tester -> reviewer
```

Agents transfer work through files such as `harness/plans/plan.md`, `harness/reports/implementation.md`, `harness/reports/test-results.md`, and `harness/reports/review.md`. This keeps the workflow durable and repeatable instead of relying only on chat history.

## Why use this?

This project helps you:

- Split coding work into clear agent responsibilities.
- Keep implementation changes small and reviewable.
- Make Codex hand off work through files.
- Run targeted Laravel/PHPUnit verification.
- Keep browser checks separate through Playwright and Valet.
- Avoid noisy route/report tests when unit tests are more appropriate.
- Build toward reliable retry loops.

## Requirements

- Codex CLI
- PHP and Composer
- Laravel project, commonly Valet-based
- Node.js and npm if using Playwright
- Git

## Suggested Repository Structure

```text
codex-largentic/
├── .codex/
│   ├── config.toml
│   ├── global-rules.md
│   └── agents/
│       ├── planner.toml
│       ├── implementer.toml
│       ├── tester.toml
│       └── reviewer.toml
├── .largentic/
│   ├── config.yaml
│   ├── task.md
│   └── runs/
│       └── <run-id>/
│           ├── plan.md
│           ├── implementation.md
│           ├── test-results.md
│           ├── review.md
│           ├── state.json
│           └── events.jsonl
├── docs/
│   ├── architecture.md
│   ├── design-patterns.md
│   ├── file-handoff.md
│   └── codex-setup.md
├── .gitignore
├── LICENSE
└── README.md
```

## Installation

Install the harness CLI globally:

```bash
cd /path/to/largentic
npm install && npm run build && npm link
```

In your Laravel project root, run:

```bash
lh init
```

This creates:

```text
.largentic/config.yaml
.largentic/task.md
.codex/config.toml
.codex/global-rules.md
.codex/agents/planner.toml
.codex/agents/implementer.toml
.codex/agents/tester.toml
.codex/agents/reviewer.toml
```

Edit `.largentic/config.yaml` and `.largentic/task.md` to match your project. Customize `.codex/global-rules.md` and `.codex/agents/*.toml` per project to adjust agent behavior, coding standards, and handoff formats.

## Playwright

If your project uses Playwright, install it in the project root as usual:

```bash
npm install --save-dev @playwright/test
npx playwright install
```

## Add this to AGENTS.md file
```text 
## Harness Execution Protocol

When the Captain asks to run the harness:

1. Read `.codex/global-rules.md`.
2. Use the planner agent to write `.largentic/runs/<run-id>/plan.md`.
3. Use the implementer agent to read the plan and implement the patch.
4. Use the tester agent to write `.largentic/runs/<run-id>/test-results.md`.
5. Use the reviewer agent to write `.largentic/runs/<run-id>/review.md`.
6. If the tester fails, repeat implementer -> tester.
7. If the review fails, repeat implementer → tester → reviewer.
8. Use files as the source of truth, not chat output.
```

## Running the Harness

From your Laravel project root:

```bash
lh run "Add rate limiting to the login endpoint"
```

Or create `.largentic/task.md` and run:

```bash
lh run
```

## Workflow

```text
planner -> .largentic/runs/<run-id>/plan.md
implementer -> .largentic/runs/<run-id>/implementation.md
tester -> .largentic/runs/<run-id>/test-results.md
reviewer -> .largentic/runs/<run-id>/review.md
```

If the reviewer rejects the patch:

```text
review.md -> implementer -> tester -> reviewer
```

## Tester Philosophy

The tester agent creates targeted unit tests for changed fields, rules, calculations, services, model methods, validation logic, and edge cases.

By default, it avoids:

- route tests
- report tests
- generic page-load tests
- broad end-to-end tests
- browser-only tests

## Documentation

Read:

- `docs/architecture.md`
- `docs/design-patterns.md`
- `docs/file-handoff.md`
- `docs/codex-setup.md`

## Safety

Do not commit real local state, logs, diffs, secrets, client names, or `.env` files. This repo commits examples only.

---

## V2 (Alpha) — CLI Orchestrator

> **Status:** `2.0.0-alpha` — Sprint 1 vertical slice complete. TypeScript CLI with durable state machine and automated workflow.

### Quick start

```bash
# In your project directory
node /path/to/largentic/dist/cli/index.js init
node /path/to/largentic/dist/cli/index.js doctor
node /path/to/largentic/dist/cli/index.js run "Add rate limiting to the login endpoint" --auto-approve
```

Or install globally via `npm link` inside `largentic/`:

```bash
cd /path/to/largentic
npm install && npm run build && npm link

# Then in any project:
lh init
lh doctor
lh run "Your task description"
```

### CLI commands

| Command | Description |
|---------|-------------|
| `lh init` | Scaffold `.largentic/config.yaml` and `task.md` with auto-detected profile |
| `lh doctor` | Check Node, Git, Codex CLI, and config validity |
| `lh config validate` | Validate config file against JSON Schema |
| `lh config show` | Print merged configuration |
| `lh run "<task>"` | Execute the full planner→implementer→tester→reviewer workflow |
| `lh run` | Same as above, reading the task from `.largentic/task.md` |
| `lh status <run-id>` | Show current state of a run |
| `lh inspect <run-id>` | Print manifest, state, and full event log |
| `lh cancel <run-id>` | Cancel a running or paused run |
| `lh report <run-id>` | Print a consolidated Markdown report |

### Providing a task

You can provide the task inline or via a file.

**Inline (one-off tasks):**
```bash
lh run "Add rate limiting to the login endpoint"
```

**File-based (`.largentic/task.md`):**

If you run `lh run` without an argument, the CLI reads your task from `.largentic/task.md`. This file is created automatically by `lh init`.

```bash
# Edit the task file
nano .largentic/task.md

# Then run without an inline prompt
lh run
```

The inline argument always takes priority — if you pass a prompt and the file exists, the file is ignored.

### How it works

```
lh run "task"
    │
    ▼
[planner]  → .largentic/runs/<run-id>/plan.md  → human approval (if required)
    │                      │
    │                      ▼
    │            export plan → .largentic/exports/plan-<run-id>.md
    │                      │
    ▼                      ▼
[implementer] → .largentic/runs/<run-id>/implementation.md
    │
    ▼
[tester]  → .largentic/runs/<run-id>/test-results.md
    │  ↑ retry on failure (up to max_attempts)
    ▼
[reviewer] → .largentic/runs/<run-id>/review.md
    │  ↑ retry on rejection (up to max_attempts)
    ▼
 APPROVED ✅  (or FAILED / CANCELLED)
```

### Exporting the plan

When `workflow.plan_approval` is `required`, the plan approval prompt offers:

- `[a]pprove` — continue to implementation
- `[r]eject` — cancel the run
- `[e]xport` — save the plan as Markdown and return to the prompt
- `[c]ancel` — cancel the run

Exporting writes the generated plan to `.largentic/exports/plan-<run-id>.md` by default. It does **not** approve the plan or start implementation; after exporting you remain at the approval prompt to make a final decision.

You can change the export directory in `.largentic/config.yaml`:

```yaml
workflow:
  plan_export_directory: docs/plans
```

Relative paths resolve from the project working directory; absolute paths are used as supplied.

The harness uses the native Codex agents registered in `.codex/agents/*.toml`. Each stage prompt tells the selected agent its run ID, attempt, run directory, required input artifacts, and the path to `.codex/global-rules.md`. Every state transition is written atomically to `.largentic/runs/<run-id>/state.json` and appended to `events.jsonl` — making runs fully inspectable and resumable.

When the effective provider is `codex`, `lh run` verifies that `.codex/config.toml`, `.codex/global-rules.md`, and all four agent TOMLs exist and are readable before starting. Missing files produce an actionable error suggesting `lh init`.

### Running the tests

```bash
cd largentic
npm install
npm run build
npm test           # 72 tests, all passing
```

### V2 architecture

See `docs/architecture/` for the Architecture Decision Records:
- `ADR-001-typescript.md` — Why TypeScript + Node.js
- `ADR-002-state-storage.md` — JSON file-based state with atomic writes
- `ADR-003-provider-strategy.md` — Codex-first with adapter interface

See `largentic-V2-Implementation-Plan.md` for the full phased roadmap.

## License

MIT

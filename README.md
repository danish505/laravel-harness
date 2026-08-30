# Laravel Harness

A file-based multi-agent harness for using Codex with Laravel projects running locally through Laravel Valet.

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
codex-laravel-harness/
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── planner.toml
│       ├── implementer.toml
│       ├── tester.toml
│       └── reviewer.toml
├── harness/
│   ├── harness.config.example.json
│   ├── state/context.example.json
│   ├── plans/plan.example.md
│   ├── reports/
│   │   ├── implementation.example.md
│   │   ├── test-results.example.md
│   │   └── review.example.md
│   ├── prompts/run-harness.md
│   ├── scripts/
│   ├── package.json
│   └── playwright.config.js
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

Copy `.codex/` and `harness/` into the root of your Laravel project, beside your existing `AGENTS.md`.

Create local config files from examples:

```bash
cd harness
./scripts/bootstrap-local-files.sh
```

Edit:

```text
harness/harness.config.json
harness/state/context.json
harness/playwright.config.js
```

Replace placeholders with your real project path and Valet URL.

## Playwright

Install Playwright in the `harness/` folder:

```bash
cd harness
./scripts/install-playwright.sh
```

## Add this to AGENTS.md file
```text 
## Harness Execution Protocol

When the Captain asks to run the harness:

1. Read `harness/prompts/run-harness.md`.
2. Use the planner agent to write `harness/plans/plan.md`.
3. Use the implementer agent to read `harness/plans/plan.md` and implement the patch.
4. Use the tester agent to write `harness/reports/test-results.md`.
5. Use the reviewer agent to write `harness/reports/review.md`.
6. If the tester fails, repeat implementer -> tester.
7. If the review fails, repeat implementer → tester → reviewer.
8. Use files as the source of truth, not chat output.
```

## Replace task in:
```text 
harness/prompts/run-harness.md
```

## Running the Harness

From your Laravel project root:

```bash
codex
```

Simply ask codex to run the harness

```text
run the harness
```

## Workflow

```text
planner -> harness/plans/plan.md
implementer -> harness/reports/implementation.md + harness/artifacts/latest-diff.patch
tester -> harness/reports/test-results.md
reviewer -> harness/reports/review.md
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
node /path/to/laravel-harness/dist/cli/index.js init
node /path/to/laravel-harness/dist/cli/index.js doctor
node /path/to/laravel-harness/dist/cli/index.js run "Add rate limiting to the login endpoint" --auto-approve
```

Or install globally via `npm link` inside `laravel-harness/`:

```bash
cd /path/to/laravel-harness
npm install && npm run build && npm link

# Then in any project:
lh init
lh doctor
lh run "Your task description"
```

### CLI commands

| Command | Description |
|---------|-------------|
| `lh init` | Scaffold `.laravel-harness/config.yaml` with auto-detected profile |
| `lh doctor` | Check Node, Git, Codex CLI, and config validity |
| `lh config validate` | Validate config file against JSON Schema |
| `lh config show` | Print merged configuration |
| `lh run "<task>"` | Execute the full planner→implementer→tester→reviewer workflow |
| `lh status <run-id>` | Show current state of a run |
| `lh inspect <run-id>` | Print manifest, state, and full event log |
| `lh cancel <run-id>` | Cancel a running or paused run |
| `lh report <run-id>` | Print a consolidated Markdown report |

### How it works

```
lh run "task"
    │
    ▼
[planner]  → plan.md  → human approval (if required)
    │
    ▼
[implementer] → implementation.md
    │
    ▼
[tester]  → test-results.md
    │  ↑ retry on failure (up to max_attempts)
    ▼
[reviewer] → review.md
    │  ↑ retry on rejection (up to max_attempts)
    ▼
 APPROVED ✅  (or FAILED / CANCELLED)
```

Every state transition is written atomically to `.laravel-harness/runs/<run-id>/state.json`
and appended to `events.jsonl` — making runs fully inspectable and resumable.

### Running the tests

```bash
cd laravel-harness
npm install
npm run build
npm test           # 47 tests, all passing
```

### V2 architecture

See `docs/architecture/` for the Architecture Decision Records:
- `ADR-001-typescript.md` — Why TypeScript + Node.js
- `ADR-002-state-storage.md` — JSON file-based state with atomic writes
- `ADR-003-provider-strategy.md` — Codex-first with adapter interface

See `laravel-harness-V2-Implementation-Plan.md` for the full phased roadmap.

## License

MIT

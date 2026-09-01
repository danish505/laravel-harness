# Changelog

## 2.0.0

Major release of the Laravel Harness with a full file-based SDLC workflow.

### Added

- `lh init` now deploys project-local Codex configuration: `.codex/config.toml`, `.codex/global-rules.md`, and `.codex/agents/*.toml`. This lets every project customize agent guidance independently.
- Native-agent preflight check: `lh run` verifies required `.codex/` files exist and are readable before starting a Codex-backed run, failing early with an actionable message.
- Conductor prompt now includes the selected native agent name, run ID, attempt, run directory, required input artifacts, `.codex/global-rules.md` path, and any per-role `system_prompt_override`.

### Changed

- Agent TOMLs and templates now reference V2 per-run artifact paths (`<run-dir>/plan.md`, `<run-dir>/implementation.md`, `<run-dir>/test-results.md`, `<run-dir>/review.md`) instead of the V1 `harness/` paths.
- `docs/codex-setup.md` updated to describe the native-agent workflow, required files, and V2 artifact locations.

### Fixed

- Workflow engine no longer relies on `process.cwd()` for global-rules and `AGENTS.md` paths; it uses the project root passed in at construction.

- Introduced V2 harness architecture with a CLI-driven state machine and workflow engine.
- Added the full agent pipeline: planner → implementer → tester → reviewer with retry loops.
- Added `AGENTS.md` harness execution protocol for consistent agent handoffs.
- Added `harness/state/context.json` state machine to track task status, attempts, and decisions across agents.
- Added file-based handoff artifacts: `harness/plans/plan.md`, `harness/reports/implementation.md`, `harness/reports/test-results.md`, `harness/reports/review.md`, and `harness/artifacts/latest-diff.patch`.
- Added `harness/prompts/run-harness.md` conductor prompt to drive the harness from Codex.
- Added `harness/harness.config.example.json` for project-specific settings (Valet URL, PHP/Laravel versions, test commands).
- Added helper scripts under `harness/scripts/` for bootstrapping local files, capturing diffs, installing Playwright, and running tests.
- Added CLI spinner feedback for a more interactive harness experience.
- Added support for defining context in a file and inline.
- Added support for adding prompts via a file.
- Switched to agent-only execution using shell commands; no MCP servers required to run the harness.
- Optimized agent prompts and workflow to reduce token usage while improving output quality.
- Documented Laravel 7.x / PHP 7.4 compatibility constraints across agents and prompts.
- Expanded documentation in `docs/` covering architecture, design patterns, file handoff, and Codex setup.

## 0.1.0

Initial public release.

- Codex subagent TOML files
- File-based handoff workflow
- Laravel/Valet harness structure
- Focused tester agent
- Playwright CLI support
- Documentation for architecture, file handoff, and design patterns

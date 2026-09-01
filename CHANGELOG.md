# Changelog

## 2.0.0

Major release of the Laravel Harness with a full file-based SDLC workflow.

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

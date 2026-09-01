# Codex V2 Native Agent Integration Plan

## Goal

Use the project's registered Codex agents in `.codex/agents/` as the
Laravel Harness V2 stage agents, and apply `.codex/global-rules.md` to every
role.

## Current State

Laravel Harness V2 currently starts one primary Codex process per stage using
hard-coded prompts from `src/engine/workflow-engine.ts`. Its Codex provider
runs `codex exec` with `--cd <project-root>`, but does not load
`.codex/config.toml`, select a named agent, or inject `.codex/global-rules.md`.

The current role TOMLs also reference V1 `harness/` paths. V2 persists
artifacts below `.laravel-harness/runs/<run-id>/`.

## Decisions

- Dispatch stages through the registered native Codex agents.
- Use V2 per-run artifacts as the agent handoff contract.
- Require all four agents to read and follow `.codex/global-rules.md`.
- Keep `AGENTS.md` as additive project guidance.
- Keep the harness engine responsible for persisting stage artifacts, rather
  than allowing agents to create conflicting handoff files.

## Implementation Steps

1. Make native agent dispatch an explicit V2 contract.

   Map stages to the named registered agents:

   | V2 stage | Codex agent |
   | --- | --- |
   | `planning` | `planner` |
   | `implementing` | `implementer` |
   | `testing` | `tester` |
   | `reviewing` | `reviewer` |

   Update `WorkflowEngine` and `CodexProvider` so the prompt explicitly
   delegates each stage to its named agent instead of relying only on the
   existing hard-coded role prompts.

2. Load project-local Codex configuration deliberately.

   The provider must explicitly make `.codex/config.toml` available to the
   spawned Codex process. Do not rely on `--cd`, which changes the workspace
   directory but does not load project-local configuration by itself.

   Preserve access to the user's existing Codex authentication and global
   configuration when choosing the mechanism. Do not blindly set `CODEX_HOME`
   to the project `.codex` directory unless authentication behavior has been
   verified.

3. Enforce global rules for all roles.

   Update every `.codex/agents/*.toml` file to require reading and following
   `.codex/global-rules.md` before performing its stage. Include the absolute
   or project-relative global-rules path in the conductor prompt as a
   redundant enforcement point.

4. Replace V1 handoff paths in role instructions.

   Update the TOML role guidance to use the V2 run directory supplied in each
   stage prompt:

   - planner output: `<run-dir>/plan.md`
   - implementer output: `<run-dir>/implementation.md`
   - tester output: `<run-dir>/test-results.md`
   - reviewer output: `<run-dir>/review.md`
   - attempt artifacts: `<run-dir>/attempts/<attempt>/`

   Each stage receives the current run ID, attempt number, run directory, and
   prerequisite artifact paths. Agents should return their stage artifact as
   their final response; the engine writes both the run-root and
   attempt-specific copies.

5. Consolidate role instructions.

   Refactor `buildSystemPrompt()` into a concise conductor prompt containing:

   - the selected native agent name;
   - task, run ID, and attempt;
   - global-rules and `AGENTS.md` locations;
   - required input artifact paths;
   - expected stage output and handoff path.

   Keep role-specific procedures, checklists, sandbox settings, and output
   formats authoritative in `.codex/agents/*.toml`.

6. Wire supported V2 agent overrides.

   The configuration schema already exposes
   `agents.<role>.system_prompt_override`. Apply it as additional,
   task-specific guidance without replacing the selected TOML role instructions
   or global rules. Preserve existing provider-resolution behavior unless
   stage-specific provider selection is intentionally introduced.

7. Add a native-agent preflight.

   Before a real Codex run, verify these files exist and are readable:

   - `.codex/config.toml`
   - `.codex/global-rules.md`
   - `.codex/agents/planner.toml`
   - `.codex/agents/implementer.toml`
   - `.codex/agents/tester.toml`
   - `.codex/agents/reviewer.toml`

   Fail with a clear remediation message if native-agent mode is selected but
   the required configuration is unavailable. Fake-provider runs must remain
   independent of this preflight.

8. Test the native-agent and handoff contracts.

   Add focused tests that verify:

   - each V2 stage selects the expected named agent;
   - stage prompts contain the V2 run directory, attempt number, required
     input artifacts, and global-rules path;
   - a per-role override supplements native guidance;
   - missing native-agent configuration blocks a real Codex run before a
     process starts;
   - existing fake-provider workflow and retry behavior remains unchanged.

9. Update documentation and initialization.

   Update `docs/codex-setup.md` with the native-agent workflow, configuration
   loading behavior, global-rules precedence, and V2 artifact locations.
   Update `lh init` so new V2 projects receive compatible Codex setup files or
   clear instructions for adding them.

## Acceptance Criteria

- [ ] A V2 planning stage uses the registered `planner` agent.
- [ ] A V2 implementation stage uses the registered `implementer` agent.
- [ ] A V2 testing stage uses the registered `tester` agent.
- [ ] A V2 review stage uses the registered `reviewer` agent.
- [ ] Every role is instructed to read and follow `.codex/global-rules.md`.
- [ ] Role instructions reference V2 per-run artifacts and not V1
  `harness/` handoff paths.
- [ ] Missing project-native-agent configuration produces an actionable error
  before Codex starts.
- [ ] Fake-provider runs and existing workflow retry behavior remain intact.

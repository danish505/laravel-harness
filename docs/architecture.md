# Architecture

It is a file-based multi-agent workflow for Laravel projects.

## Core Flow

```text
planner -> implementer -> tester -> reviewer
```

## Responsibilities

### Planner

Creates `harness/plans/plan.md`.

### Implementer

Reads `plan.md`, modifies code, and writes:

```text
harness/reports/implementation.md
harness/artifacts/latest-diff.patch
```

### Tester

Reads the plan, implementation report, and diff. Creates focused tests when needed, preferably unit tests for changed fields/rules/logic. Writes:

```text
harness/reports/test-results.md
```

### Reviewer

Reads all previous outputs and writes:

```text
harness/reports/review.md
```

If rejected, the review file becomes input for the implementer retry.

## State

Use `harness/state/context.json` for concise memory. Do not store long raw logs or secrets in state.

## Logs and Artifacts

Use `harness/logs/` and `harness/artifacts/` for raw output, diffs, and temporary files.

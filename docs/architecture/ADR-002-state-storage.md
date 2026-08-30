# ADR-002: JSON File-Based State Storage

**Status:** Accepted  
**Date:** 2026-08-30

## Context

The V2 workflow engine needs durable, resumable run state. Requirements:
- Survives process crashes and restarts.
- Human-readable for debugging without special tooling.
- No external service dependency (SQLite requires native bindings, PostgreSQL requires a server).
- Supports atomic updates to prevent corruption on crash.

Alternatives considered:
- **SQLite** — reliable, queryable, but requires native bindings and is less transparent than plain files.
- **PostgreSQL / Redis** — too heavyweight; V2 is a local CLI tool, not a server.
- **Plain JSON, overwrite in place** — simple but not crash-safe (partial write = corrupt state).

## Decision

Store all run state as **JSON files** in `.laravel-harness/runs/<run-id>/`.

Atomic write strategy: write to `<file>.tmp`, then `rename()` (atomic on POSIX filesystems).

Run locking: a `.lock` file in the run directory prevents two processes mutating the same run.

```
.laravel-harness/
├── config.yaml
└── runs/
    └── <run-id>/
        ├── manifest.json       ← immutable after creation
        ├── state.json          ← current state (atomic writes)
        ├── events.jsonl        ← append-only event stream
        ├── task.md
        ├── plan.md
        ├── implementation.md
        ├── test-results.md
        ├── review.md
        ├── .lock               ← process lock
        └── attempts/
            └── 1/              ← per-attempt artifacts
```

## Consequences

- No external dependencies or native bindings.
- Files are human-readable and inspectable with any editor.
- `events.jsonl` provides a full audit trail.
- Atomic rename is reliable on local filesystems; network filesystems (NFS, some Docker mounts) may not guarantee atomicity — documented as unsupported.
- No complex queries across runs in V2.0; `lh list` does a directory scan (acceptable at V2 scale).

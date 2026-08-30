# ADR-001: Use TypeScript on Node.js LTS for the V2 Engine

**Status:** Accepted  
**Date:** 2026-08-30

## Context

Laravel Harness V2 needs a CLI orchestrator that is:
- Cross-platform (macOS, Linux, and eventually Windows).
- Strongly typed so that state machine transitions, provider contracts, and handoff schemas can be enforced at compile time.
- Executable without a separate runtime install for most developers (Node.js is already present for Playwright).

The existing V1 harness uses Node.js for Playwright tests, so Node is already a first-class dependency.

Alternatives considered:
- **PHP** — natural fit for Laravel developers but poor CLI tooling for async process management and no built-in schema validation ecosystem.
- **Python** — excellent tooling, but adds a second runtime with version management concerns.
- **Go** — single static binary is appealing, but no existing Go code in the project and steeper contributor ramp-up.
- **Shell scripts** — V1 already proves their limits; not suitable for a typed state machine.

## Decision

Use **TypeScript** compiled to CommonJS targeting the **current Node.js LTS** (v22.x at V2 launch).

Key libraries (exact versions selected via short spike):
- CLI parsing: `commander` or `yargs`
- YAML + JSON Schema validation: `js-yaml` + `ajv`
- Structured logging: `pino`
- Process execution: `execa`
- Test runner: `vitest`

## Consequences

- Strong types enforce provider and handoff contracts at compile time.
- Node.js is already required (Playwright), so no new runtime.
- Shell scripts are kept only as thin `bin/lh` entry-point wrappers.
- Build step (`tsc`) required before distribution; add to CI.
- Contributors need Node.js familiarity; PHP-only developers have a small ramp-up.

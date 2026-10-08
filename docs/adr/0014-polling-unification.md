# ADR-0014: Polling Unification via usePolling

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** Engineering Team
- **Consulted Skills:** `frontend/react-patterns`, `code-quality/clean-code-guard`

## Context and Problem Statement

Polling pages each hand-rolled `setInterval`/`setTimeout` (13 raw sites at peak) with
inconsistent cleanup and no tab-visibility pausing — leak and battery-drain risk on a
gateway box with always-open operator dashboards, plus per-page forensics on timer bugs.

## Decision Drivers

- One timer pattern with cleanup + visibility-pause built in.
- No speculative abstraction: the hook merged only with adopted call sites
  (dead-hook incident — merged `useStationTelemetry` with zero importers — was reverted;
  speculative merges require an importer in the same PR, per AGENTS.md rule).

## Decision Outcome

- `src/lib/usePolling.ts` is the sole polling primitive; remaining raw timers exist only
  in tests and the limiter itself (verified: zero raw production timers).
- Dashboard pages and the graph hook consume it directly.

## Consequences

- **Good:**
  - Timer bugs become one-hook fixes; unmount/visibility behavior uniform.
- **Bad:**
  - Non-standard timing needs (backoff, jitter) must extend the hook, not bypass it —
    enforced by slop-gate check 4.

# ADR-0012: Account-Manager Facade Decomposition (Four Seams)

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** Engineering Team
- **Consulted Skills:** `code-quality/vibe-code-auditor`, `code-quality/clean-code-guard`, `architecture/codebase-design`

## Context and Problem Statement

`src/lib/account-manager.ts` grew into a god object (1291 lines at peak): Directus CRUD,
atomic file-cache fallback, Deye client registry, and fleet aggregation behind one class.
Any Directus schema change rippled through unrelated consumers; the class was un-mockable
as a unit (slopRecs audit series, score 53/100 at v1).

## Decision Drivers

- Isolate schema-change blast radius per responsibility.
- Keep all existing call sites stable during the split.
- Prove each seam with dedicated tests before proceeding to the next.

## Decision Outcome

- Extract, in dependency order: `FileAccountCache` (atomic file I/O) → `DirectusTransport`
  (collection CRUD + control auditing) → `ClientRegistry` (client lifecycle) →
  `FleetAggregator` (rollups; consumes registry output, hence last).
- `DeyeAccountManager` remains as a thin GoF Facade with backward-compatible delegation
  shims; hollowness documented in the file header verdict (v7 finale).
- Result: 1291 → 920 lines; seam suites green (83/83 total).

## Consequences

- **Good:**
  - Schema, cache, registry, aggregation changes no longer cross-contaminate reviews.
  - Each seam is unit-testable in isolation (client-registry, fleet-aggregator suites).
- **Bad:**
  - 920 facade lines of delegation boilerplate remain; new responsibilities must be
    assigned to a seam explicitly or the god object re-forms (guard: one-actor-per-module).

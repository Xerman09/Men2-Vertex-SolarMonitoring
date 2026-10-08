# ADR-0015: Machine-Enforced Slop Gate (ESLint + CI Greps)

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** Engineering Team
- **Consulted Skills:** `code-quality/clean-code-guard`, `devops/shipping-and-launch`

## Context and Problem Statement

Six audit passes (53 → 98) proved exhortation doesn't converge: magic literals and raw
consoles stayed flat across passes until enforcement landed. Human-reviewed zeros rot
without a machine holding them.

## Decision Drivers

- Audit findings must be CI-enforced the same PR they are fixed, or they regress.
- The gate must be runnable locally in seconds (fast feedback) and in CI (no bypass).

## Decision Outcome

- `eslint.config.mjs` with `no-console` (allowlist: `src/lib/logger.ts`, tests).
- `scripts/slop-gate.mjs`: five checks — `any` (zero), raw console (logger-exempt),
  magic `60 * 1000` (exempt: canonical `ONE_MINUTE_MS` definition in rate-limit.ts),
  raw timers (exempt: usePolling, limiter, tests), 1000-line file ceiling.
- `.github/workflows/ci.yml` runs the gate after unit tests; structured logging flows
  through `createLogger` scopes instead.

## Consequences

- **Good:**
  - The slop backlog cannot silently regrow; future audits are "confirm green."
- **Bad:**
  - Legitimate exceptions require editing the gate's allowlists — by design (exceptions
    should be visible, reviewed diffs, not silent drift).

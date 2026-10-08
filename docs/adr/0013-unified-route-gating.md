# ADR-0013: Unified Route Gating via withGate

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/auth-implementation-patterns`, `backend/api-security`, `security/threat-modeling`

## Context and Problem Statement

All 12 API routes hand-rolled the same preamble (session verify + rate limit + 401/429
blocks) with per-route limit constants and key formats. Drift already caused one incident
class: unauthenticated fleet fan-out on history/aggregate/accounts-GET (repaired across
5 files in ADR-0008 instead of one).

## Decision Drivers

- Single enforcement point for authentication, role checks, and rate limiting.
- Tenant-scope fixes must touch one file, not N routes.
- Types must hold at the trust boundary (auth skill: JWT-valid ≠ ownership).

## Decision Outcome

- `src/lib/gate.ts` exposes `withGate({ roles, rateLimit })` composing
  `requireAuthenticatedSession` + `checkRateLimit` + `Retry-After`; all 12 handlers
  wrapped (28 references); overloads type authed vs `allowUnauthenticated` contexts;
  zero `as any` casts; limits via `RATE_LIMIT_CONFIGS`.
- Middleware retains edge duties (CSRF origin check, control-route pre-gate).

## Consequences

- **Good:**
  - Auth-drift class eliminated; policy changes are one-config edits.
  - Every route handler receives a typed session context.
- **Bad:**
  - Gate is now the single point of failure for all routes — changes to `gate.ts`
    require the full suite green (enforced: 83/83 + CI).

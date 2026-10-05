# DSM Skills-Based Analysis v7 (2026-10-05)

Seventh pass. Unlike v6 (zero churn), **this pass found real movement**: ADR-0008
accepted and implemented. Method: same skill set as v6 (security / backend / frontend /
architecture / testing / devops pointers + threat-modeling, auth-implementation-patterns,
hunt-idor, hunt-ssrf, api-security, nextjs-best-practices, testing-patterns, ADR
guidance). Evidence: `git diff` over all 12 modified files, full read of new
`docs/adr/0008`, vitest full suite (6 files / 48 tests綠 — all pass), `tsc --noEmit`
clean, repo-wide grep for stale references. Prior files: opencodeRecs.md, 3/4/5/6.

## 1. Net delta vs v6: v6 fix list items #1, #2, #3 + #5-partial are DONE

12 files changed (+309/-32), plus new `docs/adr/0008-*.md` and README index entry.
Every v6 prescription was followed almost verbatim:

| v6 fix | Implementation (verified in diff) | Verdict |
|---|---|---|
| #1 fleet default-deny (ADR-08) | New `requireAuthenticatedSession` helper (`session.ts` +28); wired into history / aggregate / accounts-GET / stations / plants with 401-unauth + consumer scoping; read limiters 30-60/min + `Retry-After: 60`; plants-POST mutation limiter 20/min; accounts PUT/DELETE `ACCOUNT_ID_REGEX` | CLOSED |
| #2 X3/X4/X5 encoding pass | `encodeURIComponent` on collection+id in fetch/create/update/delete (`account-manager.ts`); `matchedUser.id` at `auth/role:102`; `DIRECTUS_COLLECTION` schema allowlist `/^[a-zA-Z0-9_-]+$/` (max 64) in `env.ts` | CLOSED |
| #3 kill `setRoleDirectly` | Removed from context type (:32), provider value (:193/:204); internal rename `applyRoleState`; **zero repo references remain** (grep clean) | CLOSED |
| #5 Retry-After | Added on login 429, accounts-mutation 429, all new read 429s | CLOSED for 429 paths |
| #4 secrets hygiene | Not addressed (history still dirty, dev defaults in repo) | OPEN |
| #6 cookie `__Host-` | Not addressed | OPEN, low |

## 2. Route-auth matrix v7 (all five fleet reads now gated)

- `history`: limiter 30/min → `requireAuthenticatedSession` (401) → consumer
  accountId pin (403 on mismatch). Was fully open in v1-v6. **Closed.**
- `aggregate`: limiter 60/min → 401-unauth; consumer scoping kept; admin/viewer fleet
  summary explicit. **Closed.**
- `accounts` GET: limiter 30/min → 401-unauth; consumers get only `session.accountId`
  match **with Directus health metadata omitted**; admin/viewer full. Mutations still
  admin + 20/min. **Closed.**
- `stations` / `plants` GET: limiter 60/min → 401-unauth → existing consumer pin +
  `enforceTenantAccess`. Fan-out now requires a session (viewer/admin by design).
  **Closed.**
- `control`, `telemetry`, `station`, `health`, `station`, `auth/*`: untouched,
  still closed. Total: **12/12 routes authenticated. No open read remains.**

Per auth-implementation-patterns: session-validity and resource-ownership are now
checked at the same gate in every route — the v6 "valid session, wrong resource"
class is gone for reads. Remaining ownership surface is mutations, which were
already admin-gated.

## 3. STRIDE v7 (rescored)

- **T-I1 IDOR — 12 High → CLOSED.** All BOLA paths (history/aggregate/accounts-GET/
  stations/plants fan-out) now default-deny with 401 + tenant scoping. Downgrade to
  hardening-watch: viewer-role fleet visibility is intentional per ADR-08 §2.
- **T-I2 filter/path injection — LOW → CLOSED.** X3/X4/X5 encoded, collection schema
  allowlisted, mutation `id` regex-validated (`PUT :164-172`, `DELETE :207-215`).
  Test asserts `solar/accounts` → `solar%2Faccounts`, `../../etc/passwd` rejected.
- **T-S1/T-T1/T-E1 SSRF — stays closed/low.** No new sinks; encoding pass only
  shrinks the reachable URL space. `redirect:'error'` + timeouts untouched.
- **T-D1 secrets-in-history — unchanged, now the top risk.** Nothing in this diff
  rotates or purges; `.env`-class values remain in git history. Becomes P0 by
  elimination.
- **T-R1 weak dev defaults — unchanged.** `DEFAULT_SESSION_SECRET`,
  `DEFAULT_ADMIN_PIN`, `http://localhost:8056` still checkout-able; prod
  `superRefine` is the only gate. P1.
- **T-E2 client role spoof — CLOSED (server side).** Context export removed, tsc
  clean, no stale imports. `localStorage` still holds a UX-hint copy (:57-58 write,
  :79-80 offline read) — acceptable residual, no privilege path: routes only trust
  the HttpOnly session cookie.
- **T-B1 brute-force/login — improved.** Login 429 now carries `Retry-After: 60`;
  read limiters close the herd-polling gap against gateway microcontrollers.

## 4. Verification evidence (not claims)

- `npx vitest run`: **6 files, 48 tests, all pass** (1.77s). New coverage:
  `requireAuthenticatedSession` 401/allow/admin-403 matrix, X3/X4 encoding
  assertions, `ACCOUNT_ID_REGEX` injection rejections — the exact regression net v6
  asked for (fix #1 proof).
- `npx tsc --noEmit`: clean — the `setRoleDirectly` removal broke no consumers.
- Repo grep `setRoleDirectly`: zero hits.
- Test count delta: 33 (3 files sampled pre-change) → 48 full suite green.

## 5. What remains (re-prioritized)

1. **P0 — Secret rotation + history purge (T-D1).** The single remaining High.
   Rotate Deye app secret, Directus token, session secret, admin PIN; purge or
   rebase history; add secret-scan to CI (open since v1).
2. **P1 — Dev defaults out of `env.ts` (T-R1).** Move to git-ignored
   `.env.development`; keep `superRefine` as prod gate. Small, mechanical.
3. **P2 — `__Host-` cookie prefix + document proxy TLS assumption** (`secure`
   prod-only is correct only if the proxy strips plain HTTP — verify).
4. **P2 — In-memory limiter note:** fine for single-node gateway (recorded
   constraint, ADR-0005 roadmap to Upstash Redis if multi-instance).
5. **Watch — viewer fleet visibility** is policy, not bug (ADR-08 §2); revisit only
   if tenant hardware identifiers in fleet responses become sensitive.

## 6. ADRs (9)

ADR-01..07 carried. **ADR-08 now Accepted** (was "proposed" in v6):
Strict Default-Deny with Role-Based Scoping; `requireAuthenticatedSession` 401 gate;
consumer/accountId scoping with Directus-health omission; viewer fleet-but-not-tenant;
read limiters 30-60/min + `Retry-After: 60`; kiosk path = dedicated viewer session or
`ALLOW_PUBLIC_FLEET_READS` flag, never absence-of-check. Implementation matches the
spec — no drift between ADR text and diff.

## 7. Sprint order

1. P0 secrets (rotation + purge + CI scan). 2. P1 env dev-defaults move. 3. P2 cookie
   prefix + proxy note. Then: commit this batch (uncommitted-risk flag from v1 still
   applies — the ADR-08 work itself is currently uncommitted), tag, and only then
   consider the hardening backlog closed.

# DSM Skills-Based Analysis v6 (2026-10-05)

Sixth pass. Method: 6 pointer libs (security / backend / frontend / architecture /
testing / devops) + 8 vault skills (threat-modeling STRIDE, auth-implementation-patterns,
hunt-idor, hunt-ssrf, api-security 10-phase, nextjs-best-practices, testing-patterns,
architecture-decision-records). Evidence: full route-auth grep over all 12 API routes,
direct reads of history / aggregate / accounts / stations / auth-role / role-context /
env, 6 test files, SSRF sink table (6 lib sinks). Prior files: opencodeRecs.md,
opencodeRecs3/4/5.md.

## 1. Net delta vs v5: NO behavior change on any open item

Zero-churn verification. `src/app` 14 entries (7 pages + chrome + `api/`), `src/lib`
15 entries (14 modules + `__tests__/`), `src/middleware.ts` unchanged (CSRF origin
:10-32, control gate :35-45, accounts-mutation admin gate :48-61, redirects :64-73,
narrow matcher :78-84). Route-auth grep over all 12 routes reproduces v5 exactly.
**One new residual found: X5** (unencoded Directus `filter[user_id]` in auth/role
L102 — same class as X3/X4, attacker-influenced `matchedUser.id` interpolated into a
query string). Everything else in v6 is re-verification with file:line proof.

## 2. Route-auth matrix (verified, with proof)

| Route | Auth state (v6 read) | Verdict |
|---|---|---|
| `deye/history` route.ts:1-25 | Zero session/rate-limit references; pure `deyeClient.getHourlyEnergy` | OPEN (unchanged) |
| `deye/aggregate` :6-25 | `session?.role==='consumer'` scoped; `session==null` falls to :24 full-fleet `getAggregatedFleetSummary()` | OPEN for unauth (unchanged) |
| `deye/accounts` GET :40-58 | Public `getAccountsSummary` + Directus health; POST/PUT/DELETE via `requireAdminSession` + 20/min per admin | OPEN read / CLOSED mutations (unchanged) |
| `deye/stations` :15-65 | Consumer pinned to `session.accountId` (403 on mismatch :22-27); `accountId` param gated by `enforceTenantAccess` :44-51; no-accountId fall-through = fleet fan-out | PARTIAL (unchanged) |
| `deye/plants|station|telemetry|health` | `verifySessionToken` + `enforceTenantAccess` wired | CLOSED (unchanged) |
| `deye/control` | zod enum + regex + 5/min + Retry-After + tenant pin + 404/502 + audit | CLOSED (unchanged) |
| `auth/role` (225 lines, full read) | 10/min IP login :13-19; 3 cookie sets all `HttpOnly/Lax/maxAge=DEFAULT_SESSION_TTL_SECONDS`, `secure` prod-only :68-76/:135-143/:207-215; master-PIN + Directus-users + legacy triple path | CLOSED except X5 |
| `auth/session` | `verifySessionToken` re-validation | CLOSED |

Per auth-implementation-patterns (JWT-valid != ownership): the residual risk sits
exactly where v5 left it — routes that accept a *valid* session but don't bind it to
the requested resource (history: no check at all; aggregate/accounts-GET/stations
fan-out: valid-or-absent session gets fleet scope).

## 3. STRIDE (unchanged scores, tightened evidence)

- **T-I1 (IDOR / broken object-level auth) — 12, High.** Proof: history open (25
  lines, no auth import); aggregate :24; accounts GET :40-58. Consumer pin exists only
  where `enforceTenantAccess` is called.
- **T-I2 (Directus filter injection) — LOW-hardening, new instance X5.**
  `auth/role` L102 `?filter[user_id][_eq]=${matchedUser.id}` joins X3/X4 (collection/id
  unencoded at S3-S6 sinks). `matchedUser.id` is DB-sourced, not raw input — severity
  stays hardening-level, but one `encodeURIComponent` pass over all three call sites
  closes the class.
- **T-S1/T-T1/T-E1 (SSRF) — 15 -> effectively closed/low.** Zero direct `fetch(` in
  routes; 6 lib sinks all `redirect:'error'` (deye S1 token / S2 `fetchWithAuth` 8s;
  account-manager S3-S6 Directus CRUD 4-5s). Deye allowlist (5 hosts + suffix fallback
  + PRIVATE_IP_REGEX); Directus choke `getDirectusBaseUrl:52`. `deleteItem:157`
  missing-redirect claim from v4 stands REFUTED. `accounts?id=` is indirect-lookup
  (safe) but unencoded at sink — fold into the X3/X4/X5 encoding pass.
- **T-D1 (secrets in git history) / T-R1 (weak defaults in repo)** — unchanged.
  `env.ts` still ships `DEFAULT_SESSION_SECRET` (:3), `DEFAULT_ADMIN_PIN` (8888-class),
  `DIRECTUS_BASE_URL http://localhost:8056` (:16); prod `superRefine` (>=32,
  non-weak PIN, HTTPS Directus :27-53) is fail-fast but dev defaults remain checkout-able.
- **T-E2 (client role spoof)** — unchanged. `src/lib/role-context.tsx`
  `setRoleDirectly:114-129` writes arbitrary role to `localStorage`
  (`dsm_user_role` :117, `dsm_auth_user` :120); server session is authoritative for
  routes, but any UI gate reading localStorage (:57-58 write, :79-80 offline-hint read)
  is spoofable. Offline-fallback (:78-80) is read-only hint — acceptable; the exported
  setter is the exposure.

## 4. Fix lists (6, ordered)

1. **Close fleet-visibility set (T-I1):** require session on history (or document
   intentionally-public + add read rate-limit); require session on aggregate and
   accounts-GET; default-deny when `accountId` absent on stations/plants. Reuse
   `requireAdminSession`-style helper — stops 3-route drift. (ADR-08 decision point.)
2. **One encoding pass (X3/X4/X5):** `encodeURIComponent` on collection/id at S3-S6,
   `matchedUser.id` at auth/role:102, `accounts?id=` value; add `DIRECTUS_COLLECTION`
   allowlist in env (currently free-form default `iot_solar_accounts`).
3. **Kill `setRoleDirectly` export** (role-context :114-129, :193/:204): derive UI role
   from `/api/auth/session` only; keep offline-hint read path. Removes client-spoof
   surface without touching auth flow.
4. **Secrets hygiene:** rotate anything ever committed (history still dirty); move dev
   defaults out of `env.ts` into `.env.development` (git-ignored), keep prod
   `superRefine` as the single gate; add secret-scan to CI (lint/secret-scan gap
   from v1 still open).
5. **Rate-limit scope:** reads (history/aggregate/accounts-GET) have no limiter;
   in-memory limiter is single-instance — acceptable for single-node solar gateway,
   note as constraint; add `Retry-After` on 429s outside control route.
6. **Cookie hardening:** TTL unified 12h (CLOSED per v5); remaining: `secure`
   prod-only (correct behind TLS-terminating proxy — verify proxy strips HTTP) and no
   `__Host-` prefix; low priority.

## 5. Test / frontend / devops notes

- 6 test files (`auth-crypto`, `control-and-tenant-matrix` incl. deleteItem redirect
  test :211-230, `rate-limit`, `session`, `trigonometric-math`, `url-validator`).
  Gap: no route-level test asserting 401-unauth on history/aggregate/accounts-GET or
  403 cross-tenant on stations — the exact regression net for fix #1 (testing-patterns
  factories already exist: `getMockSession`/`getMockControlBody`).
- Frontend (nextjs-best-practices): server-first role via `/api/auth/session` is the
  right pattern; localStorage dual-write is the drift. No RSC/polling/a11y changes
  observed this pass.
- DevOps: single-node in-memory limiter + Directus `http://localhost` default fit a
  LAN solar gateway; record as deployment constraint (ADR-08 context), not a defect.

## 6. ADRs (8 = 7 carried + 1 proposed)

ADR-01..07 carried (CSRF-by-middleware, zod-env fail-fast, SSRF allowlist+redirect:error,
scrypt sessions, control zod+5/min, mock-honesty flags, 12h cookie TTL). **ADR-08
(proposed): fleet endpoints default-deny** — history/aggregate/accounts-GET/stations
require session; public-read (if wanted for wall displays) becomes explicit
allowlist with read rate-limit, not absence-of-check.

## 7. Sprint order

1. Fix #1 + route regression tests (closes T-I1, proves ADR-08). 2. Fix #2 encoding
   pass (30 min, closes X-class). 3. Fix #3 setter removal. 4. Fix #4 secrets/CI.
   5. Fix #5/#6 hardening. No new architecture needed — all fixes reuse existing
   helpers (`requireAdminSession`, `enforceTenantAccess`, `checkRateLimit`).

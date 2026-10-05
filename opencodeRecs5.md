# DSM — Skills-Based System Analysis v5 (2026-10-05)

**Project:** Deye Solar Monitoring — Next.js 16.2.1 / React 19 / Tailwind v4 / TS strict / Vitest 5
**Path:** `C:\Users\admin\Documents\Work Men2\Iot\Iot System\Deye Solar Monitoring\DSM`
**Output:** `opencodeRecs5.md` (this file — fifth pass, supersedes v4 where noted)
**Method:** Fresh working-tree verification via 3 parallel explore agents (structure / auth-tenant / SSRF-fetch) + 6 pointer libraries + 8 vault `SKILL.md` reads. No code changed.

## Skills applied this pass

- `security/threat-modeling` — STRIDE worksheet, DFD, 5×5 matrix, High ≥12 / current-sprint SLA
- `security/auth-implementation-patterns` — "JWT validation ≠ ownership"; rotation needs atomic persistence + concurrency tests; cookie flags ≠ CSRF
- `security/hunt-idor` — two-account replay, verb/method tampering, Gate-0 (do/lose/10-min-repro)
- `security/hunt-ssrf` — OOB-or-it-didn't-happen gate, per-payload attribution, redirect-follow root cause, blind-vs-full-read
- `backend/api-security` — 10-phase REST/BOLA/BFLA/rate-limit/DoS workflow
- `frontend/nextjs-best-practices` — server-first, fetch/caching, route conventions, anti-patterns
- `testing/testing-patterns` — TDD red-green-refactor, `getMockX()` factories, behavior-not-implementation
- `architecture/architecture-decision-records` — MADR/lightweight/Y-statement, ADR lifecycle
- Pointer libraries consulted: `security` (246), `backend` (46), `frontend` (35), `architecture` (35), `testing` (45), `devops` (164)

## Evidence base

Structure agent: **59 src files, zero churn vs v4** — 25 app (7 pages + 6 chrome + 12 route handlers), 20 lib (14 modules + 6 tests), 13 components (layout×4, analytics×1, theme×2, ui×6), +1 `src/middleware.ts` (reconciles 25+20+13=58 vs 59 total). Auth agent: per-route `enforceTenantAccess`/cookie/rate-limit/role-context/control-schema verdicts with file:line. SSRF agent: all 6 server-side fetch sinks with sanitizer + redirect + timeout table.

---

## 1. Deltas vs v4 (verify before closing)

| v4 claim | v5 state |
|---|---|
| IDOR wiring "closed-pending-proof" | **Downgraded to PARTIALLY CLOSED.** Closed: `telemetry:4,13,15-21`, `health:4,12,14-20`, `station:4,13,15-21`. Partial: `stations:15-28` consumer pin + `:45-51` enforce only-if-`accountId` (else fleet fan-out by design); `plants` same split (`:16-36`, `:42-48`, admin POST `:90-95`); `aggregate:13-22` consumer-scoped, **no enforce import**, viewer/unauth get full fleet (`:24`). **Open: `history:1-25` zero authN/Z; `accounts` GET `:40-58` public.** |
| Cookie TTL "normalize legacy 7-day" | **CLOSED.** All three cookie sets (`role:75,142,214`) now `maxAge:DEFAULT_SESSION_TTL_SECONDS` (12h, `session:41`) with `httpOnly/secure-prod-only/lax/path:/`. Logout clears same path/sameSite `maxAge:0` (`session/route:34-42`). Residual nits only: no `__Host-` prefix, no sliding refresh. |
| Login rate-limit closed, reads open | **Confirmed.** Login 10/min (`role:12-19`), control 5/min + Retry-After (`control:51-58`), accounts-mutations 20/min (`accounts:25`). **No limiter on any read** (telemetry/health/station/stations/plants/aggregate/history). In-memory Map + `setInterval` cleanup (`rate-limit:6,9-19`) — multi-instance bypass stands; Upstash only in `docs/adr/0005`, not wired. |
| `deleteItem:157` missing `redirect:'error'` | **REFUTED — fixed in tree.** `account-manager:161` HAS `redirect:'error'` + `:162` 5s timeout. All 6 sinks carry `redirect:'error'`. |
| Control `accountId` free-form | **CLOSED.** `control:19-34` zod: `deviceSn ^[A-Za-z0-9_-]{6,32}$`, 6-value mode enum, `gridCharge` strict boolean, `accountId min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)`. 400 flatten (`:71-80`), consumer pin (`:86-100`), 404 unknown, 502 upstream. |
| `role-context` localStorage fallback | **PARTIALLY CLOSED.** Now server-first (`:43-75` fetch session, cache on ok, purge on unauth) with localStorage read **only on non-200 offline path** (`:78-90`) + focus revalidate (`:102-106`). Still open: `setRoleDirectly:114-129` writes arbitrary role; `isAdmin/isConsumer/isViewer` (`:181-183`) derived from client state and consumed for privileged UI. API enforcement is the real gate — treat client role as UX hint only. |
| `sanitizeAccountId` helper | **Does not exist** (0 matches codebase-wide). Closest is control zod regex. `DELETE accounts?id=` (`:167-169`) presence-check only → raw into `deleteAccount` → unencoded `collection/id` interpolation (`account-manager:137,157`). Low-severity path-injection hardening gap, not open SSRF (base still sanitized). |

---

## 2. STRIDE threat model (per `threat-modeling`)

DFD: `Browser → middleware (CSRF/session) → Route handlers (/api/deye/*, /api/auth/*) → DeyeCloudClient.fetchWithAuth → DeyeCloud OpenAPI + Directus/file fallback`. Boundaries: Internet→App (middleware), App→Upstream (SSRF/timeout/redirect), App→Data (account file, audit log).

| ID | Category | Threat → DSM instance | L×I = Score | Status |
|---|---|---|---|---|
| T-S1 | Spoofing | HMAC session forgery via weak/default `SESSION_SECRET` | 3×5=15 High | Partially mitigated: HMAC-SHA256 + exp, prod fail-fast ≥32 chars, TTL normalized 12h, flags present. Gap: dev defaults in repo, history purge + rotation still open, no rotation/binding. |
| T-T1 | Tampering | Work-mode command tampering / cross-tenant dispatch | 3×5=15 High | Partially mitigated: strict zod schema (this pass closes sub-item), tenant pin, audit, 5/min, origin-only CSRF (`middleware:10-32`). Gap: origin check only (no token), admin unconstrained, reads unwired for limit. |
| T-R1 | Repudiation | Control denied / audit missing | 2×4=8 Medium | Partially mitigated: audit exists but warn-only; no append-only guarantee. |
| T-I1 | Info Disclosure | Cross-account read (IDOR/BOLA) | 3×4=12 High | Partially mitigated, **cannot drop to Medium yet**: telemetry/health/station closed; stations/plants/aggregate fleet-by-design for viewer/unauth; **history unauth + accounts GET public remain open**. Needs: enforce on history + accounts GET + aggregate viewer path, then two-account replay matrix as proof. |
| T-I2 | Info Disclosure | SSRF via `baseUrl` / Directus URL | 2×4=8 Medium→LOW-hardening | **Mitigated.** Deye allowlist + fallback + no-redirect + 8s (2/2 sinks). Directus choke + no-redirect + 4–5s (4/4 sinks, deleteItem fixed). Residual: `*.deyecloud.com` suffix allows attacker subdomain on DNS hijack (pin to 5-host set or log suffix-match); `collection/id` unencoded (X3/X4); Directus dev-mode private-IP by design; no `sanitizeAccountId` helper. Per SSRF skill: no `fetch(userInput)` anywhere — IDs become path/query segments only; OOB negatives belong in `url-validator.test.ts`. |
| T-D1 | DoS | Polling herd / token stampede / limit bypass | 3×3=9 Medium | Partially mitigated: token lock, in-memory limiter + cleanup, control/auth/accounts wired, `inFlightRef` guard. Gap: all reads unwired, multi-instance bypass, no Upstash. |
| T-E1 | EoP | Viewer→consumer→admin via role param / method swap | 3×5=15 High | Partially mitigated: middleware gates control + accounts-mutations. Gap: role-context client-writable, BFLA matrix (method swap, version downgrade, `?accountId` pollution, nested JSON) untested. |

Treatment: ≥12 current sprint (T-S1/T-T1/T-E1/T-I1), 6–11 next sprint (T-I2-hardening, T-D1, T-R1).

---

## 3. AuthN/Z (per `auth-implementation-patterns`)

**Keep:** HMAC compact token + `subtle.verify` + exp; scrypt + `timingSafeEqual`; zod prod `superRefine`; cookie flags; login 10/min.
**Fix (ordered):**
1. Wire `enforceTenantAccess` (or explicit 401/403 equivalent) on `history` + `accounts` GET + `aggregate` viewer/unauth path; decide fleet-visibility policy explicitly (auth-required vs public) and document in ADR-06.
2. `role-context` — server-gate privileged UI on `/api/auth/session`; `setRoleDirectly` dev-only or signed; clear on 401; never trust client role for access decisions (skill limit stands).
3. Reads rate-limit: extend `checkRateLimit(ip+endpoint, 5/min)` to all 9 `deye/*` reads; migrate to Upstash Redis (per `docs/adr/0005`).
4. Sliding refresh with atomic rotation + concurrency test (skill: issuance ≠ rotation).
5. Rotate dev defaults out of repo + history purge; verify `Secure` behind HTTPS proxy (`x-forwarded-proto`); consider `__Host-` prefix.
6. Session 12h + focus-revalidate is consistent — add absolute-max-lifetime cap.

---

## 4. IDOR/BOLA + API abuse (per `hunt-idor` + `backend/api-security` 10-phase)

Two-account replay (A consumer vs B consumer + viewer + unauth) across ALL verbs × every `accountId/stationId/deviceSn/id` param on all 12 route handlers. Gate-0 each: attacker does / victim loses (C/I/A) / 10-min repro.
**Expected now-passing:** `GET telemetry?accountId=<A>` as B → 403; consumer `aggregate` scoped to own; `POST control {accountId:<A>}` as B → 403; unknown → 404. **Expected now-FAILING (fix first):** `GET history` any caller → data (no auth); `GET accounts` unauth → registry; `GET aggregate` viewer/unauth → full fleet; `GET stations/plants` no-`accountId` fleet fan-out. Still untested everywhere: method swap, version downgrade, `?accountId=own&accountId=victim`, nested `{"data":{"accountId":victim}}`, `DELETE accounts?id=` raw-id path. Do NOT probe prod without written scope.

---

## 5. SSRF (per `hunt-ssrf` OOB gate)

**Deye path: mitigated.** Allowlist (4 hosts + `*.deyecloud.com` suffix) + private-IP regex + HTTPS-only + storage-time sanitize (8 call sites: `deye-client:44,55`; `account-manager:284,330,464,535,697`) + ingress 400 (`accounts:86,133`) + `redirect:'error'` + 8s both sinks. Harden: pin to 5-host set or alert on suffix-match; note `PRIVATE_IP_REGEX` evaluated after allowlist pass.
**Directus path: mitigated-weak (intentional self-hosted policy).** Single choke `getDirectusBaseUrl:51-53`, all 4 sinks `redirect:'error'` + 4–5s. Keep as LOW: add `encodeURIComponent` on `collection/id` (X3/X4), consider `sanitizeAccountId` helper for `accounts?id=`, keep dev `http://localhost:8056` + non-prod private-IP allowance documented. No `file://`/`gopher://` (HTTP(S)-only). OOB negatives (`localhost:8080`, `169.254.169.254`, `127.0.0.1:6443` → safe default + listener silence) belong in `url-validator.test.ts`.

---

## 6. Frontend (per `nextjs-best-practices` + anti-slop audit)

Server-first: root `page.tsx` `'use client'` dashboard justified for live telemetry — split Server parent (layout/static) + Client children; `loading/error/global-error/not-found` exist, verify dashboard suspense coverage. Client fetches need `cache:'no-store'` + revalidate policy + abort on unmount + `visibilitychange` pause (already partially present in dashboard poller). Validate `accountId` with zod at network edge. Design tokens (`globals.css` VOS light/dark, solar/battery/grid/load semantics, `data-grid`/badge utilities, flow animations) are deliberate, not slop — residual slop flags from parallel audit: login-page gradient blobs + `bg-gradient-to-tr` brand tile, `●` text glyphs for live status (swap to dot `span`), hardcoded `98.4%`/`46.8°C`/`60.01 Hz` vanity telemetry in dashboard, `Sparkles` unused import (`yield-arbitrage`), 5-KPI grid + dual tabs on one viewport (1-to-3 review), recharts without dynamic import. Confirm `next/image` priority/blur, dynamic-import recharts/trigonometric graph.

---

## 7. Testing (per `testing-patterns`)

**Keep:** `getMockSession`/`getMockControlBody` factories, behavior-focused names, injection-string cases (6 files).
**Finish:** import `controlBodySchema` from route instead of duplicating (drift); add tenant-matrix (`consumer A vs B`, `viewer + accountId → 403`, `unauth + accountId → 401`, `admin any → allow`, `unknown → 404`, **plus `history` unauth → 401 and `accounts` GET unauth → 401/403** once wired); add 429 + Retry-After on reads; add SSRF negative-controls + `collection/id` encoding tests; add cookie-TTL regression (12h all paths); one behavior per test, `clearMocks`, `npm test` + coverage in CI.

---

## 8. Architecture decisions to record (per `architecture-decision-records`)

Propose `docs/adr/` lightweight ADRs (status): ADR-01 HMAC session vs JWT lib (Accepted); ADR-02 zod `env.ts` prod fail-fast (Accepted); ADR-03 Deye allowlist + `redirect:error` (Accepted); ADR-04 token-lock + fan-out (Accepted); ADR-05 in-memory rate-limit → Upstash Redis migration (Proposed — not wired); ADR-06 `enforceTenantAccess` on all reads/writes (**Partially-Accepted**: telemetry/health/station + control-pin done; history/accounts-GET/aggregate-viewer open); ADR-07 Directus weak-allowlist self-hosted policy (Accepted); **ADR-08 fleet-visibility policy for viewer/unauth on stations/plants/aggregate (Proposed — needed before T-I1 can drop).** Lifecycle Proposed→Accepted→Deprecated→Superseded; 1–2 pages max.

---

## 9. Sequenced roadmap

**Sprint (High ≥12):** enforce on `history` + `accounts` GET + `aggregate` viewer path (+ADR-08 policy); BFLA/IDOR matrix tests incl. new 401/403 cases; secrets rotation + history purge; `collection/id` encoding + `accounts?id=` validation.
**Next sprint (Medium):** read rate-limits + Upstash migration; sliding refresh + rotation concurrency test; Deye host pinning/suffix logging; audit append-only; `setRoleDirectly` hardening.
**Backlog:** polling pause/caching, recharts dynamic import, bundle split, ADR index, coverage + secret-scan + `npm audit` in `ci.yml`, OOB SSRF negatives, `__Host-` prefix + proxy-proto verification.

# DSM — Skills-Based System Analysis v4 (2026-10-05)

**Project:** Deye Solar Monitoring — Next.js 16.2.1 / React 19 / Tailwind v4 / TS strict / Vitest 5
**Path:** `C:\Users\admin\Documents\Work Men2\Iot\Iot System\Deye Solar Monitoring\DSM`
**Output:** `opencodeRecs4.md` (this file — fourth pass, supersedes v3 deltas where noted)
**Method:** Fresh working-tree reads + vault `SKILL.md` reads + 3 parallel explore agents. No code changed.

## Skills actually loaded this pass (vault reads)

- `security/threat-modeling` — STRIDE, DFD, 5×5 risk matrix, SLA per tier
- `security/auth-implementation-patterns` — session/JWT lifecycle, tenant boundaries ("JWT validation ≠ ownership"), refresh concurrency caveat, cookie flags ≠ CSRF
- `security/hunt-idor` — two-account replay, verb/method tampering, chain to ATO/escalation, Gate-0 validation
- `security/hunt-ssrf` — OOB-or-it-didn't-happen gate, metadata/internal-port payloads, redirect-follow root cause, per-payload attribution
- `backend/api-security` — 10-phase REST/JWT/BOLA/BFLA/rate-limit/DoS workflow
- `frontend/nextjs-best-practices` — Server-first, fetch/caching, route conventions, anti-patterns
- `architecture/architecture-decision-records` — MADR/lightweight/Y-statement, ADR lifecycle
- `testing/testing-patterns` — TDD red-green-refactor, `getMockX()` factories, behavior-not-implementation
- Pointer libraries consulted: `security` (246), `backend` (46), `frontend` (35), `architecture` (35), `testing` (45), `devops` (164)

## Code evidence this pass

`src/middleware.ts:1-84`, `src/lib/env.ts:1-99`, `src/lib/session.ts:1-166`, `src/lib/url-validator.ts:1-99`, `src/lib/rate-limit.ts:1-57`, `src/lib/deye-client.ts:1-130` (head) + sink map via agent, `src/lib/account-manager.ts` sink map (80/114/138/157/283/329/466/537/699), `src/lib/role-context.tsx:1-195`, `src/app/api/deye/control/route.ts:1-163`, `src/app/api/deye/telemetry/route.ts:1-45`, `src/app/api/deye/aggregate/route.ts:1-33`, `src/app/api/auth/role/route.ts:1-225`, `src/app/api/deye/` (9 dirs), `src/app/` (7 pages + loading/error/global-error/not-found), `src/lib/__tests__/` (6 files), `package.json`, `.env.example`, explore inventory (59 src files: 25 app incl. 12 route handlers, 20 lib incl. 6 tests, 13 components, 1 middleware), prior `opencodeRecs3.md` §§1-9.

---

## 1. What changed since v3 (delta — verify before closing)

| v3 gap | v4 state |
|---|---|
| `enforceTenantAccess` canonical but **no read-route evidence** (T-I1 16 open) | **CLOSED in tree:** `telemetry/route.ts:15-21` calls `enforceTenantAccess(session, accountId)` → 403/401 + `24` `getClient(targetAccountId)` + 404. Structure agent confirms same helper on `health`, consumer scoping on `aggregate:13-22`, `stations`/`plants` consumer restrictions, `accounts` admin-gated (20/min). v2/v3 IDOR headline is fixed — remaining work is matrix-test proof, not wiring. |
| Cookie flags "no evidence" | **CLOSED in tree:** `auth/role/route.ts:68-76,135-143,207-215` sets `httpOnly:true, secure:(NODE_ENV===production), sameSite:'lax', path:'/', maxAge`. **New inconsistency found:** legacy fallback `214` uses `7*24*3600` (7 days) while PIN + Directus paths use `DEFAULT_SESSION_TTL_SECONDS` (12h). Normalize to 12h constant. `Secure` prod-only is correct only behind HTTPS — verify proxy `x-forwarded-proto`. |
| Login no rate-limit | **CLOSED:** `auth/role/route.ts:11-19` 10/min per IP → 429. Control 5/min (`control:44-53` + Retry-After), accounts 20/min per inventory. Reads still unwired — extend pattern, then migrate to Upstash for multi-instance. |
| Directus URL weak | **Partly closed, policy clarified by SSRF agent:** `sanitizeDirectusBaseUrl` is single choke point (`account-manager:51-52`), all Directus sinks carry `redirect:'error'` + 4–5s timeout **except `deleteItem:157` missing `redirect:'error'`**. Dev `http://localhost:8056` + any-host is intentional for self-hosted; prod blocks private/metadata + HTTPS-only. Keep as LOW hardening, not a reopen. |
| Deye SSRF "confirm redirect/timeout" | **CLOSED:** all Deye sinks sanitized host + `redirect:'error'` + `AbortSignal.timeout(8000)` (`deye-client:126,183`; ingress `accounts/route:86,133` + `sanitizeDeyeBaseUrl` at construction/update/add/update paths). No `fetch(userInput)` anywhere — IDs only become query/body/path segments. |
| Session TTL 12h, no rotation | Unchanged. Still no sliding refresh / rotation concurrency test (skill limit stands). |
| `control accountId` free-form, admin unconstrained | Unchanged: `control:28` `z.string().optional()`, admin any-account by design with 404 (`99-104`). Constrain to `min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)` — cheap win. |
| `role-context` localStorage fallback | **Still open:** `role-context:49-75` trusts `/api/auth/session` then falls back to `dsm_user_role/dsm_auth_user`; `setRoleDirectly:92-107` writes client state. Treat as UX hint only; gate privileged UI on server session; clear on 401. |
| Secrets in repo/history | **Still open:** `env.ts:3-4` `DEFAULT_SESSION_SECRET` + `DEFAULT_ADMIN_PIN='8888'` live in repo; `.env.example` clean but git history still needs purge + rotation. Prod `superRefine:23-68` fail-fast is good — does not cover dev/staging misuse. |

---

## 2. STRIDE threat model (per `threat-modeling`)

DFD: `Browser → middleware (CSRF/session) → Route handlers (/api/deye/*, /api/auth/*) → DeyeCloudClient.fetchWithAuth → DeyeCloud OpenAPI + Directus/file fallback`. Boundaries: Internet→App (middleware), App→Upstream (SSRF/timeout/redirect), App→Data (account file, audit log).

| ID | Category | Threat → DSM instance | L×I = Score | Status |
|---|---|---|---|---|
| T-S1 | Spoofing | HMAC session forgery via weak/default `SESSION_SECRET` | 3×5=15 High | Partially mitigated: HMAC-SHA256 + exp (`session:47-105`), prod fail-fast ≥32 chars (`env:23-68`). Gap: dev defaults in repo, 12h TTL + 7-day legacy cookie, no rotation/binding. |
| T-T1 | Tampering | Work-mode command tampering / cross-tenant dispatch | 3×5=15 High | Partially mitigated: zod enum + 400 (`control:66-75`), tenant pin (`81-95`), audit (`122-136`), rate-limit, origin-only CSRF (`middleware:10-32`). Gap: `accountId` free-form, origin check only (no token). |
| T-R1 | Repudiation | Control denied / audit missing | 2×4=8 Medium | Partially mitigated: audit exists but warn-only (`control:134-136`); no append-only guarantee. |
| T-I1 | Info Disclosure | Cross-account telemetry read (IDOR/BOLA) | 4×4=16 High → **downgrade to 3×4=12 after matrix tests** | **Mitigated-pending-proof:** tenant helper now wired on reads (`telemetry:15-21`, `aggregate:13-22`, health/stations/plants per inventory). Need two-account replay evidence across all 9 `deye/*` dirs × verbs. |
| T-I2 | Info Disclosure | SSRF via `baseUrl` / Directus URL | 2×5=10 Medium → **downgrade to 2×4=8 LOW-hardening** | Mitigated for Deye (allowlist + fallback + no-redirect + 8s). Directus weak-by-design + one missing `redirect:'error'` (`account-manager:157`) + two storage-time unsanitized assignments re-sanitized at sink (`283,329-332`). |
| T-D1 | DoS | Polling herd / token stampede / limit bypass | 3×3=9 Medium | Partially mitigated: `tokenFetchPromise:109-119` lock, in-memory limiter + cleanup (`rate-limit:9-19`), control/auth/accounts wired, `inFlightRef` guard. Gap: reads unwired, multi-instance bypass, no `visibilitychange` pause confirmed. |
| T-E1 | EoP | Viewer→consumer→admin via role param / method swap | 3×5=15 High | Partially mitigated: middleware gates control (admin+consumer) + accounts-mutation (admin-only). Gap: BFLA matrix untested, client role not authoritative, mass-assignment unchecked. |

Treatment per skill matrix: ≥15 current sprint (T-S1/T-T1/T-E1), 10–12 next sprint (T-I1-proof, T-I2-hardening), 6–11 backlog (T-R1/T-D1).

---

## 3. AuthN/Z (per `auth-implementation-patterns`)

**Keep:** HMAC compact token + `crypto.subtle.verify` + exp; scrypt + `timingSafeEqual`; zod prod `superRefine`; cookie flags now present; login 10/min.
**Fix (ordered):**
1. Normalize legacy cookie `role/route:214` to `DEFAULT_SESSION_TTL_SECONDS`; confirm `session/route.ts` logout clears with same `path`/`sameSite`.
2. `role-context:65-75,92-107` — localStorage is UX hint only; revalidate against `/api/auth/session` on focus; clear on 401; never gate privileged UI on it. (Skill limit: "JWT validation ≠ ownership" — same for client role.)
3. `control:28` — `accountId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional()`; keep admin 404.
4. Session 12h — add sliding refresh with atomic rotation + concurrency test (skill warns issuance ≠ rotation).
5. Rate-limit — extend `checkRateLimit(ip+endpoint, 5/min)` to `auth/*` + `accounts/*` mutations (done for login) and all reads; migrate to Upstash Redis.
6. Rotate dev defaults out of repo + history purge; verify `Secure` only behind HTTPS proxy.

---

## 4. IDOR/BOLA + API abuse (per `hunt-idor` + `backend/api-security` 10-phase)

Wiring is done — now prove it. Two-account replay (A consumer vs B consumer + viewer + unauth) across ALL verbs × every `accountId/stationId/deviceSn` param on all 9 `deye/*` dirs + `auth/*`. Gate-0 each: attacker does / victim loses (C/I/A) / 10-min repro.
**Expected now-passing differentials:** `GET telemetry?accountId=<A>` as B → 403 via `telemetry:15-21`; `GET aggregate` as consumer → scoped to own (`aggregate:13-22`); `POST control {accountId:<A>}` as B → 403 (`control:88-92`); null-account consumer → 403; viewer + `accountId` → 403; admin any → allow; unknown → 404. Still untested: method swap, version downgrade, `?accountId=own&accountId=victim`, nested `{"data":{"accountId":victim}}`. Do NOT probe prod without written scope (skill confirmation gate).

---

## 5. SSRF (per `hunt-ssrf` OOB gate)

**Deye path: mitigated, no confirmed SSRF.** Allowlist + private-IP regex + HTTPS-only + `sanitizeDeyeBaseUrl` at every construction/update + ingress 400 + `redirect:'error'` + 8s timeout. Suffix `*.deyecloud.com` allows attacker subdomain on DNS hijack — consider pinning to 5-host set + log suffix-match.
**Directus path: mitigated-weak (intentional).** Single choke `getDirectusBaseUrl`, `redirect:'error'` + 4–5s timeout everywhere except `deleteItem:157` — add it. Storage-time assignments `account-manager:283,329-332` skip `sanitizeDeyeBaseUrl` but re-sanitize at `new DeyeCloudClient`/`updateConfig` before any fetch — normalize to sanitize-at-storage for consistency. No `file://`/`gopher://` (HTTP(S)-only). OOB negatives (`localhost:8080`, `169.254.169.254`, `127.0.0.1:6443` → safe default + listener silence) belong in `url-validator.test.ts`.

---

## 6. Frontend (per `nextjs-best-practices`)

Server-first: root `page.tsx` `'use client'` dashboard is justified for live telemetry but split Server parent (layout/static) + Client children; `loading.tsx`/`error.tsx`/`global-error`/`not-found` exist — verify dashboard suspense coverage. Client fetches (`/api/deye/aggregate`, `station?accountId=`) need `cache:'no-store'` + revalidate policy + abort on unmount + `visibilitychange` pause (T-D1). Validate `accountId` with zod at network edge; confirm `next/image` priority/blur, dynamic imports for recharts/trigonometric graph.

---

## 7. Testing (per `testing-patterns`)

**Keep:** `getMockSession`/`getMockControlBody` factories, behavior-focused names, injection-string cases.
**Finish:** import `controlBodySchema` from route instead of duplicating (drift); add tenant-matrix (`consumer A vs B`, `viewer + accountId → 403`, `unauth + accountId → 401`, `admin any → allow`, `unknown → 404`); add 429 + Retry-After; add SSRF negative-controls + `deleteItem` redirect test; add 7-day-vs-12h cookie regression test; one behavior per test, `clearMocks`, `npm test` + coverage in CI.

---

## 8. Architecture decisions to record (per `architecture-decision-records`)

Propose `docs/adr/` lightweight ADRs: ADR-01 HMAC session vs JWT lib; ADR-02 zod `env.ts` prod fail-fast; ADR-03 Deye allowlist + `redirect:error`; ADR-04 token-lock + fan-out; ADR-05 in-memory rate-limit → Upstash Redis migration; ADR-06 `enforceTenantAccess` on all reads/writes (now **Accepted**, was Proposed in v3); ADR-07 Directus weak-allowlist self-hosted policy. Lifecycle Proposed→Accepted→Deprecated→Superseded; 1–2 pages max.

---

## 9. Sequenced roadmap

**Sprint (High ≥15):** cookie TTL normalize; `role-context` server-authoritative; `control accountId` regex; secrets rotation + history purge; BFLA/IDOR matrix tests to downgrade T-I1/T-E1.
**Next sprint (Medium):** `deleteItem` redirect + storage-time sanitize + Deye pin/log; Upstash rate-limit + read coverage; sliding refresh; audit append-only.
**Backlog:** polling pause/caching, bundle split, ADR index, coverage + secret-scan + `npm audit` in `ci.yml`.

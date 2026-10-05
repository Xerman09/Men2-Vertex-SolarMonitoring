# DSM — Skills-Based System Analysis v3 (2026-10-05)

**Project:** Deye Solar Monitoring — Next.js 16.2.1 / React 19 / Tailwind v4 / TS strict / Vitest 5
**Path:** `C:\Users\admin\Documents\Work Men2\Iot\Iot System\Deye Solar Monitoring\DSM`
**Output:** `opencodeRecs3.md` (this file — third pass, supersedes v1/v2 deltas where noted)
**Method:** Fresh working-tree reads + vault `SKILL.md` reads. No code changed.

## Skills actually loaded this pass (vault reads)

- `security/threat-modeling` (`C:/Users/admin/.config/opencode/skill-libraries/security/threat-modeling/SKILL.md`) — STRIDE, DFD, 5×5 risk matrix, SLA per tier
- `security/auth-implementation-patterns` (`.../security/auth-implementation-patterns/SKILL.md`) — session/JWT lifecycle, tenant boundaries, least-privilege, refresh concurrency caveat
- `security/hunt-idor` (`.../security/hunt-idor/SKILL.md`) — two-account replay, verb tampering, chain to ATO/escalation, Gate-0 validation
- `security/hunt-ssrf` (`.../security/hunt-ssrf/SKILL.md`) — OOB-or-it-didn't-happen gate, metadata/internal-port payloads, redirect-follow root cause
- `backend/api-security` (`.../backend/api-security/SKILL.md`) — 10-phase REST/JWT/BOLA/BFLA/rate-limit/DoS workflow
- `frontend/nextjs-best-practices` (`.../frontend/nextjs-best-practices/SKILL.md`) — Server-first, fetch/caching, route conventions, anti-patterns
- `architecture/architecture-decision-records` (`.../architecture/architecture-decision-records/SKILL.md`) — MADR/lightweight/Y-statement, ADR lifecycle
- `testing/testing-patterns` (`.../testing/testing-patterns/SKILL.md`) — TDD red-green-refactor, `getMockX()` factories, behavior-not-implementation
- Pointer libraries consulted: `security-category-pointer` (246), `backend-category-pointer` (46), `frontend-category-pointer` (35), `architecture-category-pointer` (35), `testing-category-pointer` (45), `devops-category-pointer` (164)

## Code evidence this pass

`src/middleware.ts:1-84`, `src/lib/env.ts:1-99`, `src/lib/session.ts:1-166`, `src/lib/url-validator.ts:1-99`, `src/lib/rate-limit.ts:1-57`, `src/lib/auth-crypto.ts:1-38`, `src/lib/deye-client.ts:1-120` (head), `src/lib/role-context.tsx:1-80` (head), `src/app/page.tsx:1-120` (head), `src/app/api/deye/control/route.ts:1-163`, `src/app/api/deye/` (9 dirs: accounts/aggregate/control/health/history/plants/station/stations/telemetry), `src/app/api/auth/` (role/session), `src/app/` (accounts, api-diagnostics, hardware-telemetry, login, yield-arbitrage, trigonometric-analytics + error/loading/not-found), `src/lib/__tests__/` (6 files), `package.json`, `.env.example`, `.github/workflows/ci.yml`, prior `opencodeRecs.md` v2 §1-5.

---

## 1. What changed since v2 (delta)

| v2 gap | v3 state |
|---|---|
| `control` route `body:any`, free `deviceSn`, `Boolean()` coercion, no rate-limit, silent admin fallback | **Closed in tree:** `control/route.ts:19-29` zod schema (`deviceSn` regex `^[A-Za-z0-9_-]{6,32}$` optional, `mode` enum 6 values, `gridCharge` strict boolean default false), `46-53` rate-limit 5/min per IP+userId with 429+Retry-After, `99-104` 404 when account missing, `139-149` 502 on upstream failure, `131` typed `user_id` parse. Remaining: `accountId: z.string().optional()` still free-form; admin `targetAccountId` unconstrained (by design — needs existence check only, already 404). |
| Session TTL 7 days | **Improved:** `session.ts:41` `DEFAULT_SESSION_TTL_SECONDS = 12*3600` (12h). Still no sliding refresh / rotation test. |
| Directus URL weak | **Improved:** `url-validator.ts:62-99` `isValidDirectusBaseUrl(raw, isProduction)` + `sanitizeDirectusBaseUrl` with prod HTTPS + prod private-IP block + safe fallbacks. `env.ts` still only `z.string().url()` for `DIRECTUS_BASE_URL:16` in non-prod — wire `sanitizeDirectusBaseUrl` at use-site (same discipline as Deye path). |
| Tests absent | **Improved:** 6 test files including `control-and-tenant-matrix.test.ts:5-16` `getMockSession` / `getMockControlBody` factories per `testing-patterns`, enum rejection, injection-string rejection (`2209X; rm -rf /`, `SN<script>`). Still schema-duplicated in test (drift risk) — import from route instead. |

---

## 2. STRIDE threat model (per `threat-modeling`)

DFD: `Browser → middleware (CSRF/session) → Route handlers (/api/deye/*, /api/auth/*) → DeyeCloudClient.fetchWithAuth → DeyeCloud OpenAPI + Directus/file fallback`. Trust boundaries: Internet→App (middleware), App→Upstream (SSRF/timeout/redirect), App→Data (account file, audit log).

| ID | Category | Threat → DSM instance | L×I = Score | Status |
|---|---|---|---|---|
| T-S1 | Spoofing | HMAC session forgery via weak/default `SESSION_SECRET` | 3×5=15 High | Partially mitigated: `session.ts:30-66` HMAC-SHA256 + exp; `env.ts:23-68` prod fail-fast (≥32 chars, no weak PIN, HTTPS Directus). Gap: dev default `deye_solar_monitoring_session_secret_2026_default:3` + `ADMIN_PIN 8888:4` live in repo; 12h TTL long; no rotation/binding. |
| T-T1 | Tampering | Work-mode command tampering / cross-tenant dispatch | 3×5=15 High | Partially mitigated: zod enum + 400 `control:66-75`, tenant pin `81-95`, audit `122-136`, rate-limit `46-53`, origin-only CSRF `middleware:10-32`. Gap: `accountId` free-form, admin unconstrained, no CSRF token (origin check only). |
| T-R1 | Repudiation | Control denied / audit missing | 2×4=8 Medium | Partially mitigated: audit exists but warn-only `134-136`; no append-only guarantee. |
| T-I1 | Info Disclosure | Cross-account telemetry read (IDOR/BOLA) | 4×4=16 High | **Open (top risk):** `enforceTenantAccess:117-166` canonical but **no read-route evidence of use**; middleware matcher `79-83` only `/api/deye/*` + 2 pages; unauth null-account fleet reads allowed by design (`130`); viewer `role-context:38` defaults to `viewer` with localStorage fallback `66-74` — client-side only. |
| T-I2 | Info Disclosure | SSRF via `baseUrl` / Directus URL | 2×5=10 Medium | Mitigated for Deye: `url-validator:19-46` HTTPS-only + 5-host allowlist + `*.deyecloud.com` suffix + private-IP regex, `sanitizeDeyeBaseUrl` at `deye-client:44,55`, need `redirect:error` + timeout confirm. Directus weaker (see §4). |
| T-D1 | DoS | Polling herd / token stampede / limit bypass | 3×3=9 Medium | Partially mitigated: `tokenFetchPromise:109-119` lock, `checkRateLimit` in-memory + `setInterval` cleanup `9-19` (multi-instance bypass, serverless leak); control wired, reads not. `page.tsx:66-68` `inFlightRef` guard good; no `visibilitychange` pause confirmed. |
| T-E1 | EoP | Viewer→consumer→admin via role param / method swap | 3×5=15 High | Partially mitigated: middleware gates control (admin+consumer) + accounts-mutation (admin-only). Gap: BFLA matrix untested (GET vs PUT/DELETE, `/v1` vs `/v2`), `role-context` client role not authoritative, mass-assignment unchecked. |

Treatment per skill matrix: ≥15 current sprint (T-S1/T-T1/T-I1/T-E1), 10–12 next sprint (T-I2), 6–11 backlog (T-R1/T-D1).

---

## 3. AuthN/Z (per `auth-implementation-patterns`)

**Keep:** HMAC compact token `payload.sig` + `crypto.subtle.verify` + exp `session.ts:71-105`; scrypt `$salt$hash` + `timingSafeEqual` with SHA-256-digest legacy fallback `auth-crypto:7-38`; zod prod `superRefine` `env.ts:23-68`.
**Fix (ordered):**
1. `enforceTenantAccess` unused on reads — call it on **every** `deye/*` read + write; consumer strict `session.accountId === accountId`; viewer fleet-only. (Skill limit: "JWT validation ≠ ownership.")
2. Cookie flags — no `HttpOnly; Secure; SameSite=Lax` evidence for `dsm_session`. Set at issuance, verify over HTTPS/proxy.
3. `role-context.tsx:48-74` trusts `/api/auth/session` then falls back to `localStorage dsm_user_role/dsm_auth_user` — attacker-controlled. Treat localStorage as UX hint only; gate all privileged UI on server session; clear on 401.
4. `control` `accountId` — add `z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)` optional; keep admin 404 on unknown account (already `99-104`).
5. Session TTL 12h — add sliding refresh with atomic rotation + concurrency test (skill limit warns issuance example alone ≠ rotation).
6. Rate-limit — extend `checkRateLimit(ip+endpoint, 5/min)` to `auth/*` + `accounts/*` mutations; migrate to Upstash Redis for multi-instance.

---

## 4. IDOR/BOLA + API abuse (per `hunt-idor` + `backend/api-security` 10-phase)

Apply two-account replay (A consumer SP_04 vs B consumer SP_09 + viewer + unauth) across ALL verbs × every `accountId/stationId/deviceSn` param on all 9 `deye/*` dirs + `auth/*`. Gate-0 each: attacker does / victim loses (C/I/A) / 10-min repro.
**Predicted differentials to confirm:** `GET telemetry?accountId=<A>` as B → expect 403, likely 200 (no tenant evidence); same for `stations/plants/aggregate/history/station`; `POST control {accountId:<A>}` as B blocked only when `session.accountId` set — null-account consumer path now 403 via `82-87` (good) but read paths still open; method swap, version downgrade, `?accountId=own&accountId=victim`, nested `{"data":{"accountId":victim}}` all untested.
**Action:** ownership-scoped queries (`findOne({_id, accountId: session.accountId})`), Burp Autorize dual-session replay, add 401/400/403/404/502 matrix tests. Do NOT probe prod without written scope (skill confirmation gate).

---

## 5. SSRF (per `hunt-ssrf` OOB gate)

**Deye path: no confirmed SSRF.** Allowlist + private-IP regex + HTTPS-only is sound; confirm `redirect:'error'` + 8s/4s timeouts at fetch call-sites and run negative controls (`http://localhost:8080/`, `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:6443/` → safe default `https://eu1-developer.deyecloud.com`, OOB listener silence = evidence). Suffix `*.deyecloud.com:33` allows attacker subdomain on DNS hijack — consider pinning to 5-host set + log on suffix-match.
**Directus path is the weaker sink:** `env.ts:16` permits `http://` in dev; `isValidDirectusBaseUrl` prod-only HTTPS/private-IP block is good but must be invoked at every Directus fetch with `redirect:'error'` + 4s timeout. No `file://`/`gopher://` possible (HTTP(S)-only) — good.

---

## 6. Frontend (per `nextjs-best-practices`)

Server-first: `page.tsx:1` is `'use client'` 844-line dashboard — acceptable for live telemetry interactivity but split Server parent (layout/static) + Client children per skill decision tree; add `loading.tsx`/`error.tsx` usage check (files exist — verify they cover dashboard suspense); `fetch('/api/deye/aggregate')` + `station?accountId=` client fetches need `cache:'no-store'` + `revalidate` policy + abort on unmount + `visibilitychange` pause to fix T-D1 herd; validate `accountId` with zod at network edge (skill: frontend-data-contracts); confirm `next/image` priority/blur, dynamic imports for recharts/trigonometric graph to keep client bundle lean.

---

## 7. Testing (per `testing-patterns`)

**Keep:** factory pattern (`getMockSession`, `getMockControlBody`), behavior-focused names, injection-string cases.
**Finish:** import `controlBodySchema` from route instead of duplicating in test (drift); add tenant-matrix cases (`consumer A vs B`, `viewer + accountId → 403`, `unauth + accountId → 401`, `admin any → allow`, `unknown account → 404`); add rate-limit 429 + Retry-After test; add SSRF negative-control tests for `sanitizeDeyeBaseUrl/sanitizeDirectusBaseUrl`; keep one behavior per test, `clearMocks` between, `npm test` + `test:coverage` in CI.

---

## 8. Architecture decisions to record (per `architecture-decision-records`)

Propose `docs/adr/` with lightweight ADRs: ADR-01 HMAC session vs JWT lib; ADR-02 zod `env.ts` prod fail-fast; ADR-03 Deye allowlist + `redirect:error`; ADR-04 token-lock + `allSettled` fan-out; ADR-05 in-memory rate-limit → Upstash Redis migration; ADR-06 `enforceTenantAccess` canonical enforcement on all reads/writes. Lifecycle Proposed→Accepted→Deprecated→Superseded; link related; 1–2 pages max.

---

## 9. Sequenced roadmap

**Sprint (High ≥15):** wire `enforceTenantAccess` on all `deye/*` reads; harden `role-context` fallback; set cookie flags; constrain `control accountId`; rotate dev defaults out of repo + git-history purge/rotation for secrets; BFLA matrix tests.
**Next sprint (Medium):** Directus sanitize at use-site + redirect/timeout; pin Deye hosts + log suffix-match; Upstash rate-limit; sliding session refresh; audit append-only.
**Backlog:** polling pause/caching policy, bundle split, ADR index, coverage gate in `ci.yml`, secret-scan + `npm audit` in CI.

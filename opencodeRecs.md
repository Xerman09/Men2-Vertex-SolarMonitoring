# DSM — Skills-Based System Analysis v2 (2026-10-05)

**Project:** Deye Solar Monitoring — Next.js 16.2.1 / React 19 / Tailwind v4 / TS strict
**Path:** `C:\Users\admin\Documents\Work Men2\Iot\Iot System\Deye Solar Monitoring\DSM`
**Method:** Re-analysis grounded in vault skill reads + working-tree code reads. No code changed.
**Skills actually loaded this pass (vault SKILL.md reads):**
- `security/threat-modeling` — STRIDE worksheet, DFD, risk matrix (5x5), SLA per risk tier
- `security/auth-implementation-patterns` — session/JWT lifecycle, tenant boundaries, least-privilege
- `security/hunt-idor` — 26-report IDOR methodology (two-account replay, verb tampering, chain to ATO/escalation)
- `security/hunt-ssrf` — OOB-or-it-didn't-happen gate, metadata/internal-port payloads, redirect-follow root cause
- `backend/api-security` — 10-phase REST/JWT/BOLA/BFLA/rate-limit/DoS methodology
- `frontend/nextjs-best-practices` — Server-first, fetch/caching, route conventions, anti-patterns
- `testing/testing-patterns` — TDD red-green-refactor, factory `getMockX()`, behavior-not-implementation
- `architecture/architecture-decision-records` — MADR/lightweight/Y-statement templates, ADR lifecycle
**Prior pointer libraries consulted (v1):** security (246), backend (46), frontend (35), architecture (35), devops (164), code-quality (43), testing (45).
**Code evidence this pass:** `src/middleware.ts:1-84`, `src/lib/session.ts:1-164`, `src/lib/env.ts:1-99`, `src/lib/url-validator.ts:1-56`, `src/lib/deye-client.ts:1-814`, `src/lib/rate-limit.ts:1-57`, `src/lib/auth-crypto.ts:1-38`, `src/app/api/deye/control/route.ts:1-137`, `src/app/api/deye/*` (9 dirs), `package.json`.

---

## 1. STRIDE threat model (per `threat-modeling` skill)

DFD: `Browser → Next.js middleware → Route handlers (`/api/deye/*`, `/api/auth/*`) → `DeyeCloudClient.fetchWithAuth` → DeyeCloud OpenAPI + Directus/file fallback`. Trust boundaries: Internet→App (middleware CSRF/session), App→Upstream (SSRF/timeout/redirect), App→Data (account file, audit log).

| ID | Category | Threat → DSM instance | Likelihood x Impact = Score | Status / Controls |
|---|---|---|---|---|
| T-S1 | Spoofing | HMAC session forgery via weak/default `SESSION_SECRET` | 3x5=15 (High) | **Partially mitigated (uncommitted):** `session.ts` HMAC-SHA256 + expiry; `env.ts:23-68` fail-fast in prod (≥32 chars, no default/weak PIN, HTTPS Directus). Gap: dev default still weak, 7-day TTL long, no rotation/binding |
| T-T1 | Tampering | Work-mode command tampering / cross-tenant dispatch | 3x5=15 (High) | **Partially mitigated:** `control/route.ts:43-51` enum + 400, `55-69` consumer tenant pin, audit `94-110` with user/ip. Gaps: `body:any`, `deviceSn` unvalidated, admin unconstrained, no rate-limit call, origin-only CSRF |
| T-R1 | Repudiation | Control action denied / audit missing | 2x4=8 (Medium) | **Partially mitigated:** audit log exists but best-effort `try/catch` warn-only; no append-only guarantee, no SIEM |
| T-I1 | Info Disclosure | Cross-account telemetry read (IDOR/BOLA) | 4x4=16 (High) | **Open:** `enforceTenantAccess()` exists in `session.ts:115-164` but `control/route` re-implements ad-hoc check and **no read-route evidence of use**; middleware matcher `79-83` only `/api/deye/*` + 2 pages; viewer/unauth null-account paths allow fleet reads |
| T-I2 | Info Disclosure | SSRF to internal/metadata via `baseUrl` | 2x5=10 (Medium) | **Mitigated for Deye path:** `url-validator.ts` HTTPS-only + `*.deyecloud.com` allowlist + private-IP regex + `sanitizeDeyeBaseUrl` used at `deye-client.ts:44,55`; `redirect:'error'` + 8s timeout. Gap: Directus URL only `z.url()` in dev, HTTPS enforced prod-only |
| T-D1 | DoS | Polling thundering herd / token stampede / rate-limit bypass | 3x3=9 (Medium) | **Partially mitigated:** `tokenFetchPromise` lock `109-119`, 4s station cache + 4s batch cache, `Promise.allSettled` `423,569`. Gap: `rate-limit.ts` in-memory + `setInterval` (multi-instance bypass, serverless leak); no per-route limits wired; no `visibilitychange` pause confirmed |
| T-E1 | EoP | Viewer→consumer→admin escalation via role param / method swap | 3x5=15 (High) | **Partially mitigated:** middleware gates control (admin+consumer) + accounts-mutation (admin-only). Gaps: BFLA matrix untested (GET vs POST/PUT/DELETE, `/v1` vs `/v2`), `role-context` client-side only, mass-assignment (`is_admin`-style) unchecked |

Risk treatment per skill matrix: ≥15 = current sprint (T-S1/T-T1/T-I1/T-E1), 10-12 = next sprint (T-I2), 6-11 = backlog with SLA (T-R1/T-D1).

---

## 2. AuthN/Z review (per `auth-implementation-patterns`)

**Good (keep):** HMAC-SHA256 compact token `payload.sig`, `crypto.subtle.verify`, exp check `session.ts:69-103`; scrypt `$salt$hash` + `timingSafeEqual` with SHA-256-digest fallback for legacy `auth-crypto.ts:7-37` (limits timing leak vs naive `===`); zod `env.ts` prod `superRefine` (SESSION ≥32, PIN not in `8888/0000/1234/1111/123456`, Directus HTTPS).
**Gaps + fixes:**
1. Cookie flags absent — `SESSION_COOKIE_NAME='dsm_session'` set path unknown, no `HttpOnly; Secure; SameSite=Lax` evidence. Fix: set flags at issuance, test over HTTPS/proxy.
2. `enforceTenantAccess` canonical but unused — `control/route.ts:55-69` duplicates consumer logic and skips when `session.accountId` null on reads (skill limit: "JWT validation ≠ ownership"). Fix: call `enforceTenantAccess(session, accountId)` on **every** `deye/*` read + write; strict `session.accountId === accountId` for consumer; viewer gets fleet-only.
3. Session TTL 7 days default `session.ts:47` — shorten (e.g. 12h + sliding refresh with atomic rotation test, per skill limit on refresh concurrency).
4. `control` route `body:any:31`, `deviceSn` free-form `89`, `gridCharge: Boolean()` coercion `91` — add zod schema (`deviceSn: /^[A-Z0-9-]{6,32}$/`, mode enum, gridCharge boolean strict). Admin path needs `accountId` existence check (404) not silent default-client fallback.
5. Rate limit not invoked in control/accounts/auth — wire `checkRateLimit(ip+endpoint, 5/min)` now, migrate to Upstash Redis for multi-instance (skill: `backend/upstash-ratelimit`).

---

## 3. IDOR/BOLA + API abuse (per `hunt-idor` + `backend/api-security` 10-phase)

Apply two-account replay method: User A (consumer, station SP_04) vs User B (consumer, station SP_09) + viewer + unauth. Per skill, test ALL verbs × every `accountId`/`stationId`/`deviceSn` param on all 9 `deye/*` dirs + `auth/*`.
**Predicted differentials to confirm (Gate 0: what attacker does / victim loses / 10-min repro):**
- `GET /api/deye/telemetry?accountId=<A>` as B → expect 403, currently likely 200 (no tenant evidence).
- `GET /api/deye/stations?accountId=<A>` as B, `plants`, `aggregate`, `history`, `station` — same.
- `POST /api/deye/control {accountId:<A>}` as B-consumer → blocked only if `session.accountId` set; null-account consumer bypasses (route `62` checks only when both set + middleware allows consumer).
- Method swap `GET→PUT/DELETE` on `accounts/*`, version downgrade `/v1→/v2`, param pollution `?accountId=own&accountId=victim`, nested JSON `{"data":{"accountId":victim}}` — all untested per repo.
**Action:** ownership-scoped queries (`findOne({_id, accountId: session.accountId})` pattern), Burp Autorize dual-session replay, add 401/400/403/404/502 matrix tests for control + read-tenant tests. Do NOT probe prod without written scope (skill confirmation gate).

---

## 4. SSRF (per `hunt-ssrf` OOB gate)

**Deye path: no confirmed SSRF.** Allowlist + `redirect:'error'` blocks the classic redirect-follow bypass (skill root cause #2); private-IP regex + HTTPS-only covers metadata (`169.254.169.254`) and `localhost` shapes. Remaining validation before closing:
1. Negative controls: `http://localhost:8080/`, `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:6443/` → must return safe default `https://eu1-developer.deyecloud.com`, no outbound (OOB listener silence = evidence).
2. DNS-rebinding/hostname-fronting: `*.deyecloud.com` suffix allows attacker subdomain if DNS hijacked — consider pinning to the 5-host set + log on suffix-match fallback.
3. Directus path is the weaker sink: `env.ts:16` `z.string().url()` permits `http://` in dev; prod HTTPS enforced but no allowlist/private-IP check. Apply same `sanitizeDirectusUrl` discipline + `redirect:'error'` + 4s timeout (already 4s in `fetchCollection` — verify redirect flag).
4. No `file://`, `gopher://`, `dict://` schemes possible (HTTPS-only) — good.

---

## 5. Resilience / data honesty (cross-skill)

**Keep:** token lock + 401 invalidate/retry `deye-client.ts:172-208`, 8s/4s timeouts, `allSettled` fan-out, 4s caches, honest `isLive:false` on failure `233,401`, `isModelSimulated:true` history notice.
**Finish:**
- `getHourlyEnergy:809-811` still returns `getMockHourlyEnergyPoints` unconditionally — label `isModelSimulated` like history or wire live curves.
- `getInverterTelemetry:673-678` hardcodes `efficiency 98.4 / heatsink 45.0 / ambient 30.0 / PF 0.99 / THD 1.5` even when `isLive:true` — source from `dataMap` or mark simulated. Use `testing/mock-hunter` to catalog every visible number REAL/MOCK/HARDCODED.
- `getSimulatedPlants:309` returns `[]` (honest) but `discoverPlantsAndDevices:303` falls back silently — ensure callers surface `isLive:false` badge.
- `account-manager` atomic write + env-overridable data dir still pending (v1 §4.2); `Promise.all` remnants re-check (main paths now `allSettled` — verify remaining batch callers).

---

## 6. Frontend (per `nextjs-best-practices`)

Route boundaries already added (`error.tsx, global-error.tsx, loading.tsx, not-found.tsx`) — use them: async Server Components for fleet/telemetry initial paint with `loading.tsx` skeletons; keep `'use client'` only for Recharts/interactive islands (`TrigonometricHistoryGraph` ~1500 lines, `accounts/page` ~1093, `header` ~665 need split, per v1).
Polling: in-flight guard + `visibilitychange` pause + backoff; `isAnimationActive={false}` on 288-pt series; memoize `account-context` provider value + stabilize 3.5s deps. Validate with `frontend-lighthouse` CI gate + `review-animations`. A11y: Radix Dialog/Dropdown (already deps), focus-trap, `aria-expanded`, label association, non-color status.

---

## 7. Tests (per `testing-patterns` TDD + factories)

Only 3 unit tests (`auth-crypto, trigonometric-math, url-validator`). Add factory-first suites:
- `getMockSession({role, accountId})`, `getMockControlBody()`, `getMockDeyeUpstream()` factories.
- Control matrix: 401 no-session, 400 bad-enum/malformed-JSON, 403 cross-tenant consumer + null-account consumer, 404 unknown account, 502 upstream-reject, 200 success + audit row written.
- Tenant reads: A-vs-B replay per §3 (expect 403, not 200).
- `url-validator` negatives (§4) + `session` expiry/tamper + `rate-limit` window/reset.
- `brooks-test` to kill mock-abuse; `k6` polling regression; `cypress` login→control→audit smoke. Behavior assertions (badge/row present), not mock-call counts.

---

## 8. ADRs to record (per `architecture-decision-records`)

Create `docs/adr/` with index + these (MADR short form, 1 page each):
1. HMAC session over JWT lib (why, rotation plan, TTL).
2. SSRF allowlist + `redirect:error` + timeouts (Deye + Directus follow-up).
3. Honest-data contract (`isLive`/`isModelSimulated` semantics, mock-labeling rule).
4. Tenant enforcement point (`enforceTenantAccess` canonical, per-route adoption checklist).
5. Rate-limit migration (in-memory → Upstash Redis) + control/accounts/auth thresholds.
6. Persistence (Directus vs file fallback, atomic write, midnight yield cron or doc-table deletion).

---

## 9. Sequencing (skill-ordered, concrete)

1. **Commit + rotate + purge (hours, unblocks all):** ~35 files uncommitted (HEAD still `52859d9`); rotate Deye secret/password, `ADMIN_ACCESS_PIN`, Directus token (old values in git history + deleted `.env.local.example` blob); `filter-repo`/BFG purge; add `.omo/run-continuation/*.json` to `.gitignore`. Skills: `security/cred-omega`, `secrets-management`, `sops-encryption`, `gha-security-review`.
2. **Tenant + cookie + limits (days):** wire `enforceTenantAccess` everywhere, extend matcher, `HttpOnly;Secure;SameSite=Lax`, zod control schema, rate-limit calls → Upstash. Skills: `auth-implementation-patterns`, `hunt-idor`, `api-security`, `upstash-ratelimit/redis`.
3. **SSRF negative-control + Directus parity + lint/scan (days):** OOB silence proof, `sanitizeDirectusUrl`, `eslint-config-next` + `lint` + gitleaks + `npm audit`/Dependabot in `ci.yml`. Skills: `hunt-ssrf`, `gha-security-review`, `dependency-scanning`, `sast-scanning`, `github-actions-advanced`.
4. **Honesty + RSC/polling/a11y + tests + ADRs (week):** mock-hunt catalog, server-first split, Lighthouse gate, factory test expansion, 6 ADRs, README/RBAC/env-table/`DATABASE_SCHEMA_RELATIONS.md` reconciliation. Skills: `mock-hunter`, `nextjs-best-practices`, `brooks-audit`, `vitest-skill`, `cypress-skill`, `k6-load-testing`.
5. **Operate:** midnight yield cron (`cron-doctor`), Directus backup drill, OTel on `fetchWithAuth`, Lighthouse budgets. Skills: `cron-doctor`, `database-backups`, `observability-and-instrumentation`.

**Preserve:** HMAC design, scrypt+timing-safe, SSRF allowlist+timeouts+no-redirect, token lock+401 retry+`allSettled`, honest `isLive`/`isModelSimulated`, zod prod fail-fast, CI typecheck+test+format+build, route boundaries.

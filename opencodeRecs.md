# DSM — Skills-Based System Analysis & Recommendations

**Project:** Deye Solar Monitoring (DSM) — Next.js 16.2.1 / React 19 / Tailwind v4 / TypeScript strict
**Path:** `C:\Users\admin\Documents\Work Men2\Iot\Iot System\Deye Solar Monitoring\DSM`
**Date:** 2026-10-05 (follow-up to 2026-10-02 report)
**Method:** Working-tree diff vs committed HEAD + skill-library mapping. `git status` shows ~35 modified/deleted/new files **uncommitted**. No code changed by this review.
**Skill sources consulted (pointer libraries):** `security-category-pointer` (246 skills), `backend-category-pointer` (46), `frontend-category-pointer` (35), `architecture-category-pointer` (35), `devops-category-pointer` (164), `code-quality-category-pointer` (43), `testing-category-pointer` (45).

Stack: 7 pages, 11 API routes (`src/app/api/deye/*` + `auth/*`), `src/lib/` (deye-client, account-manager, session, auth-crypto, rate-limit, url-validator, env), Recharts, Radix, zod, Vitest, Prettier, GitHub Actions CI.

---

## 1. Executive summary — massive uncommitted progress, do not lose it

Since the 2026-10-02 report, the working tree fixes **~70% of P0/P1**:

| Old P0/P1 | Current state (working tree) |
|---|---|
| Leaked `.env.local.example` tracked | **Fixed (uncommitted):** `D .env.local.example`, new sanitized `.env.example` (placeholders only). `.gitignore` now `.env*` + `!.env.example` + `deye-accounts.json` + `*.class` + `org/` |
| `.class` secret file tracked | **Fixed (uncommitted):** `D org/.../LocalSecretController.class` |
| No `middleware.ts` | **Fixed (uncommitted):** `src/middleware.ts` — CSRF origin check, `/api/deye/control` session gate, `/api/deye/accounts` mutation admin gate, `/accounts` + `/api-diagnostics` page redirect |
| Unauthenticated `control` route, 200-on-failure, no enum | **Fixed:** `src/app/api/deye/control/route.ts:17-59` — session verify, `VALID_WORK_MODES` enum (400), tenant check (403), 404/502/500 codes, audit log with `user_id` + `client_ip` |
| SSRF any-`baseUrl` | **Fixed:** `src/lib/url-validator.ts` — HTTPS-only, `*.deyecloud.com` allowlist, private-IP regex; `deye-client.ts:44,55` uses `sanitizeDeyeBaseUrl`; `redirect: 'error'` + `AbortSignal.timeout(8000)` |
| Token thundering herd, no 401 retry | **Fixed:** `deye-client.ts:37,109-119,172-208` — `tokenFetchPromise` lock, `fetchWithAuth` with 401 invalidate + single retry |
| `isLive:true` on failure, silent mocks | **Fixed:** `getStationList:233` returns `isLive:false`; `history/route.ts:10-16` returns `isLive:false, isModelSimulated:true` + honest notice |
| No timeouts | **Fixed:** 8s timeout on token + `fetchWithAuth`, 4s on Directus `fetchCollection:82` |
| No validation, plaintext compare | **Fixed:** `src/lib/env.ts` (zod), `auth-crypto.ts` (scrypt + `timingSafeEqual`), `rate-limit.ts` (in-memory sliding window) |
| Wildcard `allowedDevOrigins` | **Fixed:** `next.config.ts:6-8` env-driven, localhost-only default + `/energy-flow` redirect |
| No boundaries/CI/tests/format | **Fixed (uncommitted):** `error.tsx, global-error.tsx, loading.tsx, not-found.tsx`, `ci.yml` (typecheck+test+format+build), `vitest.config.mjs`, 3 tests (`auth-crypto, trigonometric-math, url-validator`), `.prettierrc/.prettierignore/.editorconfig`, `format` scripts |

**Biggest risk right now is process, not code:** all of the above is **uncommitted** (`git log --oneline -5` HEAD is still `52859d9 opencodeRecs.md`). A stray `git stash` / checkout loses it. And **git history still contains the old secrets** — rotation + `filter-repo`/BFG purge is still mandatory (assume compromised until rotated).

---

## 2. Skill map — which skill family owns what

| Domain | Pointer library | Applicable vault skills for DSM next steps |
|---|---|---|
| Secrets / auth / SSRF / headers | `security` | `cred-omega`, `secrets-management`, `hashicorp-vault` (or `aws-secrets-manager`/`azure-keyvault`/`gcp-secret-manager`/`sops-encryption`), `auth-implementation-patterns`, `hunt-ssrf`, `hunt-idor`, `hunt-nextjs`, `hunt-jwt-crypto`, `hunt-session`, `hunt-race-condition`, `gha-security-review`, `dependency-scanning`, `sast-scanning`, `dast-scanning`, `audit-logging`, `threat-modeling` |
| API / integration / resilience | `backend` | `api-security`, `api-security-best-practices`, `backend-security-coder`, `nodejs-backend-patterns`, `api-patterns`, `api-documenter`/`openapi-spec-generator`, `upstash-ratelimit`, `upstash-redis`, `neon-postgres`/`postgresql-devsec` (if leaving Directus-file fallback) |
| UI / perf / a11y | `frontend` | `nextjs-best-practices`, `react-patterns`, `frontend-api-integration-patterns`, `frontend-data-contracts`, `frontend-optimistic-mutations`, `frontend-lighthouse`, `tailwind-patterns`, `review-animations`, `redesign-existing-projects`, `anti-ui-slop` |
| Structure / debt | `architecture` + `code-quality` | `architecture-decision-records`, `architecture-patterns`, `brooks-audit`, `production-code-audit`, `clean-code`/`clean-code-guard`/`uncle-bob-craft`, `codebase-cleanup-tech-debt`, `brooks-review`, `review-swarm`, `vibe-code-auditor`, `constraint-driven-development` |
| Test | `testing` | `vitest-skill`, `testing-patterns`, `test-driven-development`/`tdd-workflow`, `brooks-test`, `k6-load-testing`, `cypress-skill`, `mock-hunter` |
| Ship / operate | `devops` | `github-actions` (+ `-advanced`, `-debugger`), `deployment-procedures`, `deployment-validation-config-validate`, `observability-and-instrumentation`/`opentelemetry`, `database-backups`/`backup-recovery`, `cron-doctor`, `docker-expert`, `vercel-deployment`/`vercel-optimize` |
| Data / IoT | `database` + `security` | Directus hardening, `ot-ics`, `firmware-analyst` (inverter/logger trust boundary — future) |

> Vault paths: `C:/Users/admin/.config/opencode/skill-libraries/{security,backend,frontend,architecture,code-quality,testing,devops}/<skill-name>/SKILL.md`. Read the vault SKILL.md before acting — do not guess.

---

## 3. P0 — Ship the fix that's already written (hours)

### 3.1 Commit the hardening, then purge + rotate secrets
- **Evidence:** `git status` = `D .env.local.example`, `D org/.../*.class`, `M .gitignore/package.json/next.config.ts`, `?? .env.example/.github/src/middleware.ts/src/lib/{session,auth-crypto,rate-limit,url-validator,env}.ts`. Tracked-env check now only shows `deye-accounts.example.json` (good) — but `git log` history still has the old blobs.
- **Action:**
  1. Review diff, commit in small atomic commits (security fix ≠ refactor).
  2. Rotate Deye `APP_SECRET`/password, `ADMIN_ACCESS_PIN`, Directus token (old values in `opencodeRecs.md:79-83` history + deleted `.env.local.example` blob).
  3. `git filter-repo` / BFG purge of `.env.local.example` + `.class` + old `opencodeRecs.md` secret block; force-push + invalidate old tokens.
  4. Add `.omo/run-continuation/*.json` to `.gitignore` (currently `M .omo/run-continuation/ses_*.json` is dirtying the tree).
- **Skills:** `security: cred-omega`, `secrets-management`, `sops-encryption`, `gha-security-review`.

### 3.2 Kill weak defaults before they become production
- **Evidence:** `src/lib/env.ts:12` `DIRECTUS_BASE_URL` defaults to `http://goatedcodoer:8056` (plaintext); `:15` `ADMIN_ACCESS_PIN` defaults to `'8888'`; `:16` `SESSION_SECRET` defaults to checked-in `deye_solar_monitoring_session_secret_2026_default`; `.env.example:29` documents `ADMIN_ACCESS_PIN=8888`.
- **Action:** Fail-fast in production when `SESSION_SECRET`/`DIRECTUS_API_TOKEN` are defaults/empty (`zod` refine on `NODE_ENV==='production'`); change Directus default to `https://` placeholder; remove `8888` from example (empty + comment). Enforce HTTPS for Directus (same allowlist discipline as `url-validator.ts`).
- **Skills:** `security: secrets-management`, `backend: backend-security-coder`, `devops: deployment-validation-config-validate`.

---

## 4. P1 — Security & data correctness (days)

### 4.1 Close the remaining auth gaps (IDOR / open reads / cookies)
- **Evidence:** `middleware.ts:79-83` matcher only covers `/api/deye/:path*`, `/accounts`, `/api-diagnostics` — `telemetry/route.ts`, `station(s)/route.ts`, `plants/route.ts`, `aggregate/route.ts`, `health/route.ts` take arbitrary `accountId` with no tenant check; `control/route.ts:54` consumer check only fires when *both* `session.accountId` and `accountId` are set (null ⇒ skip). No `Secure/HttpOnly/SameSite` cookie flags visible in `session.ts`; `rate-limit.ts` is in-memory (multi-instance bypass, `setInterval` leak on serverless).
- **Action:** Extend middleware matcher + per-route `verifySessionToken` + strict `session.accountId === accountId` for all `deye/*` reads; set `dsm_session` as `HttpOnly; Secure; SameSite=Lax, Path=/`; move rate limits to `backend: upstash-ratelimit` (+ `upstash-redis`) for `auth/role`, `control`, `accounts`.
- **Skills:** `security: auth-implementation-patterns`, `hunt-idor`, `hunt-session`, `hunt-nextjs`, `hunt-race-condition`; `backend: api-security`, `upstash-ratelimit`, `upstash-redis`.

### 4.2 Finish the data-layer hardening
- **Evidence:** `account-manager.ts:46-48` `process.cwd()` path + (prior) non-atomic write; `:76` `<T=any>`; `fetchCollection:76-100` has timeout but callers still `Promise.all`-style fan-out in `deye-client` batch paths (one bad chunk risks whole result); `DATABASE_SCHEMA_RELATIONS.md` documents 12 tables but code only exercises subset; `station_daily_yields` empty by design (no midnight cron).
- **Action:** Atomic write (`writeFileSync tmp + rename`) + `XDG`/env-overridable data dir; replace `any` at API boundaries with `zod` schemas (`frontend-data-contracts`); `Promise.allSettled` for batch device chunks; add `cron-doctor`-validated midnight rollup (23:59/00:05) into `iot_solar_station_daily_yields` or delete the doc table; record `DATABASE_SCHEMA_RELATIONS.md` ↔ `COLLECTIONS` drift as ADR.
- **Skills:** `backend: nodejs-backend-patterns`, `api-patterns`; `architecture: architecture-decision-records`; `devops: cron-doctor`, `database-backups`.

### 4.3 Add the missing quality gates (lint + secret scan + debug)
- **Evidence:** `package.json` has `format:check` but no ESLint, no `lint` script, no husky/lint-staged; `ci.yml:26-39` runs typecheck+test+format+build but no lint, no secret scan, no dependency audit.
- **Action:** Add `eslint-config-next` + `npm run lint`, wire into CI; add `gha-security-review` pass + `dependency-scanning` (Dependabot/`npm audit`) + secret-scan (gitleaks) step; document `github-actions-debugger` runbook for red CI.
- **Skills:** `code-quality: brooks-review`, `review-swarm`; `security: gha-security-review`, `dependency-scanning`, `sast-scanning`; `devops: github-actions-advanced`.

---

## 5. P2 — Frontend honesty, perf, a11y (week)

### 5.1 Keep the honesty wins, finish the job
- **Good:** `history/route.ts:12-16` honest `isModelSimulated` notice; removal of `energy-flow` dup (now redirect).
- **Remaining:** Verify no `Math.random()` jitter overwriting live series in `TrigonometricHistoryGraph.tsx`, no hardcoded `$184.20 / 94.8% / 14.8t` presented as live, no permanent-green-dot header. Use `testing: mock-hunter` to catalog every visible number as REAL/MOCK/HARDCODED, then label demo values (`isModelSimulated` badge pattern from history route).
- **Skills:** `testing: mock-hunter`; `frontend: anti-ui-slop`, `redesign-existing-projects`.

### 5.2 RSC + polling + charts
- **Evidence (carryover — re-verify):** All 7 pages historically `'use client'`; `account-context` provider value unmemoized; 3.5s polling with unstable deps, no `visibilitychange` pause; Recharts animation on 288-pt series every 3s.
- **Action:** `frontend: nextjs-best-practices` (async Server Components for initial fleet/telemetry, `loading.tsx` skeletons already added — use them), `react-patterns` (memoize providers, `useCallback`, stabilize deps), `frontend-api-integration-patterns` (in-flight guard + `visibilitychange` pause + backoff), `review-animations` + `frontend-lighthouse` (disable `isAnimationActive` on dense series, add Lighthouse CI gate).
- **Skills:** `frontend: nextjs-best-practices`, `react-patterns`, `frontend-api-integration-patterns`, `frontend-lighthouse`, `review-animations`.

### 5.3 A11y + monolith decomposition
- **Evidence (carryover):** Clickable `<div>`s, `tabIndex={-1}` toggles, unassociated labels, hand-rolled dropdown/modal, color-only status; `accounts/page.tsx` (~1093 lines), `TrigonometricHistoryGraph.tsx` (~1500 lines), `header.tsx` (~665 lines).
- **Action:** Radix `Dialog/Dropdown` properly (already depended — use them), focus-trap + `aria-expanded`/`role=dialog`, label association, non-color status indicators; split pages into `components/*` with `frontend: tailwind-patterns`; track as `architecture: brooks-audit` + `code-quality: codebase-cleanup-tech-debt` roadmap, not a drive-by refactor.
- **Skills:** `frontend: tailwind-patterns`; `architecture: brooks-audit`; `code-quality: clean-code`, `codebase-cleanup-tech-debt`.

---

## 6. P2 — Tests & docs (week)

- **Tests:** Only 3 unit tests. Add `vitest-skill` route tests for `control` (401/400/403/502 matrix), `url-validator` edge cases (already started — extend), `session` expiry/tamper, `rate-limit` window; `testing-patterns` factories for Deye mocks; `brooks-test` to kill mock-abuse; `k6-load-testing` for polling thundering-herd regression; `cypress-skill` smoke for login → control-dispatch → audit-log.
- **Docs:** README now honest about sandbox mode — extend with middleware/RBAC matrix + `env.ts` table + honest-data contract (`isLive`/`isModelSimulated` semantics); reconcile `DATABASE_SCHEMA_RELATIONS.md` (which tables are actually read/written vs aspirational) and `DESCRIPTIONS.md` (`polarPhasor` gap noted in old report).
- **Skills:** `testing: vitest-skill`, `testing-patterns`, `tdd-workflow`, `brooks-test`, `k6-load-testing`, `cypress-skill`; `backend: api-documenter`/`openapi-spec-generator`; `architecture: docs-architect` (if full manual needed).

---

## 7. Suggested sequencing (skill-ordered)

1. **Commit + rotate + purge** (`security: cred-omega/secrets-management`) — hours, unblocks everything.
2. **Fail-fast env + HTTPS Directus + cookie flags + matcher/tenant closure + Upstash limits** (`security/auth-implementation-patterns`, `backend/upstash-ratelimit`) — days.
3. **Lint + secret-scan + dep-audit in CI; atomic persistence; `allSettled`; zod boundaries** (`devops/github-actions-advanced`, `backend/nodejs-backend-patterns`) — days.
4. **Mock-audit + RSC/polling/charts + a11y + decomposition + test expansion + docs reconciliation** (`testing/mock-hunter`, `frontend/nextjs-best-practices`, `architecture/brooks-audit`) — week.
5. **Operationalize:** midnight yield cron, Directus backup/restore drill, OpenTelemetry traces on `fetchWithAuth`, Lighthouse CI budgets, ADR log (`devops/cron-doctor`, `database-backups`, `observability-and-instrumentation`, `frontend-lighthouse`, `architecture/architecture-decision-records`).

**Positives to preserve:** HMAC-SHA256 session design, scrypt + timing-safe verify, SSRF allowlist + `redirect:'error'` + timeouts, token lock + 401 retry, honest `isLive/isModelSimulated` contract, zod `env.ts`, CI with typecheck+test+format+build, route-boundary files. Don't regress these while decomposing monoliths.

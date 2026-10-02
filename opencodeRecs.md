# DSM — Repository Analysis & Recommendations

**Project:** Deye Solar Monitoring (DSM) — Next.js 16 solar operations dashboard
**Path:** `C:\Users\admin\Documents\Work Men2\Iot\Iot System\Deye Solar Monitoring\DSM`
**Date:** 2026-10-02
**Scope:** Full repository — security, data/API layer, Next.js 16 architecture, frontend/perf, code quality & tooling.
**Method:** Parallel code review (5 explore passes) with `file:line` evidence, cross-checked against the prior report. Typecheck (`npm run typecheck`) passes clean. No code was changed.

Stack: Next.js 16.2.1 (App Router) · React 19.2.3 · Tailwind v4 · TypeScript strict (with `allowJs` + `skipLibCheck`). 44 src files, 7 pages, 11 API routes.

---

## 🔴 P0 — Do before anything else

### 1. Leaked production credentials are committed to git
`.env.local.example` **is tracked**, and its HEAD blob contains real secrets:
- `DEYE_APP_SECRET=6286d7d6…`, `DEYE_EMAIL=lopezidan808@gmail.com`, `DEYE_PASSWORD=locklock89`
- `ADMIN_ACCESS_PIN=8888`, `DEYE_APP_ID=202609154831014`
- `.env.local:2-3` has a real Directus token `AAKv73dkIV8DfAIA5vEt3eXVdIebzmBW` (and `opencodeRecs.md:79-83` duplicates secrets in an untracked file).

Also tracked: `org/jkiss/dbeaver/model/impl/app/LocalSecretController.class`. `.gitignore:15` pattern `.env*.local` does **not** match `.env.local.example`, which is why it slipped in. `gh` isn't installed so repo visibility is unknown — **assume compromised**.

**Actions:** rotate Deye AppSecret/password, `ADMIN_ACCESS_PIN`, and the Directus token; purge from history (`git filter-repo`/BFG); rename to `.env.example` with placeholders; broaden `.gitignore` to `.env*` (allowlisting `.example`); delete the `.class` file. Blast radius is full DeyeCloud account access + physical inverter control.

### 2. Inverter control is completely unauthenticated
`src/app/api/deye/control/route.ts:4-21` — no session or role check; any caller can set work mode. It also returns **HTTP 200 even on failure** (`:40-44`) and only truthy-checks `mode`, no enum validation (`:9`). Fix: enforce server-side auth, validate the enum, and return proper status codes.

### 3. Authorization exists only in the browser
`src/lib/role-context.tsx:44-72` stores role in `localStorage` (`dsm_user_role`); `api-diagnostics/page.tsx:420` merely hides the button. There is **no `middleware.ts` anywhere**. Every API route is effectively open. Fix: server sessions + middleware enforcement; treat client role as UI-only.

### 4. SSRF via attacker-controlled `baseUrl`
`POST /api/deye/accounts` (`accounts/route.ts:23-36`) → `account-manager.ts:562` stores `baseUrl` unvalidated → `deye-client.ts:41-45` accepts any http(s) and `:96-99` makes a server-side POST to `${baseUrl}/v1.0/account/token`. Reachable: internal hosts (`http://goatedcodoer:8056`), cloud metadata (`169.254.169.254`), and redirects are followed. Fix: allowlist hosts, reject private/link-local ranges, block redirects, and require auth on account creation.

---

## 🟠 P1 — Security hardening & correctness

- **Unauthenticated account CRUD + sync**: `accounts/route.ts:23-89`, `accounts/sync/route.ts:4-17`.
- **IDOR / no tenant isolation**: `telemetry/route.ts:7-10`, `station/route.ts:7-10`, `plants/route.ts:7-19` take arbitrary `accountId`; worse, `account-manager.ts:493-503` silently falls back to the **first** client on unknown id (cross-tenant leak).
- **Plaintext passwords**: `auth/role/route.ts:28` (`===` compare) and `:90` legacy plaintext; `account-manager.ts:626/689` store plaintext `password_hash`. No bcrypt, no rate limiting. Switch to argon2/bcrypt + rate limiting.
- **Directus over plaintext HTTP** with a static bearer token (`account-manager.ts:48` defaults to `http://goatedcodoer:8056`). Move to HTTPS, rotate token.
- **Privilege escalation via mass-assignment**: `account-manager.ts:707-711` spreads arbitrary updates (incl. `admin`/`enabled`) from `accounts/route.ts:45-67`. Explicitly allowlist fields.
- **`0.0.0.0` binding** (`package.json:6,8`) exposes the unauthenticated API on the LAN.
- **Dead security control**: `ADMIN_ACCESS_PIN=8888` is referenced nowhere in `src/` — remove or wire it up; don't imply protection that doesn't exist.
- **`allowedDevOrigins` wildcards** in `next.config.ts:5` (`192.168.1.*`, `*.local`, `*.lan`, `100.74.111.35`).
- **No CSRF/origin checks** on state-changing routes (`control`, `accounts`).
- **Errors leak internals** via `details: String(error)`; malformed `req.json()` yields 500 instead of 400.

---

## 🟠 P1 — Data/API layer reliability

- **Token lifecycle broken**: no concurrency lock (`deye-client.ts:85-134`) so parallel cold-cache callers each mint a token; no 401 invalidate/retry (`:112-115`, `:333-359`, `:503-516`); token only in memory (`types.ts:258-259` fields unused); `account-manager.ts:485-487` recreates a client per account on every load/save, wiping tokens+caches.
- **No HTTP timeouts/retries** on all 7 Deye fetches (`deye-client.ts:99,147,187,295,304,493,668`); `getBatchDeviceLatest:491-522` uses one `Promise.all`, so one bad chunk discards all good data (use `allSettled`).
- **Silent mock fallbacks presented as real**: `/history` is always mock (`history/route.ts:9-10`); `setWorkMode` with no token returns `success:true '[Simulated Mode]'` (`deye-client.ts:658-664`); `getHealth` fabricates OPTIMAL/14 ms/842 (`:728`), and `getSimulatedPlants` returns `[]` (`:260`). `getStationList` returns `isLive:true` on failure (`:157-169`).
- **Untyped boundaries**: `any` at `deye-client.ts:117-120,158,198,202-204`; `<T=any>` in `account-manager.ts:73,106,129,193`.
- **Directus `directusStatus` race** (`account-manager.ts:88-98`) can report false-healthy; audit log `user_id` is never written (`control/route.ts:25-35`, `account-manager.ts:179`) → anonymous audit trail.
- `process.cwd()` for data path (`account-manager.ts:44`) and non-atomic `fs.writeFileSync` (`:417-430`) are unsafe serverless/under concurrency.

---

## 🟠 P1 — All pages are client components

All 7 pages begin with `'use client'` — zero async Server Components, so no server data fetching. There is **no `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, or `middleware.ts`**. Auth guarding is a `useEffect` redirect in `app-shell.tsx:17-25`, and the root layout wraps `/login` in four client providers (`layout.tsx:33-41`). Move data fetching server-side, add route boundaries, and gate at middleware.

---

## 🟡 P2 — Frontend, performance, honesty of displayed data

- **Re-render storm**: `account-context.tsx:176` provider value unmemoized; `:132` `selectedAccount` is a new object each render and feeds `fetchTelemetry` deps; `:145` handlers not `useCallback`. Same in `role-context.tsx:110-126` and `sidebar-context.tsx:30-38`. Memoize providers/handlers.
- **Polling churn**: `page.tsx:190` restarts the 3.5 s interval whenever the unstable account identity changes (`:186`); no in-flight guard (the hardware page has one at `:46/:75-109`); polling continues in background tabs (`page.tsx:190`, `hardware-telemetry:105`, `TrigonometricHistoryGraph:189`). Pause on `visibilitychange` and stabilize deps.
- **Fabricated telemetry**: `TrigonometricHistoryGraph.tsx:186-256` overwrites real API data with `Math.random()` jitter every 3 s and flags `isElapsed:true`. This is the most serious *trust* problem after security — the UI shows invented numbers as measurements.
- **Hardcoded values shown as live** across `page.tsx`, `hardware-telemetry`, `yield-arbitrage` ($184.20, 94.8%, 14.8 tons…), `api-diagnostics` (always "HTTP 200 OK" even on error), and `header.tsx` (fixed ping 14, permanent green dot). Remove or clearly label as demo.
- **Recharts animation** on 288-point series re-rendered every 3 s (`TrigonometricHistoryGraph.tsx:828,840,852,911,966,1017`) — disable `isAnimationActive`.
- **A11y blockers**: clickable `<div>`s with no `role`/`tabIndex`/key handler (`header.tsx:281,330`); password toggle `tabIndex={-1}` with no `aria-label` (`login/page.tsx:198`); unassociated labels (`login:155,179`, `accounts:832+`, `TrigonometricHistoryGraph:1453/1468/1483`); hand-rolled dropdown/modal missing `aria-expanded`/`role=dialog`/focus-trap (`header.tsx:161,563`); color-only status; sidebar drawer doesn't inert background (`sidebar.tsx:80`). Good pattern to copy: `accounts/page.tsx:693-701`.
- **Missing states**: `loading` declared but never rendered (`page.tsx:58`, `hardware-telemetry:43`, `trigonometric-analytics:38`); fetch failures only `console.error`; uncleared `setTimeout` (`account-context.tsx:73`, `accounts/page.tsx:132/162/228`); 1 s clock re-renders the 665-line `Header` (`header.tsx:107`).

---

## 🟡 P2 — Code quality, tooling, docs

- **No quality gates at all**: no ESLint/Prettier, no lint/format/test scripts (`package.json:5-10`), no CI, no tests/framework, no husky/lint-staged, no `.editorconfig`. Adding these is the highest-leverage structural fix.
- **No env validation**: raw `process.env` reads (`deye-client.ts:43-51`, `account-manager.ts:48-61`); `DIRECTUS_COLLECTION` is read but missing from `.env.local.example`.
- **Type hygiene**: 18 `any`s across 11 files; unsafe `as UserRole` (`role-context.tsx:44`); non-null assertion (`account-manager.ts:496`); empty catch (`role-context.tsx:71`); swallowed errors (`hardware-telemetry.tsx:93-95`, `auth/role:46-48`). No `@ts-ignore` — good.
- **Dead code/deps**: unused `@radix-ui/react-dialog` (`package.json:12`) and `@radix-ui/react-tooltip` (`:16`); dead `COLLECTIONS.ALARMS/TARIFFS/DAILY_YIELDS/TELEMETRY` (`account-manager.ts:26-29`); unused types (`types.ts:222,327,340`); `ui/chart.tsx` `ChartContainer`/`ChartTooltipContent` never imported; orphan `energy-flow/page.tsx` (duplicate of `/`).
- **Duplication/monoliths**: banner scaffolding, KPI grids, and tables copy-pasted across 4-6 pages; accounts state double-sourced (`account-context.tsx:52-121` vs `accounts/page.tsx:114-143,327-344`); `accounts/page.tsx` (1093), `TrigonometricHistoryGraph.tsx` (1526 max), `page.tsx` (824), `header.tsx` (665) are hard to maintain. Overlapping `/station` vs `/stations`, `/plants`; duplicate summary methods (`account-manager.ts:267` vs `:373`).
- **Docs drift**: README documents 4 of 7 pages and calls data "Live" though history is always mock; `DATABASE_SCHEMA_RELATIONS.md` documents ALARMS/TARIFFS/DAILY_YIELDS/TELEMETRY/ORGANIZATIONS that the code never uses; `DESCRIPTIONS.md` missing `polarPhasor`.

---

## Suggested sequencing

1. **Rotate + purge secrets, rename env example, delete `.class`** (hours; highest impact).
2. **Server auth**: middleware + sessions, enforce on `control`/`accounts`, validate inputs, fix SSRF allowlist, bcrypt, field allowlist.
3. **Data-layer correctness**: token lock/invalidation, timeouts+`allSettled`, remove mock-as-real fallbacks, explicit error propagation.
4. **Tooling baseline**: ESLint + Prettier + `.editorconfig`, Vitest (start with `trigonometric-math.ts`), GitHub Actions CI (`typecheck`+`lint`+`test`+`build`), zod `src/lib/env.ts`, husky/lint-staged.
5. **RSC + perf + a11y + de-duplication/honesty cleanup.**

**Positives:** typecheck is clean, route handlers are correctly async and typed, the accounts page has a real empty state with one correct accessible pattern, and README does disclose sandbox mode when creds are absent.

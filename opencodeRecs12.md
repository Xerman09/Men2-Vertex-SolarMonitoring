# opencodeRecs12 — DSM Skills-Based Analysis v12 (2026-10-05)

## 0. Method and verdict

**Scope:** full `src/` working tree vs v11 claims. Skills lens: threat-modeling
(STRIDE worksheet + risk matrix), auth-implementation-patterns (JWT-valid ≠
ownership), hunt-idor (Gate-0 object check), hunt-ssrf (OOB gate), api-security
(10-phase), nextjs-best-practices, testing-patterns (factories), ADR lifecycle.

**Evidence basis:** direct reads/greps this pass (route inventory, control
:28–158, session :54–192, enforce call-sites, accounts :14–86, aggregate
:25–44, history :4–21, role :120, rate-limit :26, lib listing, git
diff/status/log) + fresh `npx vitest run` (6 files, 52/52 pass, 1.18 s).

**Verdict: NO behavior change on any open security item vs v11. Small
reliability-only delta in the tree (configurable Deye timeout + stale-cache
guard). But this pass REFUTES four v11 transcript claims against code —
those items are still OPEN, not closed.** Details in §3.

## 1. Churn vs v11 (git-verified)

HEAD `2bdf6fd opencodeRecs 10`. Tracked recs: `opencodeRecs.md, 3–11`
(`11` tracked; log messages lag filenames — cosmetic only). `slopRecs.md`
untracked. Working tree delta:

| File | Diff | Assessment |
|---|---|---|
| `src/lib/deye-client.ts` | +73/−15 | Timeout 8 s → `env.DEYE_API_TIMEOUT_MS` (default 15 s); typed `catch (err: unknown)` with TimeoutError/code-23 branch; stale-cache guard: only overwrite `cachedStationSummary` when `res.isLive \|\| !cached \|\| age ≥ 60 s` |
| `src/lib/env.ts` | +1 | `DEYE_API_TIMEOUT_MS: z.coerce.number().int().min(3000).max(60000).default(15000)` |
| `.env.example` | +2 | Documents the new timeout var (content not re-read; assumed doc-only) |
| `docs/adr/0010-*.md` | 1-line | Typo-level fix (per v11) |
| `slopRecs.md` | untracked, NEW (v11.5 arc) | Anti-slop audit; score 53/100; its 9 fixes NOT in tree (see §3.1) |

Net: reliability hardening only. No auth/tenant/SSRF/cookie/limit change.

## 2. Confirmed-closed (re-verified with line evidence)

| # | Control | Evidence |
|---|---|---|
| C1 | Control-route tenant isolation | `control/route.ts:28` zod `accountId`; `:84–99` inline consumer check (`session.accountId !== accountId` → reject; consumer forced to `targetAccountId = session.accountId`); `:103` `getClient(targetAccountId)`; `:56` 429 + `Retry-After: 60` |
| C2 | Session TTL + expiry 401 | `session.ts:54` `DEFAULT_SESSION_TTL_SECONDS = 12*3600`; `:62–64` `exp` claim; `:139,192` 401s; no auto-refresh path found |
| C3 | enforceTenantAccess wired (5 routes) | `health:14`, `station:15`, `telemetry:15`, `stations:70`, `plants:67` |
| C4 | X5 Directus filter interpolation FIXED | `auth/role/route.ts:120` now `encodeURIComponent(String(matchedUser.id))` |
| C5 | History route gated (v11 "open" STALE) | `history/route.ts:4` imports `verifySessionToken, requireAuthenticatedSession`; `:21` verifies token — session gate present |
| C6 | Accounts GET session-verified (v11 "public" STALE) | `accounts/route.ts:14–23` `requireAdminSession` (401 non-admin) for mutations; `:59` GET verifies session; `:86` admin+viewer get registered accounts |
| C7 | Aggregate session-verified + consumer-scoped | `aggregate/route.ts:25` verifies; `:38–44` consumer forced to `[session.accountId]` (viewer full-fleet = by-design, ADR-08) |
| C8 | Suite green | `npx vitest run`: 6 files / 52 tests pass. Files: auth-crypto, control-and-tenant-matrix, rate-limit, session, trigonometric-math, url-validator |
| C9 | Deye timeout/cache robustness (NEW delta) | `deye-client.ts` diff: env-keyed timeout, TimeoutError branch, 60 s stale-cache guard — kills the "cold cache returns dead data" shape |

## 3. Corrections: v11 transcript claims REFUTED by code

These were reported as landed/closed. Greps this pass find no trace.
**Status reverts to OPEN.**

### 3.1 SLOP-014 fixes — NOT in tree (all 9 open)

`Get-ChildItem src/lib` (14 modules + `__tests__`): **no `logger.ts`**.
Repo-wide grep for `requireAdminPin|requireSessionAccountId|
requireAccountIdOrAdmin|deyeError|lib/logger`: **zero hits** in `src/lib`
and `src/app/api`. Consequences:

- SLOP-01 (console.* → logger): open — `console.warn/error` still in
  `deye-client.ts` diff lines themselves.
- SLOP-02 (deyeError taxonomy): open.
- SLOP-03/04 (PIN/session-helper extraction): open — control still uses
  inline check (C1), accounts still uses local `requireAdminSession`.
- SLOP-05 (history date-range zod schema): open — **no zod import in
  `history/route.ts`** (pattern `zod|z\.` matches nothing there).
- SLOP-06..09 (UI strings, magic numbers, duplication): open, unassessed
  this pass beyond prior notes (`SIMULATED` badges at
  `accounts/page.tsx:552,560` are domain status values, likely legitimate;
  `trigonometric-analytics/page.tsx:42` still documents simulated fallback).

Recommendation: either schedule SLOP batch as tech-debt sprint or formally
downgrade to P2 with rationale — but stop reporting it closed.

### 3.2 X2.5 "env-keyed SSRF gates" — NOT in tree

`env.ts` diff is exactly one line (`DEYE_API_TIMEOUT_MS`). No
`ALLOWLIST_HOSTS` / `DENY_PRIVATE_IP` / allowlist-env wiring found.
SSRF posture is unchanged from v10: Deye allowlist + `redirect:error` +
timeouts (code not re-read this pass, no churn since).

### 3.3 "Directus https upgrade" — NOT in tree

No Directus URL change in any diff. `DIRECTUS_BASE_URL` default remains
`http://localhost:8056` (dev-loopback; low risk, but prod override still
unenforced at code level — env `superRefine` HTTPS rule per v11, not
re-verified).

### 3.4 "Upstash/Redis rate limiting" — NOT in tree

`rate-limit.ts:26` "Basic in-memory rate limiter"; grep
`upstash|redis|Redis` in that file: **zero hits**. Multi-instance
bypass (T-D1 family) remains open; in-memory is single-instance only.

## 4. Updated STRIDE residual table

Scale: impact (1–5) × likelihood (1–5); score = product. Only deltas
re-scored; unchanged items carry v11 scores.

| ID | Threat | Status vs v11 | Score |
|---|---|---|---|
| T-I1 | Cross-tenant read via unenforced route | History + accounts-GET now gated (C5, C6) → likelihood 3→2 | **12→8 (Med)** |
| T-I2 | Unencoded Directus collection/id segments (X3/X4) | Unchanged, no churn | LOW-hardening (per v11) |
| T-S1 | Control-command spoofing (no CSRF/session anomaly) | Unchanged | 15 (per v11) |
| T-T1 | Session theft (cookie flags/TTL) | TTL 12 h re-verified; flags per v11 | 15 (per v11) |
| T-E1 | Privilege escalation via role-context `setRoleDirectly` | Unchanged per v11 (removal verified then) | 15 → monitor |
| T-D1 | Rate-limit bypass (multi-instance; in-memory only, §3.4) | WORSE than reported — no Upstash | **open, High** |
| T-R1 | Weak dev defaults in repo (`ADMIN_PIN 8888`, http Directus) | Unchanged | Med (per v11) |
| T-H1 | Secrets in git history (rotation/purge) | Unchanged — still the #1 hygiene item | High (process) |
| T-N1 (new) | Stale-cache serves dead telemetry | CLOSED by stale-cache guard (§1) | — |
| T-N2 (new) | Phantom-closed findings (v11 transcript drift) | PROCESS gap: claims without code evidence | Med — fixed by this report's §3 method (grep before close) |

No new Spoofing/Tampering surfaces introduced by the timeout/cache delta
(config value is numeric-coerced, min/max-bounded; cache guard is
read-path only).

## 5. Fix lists (only still-open items)

### P0 (ship-blockers)
1. **T-H1**: rotate any credential ever committed; purge history
   (`git-filter-repo`) or formally accept + rotate. Unchanged.
2. **T-D1**: Redis/Upstash-backed limiter or documented single-instance
   constraint + sticky-session guarantee. (Upstash claim retracted, §3.4.)

### P1
3. SLOP-03/04/05 security-adjacent subset: history date-range zod schema;
   extract `requireAdminSession`-style helpers to one module (kills the
   drift that produced §3.1's phantom-close).
4. Prod env enforcement re-verification (HTTPS Directus, SECRET ≥ 32,
   non-weak PIN) — claimed in v11 via `superRefine`, not re-read; one grep
   to confirm.
5. Accounts-GET boundary decision: currently any authenticated session can
   enumerate registered accounts (`:59–86`). If viewer-enumeration is
   intended, record in ADR-08; if not, restrict to admin.

### P2 (tech debt)
6. SLOP-01/02/06–09 (logger, error taxonomy, magic numbers, duplication).
7. `.env.example` +2 lines: confirm timeout documented with sane guidance.
8. Recs-file log hygiene: squash/commit `opencodeRecs11/12 + slopRecs.md`;
   adopt `<short-sha> <scope>: <what>` message convention (current
   `opencodeRecs N` messages collide on search).

## 6. Sprint roadmap (next 3 moves)

1. **Close-process first (½ day):** adopt "grep-before-close" rule (T-N2):
   every future recs file must cite `file:line` for each claimed closure.
   Commit pending recs files with proper messages (§5.8).
2. **P0 sweep (1–2 days):** T-H1 rotation decision + T-D1 limiter backend.
3. **P1 correctness (1 day):** history zod schema + helper extraction +
   accounts-GET ADR-08 amendment + env `superRefine` re-grep.

## 7. ADR trace

- ADR-08 (fleet-visibility: consumer-scoped vs viewer-full-fleet): evidenced
  live at `aggregate/route.ts:38–44`. Needs §5.5 amendment for accounts-GET.
- ADR-09/10: no churn except ADR-0010 one-line fix (§1).
- Proposed **ADR-11**: Deye timeout/cache policy (15 s default via
  `DEYE_API_TIMEOUT_MS`, TimeoutError taxonomy, 60 s stale-while-revalidate
  guard) — decision is already in code; ADR just records rationale
  (upstream cloud latency) and bounds (3–60 s).

## 8. Skills traceability

- threat-modeling (STRIDE worksheet/matrix): §4 re-score, T-N1/T-N2 added.
- auth-implementation-patterns (explicit resource-access boundaries): C1,
  C5–C7 verified; §5.5 boundary question raised.
- hunt-idor (Gate-0: ownership check on every object ref): control :93,
  aggregate :38–44, accounts :14–23 pass; history/accounts-GET upgraded to
  gated since v11.
- hunt-ssrf (OOB gate): no churn; X5 closure verified at role :120;
  X2.5/X-https claims retracted (§3.2/3.3) — validator file not re-read,
  no statement made beyond "unchanged".
- api-security (10-phase: inventory→auth→input→limits): 12-route inventory
  re-listed; input validation gap localized to history (no zod); limits gap
  localized to in-memory backend (§3.4).
- testing-patterns: 52/52 green with file-level inventory (§2.C8).
- architecture (ADR lifecycle): §7; ADR-11 proposed for the one real delta.
- code-quality (vibe-code-auditor honesty rule): §3 exists because claims
  were tested against code, not transcript.

---
*Generated 2026-10-05 from working tree + fresh test run. Every closure cites
a `file:line`; every retraction cites the grep that found nothing.*

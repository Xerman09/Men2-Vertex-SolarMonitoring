# Slop Audit Report — DSM v2 (2026-10-07)

### Audit Report

**Input:** `src/` working tree (54 files, 11,862 lines, TypeScript/TSX, Next.js 16 App Router + Deye/Directus backends)
**Assumptions:** Production web service, moderate scale; prior reports slopRecs.md (53/100) and opencodeRecs12 exist — this is a delta audit, scored independently.
**Quick Stats:** 54 files, 11,862 lines (excl. `__tests__`), TS/TSX. Suite: 7 files, 64/64 pass (was 6/52). Zero TODO/FIXME/@ts-ignore in `src/`.

#### Executive Summary (Read This First)

```
- [HIGH] Logger built but never wired: src/lib/logger.ts (createLogger + logger export) has ZERO consumers; ~60 console.* calls remain live across 11 files.
- [HIGH] Two auth systems now coexist: withGate/requireAdminSession (lib/gate.ts) adopted by 5 routes while control/telemetry/health/station/role/session/sync keep inline checks — plus the same 7-line JSON-400 block pasted in 5 routes instead of living in gate.ts.
- [MEDIUM] Pervasive any: 15+ sites (sync route body:any, login/account-manager catch err:any, deye-client any[]/(st:any)/(d:any), recharts (x:any) handlers) — including inside NEW shared code (withGate<TArgs extends any[]>).
- [MEDIUM] God files unchanged: TrigonometricHistoryGraph 1505, account-manager 1160, accounts page 1070 lines.
- Overall: Deployable for low-stakes/internal use with monitoring — the gate.ts extraction is real progress, but the job is half-done (dead logger, split patterns).
```

#### Critical Issues (Must Fix Before Production)

None identified. Every bare `catch {}` resolves to an explicit 400 (`control:69`, `role:50`, `sync:21`, `accounts:85,134`) or a deliberate commented non-fatal fallback (`role:125`). No hardcoded success returns, no mock fixtures in prod paths, no `as any`/`@ts-ignore` in `src/`.

#### High-Risk Issues

```
[HIGH] Dead-on-arrival logger
Location: src/lib/logger.ts:35,68 (defined) — zero imports anywhere in src/
Dimension: Dead code (6) + Production Risks (4)
Problem: createLogger/logger exist but no route, lib, or component imports them; ~60 console.* calls (route.ts 18, account-manager 16, page.tsx 13, deye-client 11) still write unstructured logs with no correlation IDs.
Fix: Either wire logger into the 4 highest-volume files (route.ts, account-manager, deye-client, page.tsx) or delete logger.ts. A second logging abstraction that nobody calls is worse than none — it lets the next author believe logging is handled.
Code Fix:
```ts
// accounts/route.ts (example — repeat per file)
import { createLogger } from '@/lib/logger';
const log = createLogger('accounts');
// console.error('[Accounts] ...', err) → log.error('...', { err })
```
```

```
[HIGH] Split auth pattern + pasted boilerplate
Location: src/lib/gate.ts (withGate, requireAdminSession) vs inline checks in control/telemetry/health/station/role/session/sync routes; JSON-400 block duplicated in control:69, role:50, sync:21, accounts:85,134
Dimension: Consistency (2) + Architecture (1)
Problem: gate.ts fixed the drift for 5 routes, but 7 routes still hand-roll session/401/429 logic, and even the migrated routes paste the identical try/req.json/catch→400 block instead of importing it. Per DRY rule 11 this is duplicated knowledge (one rule, five expressions) — the next 429-policy change must touch gate.ts:71,98 + role:43 + control:61 independently.
Fix: Add parseJsonBody(req) (returns {ok, data|errorResponse}) and standard429() to gate.ts; migrate the 7 remaining routes to withGate/requireAdminSession. Minimum: extract the JSON-400 helper first (S effort, kills 5 copies).
```

#### Maintainability Problems

```
[MEDIUM] Pervasive any (15+ sites, incl. new shared code)
Location: sync/route.ts:18 (body:any); login/page.tsx:47, account-manager.ts:99 (catch err:any); account-manager.ts:207 Promise<any[]>; deye-client.ts:236,274,276 (any[], st:any, d:any); graph:59,85,553 + chart.tsx:67,80 ((x:any) handlers); gate.ts:84 <TArgs extends any[]>
Dimension: Technical Debt (7)
Problem: `any` at trust boundaries (sync body, catch handlers) disables the exact checking that would catch malformed Deye/Directus payloads; `any` inside NEW gate.ts bakes the debt into the shared layer every route will inherit.
Fix: Type sync body as unknown + narrow (pattern already proven: accounts:85 rawBody: unknown); type catch as unknown with instanceof narrowing (pattern already proven: deye-client typed catches); replace withGate's any[] default with unknown[]; type recharts handlers from recharts' own TooltipProps.
```

```
[MEDIUM] God files (>750 lines, unchanged since v1)
Location: TrigonometricHistoryGraph.tsx 1505; account-manager.ts 1160; accounts/page.tsx 1070; page.tsx 792; deye-client.ts 777
Dimension: Architecture (1)
Problem: Three files exceed 1000 lines with multiple responsibilities (graph: tooltip/tab/data-transform; account-manager: Directus CRUD + Deye fan-out + caching; accounts page: 6+ catch sites + CRUD UI). Account-manager grew (was 1156) — wrong direction.
Fix: Extract in this order (each M effort): account-manager Directus layer → directus-store.ts; graph custom tooltip + tab panels → separate components; accounts page data hooks → useAccounts(). No behavior change (refactor discipline, rule 24).
```

```
[MEDIUM] Magic numbers/strings (10+ sites, 3 spellings of the same policy)
Location: 'Retry-After': '60' in gate.ts:71,98 + role:43 + control:61; 60000 in deye-client.ts:105,440,545,553,615; 3000/60000/15000 bounds in env.ts:34 (the only documented one)
Dimension: Consistency (2)
Problem: Rate-limit window and cache TTL are expressed as bare literals in 3 files; changing the 429 window means finding all 4 '60's by grep.
Fix: Export RATE_LIMIT_WINDOW_S + STALE_CACHE_MS from gate.ts / deye-client (or env) and reference them. S effort.
```

```
[MEDIUM] Dead export getClientIp
Location: src/lib/gate.ts:28 — zero call sites (all withGate/requireAdminSession users verified: accounts:34,77,126,178; aggregate:6; history:28; plants:35,119; stations:7)
Dimension: Dead code (6); violates guard rule 21 ("no someday exports")
Problem: Ships surface area with no caller; next reader must guess its intended contract (x-forwarded-for trust? gateway-only?).
Fix: Delete it; re-add with its first real caller. S effort (<15 min).
```

```
[LOW] requireAuthenticatedSession (session.ts:188) caller unverified
Location: src/lib/session.ts:188
Dimension: Dead code (6) — unconfirmed, verify
Problem: history/route.ts (its likely consumer) now uses withGate instead; if nothing imports it, it is a second dead auth helper alongside the live gate.ts pair.
Fix: One grep for importers; delete or adopt. Quick win.
```

```
[LOW] Commented non-fatal swallow (acceptable, watch)
Location: src/app/api/auth/role/route.ts:125 ("Permissions lookup non-fatal")
Dimension: Robustness (3)
Problem: None today — the comment documents intent, satisfying rule 15's "unless the contract documents it" clause. Listed only so the next audit doesn't re-flag it.
Fix: None. Optional: emit log.warn in the block so silent-fallback is observable.
```

UI-slop screen (anti-ui-slop): None identified. No purple/blue gradients, no lorem/placeholder assets, product-specific labels throughout, empty state present (accounts/page.tsx:672 "No plants discovered yet"), loading/error/not-found routes exist per v1. shadcn chart primitives reused, not reinvented. 22 'use client' + 12 intervals vs 5 cleanups noted in v1 — not re-measured, carry as watch item.

#### Production Readiness Score

```
Score: 67 / 100
```

100 − 16 (2 HIGH) − 12 (4 MEDIUM) − 5 (pervasive-any pattern) = 67. The gate.ts extraction (+1 test file, 64/64 green, uniform JSON-400 shape, zero TODOs) lifts the tree out of the 51–60 band, but the logger that nobody calls and the two-coexisting-auth-systems split keep it firmly in "low-stakes/internal with monitoring" (51–70), not "production-viable with targeted fixes" (71+).

#### Refactoring Priorities

```
1. [P1 - High] Wire-or-delete logger — addresses [HIGH #1] — effort: S — impact: single structured logging path; kills 60 unstructured console calls
2. [P2 - High] Unify routes on gate.ts + extract parseJsonBody/standard429 — addresses [HIGH #2] — effort: M — impact: one 429/400 policy, 7 inline auth blocks deleted
3. [P3 - High] Eradicate any at boundaries + in gate.ts generic — addresses [MEDIUM #1] — effort: M — impact: compiler re-engaged on Deye/Directus payloads
4. [P4 - Medium] Split account-manager/graph/accounts-page — addresses [MEDIUM #2] — effort: L — impact: files reviewable, debt stops compounding
5. [P5 - Optional] Constants for 60/60000 + delete getClientIp — addresses [MEDIUM #3, #4] — effort: S — impact: nice-to-have hygiene
```

**Quick Wins (fix in <1 hour):**
- Delete getClientIp (gate.ts:28): no callers
- Verify requireAuthenticatedSession importers, delete if orphaned
- Add log.warn to role:125 non-fatal catch for observability
- Export RATE_LIMIT_WINDOW_S from gate.ts, replace 4 literals

---
*Delta vs slopRecs.md (53/100): +14. gate.ts/logger.ts/ADR-0011/api-gate test are new since v1; SLOP-01–05 reclassified from "open" to "half-landed" (built, not wired/adopted). Evidence: greps this pass, vitest 7 files 64/64.*

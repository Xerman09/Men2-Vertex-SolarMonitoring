# SlopRecs — Anti-AI-Slop Audit of DSM (2026-10-07, v3 pass)

Skills applied: `code-quality/vibe-code-auditor` (7-dimension audit + scoring rubric),
`code-quality/clean-code-guard` (review mode — no code changed),
`frontend/anti-ui-slop` (product-specific UI check). All findings substantiated by
repo greps this pass; node_modules excluded from every scan.

### Audit Report

**Input:** DSM working tree (`src/`, 61 files, 13,705 lines, TypeScript/Next.js App Router)
**Assumptions:** Single-node LAN solar gateway, single operator; security posture tracked
separately in opencodeRecs series — this pass scores *slop/maintainability only*.
**Quick Stats:** 61 files (+3 vs v1), 13,705 LOC (+1,412 vs v1); largest:
`TrigonometricHistoryGraph.tsx` (1581), `account-manager.ts` (1291),
`accounts/page.tsx` (1134); zero `TODO/FIXME` in `src/`; zero `as any` / `@ts-ignore`
in `src/`; `any` escape hatches 9 sites (down from ~20); `console.*` 41 (down from ~60).

#### Executive Summary (Read This First)

```
- [HIGH] Gate adoption is half-done: 5 routes use withGate(), 7 still hand-roll verifySessionToken + checkRateLimit — the exact drift vector that caused the ADR-08 fan-out class.
- [HIGH] account-manager.ts keeps growing as a god object: 1156 → 1291 lines (+135), still 4 responsibilities behind one class.
- [MEDIUM] logger.ts is a dead abstraction: zero production importers (only self + one test file); 41 raw console.* calls remain live.
- [MEDIUM] God UI files all grew (+52 to +91 lines each) with zero component tests; magic `60 * 1000` ×15 + 429/Retry-After ×28 still scattered.
- Overall: Secure and working, but AI-velocity debt is reconcentrating in the same files. Score 67/100 — deployable for internal/low-stakes use with monitoring.
```

#### Critical Issues (Must Fix Before Production)

None identified. (No hardcoded secrets in `src/`, no `eval`, no SQL-string concat,
every external call has error handling with timeouts, all 12 API routes gated.)

#### High-Risk Issues

```
[HIGH] Route-gate migration half-finished: withGate adopted in 5 routes, 7 still inline
Location: src/app/api/deye/*/route.ts — withGate ×5 (accounts, aggregate, health, plants, telemetry);
  verifySessionToken inline ×7 (auth/role, auth/session, accounts/sync, control, history, station, stations);
  checkRateLimit still imported per-route (auth/role route.ts:5,39; control route.ts:6,53)
Dimension: Consistency & Maintainability
Problem: Two auth patterns now coexist. The inline half still carries per-route limit constants
  (5/10/20/30/60) and key-string formats, so the next tenant-scope fix must touch N files again —
  the same drift that forced the 5-file ADR-08 repair.
Fix: Finish the migration — route every handler through withGate({ roles, limit }) in lib/gate.ts
  and delete the inline verify+limit blocks. Effort: S.
```

```
[HIGH] DeyeAccountManager god object still growing
Location: src/lib/account-manager.ts — 1291 lines (was 1156, +135), ~16 catch blocks,
  Directus CRUD + atomic file-cache fallback + client registry + fleet aggregation + plant sync
Dimension: Architecture & Design
Problem: One class answers to four stakeholder groups (persistence, cache, registry, aggregation).
  Any Directus schema change ripples through unrelated consumers; unit-mocking is impractical
  (tests go through the real singleton). Growth since v1 proves the seam is unguarded.
Fix: Split along existing seams — DirectusTransport / FileAccountCache / ClientRegistry /
  FleetAggregator — behind the current class as a facade so call sites don't churn. Effort: M.
```

#### Maintainability Problems

```
[MEDIUM] Dead logger abstraction next to 41 live console.* calls
Location: src/lib/logger.ts (68 lines, createLogger + LogContext) — zero production importers
  (only logger.ts itself + api-gate-and-schemas.test.ts:7,130,132); console.* ×41 live,
  e.g. deye-client.ts:170,222,227,252,322,421,456,605; env.ts:103,110; account-manager.ts:904,923
Dimension: Production Risks / Consistency
Problem: The structured-logging contract exists but nobody honors it — worst of both worlds:
  a second logging pattern to maintain plus zero observability gain. clean-code-guard #21
  (strip dead code) and #23 (no speculative abstraction) both trigger.
Fix: Either adopt (codemod console.* → createLogger(scope)) or delete logger.ts. Adopt is
  correct for a gateway box — keep the module, migrate per-file. Effort: S.
```

```
[MEDIUM] God UI components/pages keep absorbing logic
Location: TrigonometricHistoryGraph.tsx (1581, +76), accounts/page.tsx (1134, +64),
  app/page.tsx (844, +52), deye-client.ts-adjacent header.tsx (703, +35)
Dimension: Architecture / Technical Debt
Problem: Chart/data-fetch/tooltip/orchestration in single files; pages own data orchestration +
  rendering; zero component tests. Change blast radius is the whole page; every pass adds
  50–90 lines to the same files (clean-code-guard #2: functions/pages doing more than one thing).
Fix: Extract data hooks (useStationTelemetry, useFleetAggregate) + presentational components;
  leave pages as composition. Graph first — highest churn surface. Effort: M.
```

```
[MEDIUM] withGate<any[]> generic + 9 residual any escape hatches
Location: src/lib/gate.ts:84 (`withGate<TArgs extends any[] = any[]>`); deye-client.ts:236,274,276
  (`Promise<...any[]>`, `(st: any)`, `(d: any)`); account-manager.ts:99,207 (`err: any`, `Promise<any[]>`);
  page.tsx:105,501 (`(ps: any)`, `(v: any)`)
Dimension: Technical Debt Hotspots (missing type hints on complex functions)
Problem: The gate wrapper itself blesses `any`, so every adopted route inherits an untyped
  handler signature; Deye/plant mappers still trust external payloads post-validation.
  Down from ~20 sites (progress), but the remaining 9 sit on trust boundaries.
Fix: Type withGate args as `unknown[]` + concrete handler context; replace mapper `any` with
  zod-inferred Deye payload types already present in lib. Effort: S.
```

```
[MEDIUM] Magic time/rate literals scattered despite RATE_LIMIT_CONFIGS
Location: `60 * 1000` ×15; 429/Retry-After hits ×28 total; setInterval/setTimeout ×9;
  'use client' ×16 (expected for App Router, noted for scale)
Dimension: Consistency & Maintainability
Problem: Central configs exist (RATE_LIMIT_CONFIGS) but routes still inline `10, 60 * 1000`
  (auth/role route.ts:39) and per-route Retry-After strings. Next limit-policy change is a
  find-and-replace across 12 files instead of one config edit.
Fix: Route every limit through RATE_LIMIT_CONFIGS + a shared rateLimitKey() helper; extract
  POLL_MS constants for the ×9 timers. Effort: S.
```

```
[LOW] UI slop check — PASS with one watch item
Location: gradients ×5 — page.tsx:55 (background wash), page.tsx:65 (amber logo tile),
  TrigonometricHistoryGraph.tsx:1072,1099 (emerald/yellow progress bars),
  header.tsx:130 (emerald→cyan→amber pulse bar)
Dimension: Frontend (anti-ui-slop)
Problem: None blocking — palette is product-consistent (amber/emerald/cyan/yellow energy
  theme, no purple/blue generic-AI gradient). Watch: header pulse bar + logo tile are
  decorative motion without a reduced-motion guard.
Fix: Add prefers-reduced-motion guard for header.tsx:130 animation. Effort: S (<1 hr).
```

```
[LOW] Interval hygiene unverified
Location: setInterval/setTimeout ×9 across pages/components
Dimension: Robustness
Problem: No leak confirmed this pass, but prior passes noted cleanups < intervals.
  Polling pages (telemetry/hardware) must clear timers on unmount or tab-hide.
Fix: Single usePolling() hook with cleanup + visibility-pause. Effort: S.
```

#### Production Readiness Score

```
Score: 67 / 100
```

Same numeric score as v2 with a different composition: `any` sites halved (20→9),
`console.*` down a third (60→41), and gate centralization landed in 5 routes — offset by
+1,412 lines reconcentrated in the same six god files and a still-dead logger. Bounded,
known risks; deployable for low-stakes/internal use with monitoring, not yet tight
enough to call production-clean.

#### Refactoring Priorities

```
1. [P1 - Blocker] Finish withGate migration — addresses [HIGH #1] — effort: S — impact: eliminates the auth-drift class that caused ADR-08
2. [P2 - Blocker] Split DeyeAccountManager facade — addresses [HIGH #2] — effort: M — impact: schema changes stop rippling through registry/aggregation
3. [P3 - High] Adopt-or-delete logger — addresses [MEDIUM #1] — effort: S — impact: real observability or 68 fewer dead lines
4. [P4 - Medium] Extract graph/page data hooks — addresses [MEDIUM #2] — effort: M — impact: shrinks the 1581-line blast radius
5. [P5 - Medium] Centralize limits/timers + type the anys — addresses [MEDIUM #3, #4] — effort: S — impact: one-config policy changes, typed boundaries
```

**Quick Wins (fix in <1 hour):**
```
- Delete-or-adopt logger.ts: grep shows zero prod importers — decide today
- gate.ts:84: any[] → unknown[] + typed GateContext handler
- header.tsx:130: prefers-reduced-motion guard on pulse bar
- Extract POLL_MS + rateLimitKey() helper, replace 60*1000 ×15
- account-manager.ts:904,923 console.log → logger or delete
```

#### Recommendations (Do These Next)

Concrete, ordered, copy-paste-ready. Each maps to a finding above; no re-architecture
required for R1–R3,R5–R7 (R4 is the one M-effort split — sequenced last on purpose).

```
R1. Finish the withGate migration (addresses HIGH #1) — effort: S
    Action: in each of the 7 inline routes (auth/role, auth/session, accounts/sync,
    control, history, station, stations) replace the verifySessionToken + checkRateLimit
    preamble with withGate({ roles, rateLimit }) and delete the local 401/429 blocks.
    Before (per-route, repeated ×7):
      const session = await verifySessionToken(token);
      if (!session) return NextResponse.json({ error: '...' }, { status: 401 });
      const rate = checkRateLimit(key, 10, 60 * 1000);
    After (one pattern everywhere):
      export const GET = withGate({ roles: ['admin','consumer'], rateLimit: { keyPrefix: 'deye_history', maxRequests: 30 } }, async (req, { session }) => { ... });
    Impact: kills the auth-drift class; next tenant fix touches gate.ts only.
```

```
R2. Adopt the logger, then enforce it (addresses MEDIUM #1) — effort: S
    Action: codemod per file — `import { createLogger } from '@/lib/logger';
    const log = createLogger('deye-client');` then console.* → log.*.
    Before: console.warn('[deye] retry', err);
    After:  log.warn('deye retry', { route: 'station' }, err);
    Then add a lint rule (no-console in src/, allow in logger.ts + tests).
    Alternative if rejected: delete src/lib/logger.ts + its test imports.
    Impact: real gateway observability; removes dead-abstraction slop.
```

```
R3. Type the gate + trust-boundary mappers (addresses MEDIUM #3) — effort: S
    Action: gate.ts:84 `withGate<TArgs extends any[] = any[]>` →
    `withGate<TArgs extends unknown[] = unknown[]>`;
    deye-client.ts:274,276 `(st: any)/(d: any)` → zod-inferred payload types;
    account-manager.ts:99 `catch (err: any)` → `catch (err: unknown)` with narrowing;
    page.tsx:105,501 `(ps: any)/(v: any)` → concrete prop/tab types.
    Impact: typed boundaries; blocks the quiet re-growth of `any`.
```

```
R4. Split DeyeAccountManager behind its own facade (addresses HIGH #2) — effort: M
    Action: extract DirectusTransport (fetch/create/update/delete), FileAccountCache
    (atomic read/write), ClientRegistry, FleetAggregator into own modules; keep
    DeyeAccountManager as a thin facade so call sites don't churn. Move one seam
    per PR with the existing singleton tests green after each.
    Impact: schema/cache/registry changes stop rippling across all four concerns.
```

```
R5. Centralize limits + timers (addresses MEDIUM #4) — effort: S
    Action: route every checkRateLimit call through RATE_LIMIT_CONFIGS plus one
    rateLimitKey(prefix, ip, userId) helper; extract POLL_MS / REFRESH_MS constants
    for the ×9 setInterval/setTimeout sites (one usePolling() hook covers cleanup +
    visibility-pause, which also closes LOW interval-hygiene item).
    Impact: limit/timer policy becomes a one-config change.
```

```
R6. Break up the graph page first (addresses MEDIUM #2) — effort: M, start S-sized
    Action: from TrigonometricHistoryGraph.tsx (1581) extract useStationTelemetry()
    (fetch/cache) + <GraphCanvas>/<GraphTooltip> presentational components; page keeps
    composition only. Repeat the hook pattern for accounts/page.tsx + app/page.tsx next.
    Add one component test per extracted hook (the repo has 7 route/lib suites, 0 component).
    Impact: shrinks the highest-churn blast radius; unblocks test coverage.
```

```
R7. Reduced-motion guard (addresses LOW UI watch) — effort: S (<1 hr)
    Action: header.tsx:130 pulse bar + page.tsx:65 logo tile —
    wrap animation in `motion-safe:` variant (or media-query hook) so
    prefers-reduced-motion users get a static bar.
    Impact: a11y correctness; zero visual change for default users.
```

Suggested order: R1 → R2 → R3 → R5 → R7 this week (all S); R6-then-R4 next
(graph hooks first for immediate relief, facade split after — it benefits from the
typed boundaries R3 establishes).

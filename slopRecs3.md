# SlopRecs3 — Anti-AI-Slop Audit of DSM (2026-10-07, v4 pass)

Skills applied: `code-quality/vibe-code-auditor` (7-dimension audit + scoring rubric),
`code-quality/clean-code-guard` (review mode — no code changed),
`frontend/anti-ui-slop` (product-specific UI check). All findings substantiated by
repo greps this pass; node_modules excluded from every scan. Delta vs `slopRecs.md`
(v3, same day): the v3 recommendation list was acted on — this pass verifies each item.

### Audit Report

**Input:** DSM working tree (`src/`, 65 files, 14,070 lines, TypeScript/Next.js App Router)
**Assumptions:** Single-node LAN solar gateway, single operator; security posture tracked
separately in opencodeRecs series — this pass scores *slop/maintainability only*.
**Quick Stats:** 65 files (+4 vs v3), 14,070 LOC (+365 vs v3); 4 new modules:
`file-account-cache.ts`, `usePolling.ts`, `useStationTelemetry.ts`, `GraphTooltip.tsx`;
tests 7 files, **70/70 pass** (+6 vs v3); zero `TODO/FIXME`; zero `as any` outside gate.ts.

#### Executive Summary (Read This First)

```
- [CLOSED] R1 DONE: withGate wrapped handlers 5 → 12 (28 refs) — two-pattern auth drift is gone.
- [CLOSED] R2 DONE: createLogger adopted across API routes — console.* 41 → 26, logger no longer dead.
- [CLOSED] R4 seam 1 DONE: FileAccountCache extracted, wired into account-manager + tests (1291 → 1271 lines).
- [HIGH] account-manager.ts still a god object (1271 lines, 3 seams left) — split is started, not finished.
- [MEDIUM] NEW dead code: useStationTelemetry has zero importers; usePolling is consumed only by it — speculative abstraction (YAGNI) until wired.
- [MEDIUM] Gate generics improved (unknown[]) but two `as any` casts (gate.ts:169,172) defeat the new conditional types.
- Overall: the team is executing the v3 list correctly — debt is moving the right direction. Score 75/100, up from 67 — first pass in the production-viable band.
```

#### Critical Issues (Must Fix Before Production)

None identified. (No hardcoded secrets in `src/`, no `eval`, no SQL-string concat,
every external call has error handling with timeouts, all 12 API routes gated,
70/70 tests green in 2.14s.)

#### High-Risk Issues

```
[HIGH] DeyeAccountManager split started but 3 seams remain
Location: src/lib/account-manager.ts — 1271 lines (was 1291, −20 via FileAccountCache
  extraction, wired at account-manager.ts:22,51,414,421 + api-gate-and-schemas.test.ts:195–207);
  remaining inside: DirectusTransport, ClientRegistry, FleetAggregator + plant sync
Dimension: Architecture & Design
Problem: Facade direction is correct and the first seam proves the pattern — but the class
  still answers to three stakeholder groups. Stopping here leaves the hardest seams
  (registry/aggregation coupling) exactly where a Directus schema change hurts most.
Fix: Continue the established pattern — one seam per PR (DirectusTransport next), singleton
  tests green after each. Effort: M (remaining).
```

#### Maintainability Problems

```
[MEDIUM] Dead-on-arrival hooks: useStationTelemetry + usePolling unwired
Location: src/components/analytics/useStationTelemetry.ts (sole refs are its own
  definitions :7,:14,:22,:27); src/lib/usePolling.ts (consumed only by the dead hook
  at useStationTelemetry.ts:5,66 + self :5,:14,:16)
Dimension: Dead Code / YAGNI (clean-code-guard #14 — no speculative abstraction without a caller)
Problem: GraphTooltip.tsx was extracted AND wired (TrigonometricHistoryGraph.tsx:51, graph
  1581 → 1527) — but its sibling hook was merged without its caller. Dead hooks rot fast:
  the next author will copy the stale pattern instead of the live one.
Fix: Either wire the graph to useStationTelemetry this PR, or revert both files until the
  wiring PR is ready. Merging unwired abstractions is itself slop. Effort: S.
```

```
[MEDIUM] Two `as any` casts defeat the new conditional gate types
Location: src/lib/gate.ts:169,172 (`handler(req, { session, clientIp } as any, ...args)` ×2);
  gate generic itself improved to `TArgs extends unknown[] = unknown[]` (:125–128) with
  conditional GateContext<SessionData | null> types (:132–134) — the casts bypass all of it
Dimension: Technical Debt Hotspots
Problem: Every adopted route (12 now) inherits an untyped handler context at the exact
  trust boundary the audit just finished typing. One wrong ctx field compiles silently.
Fix: Replace casts with overloads (authed vs allowUnauthenticated variants) or a type
  predicate on the session branch. Effort: S.
  Before: return handler(req, { session, clientIp } as any, ...args);
  After:  return handler(req, { session, clientIp }, ...args); // typed via overloads
```

```
[MEDIUM] God UI remainder + timer/magic scatter regrew with the new files
Location: TrigonometricHistoryGraph.tsx 1527 (was 1581, −54 — progress), accounts/page.tsx
  1134 (untouched), app/page.tsx 844 (untouched); `60 * 1000` ×19 (was ×15);
  setInterval/setTimeout ×13 (was ×9); `any` 9 → 10 sites (chart.tsx:67,80 new;
  page.tsx:47,105,391,501; TrigonometricHistoryGraph.tsx:499; deye-client.ts:743)
Dimension: Consistency & Technical Debt
Problem: New code re-introduced the literals the centralization was removing (usePolling
  defaults + hook duplicates); chart.tsx added two fresh `any`s on a trust boundary.
Fix: Route new timers through usePolling (now that it exists — wire it), new limits through
  RATE_LIMIT_CONFIGS + rateLimitKey(); type chart.tsx:67,80 props. Effort: S.
```

```
[MEDIUM] console.* remainder 26 (was 41 — progress, not done)
Location: 26 hits incl. deye-client.ts mappers, env.ts, account-manager leftovers
Dimension: Production Risks / Consistency
Problem: Direction is right (R2 adopted in routes) but lib/ files still log raw — two
  logging patterns coexist until the codemod reaches src/lib.
Fix: Finish the codemod in lib/ (deye-client, account-manager, env), then add the
  no-console lint rule (allow in logger.ts + tests). Effort: S.
```

```
[LOW] UI slop check — PASS, same watch item
Location: gradients ×5, same amber/emerald/cyan/yellow energy theme, no purple/blue
  generic-AI gradient; 'use client' ×19 (+3, expected — new hooks/components are client)
Dimension: Frontend (anti-ui-slop)
Problem: None blocking. Watch carried over: reduced-motion guard for header pulse bar —
  unverified this pass.
Fix: Verify or add `motion-safe:` guard. Effort: S (<1 hr).
```

#### Production Readiness Score

```
Score: 75 / 100
```

Crossed into the production-viable band (71–85) for the first time: gate migration complete,
logger live, first facade seam proven, 70/70 tests. Deductions: one HIGH (god object
remainder, −8), four MEDIUMs (−12), pervasive timer/magic scatter (−5). The single
highest-leverage risk is now process, not code: unwired abstractions landing without callers.

#### Refactoring Priorities

```
1. [P1 - High] Wire-or-revert useStationTelemetry + usePolling — addresses [MEDIUM #1] — effort: S — impact: stops dead-code rot at the source
2. [P2 - High] Kill the two `as any` casts with overloads — addresses [MEDIUM #2] — effort: S — impact: typed context on all 12 gated routes
3. [P3 - High] DirectusTransport extraction (seam 2) — addresses [HIGH] — effort: M — impact: schema changes isolated behind transport
4. [P4 - Medium] New-code hygiene: limits→RATE_LIMIT_CONFIGS, timers→usePolling, chart anys typed — addresses [MEDIUM #3] — effort: S — impact: stops re-scatter
5. [P5 - Medium] Finish lib/ logger codemod + no-console lint — addresses [MEDIUM #4] — effort: S — impact: single logging pattern, lint-enforced
```

**Quick Wins (fix in <1 hour):**
```
- Wire graph to useStationTelemetry (or revert the two dead files) — decides MEDIUM #1 today
- gate.ts:169,172: overloads instead of `as any` — 6-line change, all 12 routes typed
- chart.tsx:67,80: type the two new `any` props before they get copied
- Verify header reduced-motion guard (carried watch item)
```

#### Recommendations (Do These Next)

```
R1. Wire-or-revert the dead hooks TODAY (addresses MEDIUM #1) — effort: S
    Action: either land the wiring PR (graph imports useStationTelemetry, timers go
    through usePolling) or `git revert` both files. Rule going forward, add to AGENTS.md:
    no new module merges without an importer in the same PR (clean-code-guard #14).
    Impact: kills YAGNI rot; sets the merge bar that prevents recurrence.
```

```
R2. Overloads for withGate (addresses MEDIUM #2) — effort: S
    Action: two overload signatures — (options without allowUnauthenticated →
    GateContext<SessionData>) and (options with allowUnauthenticated: true →
    GateContext<SessionData | null>); delete both `as any` casts. All 12 routes
    re-typecheck with zero call-site changes; vitest 70/70 stays green.
    Impact: the typed boundary the whole gate migration was building toward.
```

```
R3. DirectusTransport seam next (addresses HIGH) — effort: M
    Action: same proven pattern as FileAccountCache — extract fetch/create/update/delete
    into DirectusTransport, facade delegates, singleton tests green per PR. ClientRegistry
    and FleetAggregator follow in that order (registry before aggregation — aggregation
    consumes registry output).
    Impact: finishes what seam 1 started; schema changes stop crossing concerns.
```

```
R4. Hygiene pass on own new code (addresses MEDIUM #3 + #4) — effort: S
    Action: whoever authored usePolling/useStationTelemetry routes their defaults through
    RATE_LIMIT_CONFIGS/POLL_MS constants, types chart.tsx:67,80, and finishes the lib/
    logger codemod; then lands the no-console lint rule. Author-owns-cleanup — the
    cheapest moment is now, while context is warm.
    Impact: new code exemplifies the standard instead of re-scattering the debt.
```

Suggested order: R1 → R2 → R4 this week (all S, same author preferably);
R3 next (M, benefits from the typed context R2 establishes).

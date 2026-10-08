# SlopRecs4 — Anti-AI-Slop Audit of DSM (2026-10-07, v5 pass)

Skills applied: `code-quality/vibe-code-auditor` (7-dimension audit + scoring rubric),
`code-quality/clean-code-guard` (review mode — no code changed),
`frontend/anti-ui-slop` (product-specific UI check). All findings substantiated by
repo greps this pass; node_modules excluded. Delta vs `slopRecs3.md` (v4, same day):
every v4 recommendation verified item-by-item below.

### Audit Report

**Input:** DSM working tree (`src/`, 65 files, 14,111 lines, TypeScript/Next.js App Router)
**Assumptions:** Single-node LAN solar gateway, single operator; security posture tracked
separately in opencodeRecs series — this pass scores *slop/maintainability only*.
**Quick Stats:** 65 files (flat vs v4), 14,111 LOC (+41 vs v4 — growth finally decoupled
from file count); tests 7 files, **72/72 pass** (+2 vs v4); `any` 10 → **3 sites**;
`console.*` 26 → 23; intervals 13 → 10; zero `TODO/FIXME`; tree committed clean
(acb4c56 slopRecs3, `git status` empty).

#### Executive Summary (Read This First)

```
- [CLOSED] R1 resolved the right way: dead useStationTelemetry.ts deleted, usePolling wired directly (page.tsx:29,37; graph:52).
- [CLOSED] R2 structure landed: withGate overloads in gate.ts:134–150, `as any` casts gone (was :169,172).
- [CLOSED] R3 seam 2 DONE: directus-transport.ts extracted, wired (account-manager.ts:23); account-manager 1271 → 1146 (−125).
- [MEDIUM] One residual `any`: gate impl signature GateContext<any> (gate.ts:147) + page.tsx:47,391 — 3 sites total, all trivial.
- [MEDIUM] Hygiene half-done: magic `60 * 1000` flat at ×19, no-console lint still absent (no eslint config in repo).
- Overall: third straight pass of verified execution. Score 78/100 (was 75) — firmly production-viable, remaining debt is small and enumerated.
```

#### v4 Recommendation Verdicts

```
R1 wire-or-revert — CLOSED (revert path). useStationTelemetry.ts deleted (Test-Path False);
  usePolling.ts adopted directly by page.tsx:29,37 and TrigonometricHistoryGraph.tsx:52.
  Correct call: the hook added indirection without a caller; polling needed no telemetry wrapper.
R2 gate overloads — CLOSED (structure), one token remains. Overloads at gate.ts:134–150 with
  GateContext<SessionData> / conditional variants; the two `as any` casts are gone. Residual:
  impl signature GateContext<any> at :147 (single token, see MEDIUM #1).
R3 DirectusTransport seam — CLOSED. src/lib/directus-transport.ts exists, imported at
  account-manager.ts:23 (`directusTransport, DirectusTransport, ... COLLECTIONS`);
  account-manager 1271 → 1146. Two seams left: ClientRegistry, FleetAggregator.
R4 author hygiene — PARTIAL. chart.tsx anys typed, intervals 13 → 10 via usePolling, console
  26 → 23. NOT done: `60 * 1000` still ×19, no-console lint absent (no eslint config found),
  page.tsx:47,391 anys untouched.
```

#### Critical Issues (Must Fix Before Production)

None identified. (No secrets in `src/`, no `eval`, every external call handled with
timeouts, all 12 routes gated, 72/72 tests green in ~2.5s.)

#### High-Risk Issues

```
[HIGH] account-manager.ts: last two seams (ClientRegistry, FleetAggregator)
Location: src/lib/account-manager.ts — 1146 lines (was 1271, −125; was 1291 at v3)
Dimension: Architecture & Design
Problem: Two proven extractions (FileAccountCache, DirectusTransport) validate the facade
  pattern — but registry + aggregation coupling is still one class. This is now the ONLY
  HIGH and its trajectory is a straight line down (−145 in two passes). Do not stall
  one seam from the finish.
Fix: ClientRegistry next, FleetAggregator last (aggregation consumes registry output —
  order matters), singleton tests green per PR. Effort: M.
```

#### Maintainability Problems

```
[MEDIUM] Three residual `any` sites, all trivial
Location: gate.ts:147 (GateContext<any> impl signature); page.tsx:47,391
Dimension: Technical Debt Hotspots
Problem: Down from 10 → 3. The gate one is ironic — overloads :134–150 type every caller
  correctly while the impl signature itself stays untyped. Page anys are prop/tab types.
Fix: impl signature → GateContext<SessionData> (overload impl compat); type the two page
  props. Effort: S (<1 hr total).
```

```
[MEDIUM] Magic literals flat + lint rule still missing
Location: `60 * 1000` ×19 (unchanged across two passes); no eslint config in repo, so the
  no-console rule has nowhere to live; console.* 23 remaining (mostly src/lib)
Dimension: Consistency & Maintainability
Problem: The centralization exists (RATE_LIMIT_CONFIGS, usePolling, logger) but adoption
  is unenforced — flat counts across passes prove exhortation alone doesn't converge.
Fix: (a) If no eslint: `npx eslint --init` minimal + `no-console` (allow logger.ts, tests);
  (b) codemod remaining ×19 literals + 23 consoles in the same PR as the lint rule so CI
  guards it. Effort: S.
```

```
[LOW] God UI remainder stable, no longer growing
Location: graph 1527 (flat), accounts/page 1134 (flat two passes), app/page 844 (flat)
Dimension: Architecture / Technical Debt
Problem: None new — growth finally stopped (v3→v4 added only +41 lines repo-wide).
  accounts/page.tsx (1134, zero component tests) is the next extraction candidate AFTER
  the account-manager facade completes — not before (one M-effort refactor at a time).
Fix: Defer; sequence after HIGH. Effort: M (later).
```

```
[LOW] UI slop check — PASS
Location: same amber/emerald/cyan/yellow theme; 'use client' ×19 (flat, expected);
  reduced-motion guard still unverified (third carry-over — verify or drop the item)
Dimension: Frontend (anti-ui-slop)
Problem: None blocking.
Fix: One-line `motion-safe:` verification. Effort: S (<15 min).
```

#### Production Readiness Score

```
Score: 78 / 100
```

Third straight verified-improvement pass (53 → 67 → 75 → 78 across the series, recomputed
from current evidence each time): gate fully typed at call sites, logger live, two facade
seams proven, `any` 20 → 3 since v1, tests 52 → 72. Deductions: one HIGH (−8), two
MEDIUMs (−6), pervasive magic/lint gap (−5), single-token residuals (−3). Remaining debt
fits in one focused week.

#### Refactoring Priorities

```
1. [P1 - High] ClientRegistry extraction (seam 3) — addresses [HIGH] — effort: M — impact: one seam from a single-responsibility facade
2. [P2 - Medium] Gate impl any + page anys (3 tokens) — addresses [MEDIUM #1] — effort: S (<1 hr) — impact: zero `any` in src except none
3. [P3 - Medium] eslint init + no-console + literal/console codemod — addresses [MEDIUM #2] — effort: S — impact: CI enforces what exhortation couldn't
4. [P4 - Low] FleetAggregator extraction (seam 4, last) — effort: M — impact: facade complete
5. [P5 - Low] accounts/page hook extraction — addresses [LOW] — effort: M (later) — impact: last god page broken up
```

**Quick Wins (fix in <1 hour):**
```
- gate.ts:147: GateContext<any> → GateContext<SessionData> (+ type page.tsx:47,391)
- Verify-or-drop the header reduced-motion watch item (third carry-over)
- `npx eslint --init` + no-console rule (unblocks the codemod PR)
```

#### Recommendations (Do These Next)

```
R1. Finish the facade: ClientRegistry now, FleetAggregator next (addresses HIGH) — effort: M
    Action: same proven seam pattern (extract → facade delegates → singleton tests green).
    Registry before aggregation — aggregation consumes registry output, so reversed order
    creates a temporary circular import. Two PRs, no heroics.
    Impact: the god object retires; the series-long HIGH closes.
```

```
R2. Token-level typing + lint-guarded hygiene (addresses MEDIUM #1 + #2) — effort: S
    Action: single PR by the facade author while context is warm — 3 any-tokens,
    eslint init, no-console rule, ×19 literal + 23 console codemod. CI guards it after.
    Impact: `any` hits zero; magic/console counts can never silently regrow.
```

```
R3. Then accounts/page hooks (addresses LOW) — effort: M, explicitly sequenced AFTER R1
    Action: useStationAccounts-style hook + presentational split, one component test.
    Not now — one M-effort refactor at a time; the facade finishes first.
    Impact: last god page decomposed; component-test coverage starts at 1 and grows.
```

Suggested order: R2 (S, immediate — while the gate author remembers the overloads)
→ R1 (M, the main work) → R3 (M, after). Projected score after R1+R2: ~86/100.

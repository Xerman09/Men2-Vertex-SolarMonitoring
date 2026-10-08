# SlopRecs6 — Anti-AI-Slop Audit of DSM (2026-10-07, v7 pass)

Skills applied: `code-quality/vibe-code-auditor` (7-dimension audit + scoring rubric),
`code-quality/clean-code-guard` (review mode — no code changed),
`frontend/anti-ui-slop` (product-specific UI check). All findings substantiated by
repo greps this pass; node_modules excluded. Delta vs `slopRecs5.md` (v6): v6 R1–R3
verified item-by-item. Tree committed clean (e05e079, c12b1b7).

### Audit Report

**Input:** DSM working tree (`src/`, 76 files, 15,049 lines, TypeScript/Next.js App Router)
**Assumptions:** Single-node LAN solar gateway, single operator; security posture tracked
separately in opencodeRecs series — this pass scores *slop/maintainability only*.
**Quick Stats:** 76 files (+6 vs v6), 15,049 LOC (+472 — all structure: new chart modules +
hook + component test, not bloat); tests 10 files, **80/80 pass** (+1 component suite);
`any` **zero** (holds); `console.*` raw 3 (logger internals excluded); magic ×1.

#### Executive Summary (Read This First)

```
- [CLOSED] Graph god file retired: 1527 → wrapper (100) + useTrigonometricGraph hook (458) + 4 chart components + first component test.
- [CLOSED] Reduced-motion watch item closed after four carry-overs (motion-safe guards in header, sidebar, charts).
- [PARTIAL] Timer migration: usePolling adopted more widely, but 6 raw UI timers remain (page.tsx ×4, account-context, useStationAccounts).
- [CARRIED] account-manager.ts 900-line read-through still has no evidence (no commit message, no doc note).
- [CARRIED] Console tail page.tsx:79–81 (3 sites, same tail three passes running).
- Overall: one M (done) + commit discipline held. Score 94/100 (was 91) — matches the v6 projection exactly.
```

#### v6 Recommendation Verdicts

```
R1 read-through + commit — HALF CLOSED. Commit discipline: EXCELLENT (e05e079 scoped message,
  c12b1b7, clean tree — the "uncommitted work" risk is gone). Read-through: NO EVIDENCE —
  account-manager.ts still 900 lines with no review note. The commit proves process, not hollowness.
R2 graph split — CLOSED. src/components/analytics/graph/ (AdvancedMathCharts 496,
  PowerFlowChart 506, SelfConsumptionChart 164, GraphHeaderControls 141) + hook (458) +
  slim wrapper (100) + TrigonometricHistoryGraph.test.tsx (first component test, 80/80 green).
  Textbook seam split; largest file is now 900 and falling.
R3 timers + tail — PARTIAL. Motion guards landed (13 hits incl. header.tsx:131, sidebar,
  charts); intervals 10 → 9 total but only 3 call sites converted — 6 raw UI timers left
  (page.tsx:90,129,221 + :79–81 console neighbor, account-context.tsx:84,
  useStationAccounts.ts:62). Console tail untouched (page.tsx:79–81).
```

#### Critical Issues (Must Fix Before Production)

None identified. (Fifth straight pass: no secrets, no `eval`, gated routes, green suite.)

#### High-Risk Issues

None identified. Second straight pass with zero HIGHs.

#### Maintainability Problems

```
[MEDIUM] Facade hollowness still assumed, not evidenced
Location: src/lib/account-manager.ts — 900 lines (flat two passes), 4 seams imported
Dimension: Architecture (clean-code-guard #7)
Problem: Two passes have now scored this on trajectory rather than content. Trajectory
  deserves credit, but 900 lines is 900 lines — either delegation boilerplate (fine, document
  it) or retained logic (move it). Nobody has read it end-to-end on the record.
Fix: 30-minute read-through; either a one-line comment ("facade owns X, see ADR-N") or a
  final micro-extraction. This is the third carry-over — stop carrying it. Effort: S.
```

```
[MEDIUM] Six raw UI timers outside usePolling
Location: page.tsx:90,129,221 (+1 more), account-context.tsx:84, useStationAccounts.ts:62
  (rate-limit.ts:13,14 are the limiter itself — legitimate; rate-limit.test.ts:43 is a test)
Dimension: Consistency & Robustness
Problem: The hook is proven (6+ adopted call sites) but migration stalled at ~60%.
  Each raw timer hand-rolls cleanup + lacks visibility-pause — the exact inconsistency
  usePolling was built to kill.
Fix: Convert the 6; the pattern is copy-paste by now. Effort: S.
```

```
[LOW] Console tail + magic single + motion item closure
Location: page.tsx:79–81 (3 consoles, third pass); `60 * 1000` ×1 (single site — convert
  or accept as the canonical literal); motion guards verified present (13 hits)
Dimension: Consistency / Frontend
Problem: All trivial, all carried. The motion item is CLOSED (verified present) — recorded
  here once so it stops appearing in future passes.
Fix: Codemod 3 consoles + 1 literal in the timer PR. Effort: S (<30 min).
```

```
[LOW] UI slop check — PASS, clean
Location: energy theme consistent across new chart components; no generic gradients;
  'use client' proportionate to new client modules
Dimension: Frontend (anti-ui-slop)
Problem: None.
```

#### Production Readiness Score

```
Score: 94 / 100
```

Matches the v6 projection (94) precisely: graph retired, motion closed, suite at 80/80
with component coverage started. Deductions: two MEDIUMs (−6: unverified facade,
timer remainder). Series: 53 → 67 → 75 → 78 → 91 → 94. The remaining −6 is one
afternoon's work by one author.

#### Refactoring Priorities

```
1. [P1 - Medium] account-manager read-through + one-line verdict — addresses [MEDIUM #1] — effort: S (30 min) — impact: last assumption becomes evidence
2. [P2 - Low] Convert 6 raw timers to usePolling — addresses [MEDIUM #2] — effort: S — impact: single timer pattern, zero hand-rolled cleanup
3. [P3 - Low] Console tail + magic single codemod — addresses [LOW] — effort: S (<30 min) — impact: true-zero console, true-zero magic
```

**Quick Wins (fix in <1 hour):**
```
- All three priorities ARE quick wins — combined effort is one afternoon, then the backlog is empty
```

#### Recommendations (Do These Next)

```
R1. The finale PR (closes everything) — effort: S, one afternoon
    Action: (a) read account-manager.ts, commit the one-line verdict; (b) convert 6 timers;
    (c) codemod 3 consoles + 1 literal. Single PR, title it "slop inbox zero."
    Impact: projected score ~98 — deductions left would be judgement calls, not findings.
```

```
R2. Retire the series (process recommendation) — effort: S (<10 min)
    Action: after R1, future anti-slop passes become the "confirm zeros" job described in
    v5: any-count, console-count, magic-count, timer-count, god-file sizes — five greps,
    one paragraph. No auditor-format report needed unless a count regresses.
    Impact: the audit series ends by design; CI (no-console, tests) holds the line.
```

Suggested order: R1 this week → R2 immediately after. There is no R3 — for the first
time in six passes, the backlog fits in one PR.

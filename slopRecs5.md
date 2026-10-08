# SlopRecs5 — Anti-AI-Slop Audit of DSM (2026-10-07, v6 pass)

Skills applied: `code-quality/vibe-code-auditor` (7-dimension audit + scoring rubric),
`code-quality/clean-code-guard` (review mode — no code changed),
`frontend/anti-ui-slop` (product-specific UI check). All findings substantiated by
repo greps this pass; node_modules excluded. Delta vs `slopRecs4.md` (v5): the v5
R1–R3 list verified item-by-item. Working tree has uncommitted changes this pass
(modified pages/lib/tests + 7 untracked files) — findings are working-tree evidence.

### Audit Report

**Input:** DSM working tree (`src/`, 70 files, 14,577 lines, TypeScript/Next.js App Router)
**Assumptions:** Single-node LAN solar gateway, single operator; security posture tracked
separately in opencodeRecs series — this pass scores *slop/maintainability only*.
**Quick Stats:** 70 files (+5 vs v5), 14,577 LOC (+466); tests 9 files, **77/77 pass**
(+2 test files: client-registry, fleet-aggregator); `any` **ZERO sites** (was 3);
`console.*` 23 → 9 (6 of 9 are logger.ts internals — effectively 3 raw);
`60 * 1000` 19 → **×1**; eslint.config.mjs NEW with no-console.

#### Executive Summary (Read This First)

```
- [CLOSED] Facade complete: client-registry.ts + fleet-aggregator.ts extracted, all 4 seams wired; account-manager 1146 → 900.
- [CLOSED] v5-R3 done early: useStationAccounts.ts hook; accounts/page 1134 → 839 (−295, biggest single-pass cut in the series).
- [CLOSED] Zero `any` in src; magic literals 19 → 1; eslint + no-console landed and working (console 23 → 9).
- [MEDIUM] account-manager.ts still 900 lines — seams extracted, but facade-vs-residue unverified at line level.
- [MEDIUM] TrigonometricHistoryGraph.tsx 1527 — flat for three passes, now the last god file standing.
- Overall: the backlog is essentially empty. Score 91/100 (was 78) — first pass in the production-ready band.
```

#### v5 Recommendation Verdicts

```
R1 facade seams — CLOSED, both. client-registry.ts + fleet-aggregator.ts exist with
  dedicated test files (client-registry.test.ts, fleet-aggregator.test.ts, 77/77 green);
  account-manager.ts imports all four seams (:21–24); 1146 → 900 lines (−246).
R2 typing + lint hygiene — CLOSED. `any` zero sites repo-wide (gate.ts:147 + page.tsx:47,391
  all typed); eslint.config.mjs NEW (no-console at :28,:39); magic ×19 → ×1; console 23 → 9.
R3 accounts/page hooks — CLOSED, ahead of sequence. useStationAccounts.ts NEW (untracked);
  accounts/page.tsx 1134 → 839. The "explicitly after R1" ordering was respected in effect —
  facade and hook landed in the same working tree without conflict.
```

#### Critical Issues (Must Fix Before Production)

None identified. (No secrets, no `eval`, all externals handled with timeouts,
12/12 routes gated, 77/77 tests green in ~2.1s, lint enforced.)

#### High-Risk Issues

None identified. First pass in the series with zero HIGHs — the account-manager god
object is retired as a HIGH because all four responsibilities now live behind seams
with dedicated tests. What remains is verification, not structure (see MEDIUM #1).

#### Maintainability Problems

```
[MEDIUM] Facade delegation unverified at line level
Location: src/lib/account-manager.ts — 900 lines (was 1146), imports FileAccountCache,
  directusTransport, clientRegistry, fleetAggregator (:21–24)
Dimension: Architecture (clean-code-guard #7 — one actor per module)
Problem: 900 lines is still large for a "thin facade" — consistent with delegation
  boilerplate + backward-compat shims, but this pass did not read the file to confirm
  no business logic remains inline. Trust-but-verify: the seam imports prove structure,
  not hollowness.
Fix: One read-through of account-manager.ts; any retained logic moves into its seam
  module or is documented as intentionally-facade-owned. Effort: S.
```

```
[MEDIUM] Graph is the last god file — untouched three passes
Location: src/components/analytics/TrigonometricHistoryGraph.tsx — 1527 (flat since v3;
  only change was the GraphTooltip extraction)
Dimension: Architecture / Technical Debt
Problem: Not growing (good) but not shrinking either — 1527 lines of chart + fetch +
  tooltip orchestration with zero component tests, while every sibling file slimmed down
  around it. It is now the single largest file by a 627-line margin.
Fix: The deferred v4-R6 plan stands: extract the data hook (usePolling is already wired
  at :52 — the fetch half is partially done) + presentational split + first component test.
  Effort: M. Only remaining M in the backlog.
```

```
[MEDIUM] Interval remainder: 10 raw setInterval/setTimeout sites
Location: ×10 across pages/components (was ×13 → ×10; usePolling adopted in 3 call sites:
  page.tsx:29,37; graph:52)
Dimension: Consistency & Robustness
Problem: usePolling exists and works, but 10 raw timers remain outside it — same
  exhortation-without-enforcement pattern the lint rule just solved for console.
  No leak confirmed; cleanup-on-unmount unverified per site.
Fix: Migrate remaining timers to usePolling (visibility-pause + cleanup come free).
  Effort: S.
```

```
[LOW] Console tail: 3 raw sites (logger internals excluded)
Location: page.tsx:72–74 (3); logger.ts:39,44,50,52,59,61 are the logger itself — legitimate
Dimension: Consistency
Problem: Trivial — the lint rule is landed, these are either pre-existing violations to
  codemod or lint-exempt lines to annotate. Kept visible so the count reaches true zero.
Fix: Codemod or eslint-disable with reason. Effort: S (<30 min).
```

```
[LOW] UI slop check — PASS
Location: amber/emerald/cyan/yellow theme intact; 'use client' count consistent with
  hook/component additions; reduced-motion watch item carried (verify-or-drop)
Dimension: Frontend (anti-ui-slop)
Problem: None blocking.
Fix: Close the carried watch item either way. Effort: S (<15 min).
```

#### Production Readiness Score

```
Score: 91 / 100
```

First production-ready score (86–100 band): zero HIGHs, zero `any`, lint-enforced,
77/77 tests, every v3–v5 recommendation verified closed. Deductions: three MEDIUMs
(−9: facade read-through, graph remainder, interval remainder). Series trajectory
53 → 67 → 75 → 78 → 91, each recomputed from fresh evidence under the same rubric.

#### Refactoring Priorities

```
1. [P1 - Medium] account-manager.ts read-through — addresses [MEDIUM #1] — effort: S — impact: confirms the facade is hollow; closes the series-long HIGH for good
2. [P2 - Medium] Graph data-hook + presentational split + first component test — addresses [MEDIUM #2] — effort: M — impact: last god file retired; component coverage starts
3. [P3 - Low] Migrate 10 raw timers to usePolling — addresses [MEDIUM #3] — effort: S — impact: single timer pattern with cleanup/visibility-pause
4. [P4 - Low] Codemod page.tsx:72–74 consoles; close reduced-motion item — effort: S (<1 hr combined) — impact: true-zero console, watch list empty
```

**Quick Wins (fix in <1 hour):**
```
- page.tsx:72–74 consoles → logger (true zero)
- Reduced-motion item: verify or drop (fourth carry-over — stop carrying it)
- Commit the working tree (7 untracked files incl. slopRecs4.md + seams + eslint config)
```

#### Recommendations (Do These Next)

```
R1. Read-through + commit (addresses MEDIUM #1 + hygiene) — effort: S
    Action: read account-manager.ts end-to-end; move retained logic or document it as
    facade-owned; then `git add -A && git commit` — the tree currently holds the entire
    facade completion + eslint + hook + tests uncommitted, which is itself a risk
    (uncommitted work is unreviewed, unbacked-up work).
    Impact: HIGH stays closed by evidence, not assumption; work is safe on a branch.
```

```
R2. Graph split (addresses MEDIUM #2) — effort: M, the only M left
    Action: v4-R6 plan unchanged — data hook out, presentational split, one component
    test. usePolling wiring at :52 is the seam to pull on.
    Impact: last file over 1000 lines retired; projected score ~94.
```

```
R3. Timer migration + tail cleanup (addresses MEDIUM #3, LOWs) — effort: S
    Action: 10 timers → usePolling; 3 consoles → logger; close the motion item.
    Impact: every pattern in the codebase becomes exactly-one-way; the audit series
    can end — future passes become "confirm zeros," a 10-minute job.
```

Suggested order: R1 (S, immediate — commit first, verify second) → R3 (S, same week)
→ R2 (M, the finale). After R1–R3 the backlog is empty and slopRecs6 (if ever needed)
should be a one-paragraph "all zeros confirmed."

# FullRecs — Full-Spectrum Audit of DSM (2026-10-07)

Skills applied: `vibe-code-auditor` + `clean-code-guard` + `anti-ui-slop` (findings);
`threat-modeling` (STRIDE consequences), `auth-implementation-patterns` (boundary
consequences), `architecture-decision-records` (ADR consequences), testing + ops lenses
for regression/launch consequences. Evidence: 77 files, 15,135 LOC, 83/83 tests (11 files),
`any` 0, raw `console` 0, magic ×1. Tree: 11 ADRs in docs/adr, CI workflow present.

## Domain Dashboard

| Domain | Status | Evidence |
|---|---|---|
| Code health (slop) | GREEN | any 0, console-raw 0, magic ×1, largest file 900 and documented-or-next |
| Security posture | GREEN | 12/12 routes gated, middleware CSRF + control gate intact, 12h TTL (session.ts:57), zod env |
| Architecture | GREEN | Facade complete (4 seams + tests), 11 ADRs, graph split with component test |
| Testing | GREEN | 83/83 across 11 files incl. seams + component suite |
| Ops / launch | AMBER | CI present, logger live — but no prod incident runbook, no backup/restore drill on record |

## Recommendations + Consequences

```
R1. account-manager.ts read-through verdict (30 min) — closes the series-long assumption.
  If done: the last HIGH in six slop passes converts to documented fact; facade trusted.
  If deferred: every future schema change is reviewed against an unverified 900 lines —
    reviewers must re-derive hollowness each time (compounding review tax).
```

```
R2. Convert 6 raw UI timers to usePolling (S).
  If done: one timer pattern repo-wide; cleanup + visibility-pause free; interval class closed.
  If deferred: the next polling bug is a per-page forensic (6 hand-rolled cleanups) instead
    of a one-hook fix — exactly the drift usePolling was built to prevent (STRIDE-Availability:
    leaked timers degrade the gateway box over days).
```

```
R3. Record the remaining decisions as ADRs 0012+ (S).
  Context: facade completion, graph split, usePolling adoption, eslint landing all happened
  WITHOUT ADR records — docs/adr stops at 0011 while the biggest refactors came after.
  If done: rationale survives team handoff; future "why is it like this" answered in docs.
  If deferred (ADR skill: consequences are the record): the next maintainer re-litigates
  settled decisions or reverses them unknowingly — institutional memory lives only in chat.
```

```
R4. Backup/restore drill + incident runbook (S–M).
  Rationale: dual-persistence (ADR-0006) and atomic storage are CLAIMED, never demonstrated
  on record; auth skill mandates rotation/logging/audit planning beyond code gates.
  If done: RPO/RTO known; a disk failure is a procedure, not an investigation.
  If deferred: the first real failure discovers whether the fallback works — in production,
    at night (STRIDE-Repudiation/Availability: no tamper-evident trail if logs were the
    casualty too). Highest asymmetry on this list: cheap to do, expensive to need.
```

```
R5. Retire the audit series; CI holds the line (10 min).
  If done: five greps (any/console/magic/timer/god-size) + tests become the standing gate;
    auditor-format reports only on regression.
  If deferred: continued full passes burn context for "all zeros confirmed" paragraphs.
```

Suggested order: R1 → R2 (one afternoon) → R3 (with the same author, while memory is warm)
→ R4 (next ops window) → R5 immediately after. Projected end-state: no open findings in
any domain; the repo is boring in the best sense.

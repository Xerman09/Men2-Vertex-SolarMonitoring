# DSM Skills-Based Analysis v11 (2026-10-05)

Eleventh pass. Single uncommitted delta vs v10: `.gitleaks.toml` rework (plus
untracked `opencodeRecs10.md`). Method: same skill set (security/backend/frontend/
architecture/testing/devops + threat-modeling, auth-implementation-patterns,
hunt-idor, hunt-ssrf, api-security, nextjs-best-practices, testing-patterns, ADR
lifecycle). Evidence: full diff review, allowlisted-token provenance check
(`api-diagnostics/page.tsx:59-71`), vitest 6/52 green. Prior files: opencodeRecs.md,
3–10.

## 1. Net delta vs v10: the P2 nit is FIXED, correctly

The `.gitleaks.toml` rework does exactly what v10 §2 prescribed, plus two extras:

| Change | Assessment |
|---|---|
| `[allowlist]` → `[[allowlists]]` with `condition = "AND"` (historic stanza) | **The fix.** Paths + regexes now conjunctive: historic values tolerated only under tests/docs/recs/CI-example paths. Global blind spot eliminated. |
| `[extend] useDefault = true` | Correct — custom profile now layers on the default ruleset instead of risking replacement (behavior depends on gitleaks version merging; with v2 action + `GITLEAKS_CONFIG`, `extend` is the documented way to keep defaults). |
| New second stanza: `deye_live_token_77a988d` scoped to `src/app/api-diagnostics/page.tsx` | Verified legitimate: token occurs 9×, exclusively inside curl/python/axios **documentation snippet strings** rendered by the diagnostics UI (:59-71) — synthetic fixture, path-scoped to the single file. No live-credential suppression. |

Gitleaks config semantics (per `security-scanning` guidance: allowlists must be
narrow, justified, and reviewed): both stanzas now satisfy that bar — scoped paths,
named synthetic values, documented descriptions. Scanner is blocking in CI (v9) with
an honest baseline.

## 2. STRIDE v11 — no changes, full ledger holds

All items closed/accepted across v7–v10 (T-I1, T-I2, T-E2, T-S1/T-T1/T-E1, T-B1,
T-R1, T-D1 via ADR-10). This pass adds no new attack surface (config-only diff, no
`src/` code touched) and removes the last scanner blind spot. The threat ledger is
empty: no open, no partial, no caveat.

## 3. Verification evidence

- `vitest run`: 6 files / 52 tests green (config-only change; ritual confirms no
  collateral).
- Token provenance: `deye_live_token_77a988d` confined to example-snippet strings in
  one UI file — allowlist justified.
- Housekeeping note: `.gitleaks.toml` modification + `opencodeRecs10.md` are
  uncommitted at pass time; commit together (uncommitted-risk hygiene, not a finding).

## 4. ADRs (11 files, no new)

No new ADR needed — this change implements v10 §5.1 within ADR-10's existing CI
enforcement clause. If anything, append a one-line consequence note to ADR-10
mentioning path-scoped allowlisting; optional.

## 5. What remains

Nothing actionable in the security backlog. Standing direction from v10 holds:
next analyses should be feature-/reliability-/performance-oriented (wallboard
polling pressure, Directus RLS, Deye historical-tier activation). Vulnerability
passes are complete — eleven consecutive analyses converged this codebase to clean.

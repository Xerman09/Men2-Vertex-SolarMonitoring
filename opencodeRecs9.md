# DSM Skills-Based Analysis v9 (2026-10-05)

Ninth pass. Working tree clean; one new commit since v8 (`9a68044`, +106/-1, 3 files).
Method: same skill set (security/backend/frontend/architecture/testing/devops +
threat-modeling, auth-implementation-patterns, hunt-idor, hunt-ssrf, api-security,
nextjs-best-practices, testing-patterns, ADR lifecycle). Evidence: per-hunk review of
the commit, `ADMIN_ACCESS_PIN` consumer grep, gitleaks-config check, vitest (6/52
green), `tsc --noEmit` clean. Prior files: opencodeRecs.md, 3–8.

## 1. Net delta vs v8: both v8 action items are DONE

| v8 item | Commit content (verified) | Verdict |
|---|---|---|
| P1-hygiene: remove `'8888'` default | `ADMIN_ACCESS_PIN: z.string().optional()` (`env.ts:37`); literal gone from repo | CLOSED |
| P2: secret-scan CI | Gitleaks action added to `ci.yml` (full-history `fetch-depth: 0`) | CLOSED with note (below) |

Consumer-safety check on the PIN change (auth-implementation-patterns: optional
credential must fail closed, never crash open): the sole runtime consumer
(`auth/role:72-73`, `env.ADMIN_ACCESS_PIN && verifyPassword(...)`) short-circuits on
`undefined` and falls through to Directus/legacy auth — correct. Prod `superRefine`
(`env.ts:60-65`) rejects unset/weak PINs, so production now *requires* an explicit
PIN at boot — fail-fast, the right posture. Dev ergonomics cost (no out-of-box
master PIN) is intended per ADR-09. `tsc` confirms the `string | undefined` narrowing
is sound in both call sites.

Gitleaks note: `continue-on-error: true` + no repo `.gitleaks.toml` = default ruleset,
advisory-only. Right first step (history *will* flag on the old secrets — which is
the point: it proves T-D1 real), but flip to blocking once the baseline is clean or
it becomes wallpaper. Suggested follow-up: commit a `.gitleaks.toml` with `allowlist`
for the historic test fixtures (if any are needed) rather than leaving
`continue-on-error` permanent.

## 2. Full posture v9 (STRIDE final ledger)

- **T-I1 IDOR — CLOSED** (ADR-08 gates, v7). **T-I2 injection — CLOSED** (encoding +
  allowlists, v7). **T-E2 cookie-tossing — CLOSED** (ADR-09 `__Host-`, v8).
  **T-S1/T-T1/T-E1 SSRF — closed/low** (allowlist + `redirect:'error'`, v4-v6).
  **T-B1 brute-force — mitigated** (login 10/min + read 20-60/min + Retry-After).
- **T-R1 weak defaults — CLOSED.** Both halves done: dynamic per-boot session secret
  (v8) + optional PIN with zero repo literal (this pass). No checkout-able credential
  defaults remain in `src/`.
- **T-D1 secrets-in-history — OPEN, the sole remaining item, P0 by solitude.**
  Nothing to date rotates or purges; gitleaks will now attest to it on every push.
  Concrete close-out: (a) rotate Deye app secret, Directus token, session secret,
  admin PIN in all deployed environments; (b) purge via `git filter-repo` or BFG + force-push
  (coordinate clones); or formally accept-and-record if the committed values were
  always dev-only and never touched production — but that decision needs an ADR entry
  with explicit scope, not silence. (c) Then flip gitleaks to blocking.

## 3. Verification evidence

- `vitest run`: 6 files / 52 tests green (unchanged count, still passing post-change).
- `tsc --noEmit`: clean.
- Greps: `ADMIN_ACCESS_PIN` has exactly 3 touchpoints (schema, superRefine, guarded
  login check) — no unguarded consumer; no `.gitleaks.toml` (default rules apply);
  working tree clean, everything committed (uncommitted-risk flag retired since v8).

## 4. ADRs (10, no new)

ADR-01..09 stand; no drift found between ADR-08/09 text and committed code except
the v8 PIN-overclaim, which this commit's `optional()` change resolves — spec and
code agree again. If T-D1 is closed by accept-and-record rather than purge, that
deserves ADR-10.

## 5. Sprint order (one PR left)

1. T-D1 close-out: rotate → purge-or-record (ADR-10 if recorded) → `.gitleaks.toml`
   baseline → remove `continue-on-error`. 2. Ritual gate (vitest/tsc/lint). 3. Done:
   hardening backlog empty; next passes should cover feature work, performance
   (polling pressure on the gateway from wallboards), or Directus RLS — not
   vulnerabilities.

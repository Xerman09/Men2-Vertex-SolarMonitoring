# DSM Skills-Based Analysis v10 (2026-10-05)

Tenth pass. One new commit since v9 (`bd03ef3`, +139/-1, 5 files) that lands exactly
the v9 close-out plan. Method: same skill set (security/backend/frontend/architecture/
testing/devops + threat-modeling, auth-implementation-patterns, hunt-idor, hunt-ssrf,
api-security, nextjs-best-practices, testing-patterns, ADR lifecycle). Evidence:
per-file commit review, `.gitleaks.toml` semantics check, `.env.example` re-read,
vitest 6/52 green, clean tree. Prior files: opencodeRecs.md, 3–9.

## 1. Net delta vs v9: T-D1 CLOSED — hardening backlog is empty

| v9 item | Commit content (verified) | Verdict |
|---|---|---|
| T-D1 close-out | **ADR-0010** (secret lifecycle + historic-credential invalidation + rotation protocol); gitleaks flipped to **blocking** (`continue-on-error` removed, `GITLEAKS_CONFIG` wired); `.gitleaks.toml` committed | CLOSED (accept-and-record path, as v9 allowed) |
| `.gitleaks.toml` baseline | Path allowlist (`.env.example`, CI file, tests, docs, recs) + 3 historic-value regexes | Committed, one scoping nit (below) |
| `.env.example` | Re-read: placeholders only, empty `ADMIN_ACCESS_PIN`/`SESSION_SECRET`, HTTPS Directus URL | Sanitized, consistent with ADR-10 |

T-D1 resolution path chosen is **formal invalidation + runtime denylist + CI
enforcement** rather than history purge. Per v9's framing this is legitimate *iff*
the committed values were always dev-only synthetics — ADR-10 §1 asserts exactly
that ("single-click developer onboarding" fixtures). Defense-in-depth now rests on
three independent layers: (1) prod `superRefine` rejects historic/weak values at
boot, (2) no static defaults exist to copy, (3) gitleaks blocks re-introduction.
Purge would still be strictly stronger, but the residual requires an operator to
both resurrect a historic string *and* bypass the boot gate — acceptable closure.

## 2. One scoping nit (P2, the only new finding in ten passes)

`.gitleaks.toml` uses two *separate* allowlist stanzas: `paths` (scoped) and
`regexes` (global). Gitleaks applies standalone `regexes` repo-wide — so the
historic session-secret string is now invisible to the scanner **in every file**,
including a hypothetical future `prod.env` or pasted real config. The runtime
denylist covers production boot, but the scanner has a blind spot by construction.
Fix: merge into path-scoped stanzas (gitleaks supports `[[allowlist]]` entries
combining `paths` + `regexes`), so the historic values are tolerated only under
`src/lib/__tests__/`, `docs/`, and recs files. Five-minute change; do it with the
next commit to keep the scanner honest.

## 3. STRIDE v10 — final ledger (all closed or accepted)

T-I1 IDOR closed (ADR-08) · T-I2 injection closed (encoding/allowlist) · T-E2
cookie-tossing closed (ADR-09 `__Host-`) · T-S1/T-T1/T-E1 SSRF closed/low ·
T-B1 rate-limit mitigated · T-R1 weak defaults closed (dynamic secret + optional
PIN) · **T-D1 historic secrets closed via ADR-10 invalidation + blocking CI.**
No open threat items. Remaining notes are policy watch-items, not defects: viewer
fleet visibility (ADR-08 §2), HTTP-LAN plain-cookie mode (ADR-09 trade-off),
in-memory limiter single-node constraint (ADR-05 roadmap).

## 4. Verification evidence

- `vitest run`: 6 files / 52 tests green (stable across v8→v10).
- `.env.example`: no secret-shaped values; empty PIN/SECRET with production-required
  comments — matches ADR-10 §3.
- Tree clean, all work committed (uncommitted-risk flag stays retired).
- ADRs: 11 files (README + 0001–0010); 08/09/10 text-vs-code agreement verified —
  no spec drift outstanding (v8 PIN overclaim resolved by the `optional()` change).

## 5. What remains

1. **P2** — path-scope the `.gitleaks.toml` regex allowlist (§2). Only actionable
   code item left from ten passes.
2. Ritual: `tsc`/lint gate on the next change (no suspicion; last clean v9).
3. Direction: hardening complete. Next analyses should be feature-, reliability-,
   or performance-oriented (wallboard polling pressure on the gateway, Directus
   RLS evaluation, Deye historical-tier activation retiring the sinusoidal mock) —
   vulnerability-hunting passes have nothing left to find.

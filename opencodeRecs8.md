# DSM Skills-Based Analysis v8 (2026-10-05)

Eighth pass. Headline: **the v7 commit (`6367c7d`) contained more than v7 verified** —
plus a second ADR. Method: same skill set (security/backend/frontend/architecture/
testing/devops + threat-modeling, auth-implementation-patterns, hunt-idor, hunt-ssrf,
api-security, nextjs-best-practices, testing-patterns, ADR lifecycle). Evidence:
`git show 6367c7d` per-file review of everything v7 missed, working-tree grep,
full vitest (6 files / **52 tests, all pass** — up from 48), committed-tree
`requireAuthenticatedSession` reference count (19). Working tree is clean; all prior
uncommitted-risk is resolved. Prior files: opencodeRecs.md, 3/4/5/6/7.

## 1. Net delta vs v7: ADR-0009 implemented + v7 P1/P2 closed (with one caveat)

Commit `6367c7d "opencodeRecs7"` (878+/80-, 19 files) bundled: ADR-08 work (v7-verified),
recs files, **new ADR-0009 (cookie `__Host-` prefix + proxy TLS + secret hygiene)**,
and code v7 never reviewed (`auth/session` route, `middleware.ts`, extra `env.ts` /
`session.ts` / `auth/role` hunks, +4 tests). All reviewed this pass:

| Item | Implementation (verified) | Verdict |
|---|---|---|
| ADR-09 dual-cookie emission | `applySessionCookies` in `auth/role` (3 login paths deduplicated); `__Host-dsm_session` (Secure) + `dsm_session` when `x-forwarded-proto==='https' \|\| https: \|\| prod`; logout clears both (`auth/session` POST) | CLOSED |
| Host-first extraction choke point | `extractSessionToken()` (`session.ts`); middleware (3 gates) + `auth/session` GET migrated; **zero direct `cookies.get(SESSION_COOKIE_NAME)` reads remain** (repo grep clean) | CLOSED |
| Static secret defaults removed | `DEFAULT_SESSION_SECRET` / `DEFAULT_ADMIN_PIN` exports gone; per-boot random 32-byte hex via `crypto.getRandomValues` for non-prod; prod `superRefine` rejects known-dev set (`KNOWN_DEV_SESSION_SECRETS` incl. both historic values), `change_me*`, `dev_*`, len<32 | CLOSED |
| WEAK_PINS set | `8888/0000/1234/1111/123456` centralized; prod rejects | CLOSED |
| `.env.development` git-ignored | `check-ignore` confirms `.env*` rule hits; file exists on disk, untracked | CLOSED |
| v6 fix #6 (`__Host-` + proxy note) | ADR-09 + code; proxy MUST-strip-HTTP + `X-Forwarded-Proto` documented | CLOSED |
| 4 new tests (48→52) | `extractSessionToken` priority matrix (host > standard > undefined) | GREEN |

**Caveat (partial, not closed):** `ADMIN_ACCESS_PIN: z.string().default('8888')` —
the literal weak PIN survives as a zod default in `env.ts`. ADR-09 §3 claims
"local development credentials reside in git-ignored `.env.development`", but the
checkout-able `'8888'` default contradicts that for the PIN (the session secret got
the full dynamic treatment; the PIN did not). Prod `superRefine` still blocks it in
production, so severity is dev-hygiene, not prod-exposure — but the ADR text overclaims.

## 2. Route-auth matrix v8: 12/12 authenticated, single extraction path

No change to the v7 gate topology (all fleet reads 401 + scoping + limiters); this
pass confirms the *cookie layer beneath the gates* is now uniform: every
`verifySessionToken` call site feeds from `extractSessionToken()`. No split-brain
where middleware reads one cookie and the route another. Auth/session GET (the
frontend's role source-of-truth per nextjs-best-practices) also uses the helper —
server-first role derivation is now end-to-end consistent.

## 3. STRIDE v8 (rescored)

- **T-I1 IDOR — CLOSED (held).** No new read surface in commit; gates intact.
- **T-I2 injection — CLOSED (held).** Encoding + regexes intact in committed tree.
- **T-S1/T-T1/T-E1 SSRF — closed/low (held).** No new sinks.
- **T-E2 cookie-tossing / session integrity — CLOSED (new).** `__Host-` prefix
  (Secure, no Domain, Path=/) where HTTPS; host-first extraction; dual-clear logout.
  Residual: HTTP-only LAN deployments intentionally get the plain cookie (documented
  trade-off, correct per RFC 6265bis — browsers would reject `__Host-` over HTTP).
- **T-R1 weak defaults — DOWNGRADED to hygiene-note.** Session-secret half fully
  fixed (random per-boot, denylist in prod). PIN half open only as repo literal
 2877 (dev-only reachability; prod-blocked). One-line fix: drop the zod default,
  require explicit PIN (fail-fast in dev too) or read from `.env.development`.
- **T-D1 secrets-in-history — UNCHANGED, now the sole P0.** No rotation/purge
  evidence in this or any prior pass. Everything else is closed; this is the last
  High by elimination.
- **T-B1 rate-limit — held.** No changes; 429+Retry-After coverage from v7 intact.

## 4. Verification evidence

- `vitest run`: 6 files / 52 tests green (commit added 4 extraction tests; all pass).
- `tsc --noEmit`: clean in v7; cookie refactor touched only cookie plumbing with no
  type-shape changes (19 `requireAuthenticatedSession` refs intact, helpers exported
  cleanly). Re-run recommended post-merge as ritual, not from suspicion.
- Greps: `setRoleDirectly` zero hits (held); direct session-cookie reads zero hits
  (new); `__Host-` referenced in session/role/session-route/tests (consistent).

## 5. What remains (shortest list to date)

1. **P0 — Rotate + purge secrets (T-D1).** Last High. Rotate Deye secret, Directus
   token, session secret, admin PIN; purge history (filter-repo/BFG); add secret-scan
   to CI (open since v1 — now the only CI gap that matters).
2. **P1-hygiene — Remove `'8888'` zod default (T-R1 remainder).** One line:
   `ADMIN_ACCESS_PIN: z.string().optional()` + dev value living solely in ignored
   `.env.development`. Makes ADR-09 §3 true as written.
3. **P2 — `tsc`/lint ritual + secret-scan CI in the same PR as #1/#2**, then the
   hardening backlog is fully closed and the repo can move to feature work.
4. **Watch — viewer fleet visibility (ADR-08 §2), HTTP-LAN plain-cookie mode
   (ADR-09 trade-off).** Both policy, not defects.

## 6. ADRs (10)

ADR-01..08 carried (08 implementation matches spec, no drift). **ADR-09 Accepted**:
dual emission + host-first extraction + proxy TLS discipline + dynamic non-prod
secret. Code matches spec except the §3 overclaim on the PIN default (see §1
caveat) — either fix the line or amend the ADR; don't leave spec and code disagreeing.

## 7. Sprint order

1. P0 secrets (rotation + purge + CI scan) with P1 PIN-default removal in the same
   PR. 2. Ritual `tsc`/lint/test gate. 3. Close the hardening chapter; next recs
   pass should be feature/review-oriented, not vulnerability-driven — there is
   almost nothing left to find.

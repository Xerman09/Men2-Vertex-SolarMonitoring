# ADR-0001: HMAC-SHA256 Session Tokens with Web Crypto API

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/auth-implementation-patterns`, `security/threat-modeling`

## Context and Problem Statement

DSM requires stateless, tamper-proof user sessions across Next.js Edge Middleware and Node.js route handlers without heavy third-party dependencies (such as heavy JWT libraries that introduce CVE exposure or incompatible Node-only native dependencies in Edge runtimes). We also needed strict expiration, low latency, and zero dependency overhead.

## Decision Drivers

- Edge runtime compatibility (Next.js middleware).
- Zero third-party dependency vulnerabilities.
- Cryptographic timing-safe verification.
- Enforceable session TTL with fail-fast validation in production.

## Considered Options

1. **Third-party JWT library (`jsonwebtoken`, `jose`):** Provides standard JWT syntax, but adds package bloat and potential supply-chain vulnerability attack surface.
2. **Database session store:** Requires DB lookup on every request, creating bottleneck during high-frequency polling.
3. **Native HMAC-SHA256 tokens (`payload.signature`) via standard Web Crypto API (`crypto.subtle`):** Zero external dependencies, native Edge and Node support, sub-millisecond verification.

## Decision Outcome

Chosen option: **Option 3 (Native HMAC-SHA256 via Web Crypto API)**.

### Consequences

- **Good:**
  - Zero external dependencies; uses native `crypto.subtle.sign` and `crypto.subtle.verify`.
  - Fast verification on every request in both Edge Middleware and API routes.
  - Fail-fast production gate via Zod ensuring `SESSION_SECRET` is at least 32 random characters and not a default string.
  - Default TTL set to 12 hours with HTTP-only, Secure, and SameSite=Lax cookie flags.
- **Bad:**
  - Token revocation requires secret rotation or an explicit blocklist if instant revocation before 12-hour expiry is needed.

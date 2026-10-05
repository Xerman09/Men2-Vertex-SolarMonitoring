# ADR-0009: Cookie Host Prefix and Reverse Proxy TLS Discipline

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/auth-implementation-patterns`, `security/threat-modeling`, `architecture/architecture-decision-records`

## Context and Problem Statement

Stateless session cookies in multi-tenant or shared-domain solar hosting environments are vulnerable to cookie-tossing and subdomain spoofing if cookies lack origin binding. Under RFC 6265bis, the `__Host-` cookie prefix guarantees that a cookie:
1. Is accepted only over an encrypted HTTPS connection (`Secure`).
2. Cannot be overwritten or injected by parent or sibling subdomains (no `Domain` attribute).
3. Applies to the entire origin host (`Path=/`).

However, local development environments, IoT gateways on isolated LANs, and Docker containers often communicate over plaintext HTTP (`http://localhost:3000` or `http://192.168.1.50`). Modern web browsers will strictly reject any cookie bearing the `__Host-` prefix over unencrypted HTTP, breaking local developer workflows if enforced unconditionally. Furthermore, in production deployments behind reverse proxies (Nginx, Traefik, Cloudflare, Caddy), the application relies on the `X-Forwarded-Proto` header to determine transport security.

Additionally, previous iterations hardcoded fallback session secrets and PINs inside `env.ts`, leaving weak development defaults checkout-able in the repository.

## Decision Drivers

- Enforce RFC 6265bis `__Host-` prefixing whenever connections are secured via HTTPS or production proxy.
- Maintain zero-friction local development over plaintext HTTP without browser cookie rejections.
- Define explicit requirements for production reverse proxies regarding TLS termination and `X-Forwarded-Proto`.
- Eliminate hardcoded static secrets and weak defaults from `env.ts`, moving developer defaults to git-ignored `.env.development` and dynamic in-memory generation.

## Decision Outcome

Chosen option: **Dual Cookie Emission with Host-First Extraction & Dynamic Non-Production Fallback**.

### Policy Specification

1. **Dual Cookie Emission & Host-First Extraction:**
   - On login, the server evaluates connection security (`req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https:') || env.NODE_ENV === 'production'`).
   - Standard cookie `dsm_session` is emitted across all environments (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=43200`).
   - When connection security is verified, the enhanced `__Host-dsm_session` cookie is simultaneously set with `Secure: true`.
   - On logout, both cookie names are purged with `Max-Age=0`.
   - In Next.js Edge Middleware and API route handlers, cookie extraction is centralized via `extractSessionToken()`, which prioritizes `__Host-dsm_session` and falls back to `dsm_session`.
2. **Reverse Proxy TLS Discipline:**
   - Production deployments MUST sit behind a TLS-terminating reverse proxy or gateway.
   - The reverse proxy MUST strip unencrypted HTTP traffic (enforcing HTTP-to-HTTPS redirection).
   - The reverse proxy MUST correctly set `X-Forwarded-Proto: https` and `X-Forwarded-For`.
3. **Repository Secret Hygiene:**
   - Static strings for `DEFAULT_SESSION_SECRET` and `DEFAULT_ADMIN_PIN` are removed from `env.ts`.
   - Local development credentials reside in git-ignored `.env.development`.
   - In non-production environments where `SESSION_SECRET` is unset, `env.ts` dynamically generates a random 32-byte hex secret in memory per process boot.
   - In production, `superRefine` enforces that `SESSION_SECRET` is explicitly configured to a high-entropy string (>=32 characters) and rejects any known development or weak values.

### Consequences

- **Good:**
  - Hardens session integrity against subdomain hijacking and cookie-tossing attacks in production.
  - Preserves developer ergonomics on `http://localhost`.
  - Zero static secret defaults committed to git.
  - Single centralized extraction choke point `extractSessionToken()`.
- **Bad / Trade-offs:**
  - Production reverse proxies must be configured properly with `X-Forwarded-Proto` headers.

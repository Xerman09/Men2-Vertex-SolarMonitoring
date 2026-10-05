# ADR-0007: Directus Weak-Allowlist Self-Hosted Policy

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/hunt-ssrf`, `security/threat-modeling`, `architecture/architecture-decision-records`

## Context and Problem Statement

The Deye Solar Monitoring (DSM) architecture supports Directus as a headless CMS and relational persistence layer for fleet configuration, account metadata, and audit events. Development, staging, and air-gapped on-premise solar field deployments frequently host Directus locally via Docker containers or LAN addresses (e.g., `http://localhost:8056`, `http://192.168.1.100:8056`). 

Applying a hardcoded public-domain allowlist to Directus would break self-hosted local installations. However, allowing arbitrary URLs in production environments presents a Server-Side Request Forgery (SSRF) risk, where attackers or compromised credentials could induce requests to cloud metadata endpoints (e.g. `http://169.254.169.254/latest/meta-data/`) or internal network services.

## Decision Drivers

- Maintain zero-friction local development and on-premise Docker deployment without mandatory public domain DNS records.
- Protect production deployments against cloud instance metadata exfiltration and internal LAN pivot attacks.
- Prevent HTTP redirect chaining attacks (`redirect: 'error'`).
- Ensure all Directus outbound requests have bounded timeouts.

## Considered Options

1. **Strict Hardcoded Domain Allowlist for Directus:** Mirror the DeyeCloud approach, only permitting pre-registered public hostnames.
2. **Unrestricted URL Acceptance:** Allow any valid URL scheme and destination across all environments.
3. **Environment-Differentiated Validation Policy:** Permit local loopback and LAN endpoints in development/test while enforcing strict HTTPS, private IP blocking, and metadata defense in production.

## Decision Outcome

Chosen option: **Environment-Differentiated Validation Policy** implemented via `isValidDirectusBaseUrl(url, isProduction)` and `sanitizeDirectusBaseUrl(url, isProduction)`.

### Policy Specification

1. **Protocol Restrictions:**
   - Both development and production reject non-HTTP(S) schemes (e.g., `file://`, `gopher://`, `ftp://`).
   - Production strictly requires `https:`. Plaintext `http:` is rejected with fallback to `https://directus.internal`.
2. **Destination & IP Defense:**
   - In production, private IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), IPv6 loopback/ULA, and cloud instance metadata addresses (`169.254.169.254`) are strictly prohibited.
   - In development/test, local IPs and `localhost:8056` are allowed to support standard Docker Compose and local setups.
3. **Transport Discipline at Call-Sites:**
   - All Directus client calls (`fetchCollection`, `createItem`, `updateItem`, `deleteItem`) must enforce `redirect: 'error'` to prevent redirect-based filter evasion.
   - All outbound calls are bound with `AbortSignal.timeout(4000)` / `AbortSignal.timeout(5000)`.
4. **Single Choke Point:**
   - `sanitizeDirectusBaseUrl` serves as the centralized gate for Directus URLs before any outbound HTTP connection is instantiated.

### Consequences

- **Good:**
  - Developers and on-premise operators can spin up Directus on `localhost` or local subnets without extra DNS infrastructure.
  - Production deployments on cloud providers (AWS, GCP, Azure, Hetzner) are protected against metadata compromise and internal service probing.
  - Eliminates redirect bypass vectors via `redirect: 'error'`.
- **Bad / Trade-offs:**
  - Staging environments emulating production must configure HTTPS and avoid raw private IP configurations in `DIRECTUS_BASE_URL`.

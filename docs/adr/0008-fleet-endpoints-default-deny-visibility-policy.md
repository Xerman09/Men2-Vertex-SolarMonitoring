# ADR-0008: Fleet Endpoints Default-Deny Visibility Policy

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/threat-modeling`, `security/auth-implementation-patterns`, `security/hunt-idor`, `backend/api-security`, `architecture/architecture-decision-records`

## Context and Problem Statement

Prior iterations of the Deye Solar Monitoring (DSM) API permitted unauthenticated callers to query certain read-only telemetry endpoints (such as `GET /api/deye/history`, `GET /api/deye/aggregate`, `GET /api/deye/accounts`, and unconstrained fleet queries on `/api/deye/stations` and `/api/deye/plants`). While initial prototyping assumed telemetry could be surfaced freely on local kiosk or wallboard displays without user interaction, this created Broken Object Level Authorization (BOLA/IDOR - STRIDE T-I1) and unauthenticated data disclosure vulnerabilities. Unauthenticated external actors or unassigned tenants could enumerate fleet capacity, station locations, device serial numbers, and account configuration registries.

## Decision Drivers

- Enforce zero-trust default-deny across all telemetry and registry read routes.
- Prevent unauthenticated enumeration of solar gateway accounts, stations, plants, and historical energy generation.
- Enforce strict tenant isolation: consumers must never see telemetry or account registries belonging to other tenants.
- Provide structured read-side rate limiting with standard `Retry-After: 60` HTTP 429 responses to protect local gateway microcontrollers from herd polling.
- Define a clear, explicit path for kiosk or wallboard deployments without degrading default API boundary security.

## Considered Options

1. **Permissive Public Read Fallback:** Allow unauthenticated callers to read fleet-wide aggregate and history when no `accountId` is specified, but block account-specific queries.
2. **Strict Default-Deny with Role-Based Scoping:** Require a verified session token across all read endpoints (`history`, `aggregate`, `accounts`, `stations`, `plants`). Wallboards or kiosks must authenticate with dedicated viewer credentials or an explicit kiosk session.

## Decision Outcome

Chosen option: **Strict Default-Deny with Role-Based Scoping**.

### Policy Specification

1. **Authentication Gate:**
   - Every read endpoint (`/api/deye/history`, `/api/deye/aggregate`, `/api/deye/accounts`, `/api/deye/stations`, `/api/deye/plants`) requires an authenticated session (`requireAuthenticatedSession`). Unauthenticated callers receive `401 Unauthorized`.
2. **Tenant Scoping:**
   - **Consumer Role:** Strictly scoped to the consumer's assigned `session.accountId`. Consumers attempting to pass a different `accountId` receive `403 Forbidden`. Calls to `GET /api/deye/accounts` return only their assigned account and omit internal Directus database health metadata.
   - **Viewer Role:** Permitted to query unassigned fleet aggregate summaries and station overviews for facility monitoring, but prohibited from targeting private tenant hardware.
   - **Admin Role:** Unrestricted read and write access across all registered accounts and hardware.
3. **Read Rate Limiting:**
   - Read routes are guarded by sliding-window rate limiters (30–60 requests/minute per client IP) returning HTTP `429 Too Many Requests` with a `Retry-After: 60` response header.
4. **Public Kiosk Allowlist Policy:**
   - If public wall displays are required in isolated offline environments, they must be provisioned with a dedicated viewer session token or an explicit environment allowlist flag (`ALLOW_PUBLIC_FLEET_READS`), never through absence of authentication checks.

### Consequences

- **Good:**
  - Closes STRIDE T-I1 (IDOR and unauthenticated telemetry harvesting).
  - Eliminates route-to-route authentication drift via standardized `requireAuthenticatedSession`.
  - Rate limiting protects embedded gateway CPU and memory from unauthenticated polling herds.
- **Bad / Trade-offs:**
  - Unauthenticated frontend calls without an active session cookie will receive 401 until the user logs in.

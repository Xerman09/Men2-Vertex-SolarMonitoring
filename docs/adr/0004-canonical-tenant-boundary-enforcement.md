# ADR-0004: Canonical Tenant Boundary Enforcement (`enforceTenantAccess`)

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/hunt-idor`, `backend/api-security`

## Context and Problem Statement

Multi-tenant solar systems support multiple roles:
- `admin`: Fleet operations, registering gateways, full command dispatch.
- `consumer`: Customer or facility owner assigned to a specific solar station/account.
- `viewer`: Unauthenticated or read-only operator viewing public aggregate dashboards.

Previously, API routes accepted arbitrary `accountId` query/body parameters without validating whether the caller was authorized for that specific account, creating Insecure Direct Object Reference (IDOR) and Broken Object Level Authorization (BOLA) vulnerabilities.

## Decision Outcome

Created a canonical policy helper in `src/lib/session.ts`: `enforceTenantAccess(session, requestedAccountId)`:
1. **Admin:** Granted access to all requested accounts, or fleet default when omitted.
2. **Consumer:** Strictly pinned to their `session.accountId`. Attempts to specify another `accountId` return `403 Forbidden`. If `accountId` is omitted, the system automatically defaults to `session.accountId`. Consumers without an assigned station are denied access.
3. **Viewer / Unauthenticated:** Allowed only general unauthenticated overview; targeting specific tenant accounts returns `401 Unauthorized` or `403 Forbidden`.
4. **Hardware Control:** `POST /api/deye/control` enforces that only `admin` or authorized `consumer` can dispatch inverter mode changes, with `consumer` locked to their assigned account and validated with Zod schema.

### Consequences

- **Good:**
  - Complete elimination of cross-tenant telemetry inspection and hardware command dispatch.
  - Centralized logic prevents divergent, buggy ad-hoc checks across routes.
- **Bad:**
  - Route handlers must consistently invoke `enforceTenantAccess` before resolving clients.

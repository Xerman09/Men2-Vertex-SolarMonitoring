# ADR-0002: SSRF Defense, Redirect Error Handling, and Upstream Timeout Discipline

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/hunt-ssrf`, `backend/api-security`

## Context and Problem Statement

DSM communicates with external DeyeCloud OpenAPI gateways and a Directus backend service. Dynamically configured or user-submitted base URLs introduce Server-Side Request Forgery (SSRF) risks, including access to local networks (`127.0.0.1`, `192.168.*`) and cloud instance metadata endpoints (`169.254.169.254`). Furthermore, HTTP 301/302 redirects can be abused to bypass hostname checks, and lingering connections cause worker starvation.

## Decision Drivers

- Block access to internal private IP ranges, loopback addresses, and cloud metadata services.
- Prevent HTTP redirect chaining attacks (`redirect: 'error'`).
- Enforce strict abort timeouts on all outbound fetch calls.
- Require HTTPS in production environments.

## Decision Outcome

1. **DeyeCloud Gateways:**
   - Hostname allowlist strictly enforcing `api.deyecloud.com`, `eu1-developer.deyecloud.com`, `us1-developer.deyecloud.com`, `india-developer.deyecloud.com`, and `developer.deyecloud.com` over HTTPS.
   - Fallback sanitization defaults to `https://eu1-developer.deyecloud.com`.
   - `redirect: 'error'` configured on all `fetchWithAuth` calls.
   - `AbortSignal.timeout(8000)` on all upstream calls.

2. **Directus Service:**
   - Enforce HTTPS and prohibit private IP/metadata ranges in production (`isValidDirectusBaseUrl`).
   - `redirect: 'error'` set on all Directus requests (`fetchCollection`, `createItem`, `updateItem`).
   - `AbortSignal.timeout(4000)` / `(5000)` bounds Directus response times.

### Consequences

- **Good:**
  - Prevents external actors from pivoting to AWS/GCP/Azure instance metadata or internal microservices.
  - Fail-fast network timeouts prevent connection pile-ups.
- **Bad:**
  - Legitimate custom Deye regional subdomains must be added to the allowlist in `url-validator.ts`.

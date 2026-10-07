# ADR-0011: Single-Instance Gateway Constraint, Upstream Timeout Policy, and Account Boundary

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Engineering Team
- **Consulted Skills:** `architecture/adr-lifecycle`, `api-security`, `threat-modeling`

## Context and Problem Statement

Following the DSM security passes (v11/v12) and maintainability audits, three operational boundaries required architectural codification:
1. **Threat T-D1 (Distributed Rate-Limiting Bypass):** The rate limiter operates in-memory (`src/lib/rate-limit.ts`). Multi-instance clusters could theoretically bypass per-node quotas without shared state.
2. **Upstream Latency & Transient Drops:** Deye OpenAPI endpoints exhibit variable latency (2–12s) depending on regional cloud routing. Hardcoded 8s timeouts caused false dropouts to 0 kW readings.
3. **Accounts-GET Discovery Boundary:** Ambiguity existed regarding whether `viewer` roles should enumerate registered accounts or only see fleet totals.

## Decision Drivers

- Maintain zero external infrastructure requirements (no Redis/Upstash daemon) for edge/LAN solar gateway installations.
- Eliminate telemetry flapping caused by upstream cloud latency or cold caches.
- Provide clear default-deny boundaries across Admin, Viewer, and Consumer roles.

## Decision Outcome

### 1. Single-Instance Gateway Deployment Constraint (Formally Resolving T-D1)
- DSM is architected, constrained, and supported as a **single-instance LAN solar gateway** per physical site.
- Because a single Node.js runtime handles all inbound LAN traffic, the in-memory sliding-window store (`rateLimitStore` in `src/lib/rate-limit.ts`) with centralized configurations (`RATE_LIMIT_CONFIGS`) provides complete, airtight rate limiting against brute-force and DoS attempts.
- Multi-instance clustered deployments require sticky sessions or the Upstash Redis adapter specified in ADR-0005.

### 2. Deye OpenAPI Timeout and Stale-Cache Policy
- Configurable request timeout via `DEYE_API_TIMEOUT_MS` (validated in `src/lib/env.ts` with range 3,000–60,000 ms, default 15,000 ms).
- Typed `TimeoutError` / code-23 catch branches log latency diagnostics without crashing.
- **60-Second Stale-While-Revalidate Guard:** In `src/lib/deye-client.ts`, cached station summaries and batch device telemetry are retained for up to 60 seconds if an upstream request times out or returns transient zero data while previously live readings exist.

### 3. Accounts-GET Access Boundary (Clarifying ADR-0008)
- **Admin Role:** Full read and write/mutation privileges (POST/PUT/DELETE) over the account registry and Directus storage.
- **Viewer Role:** Read-only access to the list of registered accounts in `/api/deye/accounts` GET. This is **by-design** to allow operators to see multi-inverter statuses across site arrays without granting credential editing or mutation permissions.
- **Consumer Role:** Strictly scoped; the registry response filters out all other accounts and only returns the single account matching `session.accountId`.

### Consequences

- **Good:**
  - Zero external database or cache dependencies required for rate limiting.
  - Telemetry curves remain smooth and resilient during DeyeCloud API latency spikes.
  - Consistent tenant scoping across all 12 API routes.
- **Bad:**
  - Clustered deployments must not be run without sticky sessions or distributed Redis state.

# Architecture Decision Records (ADRs)

This directory contains records of significant architectural and security design decisions made for the **Deye Solar Monitoring (DSM)** system, formatted using the MADR (Markdown Architectural Decision Records) structure.

## Index of Decisions

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](./0001-hmac-sha256-session-tokens.md) | HMAC-SHA256 Session Tokens with Web Crypto API | Accepted | 2026-10-05 |
| [ADR-0002](./0002-ssrf-allowlist-and-timeout-discipline.md) | SSRF Defense, Redirect Error Handling, and Upstream Timeout Discipline | Accepted | 2026-10-05 |
| [ADR-0003](./0003-honest-telemetry-data-contract.md) | Honest Telemetry Data Contracts and Model-Driven Simulation Flags | Accepted | 2026-10-05 |
| [ADR-0004](./0004-canonical-tenant-boundary-enforcement.md) | Canonical Tenant Boundary Enforcement (`enforceTenantAccess`) | Accepted | 2026-10-05 |
| [ADR-0005](./0005-rate-limiting-and-upstash-roadmap.md) | Sliding-Window Rate Limiting and Upstash Redis Roadmap | Accepted | 2026-10-05 |
| [ADR-0006](./0006-dual-persistence-and-atomic-storage.md) | Dual Directus Relational Persistence with Atomic File Cache Fallback | Accepted | 2026-10-05 |
| [ADR-0007](./0007-directus-weak-allowlist-self-hosted-policy.md) | Directus Weak-Allowlist Self-Hosted Policy | Accepted | 2026-10-05 |
| [ADR-0008](./0008-fleet-endpoints-default-deny-visibility-policy.md) | Fleet Endpoints Default-Deny Visibility Policy | Accepted | 2026-10-05 |
| [ADR-0009](./0009-cookie-host-prefix-and-proxy-tls-discipline.md) | Cookie Host Prefix and Reverse Proxy TLS Discipline | Accepted | 2026-10-05 |
| [ADR-0010](./0010-secret-lifecycle-and-credential-boundary-policy.md) | Secret Lifecycle, Environment Segregation, and Historic Credential Invalidation Policy | Accepted | 2026-10-05 |
| [ADR-0011](./0011-single-instance-gateway-and-deye-timeout-policy.md) | Single-Instance Gateway Constraint, Upstream Timeout Policy, and Account Boundary | Accepted | 2026-10-06 |


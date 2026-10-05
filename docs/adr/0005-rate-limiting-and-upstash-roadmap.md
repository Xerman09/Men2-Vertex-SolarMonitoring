# ADR-0005: Sliding-Window Rate Limiting and Upstash Redis Roadmap

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `backend/upstash-ratelimit`, `backend/api-security`

## Context and Problem Statement

Authentication endpoints (`/api/auth/role`), hardware inverter control (`/api/deye/control`), and gateway account registration (`/api/deye/accounts`) represent sensitive surfaces vulnerable to brute-force credential stuffing, relay-switch thrashing, and DoS.

## Decision Drivers

- Immediate protection without mandatory external infrastructure.
- Zero event-loop starvation or process leaks on serverless/container runtimes.
- Clear migration path to distributed rate limiting (Upstash Redis) for multi-node deployments.

## Decision Outcome

1. **Current In-Memory Sliding Window (`src/lib/rate-limit.ts`):**
   - High-performance `Map<string, RateLimitRecord>` tracking sliding request windows.
   - Periodic cleanup timer calls `timer.unref?.()` to avoid keeping Node.js event loops open on serverless environments.
   - Wired thresholds:
     - Authentication: 10 attempts / minute per IP.
     - Inverter Control: 5 commands / minute per user/IP.
     - Account Mutations: 20 requests / minute per admin.
2. **Upstash Redis Roadmap:**
   - For multi-instance horizontal scaling, deploy `@upstash/ratelimit` backed by Redis using the same key schema (`<endpoint>_<ip>_<userId>`).

### Consequences

- **Good:**
  - Instantly protects single-instance and developer environments out of the box with zero setup.
  - Returns standard HTTP 429 Too Many Requests with `Retry-After: 60` headers.
- **Bad:**
  - In-memory store does not share counts across multiple clustered nodes until Upstash Redis is connected.

# ADR-0010: Secret Lifecycle, Environment Segregation, and Historic Credential Invalidation Policy

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Engineering Team
- **Consulted Skills:** `security/threat-modeling`, `security/auth-implementation-patterns`, `architecture/architecture-decision-records`

## Context and Problem Statement

During early proof-of-concept development, synthetic fallback values (such as master admin PIN `8888`, static session secret string `deye_solar_monitoring_session_secret_2026_default`, and local Docker Directus tokens) were committed to source control to facilitate single-click developer onboarding. In threat model STRIDE T-D1, committed credentials in git history pose a risk if developers or operators inadvertently reuse them in live field environments.

## Decision Drivers

- Formally invalidate and disallow all historic repository credentials from production and staging environments.
- Define a clear, enforceable boundary between local developer convenience and production secret management.
- Ensure automated CI gates enforce secret detection on all future code changes.
- Establish an auditable credential rotation protocol for production solar gateway deployments.

## Decision Outcome

Chosen option: **Formal Invalidation & Active Production Denylisting with Automated CI Gitleaks Enforcement**.

### Policy Specification

1. **Historic Credential Invalidation:**
   - All credentials, tokens, PINs, and secret strings present in git commit history or `.env.example` are formally designated as **untrusted, compromised synthetic fixtures**.
   - These values MUST NEVER be provisioned or accepted in production, staging, or customer solar station environments.
2. **Runtime Code Defense (`superRefine`):**
   - The production startup validator in `src/lib/env.ts` maintains an active denylist (`KNOWN_DEV_SESSION_SECRETS`, `WEAK_PINS`) and rejects any deployment attempting to initialize with historic repository strings, `change_me*` values, or PINs in `[8888, 0000, 1234, 1111, 123456]`.
   - Production startup immediately aborts (`fail-fast`) if `SESSION_SECRET` has fewer than 32 characters or if `ADMIN_ACCESS_PIN` is missing or trivial.
3. **Environment Segregation:**
   - Local development credentials reside solely in git-ignored `.env.development` or `.env.local`.
   - In non-production environments where `SESSION_SECRET` is omitted, the engine dynamically generates a unique in-memory 32-byte cryptographic random hex secret per boot, ensuring zero static secrets are stored in code.
   - Production secrets MUST be provisioned out-of-band via encrypted secret stores (e.g. AWS Secrets Manager, Doppler, HashiCorp Vault, or deployment environment variables).
4. **CI Secret Scanning:**
   - CI executes automated Gitleaks secret scanning on every pull request and push to protected branches using repository profile `.gitleaks.toml`.
   - Test fixture paths, mock examples, and historical synthetic markers are explicitly cataloged in `.gitleaks.toml` allowlists.

### Consequences

- **Good:**
  - Closes STRIDE T-D1 by formally invalidating historical sandbox tokens and actively blocking them at application runtime.
  - Zero hardcoded static secrets remain in repository source files (`src/`).
  - Gitleaks CI scanning prevents new secrets from entering the codebase, with conjunctive path-scoped allowlists eliminating scanner blind spots.
- **Bad / Trade-offs:**
  - Production deployments require explicit environment variable configuration before container boot.

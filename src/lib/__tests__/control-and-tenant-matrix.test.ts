import { describe, it, expect, vi } from 'vitest';
import {
  enforceTenantAccess,
  SessionData,
  DEFAULT_SESSION_TTL_SECONDS,
  requireAuthenticatedSession,
  HOST_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  extractSessionToken,
  ACCOUNT_ID_REGEX,
} from '../session';
import { checkRateLimit, ONE_MINUTE_MS } from '../rate-limit';
import { accountManager } from '../account-manager';
import { z } from 'zod';

// Factories per testing-patterns skill
export function getMockSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: 101,
    email: 'engineer@solarsite.local',
    name: 'Solar Operator',
    role: 'consumer',
    accountId: 'station-alpha',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

export function getMockControlBody(overrides: Record<string, unknown> = {}) {
  return {
    deviceSn: '2209X891104',
    mode: 'BATTERY_FIRST',
    gridCharge: true,
    accountId: 'station-alpha',
    ...overrides,
  };
}

import { controlBodySchema } from '../../app/api/deye/control/route';

describe('Control Command Body Schema Validation', () => {
  it('accepts valid control payload', () => {
    const body = getMockControlBody();
    const result = controlBodySchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('BATTERY_FIRST');
      expect(result.data.gridCharge).toBe(true);
      expect(result.data.deviceSn).toBe('2209X891104');
    }
  });

  it('rejects invalid work mode enums (400 validation error)', () => {
    const invalidBody = getMockControlBody({ mode: 'TURBO_MAX_OVERCHARGE' });
    const result = controlBodySchema.safeParse(invalidBody);
    expect(result.success).toBe(false);
  });

  it('rejects malformed device serial numbers', () => {
    // Too short (< 6 chars)
    expect(controlBodySchema.safeParse(getMockControlBody({ deviceSn: '123' })).success).toBe(false);
    // Invalid characters (spaces, special characters, command injection attempts)
    expect(controlBodySchema.safeParse(getMockControlBody({ deviceSn: '2209X; rm -rf /' })).success).toBe(false);
    expect(controlBodySchema.safeParse(getMockControlBody({ deviceSn: 'SN<script>' })).success).toBe(false);
  });

  it('validates accountId strictly when provided', () => {
    // Valid alphanumeric with hyphens and underscores
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: 'station-alpha' })).success).toBe(true);
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: 'site_42' })).success).toBe(true);
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: 'Station101' })).success).toBe(true);

    // Invalid accountId: special characters, spaces, directory traversal, empty string
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: 'station alpha' })).success).toBe(false);
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: 'station; rm -rf /' })).success).toBe(false);
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: '<script>' })).success).toBe(false);
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: '../../etc/passwd' })).success).toBe(false);
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: '' })).success).toBe(false);
    // Over max length (64 chars)
    expect(controlBodySchema.safeParse(getMockControlBody({ accountId: 'a'.repeat(65) })).success).toBe(false);
  });

  it('defaults gridCharge to false when omitted', () => {
    const body = { mode: 'PEAK_SHAVING' };
    const result = controlBodySchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gridCharge).toBe(false);
    }
  });
});

describe('Two-Account Replay & Tenant Isolation Matrix (hunt-idor)', () => {
  const userA = getMockSession({
    userId: 1,
    email: 'user-a@tenant.com',
    role: 'consumer',
    accountId: 'account-tenant-a',
  });

  const userB = getMockSession({
    userId: 2,
    email: 'user-b@tenant.com',
    role: 'consumer',
    accountId: 'account-tenant-b',
  });

  const unassignedConsumer = getMockSession({
    userId: 3,
    email: 'no-station@tenant.com',
    role: 'consumer',
    accountId: undefined,
  });

  const admin = getMockSession({
    userId: 99,
    email: 'fleet-admin@solar.com',
    role: 'admin',
    accountId: undefined,
  });

  it('blocks User B from querying User A telemetry (returns 403 Forbidden)', () => {
    const check = enforceTenantAccess(userB, 'account-tenant-a');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe(403);
  });

  it('allows User A to query User A telemetry (returns allowed: true)', () => {
    const check = enforceTenantAccess(userA, 'account-tenant-a');
    expect(check.allowed).toBe(true);
    expect(check.targetAccountId).toBe('account-tenant-a');
  });

  it('locks User A to account-tenant-a even if no accountId is passed', () => {
    const check = enforceTenantAccess(userA, undefined);
    expect(check.allowed).toBe(true);
    expect(check.targetAccountId).toBe('account-tenant-a');
  });

  it('scopes User A to account-tenant-a when querying ALL', () => {
    const check = enforceTenantAccess(userA, 'ALL');
    expect(check.allowed).toBe(true);
    expect(check.targetAccountId).toBe('account-tenant-a');
  });

  it('allows User A to query using station prefix alias', () => {
    const check = enforceTenantAccess(userA, 'station-account-tenant-a');
    expect(check.allowed).toBe(true);
    expect(check.targetAccountId).toBe('account-tenant-a');
  });

  it('blocks unassigned consumer with no accountId from accessing hardware', () => {
    const check = enforceTenantAccess(unassignedConsumer, 'account-tenant-a');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe(403);
  });

  it('allows admin unrestricted access across all tenants', () => {
    const checkA = enforceTenantAccess(admin, 'account-tenant-a');
    expect(checkA.allowed).toBe(true);
    expect(checkA.targetAccountId).toBe('account-tenant-a');

    const checkB = enforceTenantAccess(admin, 'account-tenant-b');
    expect(checkB.allowed).toBe(true);
    expect(checkB.targetAccountId).toBe('account-tenant-b');
  });

  const viewer = getMockSession({
    userId: 4,
    email: 'guest-viewer@solar.com',
    role: 'viewer',
    accountId: undefined,
  });

  it('blocks unauthenticated visitors from querying specific tenant accounts', () => {
    const check = enforceTenantAccess(null, 'account-tenant-a');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe(401);
  });

  it('allows unauthenticated visitors to view unassigned fleet overview', () => {
    const check = enforceTenantAccess(null, undefined);
    expect(check.allowed).toBe(true);
    expect(check.targetAccountId).toBeUndefined();
  });

  it('blocks viewer from targeting specific tenant accounts (403 Forbidden)', () => {
    const check = enforceTenantAccess(viewer, 'account-tenant-a');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe(403);
    expect(check.error).toContain('Viewer role cannot query account-specific telemetry');
  });

  it('allows viewer to view unassigned fleet overview', () => {
    const check = enforceTenantAccess(viewer, undefined);
    expect(check.allowed).toBe(true);
    expect(check.targetAccountId).toBeUndefined();
  });
});

describe('Rate Limiter Contract & 429 Retry-After Headers', () => {
  it('enforces 429 response structure with Retry-After header on threshold exhaustion', () => {
    const key = 'test-mutation-ip-user-123';
    // Consume 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(key, 5, ONE_MINUTE_MS);
      expect(res.success).toBe(true);
    }

    // 6th request triggers rate limit block
    const blocked = checkRateLimit(key, 5, ONE_MINUTE_MS);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);

    // Simulate route handler 429 synthesis
    const retryAfterSeconds = Math.ceil(Math.max(1, (blocked.resetAt - Date.now()) / 1000));
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});

describe('Session TTL & Cookie Hardening Regression', () => {
  it('enforces normalized 12-hour session TTL across all auth paths (eliminating 7-day legacy drift)', () => {
    // 12 hours in seconds = 43200
    expect(DEFAULT_SESSION_TTL_SECONDS).toBe(12 * 3600);
    expect(DEFAULT_SESSION_TTL_SECONDS).toBe(43200);
    // Regression check: must NOT be 7 days (604800s)
    expect(DEFAULT_SESSION_TTL_SECONDS).not.toBe(7 * 24 * 3600);
  });
});

describe('Directus Client Transport Discipline & Parameter Encoding (X3/X4)', () => {
  it('enforces redirect: "error" on deleteItem to block SSRF redirect-chaining', async () => {
    const originalFetch = global.fetch;
    let interceptedInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      interceptedInit = init;
      return new Response(null, { status: 204 });
    });

    try {
      const result = await accountManager.deleteItem('solar_accounts', 'acc-test-999');
      expect(result).toBe(true);
      expect(interceptedInit).toBeDefined();
      expect(interceptedInit?.redirect).toBe('error');
      expect(interceptedInit?.method).toBe('DELETE');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('safely encodes collection and id parameters in Directus requests to prevent path injection', async () => {
    const originalFetch = global.fetch;
    const requestedUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrls.push(url);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    try {
      // 1. fetchCollection with special characters in collection
      await accountManager.fetchCollection('solar/accounts', '?limit=10');
      expect(requestedUrls[0]).toContain('/items/solar%2Faccounts?limit=10');

      // 2. updateItem with special characters in collection and id
      await accountManager.updateItem('solar/accounts', 'id/with/slashes', { enabled: true });
      expect(requestedUrls[1]).toContain('/items/solar%2Faccounts/id%2Fwith%2Fslashes');

      // 3. deleteItem with special characters in collection and id
      await accountManager.deleteItem('solar/accounts', 'id#hash?query=1');
      expect(requestedUrls[2]).toContain('/items/solar%2Faccounts/id%23hash%3Fquery%3D1');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('ADR-08 Fleet Endpoints Default-Deny & Session Requirement', () => {
  const admin = getMockSession({ role: 'admin' });
  const viewer = getMockSession({ role: 'viewer' });
  const consumer = getMockSession({ role: 'consumer', accountId: 'acc-1' });

  it('rejects unauthenticated callers with 401 Unauthorized', () => {
    const check = requireAuthenticatedSession(null);
    expect(check.allowed).toBe(false);
    expect(check.status).toBe(401);
    expect(check.error).toContain('Authentication required');
  });

  it('allows authenticated callers when no specific role is mandated', () => {
    expect(requireAuthenticatedSession(admin).allowed).toBe(true);
    expect(requireAuthenticatedSession(viewer).allowed).toBe(true);
    expect(requireAuthenticatedSession(consumer).allowed).toBe(true);
  });

  it('strictly restricts admin-only actions to admin sessions', () => {
    expect(requireAuthenticatedSession(admin, 'admin').allowed).toBe(true);
    const viewerCheck = requireAuthenticatedSession(viewer, 'admin');
    expect(viewerCheck.allowed).toBe(false);
    expect(viewerCheck.status).toBe(403);

    const consumerCheck = requireAuthenticatedSession(consumer, 'admin');
    expect(consumerCheck.allowed).toBe(false);
    expect(consumerCheck.status).toBe(403);
  });

  it('validates account ID regex for mutation safety', () => {
    // Tests shared ACCOUNT_ID_REGEX exported from session.ts
    expect(ACCOUNT_ID_REGEX.test('station-01')).toBe(true);
    expect(ACCOUNT_ID_REGEX.test('account_alpha_99')).toBe(true);
    expect(ACCOUNT_ID_REGEX.test('Acc123')).toBe(true);

    // Rejection of path injection and control characters
    expect(ACCOUNT_ID_REGEX.test('../../etc/passwd')).toBe(false);
    expect(ACCOUNT_ID_REGEX.test('station;rm -rf /')).toBe(false);
    expect(ACCOUNT_ID_REGEX.test('station<script>')).toBe(false);
    expect(ACCOUNT_ID_REGEX.test('station name')).toBe(false);
    expect(ACCOUNT_ID_REGEX.test('')).toBe(false);
  });
});

describe('ADR-0009 Cookie Host Prefix & Extraction Discipline', () => {
  it('extracts session token from standard cookie name', () => {
    const mockCookieStore = {
      get: (name: string) => (name === SESSION_COOKIE_NAME ? { value: 'token-standard' } : undefined),
    };
    expect(extractSessionToken(mockCookieStore)).toBe('token-standard');
  });

  it('extracts session token from __Host- prefixed cookie when present', () => {
    const mockCookieStore = {
      get: (name: string) => (name === HOST_SESSION_COOKIE_NAME ? { value: 'token-host' } : undefined),
    };
    expect(extractSessionToken(mockCookieStore)).toBe('token-host');
  });

  it('prioritizes __Host- cookie over standard cookie if both are delivered', () => {
    const mockCookieStore = {
      get: (name: string) => {
        if (name === HOST_SESSION_COOKIE_NAME) return { value: 'token-host-priority' };
        if (name === SESSION_COOKIE_NAME) return { value: 'token-standard-shadowed' };
        return undefined;
      },
    };
    expect(extractSessionToken(mockCookieStore)).toBe('token-host-priority');
  });

  it('returns undefined if neither session cookie is present', () => {
    const mockCookieStore = {
      get: () => undefined,
    };
    expect(extractSessionToken(mockCookieStore)).toBeUndefined();
  });
});




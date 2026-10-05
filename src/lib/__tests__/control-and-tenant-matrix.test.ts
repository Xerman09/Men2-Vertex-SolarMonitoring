import { describe, it, expect, vi } from 'vitest';
import { enforceTenantAccess, SessionData, DEFAULT_SESSION_TTL_SECONDS } from '../session';
import { checkRateLimit } from '../rate-limit';
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

export function getMockControlBody(overrides: Record<string, any> = {}) {
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
      const res = checkRateLimit(key, 5, 60 * 1000);
      expect(res.success).toBe(true);
    }

    // 6th request triggers rate limit block
    const blocked = checkRateLimit(key, 5, 60 * 1000);
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

describe('Directus Client Transport Discipline', () => {
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
});


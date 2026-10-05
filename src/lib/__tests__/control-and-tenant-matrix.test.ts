import { describe, it, expect } from 'vitest';
import { enforceTenantAccess, SessionData } from '../session';
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

const VALID_WORK_MODES = [
  'PEAK_SHAVING',
  'BATTERY_FIRST',
  'LOAD_FIRST',
  'SELLING_FIRST',
  'ZERO_EXPORT_TO_LOAD',
  'ZERO_EXPORT_TO_CT',
] as const;

const controlBodySchema = z.object({
  deviceSn: z
    .string()
    .regex(/^[A-Za-z0-9_-]{6,32}$/, 'Invalid device serial number format')
    .optional(),
  mode: z.enum(VALID_WORK_MODES, {
    message: `Invalid work mode. Allowed modes: ${VALID_WORK_MODES.join(', ')}`,
  }),
  gridCharge: z.boolean().default(false),
  accountId: z.string().optional(),
});

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

  it('blocks unauthenticated visitors from querying specific tenant accounts', () => {
    const check = enforceTenantAccess(null, 'account-tenant-a');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe(401);
  });
});

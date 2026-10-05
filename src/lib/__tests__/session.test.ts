import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken, enforceTenantAccess } from '../session';

describe('Session Token HMAC-SHA256', () => {
  it('creates and verifies a valid session token', async () => {
    const token = await createSessionToken({
      userId: 42,
      email: 'engineer@example.com',
      name: 'Test Engineer',
      role: 'consumer',
      accountId: 'acc-123',
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(2);

    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(42);
    expect(session?.email).toBe('engineer@example.com');
    expect(session?.role).toBe('consumer');
    expect(session?.accountId).toBe('acc-123');
    expect(session?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects tampered payload or signature', async () => {
    const token = await createSessionToken({
      userId: 1,
      email: 'user@example.com',
      role: 'viewer',
    });

    const [payload, signature] = token.split('.');
    
    // Tamper with payload (elevate role to admin)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ userId: 1, email: 'user@example.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');

    const tamperedToken = `${tamperedPayload}.${signature}`;
    const result = await verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it('rejects expired tokens', async () => {
    // Generate token with negative expiration (-10 seconds)
    const token = await createSessionToken(
      {
        userId: 99,
        email: 'expired@example.com',
        role: 'consumer',
      },
      -10
    );

    const session = await verifySessionToken(token);
    expect(session).toBeNull();
  });

  it('returns null for null, empty or malformed tokens', async () => {
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken('')).toBeNull();
    expect(await verifySessionToken('invalid-token')).toBeNull();
    expect(await verifySessionToken('part1.part2.part3')).toBeNull();
  });
});

describe('enforceTenantAccess', () => {
  const adminSession = {
    userId: 1,
    email: 'admin@solar.local',
    role: 'admin' as const,
    exp: 9999999999,
  };

  const consumerSession = {
    userId: 2,
    email: 'user@tenant.local',
    role: 'consumer' as const,
    accountId: 'tenant-station-A',
    exp: 9999999999,
  };

  const unassignedConsumerSession = {
    userId: 3,
    email: 'no-station@tenant.local',
    role: 'consumer' as const,
    exp: 9999999999,
  };

  it('allows admin to access any or no accountId', () => {
    const res1 = enforceTenantAccess(adminSession, 'station-xyz');
    expect(res1.allowed).toBe(true);
    expect(res1.targetAccountId).toBe('station-xyz');

    const res2 = enforceTenantAccess(adminSession);
    expect(res2.allowed).toBe(true);
    expect(res2.targetAccountId).toBeUndefined();
  });

  it('restricts consumer to their assigned accountId', () => {
    // Matching account
    const resMatch = enforceTenantAccess(consumerSession, 'tenant-station-A');
    expect(resMatch.allowed).toBe(true);
    expect(resMatch.targetAccountId).toBe('tenant-station-A');

    // Default when no accountId provided in query
    const resDefault = enforceTenantAccess(consumerSession, undefined);
    expect(resDefault.allowed).toBe(true);
    expect(resDefault.targetAccountId).toBe('tenant-station-A');

    // Mismatched account
    const resMismatch = enforceTenantAccess(consumerSession, 'other-station-B');
    expect(resMismatch.allowed).toBe(false);
    expect(resMismatch.status).toBe(403);
  });

  it('blocks consumer with no assigned accountId from accessing hardware', () => {
    const res = enforceTenantAccess(unassignedConsumerSession, 'some-station');
    expect(res.allowed).toBe(false);
    expect(res.status).toBe(403);
  });

  it('blocks unauthenticated visitors from querying specific accounts', () => {
    const res1 = enforceTenantAccess(null, 'private-account-123');
    expect(res1.allowed).toBe(false);
    expect(res1.status).toBe(401);

    const res2 = enforceTenantAccess(null, undefined);
    expect(res2.allowed).toBe(true);
    expect(res2.targetAccountId).toBeUndefined();
  });
});

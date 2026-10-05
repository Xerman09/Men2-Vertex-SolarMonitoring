import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth-crypto';
import { createSessionToken, verifySessionToken } from '../session';

describe('Auth Crypto & Session', () => {
  it('hashes and verifies passwords correctly with scrypt', () => {
    const raw = 'SolarSecure2026!';
    const hashed = hashPassword(raw);
    expect(hashed.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword(raw, hashed)).toBe(true);
    expect(verifyPassword('WrongPass', hashed)).toBe(false);
  });

  it('verifies legacy plaintext passwords with timingSafeEqual fallback', () => {
    const plain = 'legacyPass123';
    expect(verifyPassword('legacyPass123', plain)).toBe(true);
    expect(verifyPassword('wrong', plain)).toBe(false);
  });

  it('creates and verifies session tokens', async () => {
    const session = await createSessionToken({
      userId: 'user-1',
      email: 'admin@solar.local',
      role: 'admin',
    });

    expect(session).toBeDefined();
    const verified = await verifySessionToken(session);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe('admin@solar.local');
    expect(verified?.role).toBe('admin');
  });

  it('rejects tampered session tokens', async () => {
    const session = await createSessionToken({
      userId: 'user-1',
      email: 'admin@solar.local',
      role: 'admin',
    });

    const tampered = session.slice(0, -4) + 'abcd';
    const verified = await verifySessionToken(tampered);
    expect(verified).toBeNull();
  });
});

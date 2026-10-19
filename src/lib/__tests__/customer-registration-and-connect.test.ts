import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSchema } from '../../app/api/auth/register/route';
import { connectAccountSchema } from '../../app/api/deye/accounts/connect/route';
import { createSessionToken, verifySessionToken, applySessionCookies, enforceTenantAccess } from '../session';
import { hashPassword, verifyPassword } from '../auth-crypto';
import { isValidDeyeBaseUrl } from '../url-validator';

describe('Model 3: Customer Direct Registration & DeyeCloud Account Link', () => {
  describe('Customer Self-Service Registration Schema (registerSchema)', () => {
    it('accepts valid registration payload with email, password, and full name', () => {
      const payload = {
        email: 'customer@solarhome.com',
        password: 'SecurePassword123!',
        fullName: 'Jane Solar Customer',
      };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('customer@solarhome.com');
        expect(result.data.password).toBe('SecurePassword123!');
        expect(result.data.fullName).toBe('Jane Solar Customer');
      }
    });

    it('rejects registration with invalid email format', () => {
      const payload = {
        email: 'not-an-email',
        password: 'ValidPassword123!',
      };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects passwords shorter than 6 characters', () => {
      const payload = {
        email: 'user@example.com',
        password: '12345',
      };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.password).toBeDefined();
      }
    });

    it('trims leading and trailing whitespace from input fields', () => {
      const payload = {
        email: '  operator@test.com  ',
        password: 'myPassword123',
        fullName: '  Acme Solar Operator  ',
      };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('operator@test.com');
        expect(result.data.fullName).toBe('Acme Solar Operator');
      }
    });
  });

  describe('DeyeCloud Account Connection Schema (connectAccountSchema)', () => {
    it('accepts valid credentials including OpenAPI App ID, Secret, email, and password', () => {
      const payload = {
        name: 'Rooftop 10kW Array',
        appId: '2024091800112233',
        appSecret: '9876543210abcdef',
        email: 'deye.developer@plant.com',
        password: 'DeyeSecretPassword1!',
        baseUrl: 'https://api.deyecloud.com',
      };
      const result = connectAccountSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects connect request when required appId or appSecret is missing', () => {
      expect(
        connectAccountSchema.safeParse({
          email: 'deye@test.com',
          password: 'pass',
        }).success
      ).toBe(false);

      expect(
        connectAccountSchema.safeParse({
          appId: '123',
          email: 'deye@test.com',
          password: 'pass',
        }).success
      ).toBe(false);
    });

    it('enforces SSRF protection on DeyeCloud base URL', () => {
      expect(isValidDeyeBaseUrl('https://api.deyecloud.com')).toBe(true);
      expect(isValidDeyeBaseUrl('https://api-eu.deyecloud.com')).toBe(true);
      expect(isValidDeyeBaseUrl('http://api.deyecloud.com')).toBe(false); // Insecure HTTP rejected
      expect(isValidDeyeBaseUrl('https://evil-attacker.com')).toBe(false);
      expect(isValidDeyeBaseUrl('http://169.254.169.254/latest/meta-data')).toBe(false); // Cloud metadata rejected
      expect(isValidDeyeBaseUrl('http://127.0.0.1:8055')).toBe(false); // Internal SSRF rejected
    });
  });

  describe('Customer Session Generation and Password Hashing', () => {
    it('correctly hashes customer password with scrypt and verifies', () => {
      const rawPassword = 'MySecretSolarPassword2026!';
      const hash = hashPassword(rawPassword);

      expect(hash.startsWith('scrypt$')).toBe(true);
      const parts = hash.split('$');
      expect(parts.length).toBe(3);
      expect(parts[1].length).toBeGreaterThanOrEqual(16);
      expect(parts[2].length).toBeGreaterThanOrEqual(32);

      expect(verifyPassword(rawPassword, hash)).toBe(true);
      expect(verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('issues a consumer session token and validates customer role', async () => {
      const customerSession = await createSessionToken({
        userId: 'cust-42',
        email: 'jane@solar.com',
        name: 'Jane Customer',
        role: 'consumer',
        accountId: 'acc-deye-cust-42',
      });

      expect(typeof customerSession).toBe('string');
      const verified = await verifySessionToken(customerSession);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe('cust-42');
      expect(verified?.role).toBe('consumer');
      expect(verified?.accountId).toBe('acc-deye-cust-42');
      expect(verified?.email).toBe('jane@solar.com');
    });

    it('applies session cookies correctly with secure parameters', () => {
      const setMock = vi.fn();
      const mockResponse = {
        cookies: {
          set: setMock,
        },
      };

      const token = 'sample.payload.signature';
      applySessionCookies(mockResponse, token);

      expect(setMock).toHaveBeenCalled();
      const call = setMock.mock.calls[0][0];
      expect(call.name).toBe('dsm_session');
      expect(call.value).toBe(token);
      expect(call.httpOnly).toBe(true);
      expect(call.sameSite).toBe('lax');
    });
  });

  describe('Tenant Boundary Isolation for Customer', () => {
    it('allows customer access strictly to their assigned account and rejects other accounts', () => {
      const customerSession = {
        userId: 'cust-10',
        email: 'customer@solar.com',
        name: 'Customer 10',
        role: 'consumer' as const,
        accountId: 'acc-cust-10',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Querying own account
      const ownAccess = enforceTenantAccess(customerSession, 'acc-cust-10');
      expect(ownAccess.allowed).toBe(true);
      expect(ownAccess.targetAccountId).toBe('acc-cust-10');

      // Querying 'ALL' or 'ALL_FLEET' falls back strictly to their own account
      const allAccess = enforceTenantAccess(customerSession, 'ALL');
      expect(allAccess.allowed).toBe(true);
      expect(allAccess.targetAccountId).toBe('acc-cust-10');

      // Attempting to query another customer's or admin's account is strictly forbidden (403)
      const foreignAccess = enforceTenantAccess(customerSession, 'other-customer-account');
      expect(foreignAccess.allowed).toBe(false);
      expect(foreignAccess.status).toBe(403);
    });

    it('admin retains unrestricted visibility across all customer accounts', () => {
      const adminSession = {
        userId: 'admin-1',
        email: 'admin@solar.local',
        name: 'Operations Administrator',
        role: 'admin' as const,
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const accessOwn = enforceTenantAccess(adminSession, 'any-customer-account');
      expect(accessOwn.allowed).toBe(true);
      expect(accessOwn.targetAccountId).toBe('any-customer-account');

      const accessFleet = enforceTenantAccess(adminSession, null);
      expect(accessFleet.allowed).toBe(true);
      expect(accessFleet.targetAccountId).toBeUndefined();
    });
  });
});

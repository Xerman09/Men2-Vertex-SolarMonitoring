import { describe, it, expect, vi } from 'vitest';
import { historyQuerySchema } from '../../app/api/deye/history/route';
import { addAccountSchema, updateAccountSchema } from '../../app/api/deye/accounts/route';
import { addPlantBodySchema } from '../../app/api/deye/plants/route';
import { RATE_LIMIT_CONFIGS } from '../rate-limit';
import { ACCOUNT_ID_REGEX } from '../session';
import { createLogger } from '../logger';

describe('API Gate & Schemas Validation Suite', () => {
  describe('History Query Schema (historyQuerySchema)', () => {
    it('accepts valid query parameters and assigns defaults', () => {
      const parsed = historyQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.range).toBe('TODAY');
        expect(parsed.data.step).toBe(5);
        expect(parsed.data.accountId).toBeUndefined();
      }
    });

    it('accepts custom range, step, and accountId', () => {
      const parsed = historyQuerySchema.safeParse({
        range: 'YESTERDAY',
        step: '15',
        accountId: 'plant_101',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.range).toBe('YESTERDAY');
        expect(parsed.data.step).toBe(15);
        expect(parsed.data.accountId).toBe('plant_101');
      }
    });

    it('rejects step outside valid range 1-60', () => {
      expect(historyQuerySchema.safeParse({ step: 0 }).success).toBe(false);
      expect(historyQuerySchema.safeParse({ step: 120 }).success).toBe(false);
      expect(historyQuerySchema.safeParse({ step: 'invalid' }).success).toBe(false);
    });

    it('rejects malformed accountId with path traversal or injection characters', () => {
      expect(historyQuerySchema.safeParse({ accountId: '../../etc/passwd' }).success).toBe(false);
      expect(historyQuerySchema.safeParse({ accountId: 'acc<script>' }).success).toBe(false);
      expect(historyQuerySchema.safeParse({ accountId: 'acc; rm -rf /' }).success).toBe(false);
    });
  });

  describe('Account Management Schemas', () => {
    it('validates addAccountSchema with required fields', () => {
      const validPayload = {
        name: 'Site Beta',
        appId: 'deye_app_123',
        appSecret: 'secret_xyz',
        email: 'admin@solarsite.com',
        password: 'securePassword123!',
      };
      const result = addAccountSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects addAccountSchema with missing credentials or invalid email', () => {
      expect(addAccountSchema.safeParse({ name: 'Site Beta' }).success).toBe(false);
      expect(
        addAccountSchema.safeParse({
          name: 'Site Beta',
          appId: 'deye_app_123',
          appSecret: 'secret_xyz',
          email: 'not-an-email',
          password: 'pass',
        }).success
      ).toBe(false);
    });

    it('validates updateAccountSchema requiring valid alphanumeric id', () => {
      const validUpdate = {
        id: 'site_alpha_42',
        name: 'Updated Name',
      };
      expect(updateAccountSchema.safeParse(validUpdate).success).toBe(true);

      const invalidIdUpdate = {
        id: 'bad id with spaces',
      };
      expect(updateAccountSchema.safeParse(invalidIdUpdate).success).toBe(false);
    });
  });

  describe('Plant Registration Schema (addPlantBodySchema)', () => {
    it('accepts valid plant registration payload', () => {
      const valid = {
        accountId: 'account-1',
        plant: {
          stationId: 'SP_04',
          stationName: 'North Array Rooftop',
        },
      };
      expect(addPlantBodySchema.safeParse(valid).success).toBe(true);
    });

    it('rejects payload with missing stationName', () => {
      const invalid = {
        accountId: 'account-1',
        plant: {
          stationId: 'SP_04',
        },
      };
      expect(addPlantBodySchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('Centralized Rate Limits & Constants', () => {
    it('ensures all critical endpoints have explicit rate limits', () => {
      expect(RATE_LIMIT_CONFIGS.CONTROL.maxRequests).toBe(5);
      expect(RATE_LIMIT_CONFIGS.ACCOUNT_MUTATION.maxRequests).toBe(20);
      expect(RATE_LIMIT_CONFIGS.READ_HISTORY.maxRequests).toBe(30);
      expect(RATE_LIMIT_CONFIGS.READ_ACCOUNTS.maxRequests).toBe(30);
      expect(RATE_LIMIT_CONFIGS.READ_STATIONS.maxRequests).toBe(60);
      expect(RATE_LIMIT_CONFIGS.READ_PLANTS.maxRequests).toBe(60);
      expect(RATE_LIMIT_CONFIGS.READ_AGGREGATE.maxRequests).toBe(60);
    });

    it('validates ACCOUNT_ID_REGEX pattern against alphanumeric and hyphens/underscores', () => {
      expect(ACCOUNT_ID_REGEX.test('station-1')).toBe(true);
      expect(ACCOUNT_ID_REGEX.test('site_99')).toBe(true);
      expect(ACCOUNT_ID_REGEX.test('invalid!id')).toBe(false);
      expect(ACCOUNT_ID_REGEX.test('')).toBe(false);
    });
  });

  describe('Structured Logger (createLogger)', () => {
    it('creates logger and dispatches without error', () => {
      const testLogger = createLogger('TestModule');
      expect(() => {
        testLogger.debug('Debug test message', { debugKey: 1 });
        testLogger.info('Info test message', { infoKey: 'test' });
        testLogger.warn('Warn test message', { warnKey: true });
        testLogger.error('Error test message', new Error('sample err'), { errKey: 42 });
      }).not.toThrow();
    });
  });

  describe('Gate Helpers & Utilities', () => {
    it('parseJsonBody successfully extracts parsed JSON from valid Request', async () => {
      const { parseJsonBody } = await import('../gate');
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'INV-01', enabled: true }),
      });

      const res = await parseJsonBody<{ deviceId: string; enabled: boolean }>(req);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.deviceId).toBe('INV-01');
        expect(res.data.enabled).toBe(true);
      }
    });

    it('parseJsonBody returns 400 NextResponse on malformed JSON payload', async () => {
      const { parseJsonBody } = await import('../gate');
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed: json, missing quotes',
      });

      const res = await parseJsonBody(req);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errorResponse.status).toBe(400);
        const data = await res.errorResponse.json();
        expect(data.error).toBe('Malformed JSON payload');
      }
    });

    it('standard429 constructs compliant 429 response with Retry-After header', async () => {
      const { standard429 } = await import('../gate');
      const futureReset = Date.now() + 45000; // 45s from now
      const res = standard429(30, futureReset, 'Custom throttle exceeded');

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('45');
      const body = await res.json();
      expect(body.error).toBe('Custom throttle exceeded');
    });

    it('rateLimitKey builds normalized rate limit cache keys', async () => {
      const { rateLimitKey } = await import('../rate-limit');
      expect(rateLimitKey('RL_TEST', '192.168.1.50')).toBe('RL_TEST_192.168.1.50');
      expect(rateLimitKey('RL_TEST', ' 192.168.1.50 ', 'user-123')).toBe('RL_TEST_192.168.1.50_user-123');
      expect(rateLimitKey('RL_TEST', '')).toBe('RL_TEST_unknown');
    });
  });

  describe('FileAccountCache Seam & Fallbacks', () => {
    it('resolves correct config path using cwd or DSM_DATA_DIR', async () => {
      const { FileAccountCache } = await import('../file-account-cache');
      const cfgPath = FileAccountCache.getConfigPath();
      expect(cfgPath.endsWith('deye-accounts.json')).toBe(true);
    });

    it('returns empty array when file does not exist or fails parsing gracefully', async () => {
      const { FileAccountCache } = await import('../file-account-cache');
      const originalEnv = process.env.DSM_DATA_DIR;
      process.env.DSM_DATA_DIR = './non-existent-subpath-for-testing';
      try {
        const accounts = FileAccountCache.getAllRawAccounts();
        expect(Array.isArray(accounts)).toBe(true);
        expect(accounts.length).toBe(0);
      } finally {
        process.env.DSM_DATA_DIR = originalEnv;
      }
    });
  });

  describe('DirectusTransport Seam & Graceful Degradation', () => {
    it('initializes with health status and headers', async () => {
      const { directusTransport } = await import('../directus-transport');
      const health = directusTransport.getHealth();
      expect(typeof health.connected).toBe('boolean');
      const headers = directusTransport.getDirectusHeaders();
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
    });

    it('returns null on unreachable endpoint without throwing uncaught exceptions', async () => {
      const { DirectusTransport } = await import('../directus-transport');
      const transport = new DirectusTransport();
      // Overwrite base url to unroutable port
      vi.spyOn(transport, 'getDirectusBaseUrl').mockReturnValue('http://127.0.0.1:59999');
      const result = await transport.fetchCollection('test_collection');
      expect(result).toBeNull();
      expect(transport.getHealth().connected).toBe(false);
    });
  });
});


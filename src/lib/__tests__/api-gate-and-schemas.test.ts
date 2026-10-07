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
});

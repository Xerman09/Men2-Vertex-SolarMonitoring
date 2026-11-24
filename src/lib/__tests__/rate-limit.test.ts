import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, _resetRateLimitStoreForTesting } from '../rate-limit';

describe('In-memory Rate Limiter', () => {
  beforeEach(() => {
    _resetRateLimitStoreForTesting();
  });

  it('allows requests within threshold', () => {
    const key = 'test-client-1';
    const res1 = checkRateLimit(key, 3, 1000);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = checkRateLimit(key, 3, 1000);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = checkRateLimit(key, 3, 1000);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks requests exceeding threshold', () => {
    const key = 'test-client-2';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 1000);
    }

    const blocked = checkRateLimit(key, 3, 1000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets after window expires', async () => {
    const key = 'test-client-3';
    checkRateLimit(key, 1, 50); // 50ms window
    
    const blocked = checkRateLimit(key, 1, 50);
    expect(blocked.success).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const allowed = checkRateLimit(key, 1, 50);
    expect(allowed.success).toBe(true);
  });
});

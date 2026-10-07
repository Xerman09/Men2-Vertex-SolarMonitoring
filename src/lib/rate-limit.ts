interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired records every 5 minutes without holding event loop open
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  timer.unref?.();
}

export const RATE_LIMIT_WINDOW_S = 60;

export const RATE_LIMIT_CONFIGS = {
  CONTROL: { maxRequests: 5, windowMs: 60 * 1000 },
  ACCOUNT_MUTATION: { maxRequests: 20, windowMs: 60 * 1000 },
  SYNC_ACCOUNT: { maxRequests: 20, windowMs: 60 * 1000 },
  AUTH_LOGIN: { maxRequests: 10, windowMs: 60 * 1000 },
  READ_HISTORY: { maxRequests: 30, windowMs: 60 * 1000 },
  READ_ACCOUNTS: { maxRequests: 30, windowMs: 60 * 1000 },
  READ_STATIONS: { maxRequests: 60, windowMs: 60 * 1000 },
  READ_PLANTS: { maxRequests: 60, windowMs: 60 * 1000 },
  READ_AGGREGATE: { maxRequests: 60, windowMs: 60 * 1000 },
  READ_HEALTH: { maxRequests: 60, windowMs: 60 * 1000 },
  READ_TELEMETRY: { maxRequests: 60, windowMs: 60 * 1000 },
} as const;

export const POLL_INTERVALS = {
  FAST_TELEMETRY_MS: 5000,
  NORMAL_TELEMETRY_MS: 15000,
  HEALTH_CHECK_MS: 30000,
  HOURLY_REFRESH_MS: 60 * 60 * 1000,
} as const;

/**
 * Standardized key builder for rate limiter lookups
 */
export function rateLimitKey(prefix: string, ip: string, identifier?: string): string {
  const cleanIp = ip ? ip.trim() : 'unknown';
  return identifier ? `${prefix}_${cleanIp}_${identifier}` : `${prefix}_${cleanIp}`;
}

export function _resetRateLimitStoreForTesting(): void {
  rateLimitStore.clear();
}


/**
 * Basic in-memory rate limiter for sensitive endpoints
 * @param key unique identifier (e.g. IP + endpoint)
 * @param maxRequests maximum allowed requests within window
 * @param windowMs window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 5,
  windowMs: number = 60 * 1000
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || record.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { success: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (record.count >= maxRequests) {
    return { success: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return {
    success: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

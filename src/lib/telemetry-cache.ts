/**
 * Client-Side In-Memory Telemetry Cache (SWR Pattern)
 * 
 * Provides instant (0ms) plant and telemetry switching between previously visited stations.
 * Stored in memory with configurable TTL (default: 60 seconds).
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Shared device serial-number contract: optional `device_sn` query param.
 * Mirrors telemetry route usage; validated as ^[A-Za-z0-9_-]{1,64}$ upstream.
 */
export const DEVICE_SN_PATTERN = '^[A-Za-z0-9_-]{1,64}$';
export const DEVICE_SN_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Deterministic per-inverter cache key: `${account}:${station}:${sn}`.
 * Optional `extra` appends a suffix segment (e.g. telemetry, station).
 * Missing/blank SN normalizes to 'ALL' so fleet-level probes stay stable.
 */
export function inverterCacheKey(
  account: string,
  station: string,
  sn?: string | null,
  extra?: string
): string {
  const cleanSn = sn && String(sn).trim() ? String(sn).trim() : 'ALL';
  const base = `${account}:${station}:${cleanSn}`;
  return extra && extra.trim() ? `${base}:${extra.trim()}` : base;
}

/**
 * Ownership check: SN belongs to one of the tenant's plants' devices.
 * 'ALL' / 'ALL_FLEET' / undefined pass through as true so fleet views
 * stay byte-identical (no filtering). Unknown SN returns false.
 */
export function isValidInverterSn(
  plants: Array<{ devices?: Array<{ deviceSn?: string | null }> | null } | null> | null | undefined,
  sn?: string | null
): boolean {
  if (sn === undefined || sn === null) return true;
  const clean = String(sn).trim();
  if (clean === '' || clean === 'ALL' || clean === 'ALL_FLEET') return true;
  if (!plants || plants.length === 0) return false;
  return plants.some((p) =>
    p?.devices?.some((d) => d?.deviceSn != null && String(d.deviceSn).trim() === clean)
  );
}

class TelemetryCacheManager {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Retrieve cached data if present.
   * If allowStale is true, returns cached data even if expired (for background revalidation).
   */
  public get<T>(key: string, maxAgeMs: number = 60000, allowStale: boolean = true): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age <= maxAgeMs) {
      return entry.data as T;
    }

    if (allowStale) {
      return entry.data as T;
    }

    this.store.delete(key);
    return null;
  }

  /**
   * Check if the cache entry is fresh within the maxAgeMs window.
   */
  public isFresh(key: string, maxAgeMs: number = 60000): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    return Date.now() - entry.timestamp <= maxAgeMs;
  }

  /**
   * Store data in cache.
   */
  public set<T>(key: string, data: T): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete a specific cache key.
   */
  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear cache entries (or entire cache if keyPrefix is omitted).
   */
  public clear(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.store.clear();
      return;
    }
    for (const k of this.store.keys()) {
      if (k.startsWith(keyPrefix)) {
        this.store.delete(k);
      }
    }
  }
}

export const telemetryCache = new TelemetryCacheManager();

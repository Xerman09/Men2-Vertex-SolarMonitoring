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

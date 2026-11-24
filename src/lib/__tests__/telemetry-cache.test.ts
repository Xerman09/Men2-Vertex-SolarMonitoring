import { describe, it, expect, beforeEach } from 'vitest';
import { telemetryCache } from '../telemetry-cache';

describe('TelemetryCache Suite', () => {
  beforeEach(() => {
    telemetryCache.clear();
  });

  it('stores and retrieves cached items', () => {
    telemetryCache.set('test:key', { foo: 'bar' });
    const cached = telemetryCache.get<{ foo: string }>('test:key');
    expect(cached).not.toBeNull();
    expect(cached?.foo).toBe('bar');
  });

  it('returns null for missing keys', () => {
    expect(telemetryCache.get('non_existent')).toBeNull();
  });

  it('identifies freshness and respects allowStale', () => {
    telemetryCache.set('item:1', { val: 123 });
    expect(telemetryCache.isFresh('item:1')).toBe(true);

    // Negative maxAge simulating expired entry
    expect(telemetryCache.isFresh('item:1', -1)).toBe(false);
    expect(telemetryCache.get('item:1', -1, true)).toEqual({ val: 123 });
    expect(telemetryCache.get('item:1', -1, false)).toBeNull();
  });

  it('deletes and clears keys correctly', () => {
    telemetryCache.set('a', 1);
    telemetryCache.set('b', 2);
    expect(telemetryCache.get('a')).toBe(1);
    telemetryCache.delete('a');
    expect(telemetryCache.get('a')).toBeNull();
    expect(telemetryCache.get('b')).toBe(2);
    telemetryCache.clear();
    expect(telemetryCache.get('b')).toBeNull();
  });

  it('clears selectively by prefix', () => {
    telemetryCache.set('prefix:1', 'data1');
    telemetryCache.set('prefix:2', 'data2');
    telemetryCache.set('other:1', 'data3');
    telemetryCache.clear('prefix:');
    expect(telemetryCache.get('prefix:1')).toBeNull();
    expect(telemetryCache.get('prefix:2')).toBeNull();
    expect(telemetryCache.get('other:1')).toBe('data3');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { FileHistoryCache } from '../file-history-cache';
import { historyQuerySchema } from '@/app/api/deye/history/route';

describe('FileHistoryCache Unit Suite (B2)', () => {
  beforeEach(() => {
    FileHistoryCache.clear();
  });

  afterEach(() => {
    FileHistoryCache.clear();
  });

  it('stores and retrieves closed past history points from memory and disk', () => {
    const key = 'station:101:2026-11-01:5';
    const testData = {
      points: [
        { hour: '06:00', solarYieldKw: 10.5, loadDemandKw: 5.0, batteryFlowKw: 0, gridExportKw: 5.5, isElapsed: true },
        { hour: '07:00', solarYieldKw: 25.0, loadDemandKw: 8.0, batteryFlowKw: 0, gridExportKw: 17.0, isElapsed: true },
      ],
      recordedCount: 2,
    };

    FileHistoryCache.set(key, testData, { immutable: true, immediateSave: true });

    // In-memory lookup
    expect(FileHistoryCache.has(key)).toBe(true);
    const retrieved = FileHistoryCache.get<typeof testData>(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.recordedCount).toBe(2);
    expect(retrieved?.points[0].solarYieldKw).toBe(10.5);

    // Verify cache file exists on disk
    const filePath = FileHistoryCache.getCacheFilePath();
    expect(fs.existsSync(filePath)).toBe(true);
    const fileRaw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(fileRaw);
    expect(parsed.entries[key]).toBeDefined();
    expect(parsed.entries[key].data.recordedCount).toBe(2);
  });

  it('expires transient entries when TTL elapses', async () => {
    const key = 'transient:today:station-1';
    FileHistoryCache.set(key, { temp: true }, { immutable: false, ttlMs: 50 });

    expect(FileHistoryCache.get(key)).toEqual({ temp: true });

    await new Promise((r) => setTimeout(r, 60));
    expect(FileHistoryCache.get(key)).toBeNull();
    expect(FileHistoryCache.has(key)).toBe(false);
  });
});

describe('History Route Schema and Fast-Path Partitioning (B1)', () => {
  it('validates part parameter in historyQuerySchema', () => {
    const defaultParsed = historyQuerySchema.parse({ range: 'TODAY' });
    expect(defaultParsed.part).toBe('all');

    const dayParsed = historyQuerySchema.parse({ range: 'TODAY', part: 'day' });
    expect(dayParsed.part).toBe('day');

    const periodParsed = historyQuerySchema.parse({ range: 'WEEK', part: 'period' });
    expect(periodParsed.part).toBe('period');

    const invalid = historyQuerySchema.safeParse({ part: 'invalid_part' });
    expect(invalid.success).toBe(false);
  });
});


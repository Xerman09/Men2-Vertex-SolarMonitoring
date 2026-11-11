import { describe, it, expect } from 'vitest';
import { getManilaNowParts, getManilaToday } from '../manila-time';
import { mergeDailySeries } from '../deye-client';
import type { DailyAnalyticsPoint } from '../analytics-data';

function day(peakSolarKw: number, solarYieldKwh: number): DailyAnalyticsPoint {
  return {
    date: '2026-10-04',
    dayLabel: 'Sun',
    solarYieldKwh,
    loadDemandKwh: 10,
    selfConsumptionKwh: 5,
    batteryStoredKwh: 0,
    batteryDischargedKwh: 0,
    gridExportKwh: 5,
    gridImportKwh: 1,
    peakSolarKw,
    performanceRatioPct: 80,
    co2AvoidedKg: 1,
  } as DailyAnalyticsPoint;
}

describe('Manila time helpers', () => {
  it('rolls over to the next Manila day while UTC is still the previous day', () => {
    // 2026-10-04T17:30:00Z = 2026-10-05 01:30 in Asia/Manila (UTC+8)
    const parts = getManilaNowParts(new Date('2026-10-04T17:30:00Z'));
    expect(parts.dateStr).toBe('2026-10-05');
    expect(parts.hourFloat).toBeCloseTo(1.5, 5);
    expect(getManilaToday(new Date('2026-10-04T03:59:00Z'))).toBe('2026-10-04');
  });
});

describe('mergeDailySeries peak handling', () => {
  it('does not sum per-station peaks (which would overstate the combined peak)', () => {
    const merged = mergeDailySeries([[day(60, 300)], [day(45, 200)]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].solarYieldKwh).toBe(500);
    expect(merged[0].peakSolarKw).toBe(60);
  });
});

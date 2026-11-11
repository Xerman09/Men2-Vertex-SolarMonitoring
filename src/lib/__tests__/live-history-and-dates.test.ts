import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeyeCloudClient, getManilaDateParts, shiftIsoDate } from '../deye-client';
import { getMockHourlyEnergyPoints } from '../mock-telemetry';
import { computeAnalyticsSummary } from '../analytics-data';
import { historyQuerySchema } from '../../app/api/deye/history/route';
import type { PlantInfo } from '../types';

function makeTestPlants(): PlantInfo[] {
  return [
    {
      stationId: '62112170',
      stationName: 'La Salette School',
      installedCapacityKw: 100,
      devices: [
        {
          deviceSn: '2505174004',
          deviceType: 'INVERTER',
          name: 'Inverter 1',
          model: 'SUN-50K-G04',
          ratedKw: 50,
          status: 'ONLINE',
        },
        {
          deviceSn: '2505174005',
          deviceType: 'INVERTER',
          name: 'Inverter 2',
          model: 'SUN-50K-G04',
          ratedKw: 50,
          status: 'ONLINE',
        },
      ],
    },
  ];
}

describe('Date-distinct telemetry & live DeyeCloud history resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces genuinely distinct solar and load curves across different dates in fallback mode', () => {
    const nov1 = getMockHourlyEnergyPoints('TODAY', undefined, 5, '2026-10-01');
    const nov5 = getMockHourlyEnergyPoints('TODAY', undefined, 5, '2026-10-05');
    const nov4 = getMockHourlyEnergyPoints('TODAY', undefined, 5, '2026-10-04');

    expect(nov1).toHaveLength(288);
    expect(nov5).toHaveLength(288);

    const noon1 = nov1.find((p) => p.hour === '12:00');
    const noon5 = nov5.find((p) => p.hour === '12:00');
    const noon4 = nov4.find((p) => p.hour === '12:00');

    expect(noon1?.solarYieldKw).not.toBe(noon5?.solarYieldKw);
    expect(noon1?.loadDemandKw).not.toBe(noon5?.loadDemandKw);
    expect(noon5?.loadDemandKw).not.toBe(noon4?.loadDemandKw);

    // Ensure distinctness across WEEK / MONTH / YEAR even on same date string
    const week = getMockHourlyEnergyPoints('WEEK', undefined, 5, '2026-10-05');
    const month = getMockHourlyEnergyPoints('MONTH', undefined, 5, '2026-10-05');
    expect(week.find((p) => p.hour === '12:00')?.solarYieldKw).not.toBe(
      month.find((p) => p.hour === '12:00')?.solarYieldKw
    );
  });

  it('fetches live station day history (granularity 1) mapped to Asia/Manila slots', async () => {
    const client = new DeyeCloudClient({
      id: 'hanvin-live',
      name: 'Hanvin Solar',
      appId: 'valid-app-id',
      appSecret: 'valid-secret-key',
      email: 'ops@hanvin.local',
      password: 'valid-password',
      plants: makeTestPlants(),
    });
    vi.spyOn(client, 'getAccessToken').mockResolvedValue('mock-token');

    // Construct an exact Manila noon timestamp for 2026-10-04: 2026-10-04T04:00:00Z
    const noonOct4Ts = Math.floor(Date.parse('2026-10-04T04:00:00Z') / 1000);
    const noonOct5Ts = Math.floor(Date.parse('2026-10-05T04:00:00Z') / 1000);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const parsed = JSON.parse(String(init?.body || '{}'));
      const isOct4 = parsed.startAt === '2026-10-04';
      return new Response(
        JSON.stringify({
          code: '1000000',
          success: true,
          stationDataItems: [
            {
              timeStamp: isOct4 ? noonOct4Ts : noonOct5Ts,
              generationPower: isOct4 ? 42500 : 78200,
              consumptionPower: isOct4 ? 12000 : 25000,
              wirePower: isOct4 ? 30500 : 53200,
              batteryPower: 0,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const oct4Res = await client.getLiveDayHistory({ stationId: '62112170', date: '2026-10-04', stepMinutes: 5 });
    const oct5Res = await client.getLiveDayHistory({ stationId: '62112170', date: '2026-10-05', stepMinutes: 5 });

    expect(oct4Res?.isLive).toBe(true);
    expect(oct5Res?.isLive).toBe(true);

    const oct4Noon = oct4Res?.points.find((p) => p.hour === '12:00');
    const oct5Noon = oct5Res?.points.find((p) => p.hour === '12:00');

    expect(oct4Noon?.solarYieldKw).toBe(42.5);
    expect(oct4Noon?.loadDemandKw).toBe(12);
    expect(oct5Noon?.solarYieldKw).toBe(78.2);
    expect(oct5Noon?.loadDemandKw).toBe(25);
  });

  it('uses exclusive endAt (+1 day) for granularity 2 daily history so final date is never truncated', async () => {
    const client = new DeyeCloudClient({
      id: 'hanvin-live',
      name: 'Hanvin Solar',
      appId: 'valid-app-id',
      appSecret: 'valid-secret-key',
      email: 'ops@hanvin.local',
      password: 'valid-password',
      plants: makeTestPlants(),
    });
    vi.spyOn(client, 'getAccessToken').mockResolvedValue('mock-token');

    let capturedEndAt = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const parsed = JSON.parse(String(init?.body || '{}'));
      capturedEndAt = parsed.endAt;
      return new Response(
        JSON.stringify({
          code: '1000000',
          success: true,
          stationDataItems: [
            { year: 2026, month: 10, day: 1, generationValue: 210.1, consumptionValue: 80, gridValue: 130.1, purchaseValue: 10 },
            { year: 2026, month: 10, day: 2, generationValue: 364.8, consumptionValue: 95, gridValue: 269.8, purchaseValue: 8 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const daily = await client.getLiveDailyHistory({
      stationId: '62112170',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    });

    expect(capturedEndAt).toBe(shiftIsoDate('2026-10-02', 1));
    expect(daily?.items).toHaveLength(2);
    expect(daily?.items[0].solarYieldKwh).toBe(210.1);
    expect(daily?.items[1].solarYieldKwh).toBe(364.8);
  });

  it('preserves 0 kWh when allowZeroYield is true in computeAnalyticsSummary for offline/dark dates', () => {
    const zeroPoints = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      solarYieldKw: 0,
      loadDemandKw: 0,
      batteryFlowKw: 0,
      gridFlowKw: 0,
      tariffRateUsd: 0.14,
      isElapsed: true,
    }));

    const summary = computeAnalyticsSummary(zeroPoints, 100, false, { allowZeroYield: true });
    expect(summary.totalSolarYieldKwh).toBe(0);
    expect(summary.performanceRatioPct).toBe(0);
  });

  it('validates station_id, startDate, and endDate cleanly in historyQuerySchema', () => {
    expect(
      historyQuerySchema.safeParse({
        station_id: '62112170',
        startDate: '2026-10-01',
        endDate: '2026-10-07',
      }).success
    ).toBe(true);

    expect(historyQuerySchema.safeParse({ station_id: '../bad' }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ startDate: '10/01/2026' }).success).toBe(false);
    expect(getManilaDateParts(Math.floor(Date.parse('2026-10-04T04:00:00Z') / 1000)).dateStr).toBe('2026-10-04');
  });
});


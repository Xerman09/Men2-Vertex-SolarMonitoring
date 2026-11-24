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

  it('aggregates all stations when stationId is omitted for multi-plant fleet view', async () => {
    const multiPlants: PlantInfo[] = [
      {
        stationId: '61825217',
        stationName: 'Men 2 office',
        installedCapacityKw: 100,
        devices: [],
      },
      {
        stationId: '62112170',
        stationName: 'La Salette School',
        installedCapacityKw: 100,
        devices: [],
      },
    ];

    const client = new DeyeCloudClient({
      id: 'hanvin-live',
      name: 'Hanvin Solar',
      appId: 'valid-app-id',
      appSecret: 'valid-secret-key',
      email: 'ops@hanvin.local',
      password: 'valid-password',
      plants: multiPlants,
    });
    vi.spyOn(client, 'getAccessToken').mockResolvedValue('mock-token');

    const noonOct8Ts = Math.floor(Date.parse('2026-10-08T04:00:00Z') / 1000);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const parsed = JSON.parse(String(init?.body || '{}'));
      const isStation1 = parsed.stationId === 61825217 || parsed.stationId === '61825217';
      return new Response(
        JSON.stringify({
          code: '1000000',
          success: true,
          stationDataItems: [
            {
              timeStamp: noonOct8Ts,
              generationPower: isStation1 ? 30000 : 50000,
              consumptionPower: isStation1 ? 10000 : 15000,
              wirePower: isStation1 ? 20000 : 35000,
              batteryPower: 0,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const fleetRes = await client.getLiveDayHistory({ date: '2026-10-08', stepMinutes: 5 });
    expect(fleetRes?.isLive).toBe(true);

    const noon = fleetRes?.points.find((p) => p.hour === '12:00');
    // Sum of 30 kW + 50 kW = 80 kW
    expect(noon?.solarYieldKw).toBe(80);
    // Sum of 10 kW + 15 kW = 25 kW
    expect(noon?.loadDemandKw).toBe(25);
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


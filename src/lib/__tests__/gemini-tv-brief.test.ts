import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TV_BRIEF_MODEL,
  _resetTvBriefCacheForTesting,
  buildDeterministicTvBrief,
  extractTvSnapshotFromAggregate,
  getCachedOrGenerateTvBrief,
} from '../gemini-tv-brief';
import type { AggregatedFleetSummary } from '../types';

function makeAggregate(overrides: Partial<AggregatedFleetSummary> = {}): AggregatedFleetSummary {
  return {
    totalAccounts: 1,
    activeAccounts: 1,
    totalPlants: 2,
    totalInverters: 4,
    totalLoggers: 2,
    totalCapacityKw: 200,
    totalSolarPowerKw: 94.6,
    totalDailyYieldKwh: 412.5,
    totalLifetimeYieldMwh: 85,
    avgBatterySoc: 0,
    totalBatteryPowerKw: 0,
    netGridPowerKw: 72.1,
    totalLoadPowerKw: 22.5,
    accounts: [
      {
        id: 'men2-facility-1',
        name: 'Hanvin Solar',
        isLive: true,
        stationCount: 2,
        deviceCount: 4,
        inverterCount: 4,
        loggerCount: 2,
        liveSolarPowerKw: 94.6,
        dailyYieldKwh: 412.5,
        capacityKw: 200,
        status: 'ONLINE',
        lastPingMs: 12,
        plants: [
          {
            stationId: '62112170',
            stationName: 'La Salette School',
            installedCapacityKw: 150,
            liveSolarPowerKw: 74.6,
            dailyYieldKwh: 320.5,
            devices: [
              {
                deviceSn: '2505174004',
                deviceType: 'INVERTER',
                name: 'Inv 1',
                model: 'SUN-50K',
                ratedKw: 50,
                status: 'ONLINE',
              },
            ],
          },
          {
            stationId: '61825217',
            stationName: 'Hanvin Branch',
            installedCapacityKw: 50,
            liveSolarPowerKw: 20.0,
            dailyYieldKwh: 92.0,
            devices: [
              {
                deviceSn: '2408124366',
                deviceType: 'INVERTER',
                name: 'Inv 2',
                model: 'SUN-50K',
                ratedKw: 50,
                status: 'ONLINE',
              },
            ],
          },
        ],
      },
    ],
    nodes: [
      {
        accountId: 'men2-facility-1',
        accountName: 'Hanvin Solar',
        stationId: '62112170',
        stationName: 'La Salette School',
        deviceSn: '2505174004',
        deviceType: 'INVERTER',
        model: 'SUN-50K',
        ratedKw: 50,
        liveSolarPowerKw: 74.6,
        dailyYieldKwh: 320.5,
        gridPowerKw: 60.0,
        consumptionPowerKw: 14.6,
        batterySoc: 0,
        mode: 'GRID',
        status: 'ONLINE',
        loggerStatus: 'ONLINE',
        isLive: true,
      },
    ],
    isLive: true,
    lastUpdated: '2026-11-17T06:00:00Z',
    ...overrides,
  };
}

describe('Gemini 3.5 TV Telemetry Brief Engine', () => {
  beforeEach(() => {
    _resetTvBriefCacheForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls gemini-3.5-flash-lite with store=false, JSON schema, and caches 5-minute brief', async () => {
    const createInteraction = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        headline: 'Hanvin Solar 94.6 kW live · ₱5,734 saved today',
        severity: 'normal',
        priorityStationId: '62112170',
      }),
    });

    const snap = extractTvSnapshotFromAggregate(makeAggregate(), 'ALL_ADMIN', 13.9);
    const first = await getCachedOrGenerateTvBrief(snap, {
      apiKey: 'test-key-placeholder',
      createInteraction,
    });
    const second = await getCachedOrGenerateTvBrief(snap, {
      apiKey: 'test-key-placeholder',
      createInteraction,
    });

    expect(createInteraction).toHaveBeenCalledTimes(1);
    const callArg = createInteraction.mock.calls[0][0];
    expect(callArg.model).toBe(TV_BRIEF_MODEL);
    expect(callArg.model).toBe('gemini-3.5-flash-lite');
    expect(callArg.store).toBe(false);
    expect(callArg.response_format).toMatchObject({
      type: 'text',
      mime_type: 'application/json',
    });

    expect(first.source).toBe('gemini');
    expect(first.priorityStationId).toBe('62112170');
    expect(second.headline).toBe(first.headline);
  });

  it('strips unverified station IDs and falls back deterministically on malformed output or missing key', async () => {
    const aggWithFault = makeAggregate({
      nodes: [
        {
          accountId: 'men2-facility-1',
          accountName: 'Hanvin Solar',
          stationId: '61825217',
          stationName: 'Hanvin Branch',
          deviceSn: '2408124366',
          deviceType: 'INVERTER',
          model: 'SUN-50K',
          ratedKw: 50,
          liveSolarPowerKw: 0,
          dailyYieldKwh: 0,
          gridPowerKw: 0,
          consumptionPowerKw: 5,
          batterySoc: 0,
          mode: 'FAULT',
          status: 'FAULT',
          loggerStatus: 'OFFLINE',
          isLive: true,
        },
      ],
    });
    const snap = extractTvSnapshotFromAggregate(aggWithFault, 'TENANT_FAULT', 13.9);

    // Hallucinated stationId returned by model must be sanitized to null
    const hallucinatedRes = await getCachedOrGenerateTvBrief(snap, {
      apiKey: 'test-key',
      createInteraction: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          headline: 'Hanvin Branch fault · 94.6 kW solar',
          severity: 'critical',
          priorityStationId: '99999999',
        }),
      }),
    });
    expect(hallucinatedRes.source).toBe('gemini');
    expect(hallucinatedRes.priorityStationId).toBeNull();

    // Missing API key falls back deterministically using verified metrics only
    _resetTvBriefCacheForTesting();
    const fallback = await getCachedOrGenerateTvBrief(snap, { apiKey: '' });
    expect(fallback.source).toBe('fallback');
    expect(fallback.severity).toBe('critical');
    expect(fallback.priorityStationId).toBe('61825217');
    expect(fallback.headline).toContain('94.6 kW');
    expect(fallback.headline).toContain('Hanvin Branch');

    // Direct deterministic brief never fabricates fault when online
    const okSnap = extractTvSnapshotFromAggregate(makeAggregate(), 'OK', 13.9);
    const okFallback = buildDeterministicTvBrief(okSnap);
    expect(okFallback.severity).toBe('normal');
    expect(okFallback.headline).toContain('PHP ');
  });
});

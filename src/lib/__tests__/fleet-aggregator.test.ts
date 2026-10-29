import { describe, it, expect, vi } from 'vitest';
import { FleetAggregator } from '../fleet-aggregator';
import { DeyeCloudClient } from '../deye-client';
import { DeyeAccountConfig } from '../types';

describe('FleetAggregator Unit Suite', () => {
  const mockConfig: DeyeAccountConfig = {
    id: 'fleet-acc-1',
    name: 'Solar Peak Array',
    email: 'ops@solar.local',
    password: 'secure-pwd',
    appId: 'app-99',
    appSecret: 'secret-99',
    baseUrl: 'https://eu1-developer.deyecloud.com',
    enabled: true,
    plants: [
      {
        stationId: 'st-01',
        stationName: 'North Station',
        installedCapacityKw: 120,
        devices: [
          {
            deviceSn: 'INV-001',
            deviceType: 'INVERTER',
            name: 'Inverter Unit 1',
            ratedKw: 120,
            status: 'ONLINE',
          },
        ],
      },
    ],
  };

  it('aggregates fleet statistics across active clients', async () => {
    const aggregator = new FleetAggregator();
    const client = new DeyeCloudClient(mockConfig);

    // Mock client responses
    vi.spyOn(client, 'getStationSummary').mockResolvedValue({
      data: {
        stationId: 'st-01',
        name: 'North Station',
        liveSolarPowerKw: 85.5,
        dailyYieldKwh: 450.2,
        totalYieldMwh: 12.4,
        batterySoc: 92,
        batteryPowerKw: 15.0,
        gridPowerKw: -30.0,
        loadPowerKw: 40.5,
        capacityKw: 120,
        status: 'ONLINE',
        lastUpdated: new Date().toISOString(),
      },
      isLive: true,
      stationDetected: true,
    });

    vi.spyOn(client, 'getBatchDeviceLatest').mockResolvedValue(new Map());
    vi.spyOn(client, 'getHealth').mockResolvedValue({
      gatewayUrl: 'https://eu1-developer.deyecloud.com',
      region: 'EU',
      isLive: true,
      status: 'OPTIMAL',
      pingMs: 18,
      rateLimitUsed: 1,
      rateLimitMax: 60,
      tokenExpiresAt: null,
      lastChecked: new Date().toISOString(),
    });

    const summary = await aggregator.aggregateFleet([client], [mockConfig]);

    expect(summary.totalAccounts).toBe(1);
    expect(summary.activeAccounts).toBe(1);
    expect(summary.totalPlants).toBe(1);
    expect(summary.totalInverters).toBe(1);
    expect(summary.totalCapacityKw).toBe(120);
    expect(summary.totalSolarPowerKw).toBe(85.5);
    expect(summary.avgBatterySoc).toBe(92);
    expect(summary.isLive).toBe(true);
    expect(summary.accounts.length).toBe(1);
    expect(summary.nodes.length).toBe(1);
    expect(summary.nodes[0].deviceSn).toBe('INV-001');
  });

  it('filters aggregation to specific allowed accountIds', async () => {
    const aggregator = new FleetAggregator();
    const client1 = new DeyeCloudClient(mockConfig);
    const client2 = new DeyeCloudClient({
      ...mockConfig,
      id: 'fleet-acc-2',
      name: 'South Array',
    });

    vi.spyOn(client1, 'getStationSummary').mockResolvedValue({
      data: {
        stationId: 'st-01',
        name: 'North Station',
        liveSolarPowerKw: 50,
        dailyYieldKwh: 200,
        totalYieldMwh: 5,
        batterySoc: 90,
        batteryPowerKw: 10,
        gridPowerKw: -20,
        loadPowerKw: 20,
        capacityKw: 100,
        status: 'ONLINE',
        lastUpdated: new Date().toISOString(),
      },
      isLive: true,
      stationDetected: true,
    });
    vi.spyOn(client1, 'getBatchDeviceLatest').mockResolvedValue(new Map());
    vi.spyOn(client1, 'getHealth').mockResolvedValue({
      gatewayUrl: 'https://eu1-developer.deyecloud.com',
      region: 'EU',
      isLive: true,
      status: 'OPTIMAL',
      pingMs: 20,
      rateLimitUsed: 1,
      rateLimitMax: 60,
      tokenExpiresAt: null,
      lastChecked: new Date().toISOString(),
    });

    const summary = await aggregator.aggregateFleet(
      [client1, client2],
      [mockConfig, { ...mockConfig, id: 'fleet-acc-2' }],
      ['fleet-acc-1']
    );

    expect(summary.totalAccounts).toBe(1);
    expect(summary.accounts[0].id).toBe('fleet-acc-1');
  });

  it('never returns 0 accounts when an account exists in the database even if enabled=false or allClients is empty', async () => {
    const aggregator = new FleetAggregator();
    const disabledDbAccount: DeyeAccountConfig = {
      ...mockConfig,
      id: 'men2-facility-1',
      directusId: '1',
      enabled: false,
    };

    const summary = await aggregator.aggregateFleet([], [disabledDbAccount]);

    expect(summary.totalAccounts).toBeGreaterThanOrEqual(1);
    expect(summary.accounts.length).toBeGreaterThanOrEqual(1);
    expect(summary.accounts[0].id).toBe('men2-facility-1');
  });

  it('matches accounts by directusId or stationId and never returns 0 accounts on ID format mismatch', async () => {
    const aggregator = new FleetAggregator();
    const dbAccount: DeyeAccountConfig = {
      ...mockConfig,
      id: 'men2-facility-1',
      directusId: '1',
      enabled: true,
    };
    const client = new DeyeCloudClient(dbAccount);

    // Match by directusId alias ('directus-1')
    const summaryByDirectusId = await aggregator.aggregateFleet([client], [dbAccount], ['directus-1']);
    expect(summaryByDirectusId.totalAccounts).toBe(1);
    expect(summaryByDirectusId.accounts[0].id).toBe('men2-facility-1');

    // Match by stationId alias ('st-01')
    const summaryByStationId = await aggregator.aggregateFleet([client], [dbAccount], ['st-01']);
    expect(summaryByStationId.totalAccounts).toBe(1);
    expect(summaryByStationId.accounts[0].id).toBe('men2-facility-1');

    // Fallback when session holds a stale/unmatched ID so fleet aggregate never shows 0 accounts
    const summaryFallback = await aggregator.aggregateFleet([client], [dbAccount], ['stale-id-999']);
    expect(summaryFallback.totalAccounts).toBe(1);
    expect(summaryFallback.accounts.length).toBe(1);
  });
});

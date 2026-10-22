import { describe, it, expect, vi } from 'vitest';
import { FleetAggregator } from '../fleet-aggregator';
import { DeyeCloudClient } from '../deye-client';
import { DeyeAccountConfig } from '../types';
import fs from 'fs';
import path from 'path';

describe('Fleet Monitoring & Multi-Account Aggregation Suite', () => {
  it('loads multi-account configured data from deye-accounts.json', () => {
    const accountsPath = path.resolve(process.cwd(), 'deye-accounts.json');
    expect(fs.existsSync(accountsPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
    expect(data.accounts).toBeDefined();
    expect(Array.isArray(data.accounts)).toBe(true);
    expect(data.accounts.length).toBeGreaterThanOrEqual(3);

    // Verify the copied accounts exist
    const acc1 = data.accounts.find((a: DeyeAccountConfig) => a.id === 'men2-facility-1');
    const acc2 = data.accounts.find((a: DeyeAccountConfig) => a.id === 'men2-facility-2');
    const acc3 = data.accounts.find((a: DeyeAccountConfig) => a.id === 'men2-facility-3');

    expect(acc1).toBeDefined();
    expect(acc2).toBeDefined();
    expect(acc3).toBeDefined();

    expect(acc1.name).toContain('Hanvin Solar');
    expect(acc2.name).toContain('Commercial Fleet');
    expect(acc3.name).toContain('Regional Microgrid');

    // Check total plants across all accounts
    const totalPlants = data.accounts.reduce(
      (sum: number, a: DeyeAccountConfig) => sum + (a.plants?.length || 0),
      0
    );
    expect(totalPlants).toBeGreaterThanOrEqual(9);

    // Check inverters across all accounts
    const totalInverters = data.accounts.reduce(
      (sum: number, a: DeyeAccountConfig) =>
        sum +
        (a.plants?.reduce(
          (pSum, p) => pSum + (p.devices?.filter((d) => d.deviceType === 'INVERTER').length || 0),
          0
        ) || 0),
      0
    );
    expect(totalInverters).toBeGreaterThanOrEqual(23);
  });

  it('aggregates multi-account fleet data into unified matrix nodes', async () => {
    const aggregator = new FleetAggregator();

    const mockAccount1: DeyeAccountConfig = {
      id: 'acc-1',
      name: 'Primary Site',
      email: 'p1@solar.local',
      password: 'valid-password',
      appId: 'app-valid-1',
      appSecret: 'secret-valid-1',
      baseUrl: 'https://eu1-developer.deyecloud.com',
      enabled: true,
      plants: [
        {
          stationId: 'st-101',
          stationName: 'Alpha Rooftop',
          installedCapacityKw: 100,
          devices: [
            { deviceSn: 'INV-A1', deviceType: 'INVERTER', name: 'Alpha 1', ratedKw: 50, status: 'ONLINE' },
            { deviceSn: 'INV-A2', deviceType: 'INVERTER', name: 'Alpha 2', ratedKw: 50, status: 'ONLINE' },
            { deviceSn: 'LOG-A1', deviceType: 'LOGGER', name: 'Logger Alpha', status: 'ONLINE' },
          ],
        },
      ],
    };

    const mockAccount2: DeyeAccountConfig = {
      id: 'acc-2',
      name: 'Commercial Site',
      email: 'p2@solar.local',
      password: 'valid-password',
      appId: 'app-valid-2',
      appSecret: 'secret-valid-2',
      baseUrl: 'https://eu1-developer.deyecloud.com',
      enabled: true,
      plants: [
        {
          stationId: 'st-201',
          stationName: 'Beta Commercial Hub',
          installedCapacityKw: 150,
          devices: [
            { deviceSn: 'INV-B1', deviceType: 'INVERTER', name: 'Beta 1', ratedKw: 75, status: 'ONLINE' },
            { deviceSn: 'INV-B2', deviceType: 'INVERTER', name: 'Beta 2', ratedKw: 75, status: 'ONLINE' },
          ],
        },
      ],
    };

    const client1 = new DeyeCloudClient(mockAccount1);
    const client2 = new DeyeCloudClient(mockAccount2);

    vi.spyOn(client1, 'getStationSummary').mockResolvedValue({
      data: {
        stationId: 'st-101',
        name: 'Alpha Rooftop',
        liveSolarPowerKw: 80,
        dailyYieldKwh: 400,
        totalYieldMwh: 10,
        batterySoc: 90,
        batteryPowerKw: 5,
        gridPowerKw: -20,
        loadPowerKw: 55,
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
      pingMs: 15,
      rateLimitUsed: 1,
      rateLimitMax: 60,
      tokenExpiresAt: null,
      lastChecked: new Date().toISOString(),
    });

    vi.spyOn(client2, 'getStationSummary').mockResolvedValue({
      data: {
        stationId: 'st-201',
        name: 'Beta Commercial Hub',
        liveSolarPowerKw: 120,
        dailyYieldKwh: 600,
        totalYieldMwh: 15,
        batterySoc: 85,
        batteryPowerKw: 10,
        gridPowerKw: -40,
        loadPowerKw: 70,
        capacityKw: 150,
        status: 'ONLINE',
        lastUpdated: new Date().toISOString(),
      },
      isLive: true,
      stationDetected: true,
    });
    vi.spyOn(client2, 'getBatchDeviceLatest').mockResolvedValue(new Map());
    vi.spyOn(client2, 'getHealth').mockResolvedValue({
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

    const summary = await aggregator.aggregateFleet(
      [client1, client2],
      [mockAccount1, mockAccount2]
    );

    expect(summary.totalAccounts).toBe(2);
    expect(summary.activeAccounts).toBe(2);
    expect(summary.totalPlants).toBe(2);
    expect(summary.totalInverters).toBe(4);
    expect(summary.totalCapacityKw).toBe(250);
    expect(summary.totalSolarPowerKw).toBe(200);
    expect(summary.totalDailyYieldKwh).toBe(1000);
    expect(summary.nodes.length).toBe(4);

    // Verify nodes map back to their proper account and station
    const nodeA1 = summary.nodes.find((n) => n.deviceSn === 'INV-A1');
    const nodeB1 = summary.nodes.find((n) => n.deviceSn === 'INV-B1');

    expect(nodeA1).toBeDefined();
    expect(nodeA1?.accountId).toBe('acc-1');
    expect(nodeA1?.stationName).toBe('Alpha Rooftop');

    expect(nodeB1).toBeDefined();
    expect(nodeB1?.accountId).toBe('acc-2');
    expect(nodeB1?.stationName).toBe('Beta Commercial Hub');
  });

  it('restricts demo accounts exclusively to the admin role', async () => {
    const { accountManager } = await import('../account-manager');
    vi.spyOn(accountManager as any, 'syncWithDirectus').mockResolvedValue(undefined);
    vi.spyOn(DeyeCloudClient.prototype, 'getHealth').mockResolvedValue({
      isLive: false,
      pingMs: 10,
      gatewayUrl: 'https://eu1-developer.deyecloud.com',
      region: 'EU',
      status: 'OPTIMAL',
      rateLimitUsed: 0,
      rateLimitMax: 60,
      tokenExpiresAt: null,
      lastChecked: new Date().toISOString(),
    });

    // As non-admin session role (e.g. viewer or consumer)
    const viewerAccounts = await accountManager.getAccountsSummary(false, 'viewer');
    const demoInViewer = viewerAccounts.filter(
      (a) => a.isDemo || a.id === 'men2-facility-2' || a.id === 'men2-facility-3'
    );
    expect(demoInViewer.length).toBe(0);

    // As admin session role
    const adminAccounts = await accountManager.getAccountsSummary(false, 'admin');
    const demoInAdmin = adminAccounts.filter(
      (a) => a.isDemo || a.id === 'men2-facility-2' || a.id === 'men2-facility-3'
    );
    expect(demoInAdmin.length).toBeGreaterThanOrEqual(2);
  });

  describe('3-Column Plant & Inverter Row Realignment Algorithm', () => {
    function computePlantRowLayout(
      plants: Array<{ id: string; invertersCount: number }>,
      expandedPlantIds: Set<string>
    ) {
      let currentRow = 1;
      return plants.map((plant) => {
        const isPlantExpanded = expandedPlantIds.has(plant.id);
        const rowSpan = isPlantExpanded && plant.invertersCount > 0 ? plant.invertersCount : 1;
        const startRow = currentRow;
        currentRow += rowSpan;
        return {
          plantId: plant.id,
          isPlantExpanded,
          startRow,
          rowSpan,
          inverterRows: isPlantExpanded && plant.invertersCount > 0
            ? Array.from({ length: plant.invertersCount }, (_, k) => startRow + k)
            : [],
        };
      });
    }

    it('matches user example: expanding plant 1 with 2 inverters shifts plant 2 to row 3', () => {
      const hanvinPlants = [
        { id: 'men2-office', invertersCount: 2 },
        { id: 'la-salette', invertersCount: 2 },
      ];

      // Step 1: Initial state (both plants collapsed)
      const initialLayout = computePlantRowLayout(hanvinPlants, new Set());
      expect(initialLayout[0].startRow).toBe(1);
      expect(initialLayout[0].rowSpan).toBe(1);
      expect(initialLayout[1].startRow).toBe(2);
      expect(initialLayout[1].rowSpan).toBe(1);

      // Step 2: Expand 1st plant ("Men 2 office") with 2 inverters
      const expandedP1Layout = computePlantRowLayout(hanvinPlants, new Set(['men2-office']));
      // Row 1: Hanvin / 1stplant / 1stinverter of 1st plant
      expect(expandedP1Layout[0].startRow).toBe(1);
      expect(expandedP1Layout[0].rowSpan).toBe(2);
      expect(expandedP1Layout[0].inverterRows).toEqual([1, 2]); // row 1: inv 1, row 2: inv 2

      // Row 3: Hanvin / 2ndplant / .
      expect(expandedP1Layout[1].startRow).toBe(3);
      expect(expandedP1Layout[1].rowSpan).toBe(1);
      expect(expandedP1Layout[1].inverterRows).toEqual([]); // collapsed
    });

    it('allows opening other plants without overlap (expanding both plants aligns rows sequentially)', () => {
      const hanvinPlants = [
        { id: 'men2-office', invertersCount: 2 },
        { id: 'la-salette', invertersCount: 2 },
        { id: 'plant-3', invertersCount: 1 },
      ];

      // Expand both plant 1 and plant 2
      const expandedBoth = computePlantRowLayout(hanvinPlants, new Set(['men2-office', 'la-salette']));

      // Plant 1 occupies rows 1..2
      expect(expandedBoth[0].startRow).toBe(1);
      expect(expandedBoth[0].rowSpan).toBe(2);
      expect(expandedBoth[0].inverterRows).toEqual([1, 2]);

      // Plant 2 occupies rows 3..4 (no overlap with Plant 1)
      expect(expandedBoth[1].startRow).toBe(3);
      expect(expandedBoth[1].rowSpan).toBe(2);
      expect(expandedBoth[1].inverterRows).toEqual([3, 4]);

      // Plant 3 occupies row 5 (pushed down below both plants' inverters)
      expect(expandedBoth[2].startRow).toBe(5);
      expect(expandedBoth[2].rowSpan).toBe(1);
    });

    it('collapsing plant 1 smoothly realigns plant 2 to row 2 without overlap', () => {
      const hanvinPlants = [
        { id: 'men2-office', invertersCount: 2 },
        { id: 'la-salette', invertersCount: 2 },
      ];

      // Plant 1 collapsed, Plant 2 expanded
      const p2Only = computePlantRowLayout(hanvinPlants, new Set(['la-salette']));

      expect(p2Only[0].startRow).toBe(1);
      expect(p2Only[0].rowSpan).toBe(1);
      expect(p2Only[1].startRow).toBe(2);
      expect(p2Only[1].rowSpan).toBe(2);
      expect(p2Only[1].inverterRows).toEqual([2, 3]);
    });
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DeyeCloudClient,
  extractDeviceDailyYieldKwh,
  extractDeviceRatedKw,
  extractDeviceSolarPowerWatts,
} from '../deye-client';
import { accountManager } from '../account-manager';
import type { DeyeAccountConfig, PlantInfo } from '../types';

describe('DeyeCloud Device Register Extraction & Auto-Discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts watts, daily kWh, and real ratedKw across hybrid and 30kW string register sets', () => {
    const hybridReg = new Map<string, string>([
      ['RatedPower', '50000.00'],
      ['TotalActiveACOutputPower', '9895'],
      ['DailyActiveProduction', '117.50'],
    ]);
    expect(extractDeviceSolarPowerWatts(hybridReg)).toBe(9895);
    expect(extractDeviceDailyYieldKwh(hybridReg)).toBe(117.5);
    expect(extractDeviceRatedKw(hybridReg)).toBe(50);

    const string30kReg = new Map<string, string>([
      ['RatedPower', '30000.00'],
      ['TotalSolarPower', '2810.00'],
      ['TotalInverterOutputPower', '2595'],
      ['PVDailyPowerGenerationActive', '72.00'],
    ]);
    expect(extractDeviceSolarPowerWatts(string30kReg)).toBe(2810);
    expect(extractDeviceDailyYieldKwh(string30kReg)).toBe(72);
    expect(extractDeviceRatedKw(string30kReg)).toBe(30);

    expect(extractDeviceRatedKw(new Map())).toBe(0);
    expect(extractDeviceSolarPowerWatts(null)).toBe(0);
  });

  it('links inverters to parent collector loggerSn via parentId and enriches real RatedPower from /device/latest', async () => {
    const client = new DeyeCloudClient({
      id: 'hanvin-test',
      name: 'Hanvin Solar',
      appId: 'valid-app-id',
      appSecret: 'valid-secret-key',
      email: 'ops@hanvin.local',
      password: 'valid-password',
    });
    vi.spyOn(client, 'getAccessToken').mockResolvedValue('mock-token');
    vi.spyOn(client, 'getBatchDeviceLatest').mockResolvedValue(
      new Map([
        ['2508141002', new Map([['RatedPower', '50000.00']])],
        ['2603282575', new Map([['RatedPower', '30000.00']])],
      ])
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: '1000000',
          stationList: [
            {
              id: 62738910,
              name: 'Men 2 warehouse (storage)',
              installedCapacity: 50,
              locationAddress: 'Dagupan',
              deviceTotal: 2,
              deviceListItems: [
                {
                  deviceSn: '3136569389',
                  deviceId: 4410711,
                  parentId: 4410711,
                  deviceType: 'COLLECTOR',
                  connectStatus: 1,
                },
                {
                  deviceSn: '2508141002',
                  deviceId: 18018142,
                  parentId: 4410711,
                  deviceType: 'INVERTER',
                  connectStatus: 1,
                },
              ],
            },
            {
              id: 62766678,
              name: 'Figaro',
              installedCapacity: 30,
              locationAddress: 'Dagupan',
              deviceTotal: 2,
              deviceListItems: [
                {
                  deviceSn: 'D26304839230',
                  deviceId: 4410900,
                  parentId: 4410900,
                  deviceType: 'COLLECTOR',
                  connectStatus: 1,
                },
                {
                  deviceSn: '2603282575',
                  deviceId: 18018999,
                  parentId: 4410900,
                  deviceType: 'INVERTER',
                  connectStatus: 1,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await client.discoverPlantsAndDevices();
    expect(res.isLive).toBe(true);
    expect(res.plants).toHaveLength(2);

    const warehouse = res.plants.find((p) => p.stationId === '62738910')!;
    const whInv = warehouse.devices.find((d) => d.deviceType === 'INVERTER')!;
    expect(whInv.deviceSn).toBe('2508141002');
    expect(whInv.ratedKw).toBe(50);
    expect(whInv.loggerSn).toBe('3136569389');

    const figaro = res.plants.find((p) => p.stationId === '62766678')!;
    const figInv = figaro.devices.find((d) => d.deviceType === 'INVERTER')!;
    expect(figInv.deviceSn).toBe('2603282575');
    expect(figInv.ratedKw).toBe(30);
    expect(figInv.loggerSn).toBe('D26304839230');
  });

  it('prevents stale Directus rows with null last_checked_at from overwriting fresher auto-discovered stations/inverters', async () => {
    const fresherPlants: PlantInfo[] = [
      {
        stationId: '62738910',
        stationName: 'Men 2 warehouse (storage)',
        installedCapacityKw: 50,
        devices: [
          {
            deviceSn: '3136569389',
            deviceType: 'LOGGER',
            name: 'Logger',
            ratedKw: 0,
            status: 'ONLINE',
          },
          {
            deviceSn: '2508141002',
            deviceType: 'INVERTER',
            name: 'Inverter',
            ratedKw: 50,
            status: 'ONLINE',
          },
        ],
      },
      {
        stationId: '62766678',
        stationName: 'Figaro',
        installedCapacityKw: 30,
        devices: [
          {
            deviceSn: '2603282575',
            deviceType: 'INVERTER',
            name: 'Figaro Inv',
            ratedKw: 30,
            status: 'ONLINE',
          },
        ],
      },
    ];

    const diskAcc: DeyeAccountConfig = {
      id: 'men2-facility-1',
      directusId: '1',
      name: 'Hanvin Solar',
      enabled: true,
      admin: true,
      baseUrl: 'https://eu1-developer.deyecloud.com',
      appId: 'app',
      appSecret: 'secret',
      email: 'hanvinsolar@gmail.com',
      password: 'pass',
      autoDiscovered: true,
      lastSyncedAt: '2026-11-16T08:30:00.000Z',
      plants: fresherPlants,
    };

    vi.spyOn(accountManager, 'getAllRawAccounts').mockReturnValue([diskAcc]);
    const saveSpy = vi.spyOn(accountManager, 'saveAccountsToFile').mockReturnValue(true);

    vi.spyOn(accountManager, 'fetchCollection').mockImplementation(async (col: string) => {
      if (col.includes('configs')) {
        return [
          {
            id: 1,
            profile_name: 'Hanvin Solar',
            base_url: 'https://eu1-developer.deyecloud.com',
            app_id: 'app',
            app_secret: 'secret',
            account_email: 'hanvinsolar@gmail.com',
            account_password: 'pass',
            status: 'OPTIMAL',
            last_checked_at: null,
          },
        ];
      }
      if (col.includes('stations')) {
        return [
          {
            id: 7,
            station_id: '62738910',
            deye_config_id: 1,
            name: 'Men 2 warehouse (storage)',
            installed_capacity_kw: 50,
            grid_type: '3-PHASE',
            is_active: 1,
          },
        ];
      }
      if (col.includes('devices')) {
        // Stale Directus snapshot only has the collector, missing inverter 2508141002
        return [
          {
            id: 52,
            device_sn: '3136569389',
            station_id: '62738910',
            device_type: 'LOGGER',
            status: 'ONLINE',
          },
        ];
      }
      return [];
    });

    const synced = await accountManager.syncWithDirectus(true);
    const hanvin = synced.find((a) => a.id === 'men2-facility-1')!;
    expect(hanvin).toBeDefined();
    expect(hanvin.lastSyncedAt).toBe('2026-11-16T08:30:00.000Z');
    expect(hanvin.plants?.find((p) => p.stationId === '62766678')).toBeDefined();
    const wh = hanvin.plants?.find((p) => p.stationId === '62738910')!;
    expect(wh.devices.some((d) => d.deviceSn === '2508141002')).toBe(true);
    expect(saveSpy).toHaveBeenCalled();
  });
});

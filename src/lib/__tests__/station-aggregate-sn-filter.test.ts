import { describe, it, expect } from 'vitest';
import { isValidInverterSn } from '../telemetry-cache';
import {
  getSingleInverterStationView,
  getSnLiveOverlay,
} from '../deye-client';
import { filterFleetByDeviceSn } from '../fleet-aggregator';
import type {
  AggregatedFleetSummary,
  PlantInfo,
  StationSummary,
} from '../types';

const accountAPlants: PlantInfo[] = [
  {
    stationId: 'SP_04',
    stationName: 'North Array',
    installedCapacityKw: 20,
    devices: [
      { deviceSn: 'SN-A-001', deviceType: 'INVERTER', name: 'Inv A1', status: 'ONLINE' },
      { deviceSn: 'SN-A-002', deviceType: 'INVERTER', name: 'Inv A2', status: 'ONLINE' },
    ],
  },
];

const accountBPlants: PlantInfo[] = [
  {
    stationId: 'SP_09',
    stationName: 'South Array',
    installedCapacityKw: 10,
    devices: [
      { deviceSn: 'SN-B-001', deviceType: 'INVERTER', name: 'Inv B1', status: 'ONLINE' },
    ],
  },
];

const stationBase: StationSummary = {
  stationId: 'SP_04',
  name: 'North Array',
  capacityKw: 20,
  liveSolarPowerKw: 15.5,
  dailyYieldKwh: 120,
  totalYieldMwh: 3.1,
  batterySoc: 80,
  batteryPowerKw: 2,
  gridPowerKw: -1,
  loadPowerKw: 5,
  status: 'ONLINE',
  lastUpdated: new Date().toISOString(),
};

function batchFor(sn: string): Map<string, Map<string, string>> {
  return new Map([
    [sn, new Map([
      ['TotalActiveACOutputPower', '5250'],
      ['DailyActiveProduction', '42.5'],
    ])],
  ]);
}

function fleetFixture(): AggregatedFleetSummary {
  const node = (
    accountId: string,
    deviceSn: string,
    stationId: string
  ) => ({
    accountId,
    accountName: accountId,
    stationName: stationId,
    stationId,
    deviceSn,
    deviceType: 'INVERTER' as const,
    model: 'SUN-100K-SG01HP3-EU-AM2',
    ratedKw: 100,
    liveSolarPowerKw: 5.25,
    dailyYieldKwh: 42.5,
    batterySoc: 80,
    mode: 'PEAK SHAVING',
    status: 'ONLINE' as const,
    isLive: true,
  });
  return {
    totalAccounts: 2,
    activeAccounts: 2,
    totalPlants: 2,
    totalInverters: 3,
    totalLoggers: 0,
    totalCapacityKw: 30,
    totalSolarPowerKw: 15.5,
    totalDailyYieldKwh: 120,
    totalLifetimeYieldMwh: 3.1,
    avgBatterySoc: 80,
    totalBatteryPowerKw: 2,
    netGridPowerKw: -1,
    totalLoadPowerKw: 5,
    accounts: [],
    nodes: [
      node('acc-a', 'SN-A-001', 'SP_04'),
      node('acc-a', 'SN-A-002', 'SP_04'),
      node('acc-b', 'SN-B-001', 'SP_09'),
    ],
    isLive: true,
    lastUpdated: new Date().toISOString(),
  };
}

describe('station + aggregate SN-aware filtering', () => {
  it('ALL / missing SN keeps full fleet unchanged (byte-identical passthrough)', () => {
    const fleet = fleetFixture();
    expect(filterFleetByDeviceSn(fleet, undefined)).toBeNull();
    expect(filterFleetByDeviceSn(fleet, 'ALL')).toBeNull();
    expect(filterFleetByDeviceSn(fleet, 'ALL_FLEET')).toBeNull();
    expect(isValidInverterSn(accountAPlants, undefined)).toBe(true);
    expect(isValidInverterSn(accountAPlants, 'ALL')).toBe(true);
  });

  it('SN present returns single-node filtered view with deviceSn', () => {
    const fleet = fleetFixture();
    const filtered = filterFleetByDeviceSn(fleet, 'SN-A-001');
    expect(filtered).not.toBeNull();
    expect(filtered?.nodes).toHaveLength(1);
    expect(filtered?.nodes[0]?.deviceSn).toBe('SN-A-001');
    expect(filtered?.deviceSn).toBe('SN-A-001');
  });

  it('unknown SN yields no match (route maps to 404)', () => {
    const fleet = fleetFixture();
    expect(filterFleetByDeviceSn(fleet, 'NOPE-0000')).toBeNull();
    expect(isValidInverterSn(accountAPlants, 'NOPE-0000')).toBe(false);
    expect(getSingleInverterStationView(stationBase, batchFor('SN-A-001'), 'NOPE-0000')).toBeNull();
  });

  it('cross-account SN fails tenant ownership check (route maps to 404, not 403)', () => {
    expect(isValidInverterSn(accountAPlants, 'SN-B-001')).toBe(false);
    expect(isValidInverterSn(accountBPlants, 'SN-B-001')).toBe(true);
    const consumerScoped = {
      ...fleetFixture(),
      nodes: fleetFixture().nodes.filter((n) => n.accountId === 'acc-a'),
    };
    expect(filterFleetByDeviceSn(consumerScoped, 'SN-B-001')).toBeNull();
    expect(filterFleetByDeviceSn(fleetFixture(), 'SN-B-001')?.nodes).toHaveLength(1);
  });

  it('station SN overlay derives live fields from getBatchDeviceLatest([sn]) map', () => {
    const view = getSingleInverterStationView(stationBase, batchFor('SN-A-001'), 'SN-A-001');
    expect(view?.deviceSn).toBe('SN-A-001');
    expect(view?.data).toBe(stationBase);
    const overlay = getSnLiveOverlay(view?.raw ?? new Map());
    expect(overlay.liveSolarPowerKw).toBe(5.25);
    expect(overlay.todayEnergyKwh).toBe(42.5);
  });
});

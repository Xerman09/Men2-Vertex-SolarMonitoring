import { describe, it, expect } from 'vitest';
import {
  DeyeCloudClient,
  getInverterShareInfo,
  getSingleInverterStationView,
} from '../deye-client';
import type { PlantInfo, StationSummary } from '../types';

function makePlants(): PlantInfo[] {
  return [
    {
      stationId: 'SP_04',
      stationName: 'SunPeak Industrial Array #04',
      installedCapacityKw: 120,
      devices: [
        {
          deviceSn: 'INV-A-001',
          deviceType: 'INVERTER',
          name: 'Inverter A',
          model: 'SUN-60K-SG01HP3',
          ratedKw: 60,
          status: 'ONLINE',
        },
        {
          deviceSn: 'INV-B-002',
          deviceType: 'INVERTER',
          name: 'Inverter B',
          model: 'SUN-60K-SG01HP3',
          ratedKw: 60,
          status: 'ONLINE',
        },
      ],
    },
  ];
}

function makeSummary(): StationSummary {
  return {
    stationId: 'SP_04',
    name: 'SunPeak Industrial Array #04',
    capacityKw: 120,
    liveSolarPowerKw: 100,
    dailyYieldKwh: 400,
    totalYieldMwh: 140,
    batterySoc: 90,
    batteryPowerKw: 20,
    gridPowerKw: 25,
    loadPowerKw: 55,
    status: 'ONLINE',
    lastUpdated: new Date().toISOString(),
  };
}

describe('DeyeCloudClient per-inverter scaling (TDD)', () => {
  it('keeps old 3-arg getHourlyEnergy calls byte-identical', () => {
    const client = new DeyeCloudClient({ plants: makePlants() });
    const legacy = client.getHourlyEnergy('TODAY', 60, '2026-01-05');
    const viaDefault = client.getHourlyEnergy('TODAY', 60, '2026-01-05');
    expect(viaDefault).toEqual(legacy);
    expect(JSON.stringify(viaDefault)).toBe(JSON.stringify(legacy));
  });

  it('scales mock series deterministically by SN hash times capacityRatio', () => {
    const client = new DeyeCloudClient({ plants: makePlants() });
    const base = client.getHourlyEnergy('TODAY', 60, '2026-01-05');
    const scaled = client.getHourlyEnergy('TODAY', 60, '2026-01-05', {
      deviceSn: 'INV-A-001',
      capacityRatio: 0.5,
    });
    expect(scaled.length).toBe(base.length);
    // Null (future) slots stay null; shape preserved
    for (let i = 0; i < base.length; i++) {
      expect(scaled[i].hour).toBe(base[i].hour);
      expect(scaled[i].isElapsed).toBe(base[i].isElapsed);
      expect(scaled[i].tariffRateUsd).toBe(base[i].tariffRateUsd);
      if (base[i].solarYieldKw === null) {
        expect(scaled[i].solarYieldKw).toBeNull();
      }
    }
    // At least one elapsed solar point is scaled (not equal, within factor bounds)
    const idx = base.findIndex(
      (p) => p.solarYieldKw !== null && p.solarYieldKw > 0
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    const b = base[idx].solarYieldKw as number;
    const s = scaled[idx].solarYieldKw as number;
    expect(s).toBeGreaterThan(0);
    expect(s).not.toBe(b);
    const factor = s / b;
    // hash variance 0.9-1.1 times ratio 0.5 => 0.45-0.55
    expect(factor).toBeGreaterThanOrEqual(0.44);
    expect(factor).toBeLessThanOrEqual(0.56);
  });

  it('returns identical series for same SN+date twice (determinism)', () => {
    const client = new DeyeCloudClient({ plants: makePlants() });
    const first = client.getHourlyEnergy('TODAY', 60, '2026-01-05', {
      deviceSn: 'INV-A-001',
    });
    const second = client.getHourlyEnergy('TODAY', 60, '2026-01-05', {
      deviceSn: 'INV-A-001',
    });
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('getInverterShareInfo returns share info for known SN', () => {
    const info = getInverterShareInfo(makePlants(), 'INV-A-001');
    expect(info).not.toBeNull();
    expect(info?.ratedKw).toBe(60);
    expect(info?.baseCapKw).toBe(120);
    expect(info?.ratio).toBeCloseTo(0.5, 5);
    expect(info?.plant.stationId).toBe('SP_04');
    expect(info?.device.deviceSn).toBe('INV-A-001');
  });

  it('getInverterShareInfo returns null for unknown SN', () => {
    expect(getInverterShareInfo(makePlants(), 'NOPE-999')).toBeNull();
  });

  it('getSingleInverterStationView returns filtered view, null for unknown SN', () => {
    const batch = new Map<string, Map<string, string>>([
      ['INV-A-001', new Map([['TotalActiveACOutputPower', '30000']])],
    ]);
    const view = getSingleInverterStationView(
      makeSummary(),
      batch,
      'INV-A-001'
    );
    expect(view).not.toBeNull();
    expect(view?.deviceSn).toBe('INV-A-001');
    const missing = getSingleInverterStationView(
      makeSummary(),
      batch,
      'UNKNOWN-SN'
    );
    expect(missing).toBeNull();
  });
});

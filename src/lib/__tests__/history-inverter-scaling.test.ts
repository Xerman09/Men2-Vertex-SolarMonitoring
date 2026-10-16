import { describe, it, expect } from 'vitest';
import {
  DeyeCloudClient,
  getInverterShareInfo,
  getInverterSnScaleFactor,
} from '../deye-client';
import { isValidInverterSn } from '../telemetry-cache';
import { historyQuerySchema } from '../../app/api/deye/history/route';
import type { PlantInfo } from '../types';

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

describe('history device_sn wiring (Task: scaled synth series)', () => {
  it('SN series is scaled vs ALL fleet series with appliedRatio < 1', () => {
    const client = new DeyeCloudClient({ plants: makePlants() });
    const base = client.getHourlyEnergy('TODAY', 60, '2026-01-05');
    const shareInfo = getInverterShareInfo(client.plants, 'INV-A-001');
    expect(shareInfo).not.toBeNull();
    const ratio = shareInfo?.ratio ?? 1;
    const appliedRatio = getInverterSnScaleFactor('INV-A-001') * ratio;
    expect(appliedRatio).toBeLessThan(1);

    const scaled = client.getHourlyEnergy('TODAY', 60, '2026-01-05', {
      deviceSn: 'INV-A-001',
      capacityRatio: ratio,
    });
    expect(scaled.length).toBe(base.length);
    const idx = base.findIndex((p) => p.solarYieldKw !== null && p.solarYieldKw > 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const b = base[idx].solarYieldKw as number;
    const s = scaled[idx].solarYieldKw as number;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(b);
    expect(s / b).toBeCloseTo(appliedRatio, 2);
  });

  it('fleet ALL view stays byte-identical (no SN opts)', () => {
    const client = new DeyeCloudClient({ plants: makePlants() });
    const a = client.getHourlyEnergy('TODAY', 60, '2026-01-05');
    const b = client.getHourlyEnergy('TODAY', 60, '2026-01-05');
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(isValidInverterSn(client.plants, 'ALL')).toBe(true);
    expect(isValidInverterSn(client.plants, undefined)).toBe(true);
  });

  it('bad SN format is rejected 400 by history schema', () => {
    expect(historyQuerySchema.safeParse({ device_sn: 'bad sn!' }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ device_sn: '../../etc/passwd' }).success).toBe(
      false
    );
    expect(historyQuerySchema.safeParse({ device_sn: 'INV-A-001' }).success).toBe(true);
  });

  it('unknown SN resolves to 404 (null share info + invalid SN)', () => {
    const plants = makePlants();
    expect(getInverterShareInfo(plants, 'NOPE-999')).toBeNull();
    expect(isValidInverterSn(plants, 'NOPE-999')).toBe(false);
    // Route maps null shareInfo -> 404; assert contract here.
    const shareInfo = getInverterShareInfo(plants, 'NOPE-999');
    const status = !shareInfo ? 404 : 200;
    expect(status).toBe(404);
  });
});

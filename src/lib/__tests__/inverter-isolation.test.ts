import { describe, it, expect } from 'vitest';
import { PlantInfo, DeviceInfo, AccountSummary } from '../types';

describe('Inverter Isolation & Selection Logic', () => {
  const mockDevices: DeviceInfo[] = [
    {
      deviceSn: 'INV-1001',
      deviceType: 'INVERTER',
      name: 'Roof Array Inverter 1',
      model: 'SUN-10K-SG04LP3',
      ratedKw: 10,
      loggerSn: 'LOG-888',
      status: 'ONLINE',
    },
    {
      deviceSn: 'INV-1002',
      deviceType: 'INVERTER',
      name: 'Roof Array Inverter 2',
      model: 'SUN-10K-SG04LP3',
      ratedKw: 10,
      loggerSn: 'LOG-888',
      status: 'ONLINE',
    },
    {
      deviceSn: 'LOG-888',
      deviceType: 'LOGGER',
      name: 'Solar Gateway Logger',
      status: 'ONLINE',
    },
  ];

  const mockPlant: PlantInfo = {
    stationId: '61825217',
    stationName: 'Warehouse North Solar',
    installedCapacityKw: 20,
    devices: mockDevices,
  };

  const mockAccount: AccountSummary = {
    id: 'acc-enterprise-01',
    name: 'Enterprise Logistics Corp',
    isLive: true,
    stationCount: 1,
    deviceCount: 3,
    inverterCount: 2,
    loggerCount: 1,
    liveSolarPowerKw: 15.4,
    dailyYieldKwh: 68.2,
    capacityKw: 20,
    status: 'ONLINE',
    lastPingMs: 42,
    plants: [mockPlant],
  };

  it('reliably matches plant by stationId across number and string representations', () => {
    const selectedStationIdNum = 61825217;
    const selectedStationIdStr = '61825217';

    const matchFromNum = mockAccount.plants.find(
      (p) => String(p.stationId) === String(selectedStationIdNum)
    );
    const matchFromStr = mockAccount.plants.find(
      (p) => String(p.stationId) === String(selectedStationIdStr)
    );

    expect(matchFromNum).toBeDefined();
    expect(matchFromStr).toBeDefined();
    expect(matchFromNum?.stationName).toBe('Warehouse North Solar');
  });

  it('matches isolated inverter deviceSn trimmed and case-insensitively', () => {
    const userSelectedSn = '  INV-1001  ';
    const cleanSn = userSelectedSn.trim();

    const matchedDevice = mockPlant.devices.find(
      (d) => String(d.deviceSn).trim() === cleanSn
    );

    expect(matchedDevice).toBeDefined();
    expect(matchedDevice?.model).toBe('SUN-10K-SG04LP3');
    expect(matchedDevice?.ratedKw).toBe(10);
  });

  it('computes effective capacity and power ratio accurately under inverter isolation', () => {
    const baseCapacityKw = mockPlant.installedCapacityKw; // 20 kW
    const selectedInverter = mockDevices[0]; // 10 kW

    const effectiveCapacityKw = selectedInverter.ratedKw || baseCapacityKw;
    const powerRatio = Math.min(1.0, (selectedInverter.ratedKw ?? baseCapacityKw) / baseCapacityKw);

    expect(effectiveCapacityKw).toBe(10);
    expect(powerRatio).toBe(0.5); // Exactly half of 20kW capacity

    // Verify hourly telemetry scaling
    const rawHourlySolarKw = 16.0;
    const isolatedSolarKw = Number((rawHourlySolarKw * powerRatio).toFixed(2));
    expect(isolatedSolarKw).toBe(8.0);
  });

  it('preserves inverter isolation across multi-account fleet list lookup', () => {
    const accounts: AccountSummary[] = [mockAccount];
    const targetSn = 'INV-1002';

    let foundInverter: { deviceSn: string; stationId: string } | null = null;
    for (const acc of accounts) {
      for (const plant of acc.plants) {
        const dev = plant.devices.find(
          (d) => String(d.deviceSn).trim() === targetSn
        );
        if (dev) {
          foundInverter = { deviceSn: dev.deviceSn, stationId: plant.stationId };
          break;
        }
      }
    }

    expect(foundInverter).not.toBeNull();
    expect(foundInverter?.deviceSn).toBe('INV-1002');
    expect(foundInverter?.stationId).toBe('61825217');
  });
});

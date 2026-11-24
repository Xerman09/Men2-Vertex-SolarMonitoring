import { describe, it, expect } from 'vitest';
import { inverterCacheKey, isValidInverterSn } from '../telemetry-cache';
import { historyQuerySchema } from '../../app/api/deye/history/route';
import { stationQuerySchema } from '../../app/api/deye/station/route';
import { aggregateQuerySchema } from '../../app/api/deye/aggregate/route';
import type { PlantInfo } from '../types';

const mockPlants: PlantInfo[] = [
  {
    stationId: 'SP_04',
    stationName: 'North Array',
    installedCapacityKw: 20,
    devices: [
      { deviceSn: '2209X891104', deviceType: 'INVERTER', name: 'Inv 1', status: 'ONLINE' },
      { deviceSn: '2209X891105', deviceType: 'INVERTER', name: 'Inv 2', status: 'ONLINE' },
    ],
  },
  {
    stationId: 'SP_05',
    stationName: 'South Array',
    installedCapacityKw: 10,
    devices: [{ deviceSn: 'LOG-888', deviceType: 'LOGGER', name: 'Logger', status: 'ONLINE' }],
  },
];

describe('device_sn contract', () => {
  it('inverterCacheKey builds deterministic acc:station:sn key', () => {
    expect(inverterCacheKey('acc1', 'SP_04', '2209X891104')).toBe('acc1:SP_04:2209X891104');
  });

  it('inverterCacheKey appends extra suffix when provided', () => {
    expect(inverterCacheKey('acc1', 'SP_04', '2209X891104', 'telemetry')).toBe(
      'acc1:SP_04:2209X891104:telemetry'
    );
  });

  it('inverterCacheKey defaults missing sn to ALL', () => {
    expect(inverterCacheKey('acc1', 'SP_04')).toBe('acc1:SP_04:ALL');
  });

  it('isValidInverterSn returns true for owned SN', () => {
    expect(isValidInverterSn(mockPlants, '2209X891104')).toBe(true);
  });

  it('isValidInverterSn returns false for unknown SN', () => {
    expect(isValidInverterSn(mockPlants, 'NOPE-0000')).toBe(false);
  });

  it('isValidInverterSn passes ALL/undefined through (byte-identical fleet view)', () => {
    expect(isValidInverterSn(mockPlants, 'ALL')).toBe(true);
    expect(isValidInverterSn(mockPlants, undefined)).toBe(true);
  });

  it('history schema accepts valid device_sn and rejects BAD SN', () => {
    expect(historyQuerySchema.safeParse({ device_sn: '2209X891104' }).success).toBe(true);
    expect(historyQuerySchema.safeParse({ device_sn: 'ALL' }).success).toBe(true);
    expect(historyQuerySchema.safeParse({}).success).toBe(true);
    expect(historyQuerySchema.safeParse({ device_sn: 'bad sn!' }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ device_sn: '../../etc/passwd' }).success).toBe(false);
  });

  it('station schema accepts valid device_sn and rejects BAD SN', () => {
    expect(stationQuerySchema.safeParse({ device_sn: 'INV-1001' }).success).toBe(true);
    expect(stationQuerySchema.safeParse({}).success).toBe(true);
    expect(stationQuerySchema.safeParse({ device_sn: 'bad sn!' }).success).toBe(false);
  });

  it('aggregate schema accepts valid device_sn and rejects BAD SN', () => {
    expect(aggregateQuerySchema.safeParse({ device_sn: 'INV-1001' }).success).toBe(true);
    expect(aggregateQuerySchema.safeParse({}).success).toBe(true);
    expect(aggregateQuerySchema.safeParse({ device_sn: 'acc<script>' }).success).toBe(false);
  });
});

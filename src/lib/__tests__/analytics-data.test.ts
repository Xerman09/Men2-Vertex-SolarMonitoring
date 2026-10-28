import { describe, it, expect } from 'vitest';
import {
  generateDailyAnalytics,
  generateMonthlyAnalytics,
  generateBatteryHourlyTelemetry,
  computeAnalyticsSummary,
} from '../analytics-data';
import { HourlyEnergyPoint } from '../types';

describe('Analytics Data & Model Calculations', () => {
  it('generates 7-day and 30-day daily analytics datasets properly scaled by capacity', () => {
    const days7 = generateDailyAnalytics(7, 120);
    expect(days7).toHaveLength(7);
    expect(days7[0]).toHaveProperty('solarYieldKwh');
    expect(days7[0]).toHaveProperty('loadDemandKwh');
    expect(days7[0]).toHaveProperty('performanceRatioPct');
    expect(days7[0].solarYieldKwh).toBeGreaterThan(0);

    const days30 = generateDailyAnalytics(30, 240);
    expect(days30).toHaveLength(30);
    // 240 kWp capacity should produce ~2x compared to 120 kWp capacity
    expect(days30[0].solarYieldKwh).toBeGreaterThan(days7[0].solarYieldKwh);
  });

  it('generates 12 months seasonal analytics breakdown', () => {
    const monthly = generateMonthlyAnalytics(150);
    expect(monthly).toHaveLength(12);
    expect(monthly[0].month).toBe('Jan');
    expect(monthly[11].month).toBe('Dec');
    expect(monthly[5].month).toBe('Jun');
    // Summer solar yield in Jun/Jul should exceed winter solar yield in Jan/Dec
    expect(monthly[5].solarYieldMwh).toBeGreaterThan(monthly[0].solarYieldMwh);
  });

  it('generates 24-hour battery State-of-Charge and flow profile', () => {
    const batteryProfile = generateBatteryHourlyTelemetry();
    expect(batteryProfile).toHaveLength(24);
    expect(batteryProfile[0].socPct).toBeGreaterThanOrEqual(0);
    expect(batteryProfile[0].socPct).toBeLessThanOrEqual(100);

    // During midday solar charging hours (e.g. 12:00 = index 12), power should be positive (charging)
    const midday = batteryProfile[12];
    expect(midday.batteryPowerKw).toBeGreaterThan(0);
    expect(midday.state).toBe('CHARGING');

    // During evening peak hours (e.g. 19:00 = index 19), power should be negative (discharging)
    const evening = batteryProfile[19];
    expect(evening.batteryPowerKw).toBeLessThan(0);
    expect(evening.state).toBe('DISCHARGING');
  });

  it('computes accurate executive KPI summaries from hourly telemetry points', () => {
    const mockHourly: HourlyEnergyPoint[] = [
      {
        hour: '10:00',
        solarYieldKw: 80,
        loadDemandKw: 50,
        batteryFlowKw: 20,
        gridFlowKw: 10,
        tariffRateUsd: 0.14,
        isElapsed: true,
      },
      {
        hour: '12:00',
        solarYieldKw: 120,
        loadDemandKw: 60,
        batteryFlowKw: 30,
        gridFlowKw: 30,
        tariffRateUsd: 0.14,
        isElapsed: true,
      },
      {
        hour: '18:00',
        solarYieldKw: 10,
        loadDemandKw: 70,
        batteryFlowKw: -25,
        gridFlowKw: -35,
        tariffRateUsd: 0.36,
        isElapsed: true,
      },
    ];

    const summary = computeAnalyticsSummary(mockHourly, 120);
    expect(summary.totalSolarYieldKwh).toBeGreaterThan(0);
    expect(summary.peakSolarKw).toBe(120);
    expect(summary.peakHour).toBe('12:00');
    expect(summary.selfConsumptionPct).toBeGreaterThan(0);
    expect(summary.selfConsumptionPct).toBeLessThanOrEqual(100);
    expect(summary.co2AvoidedKg).toBeGreaterThan(0);
  });

  it('honors reported daily yield and live solar power from live hardware telemetry', () => {
    const mockHourly: HourlyEnergyPoint[] = [
      {
        hour: '12:00',
        solarYieldKw: 50,
        loadDemandKw: 30,
        batteryFlowKw: 0,
        gridFlowKw: 20,
        tariffRateUsd: 0.14,
        isElapsed: true,
      },
    ];

    const summary = computeAnalyticsSummary(mockHourly, 100, false, {
      dailyYieldKwh: 324.2,
      liveSolarPowerKw: 85.0,
    });

    expect(summary.totalSolarYieldKwh).toBe(324.2);
    expect(summary.peakSolarKw).toBe(85.0);
  });
});

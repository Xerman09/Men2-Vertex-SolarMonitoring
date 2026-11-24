import { describe, it, expect } from 'vitest';
import {
  calculateSinusoidalFit,
  calculateFourierDecomposition,
  calculatePolarCyclicalPoints,
  generateThreePhaseACWaveforms,
  HourlySolarPoint,
} from '../trigonometric-math';

describe('Trigonometric Math Engine', () => {
  const mockHourlyData: HourlySolarPoint[] = [
    { hour: '06:00', hourDecimal: 6.0, solarYieldKw: 5.0, loadDemandKw: 30, batteryFlowKw: 0, gridExportKw: 0, isElapsed: true },
    { hour: '09:00', hourDecimal: 9.0, solarYieldKw: 45.0, loadDemandKw: 50, batteryFlowKw: 10, gridExportKw: 0, isElapsed: true },
    { hour: '12:00', hourDecimal: 12.0, solarYieldKw: 95.0, loadDemandKw: 60, batteryFlowKw: 25, gridExportKw: 10, isElapsed: true },
    { hour: '15:00', hourDecimal: 15.0, solarYieldKw: 50.0, loadDemandKw: 55, batteryFlowKw: 5, gridExportKw: 0, isElapsed: true },
    { hour: '18:00', hourDecimal: 18.0, solarYieldKw: 5.0, loadDemandKw: 40, batteryFlowKw: -15, gridExportKw: 0, isElapsed: true },
    { hour: '21:00', hourDecimal: 21.0, solarYieldKw: 0.0, loadDemandKw: 35, batteryFlowKw: -20, gridExportKw: 0, isElapsed: true },
  ];

  it('calculates sinusoidal clear-sky curve fit', () => {
    const fit = calculateSinusoidalFit(mockHourlyData, 100);
    expect(fit.theoreticalPoints.length).toBe(mockHourlyData.length);
    expect(fit.actualPeakKw).toBe(95.0);
    expect(fit.peakSunHours).toBeGreaterThan(0);
    expect(fit.rSquared).toBeGreaterThanOrEqual(0);
  });

  it('decomposes Fourier harmonics', () => {
    const fourier = calculateFourierDecomposition(mockHourlyData);
    expect(fourier.length).toBe(mockHourlyData.length);
    for (const pt of fourier) {
      expect(pt).toHaveProperty('fundamentalHarmonicKw');
      expect(pt).toHaveProperty('fourierReconstructedKw');
    }
  });

  it('generates 24-hour polar phasor coordinates', () => {
    const polar = calculatePolarCyclicalPoints(mockHourlyData);
    expect(polar.length).toBe(mockHourlyData.length);
    // 06:00 is 90 degrees
    const at6 = polar.find((p) => p.hourLabel === '06:00');
    expect(at6?.angleDeg).toBe(90);
    // 12:00 is 180 degrees
    const at12 = polar.find((p) => p.hourLabel === '12:00');
    expect(at12?.angleDeg).toBe(180);
  });

  it('generates three-phase AC waveforms and phasor metrics', () => {
    const result = generateThreePhaseACWaveforms(230, 20, 60, 0.95, 64);
    expect(result.waveform.length).toBe(65);
    expect(result.waveform[0]).toHaveProperty('voltagePhaseA');
    expect(result.waveform[0]).toHaveProperty('voltagePhaseB');
    expect(result.waveform[0]).toHaveProperty('voltagePhaseC');
    expect(result.waveform[0]).toHaveProperty('currentA');

    const metrics = result.metrics;
    expect(metrics.frequencyHz).toBe(60);
    expect(metrics.powerFactorCosPhi).toBe(0.95);
    expect(metrics.vrmsAvg).toBe(230);
    expect(metrics.activePowerKw).toBeGreaterThan(0);
    expect(metrics.reactivePowerKvar).toBeGreaterThanOrEqual(0);
    expect(metrics.apparentPowerKva).toBeGreaterThanOrEqual(metrics.activePowerKw);
  });
});

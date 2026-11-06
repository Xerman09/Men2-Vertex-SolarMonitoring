import { describe, it, expect } from 'vitest';
import {
  detectUtilityTariff,
  resolveActiveTariff,
  PHILIPPINE_UTILITY_PRESETS,
  DEFAULT_TARIFF_SCHEDULE,
} from '../tariff-rates';

describe('Tariff Rates & Auto-Detection Suite', () => {
  it('auto-detects DECORP for Dagupan plants', () => {
    const tariff1 = detectUtilityTariff('Bonuan boquig dagupan');
    expect(tariff1.id).toBe('decorp');
    expect(tariff1.peakRatePerKwh).toBe(13.90);

    const tariff2 = detectUtilityTariff('Dagupan City, Pangasinan');
    expect(tariff2.id).toBe('decorp');
  });

  it('auto-detects Meralco for Metro Manila / Bulacan locations', () => {
    const tariff = detectUtilityTariff('Quezon City, Metro Manila');
    expect(tariff.id).toBe('meralco');
    expect(tariff.peakRatePerKwh).toBe(14.80);
    expect(tariff.offPeakRatePerKwh).toBe(10.50);
  });

  it('auto-detects VECO for Cebu locations', () => {
    const tariff = detectUtilityTariff('Cebu IT Park, Cebu City');
    expect(tariff.id).toBe('veco');
  });

  it('auto-detects DLPC for Davao locations', () => {
    const tariff = detectUtilityTariff('Davao City, Mindanao');
    expect(tariff.id).toBe('dlpc');
  });

  it('falls back to National ERC Commercial Average for unknown locations', () => {
    const tariff = detectUtilityTariff('Unknown Solar Station 99');
    expect(tariff.id).toBe(DEFAULT_TARIFF_SCHEDULE.id);
    expect(tariff.peakRatePerKwh).toBe(14.50);
  });

  it('resolves active tariff with custom overrides', () => {
    const resolved = resolveActiveTariff({
      plantAddress: 'Bonuan boquig dagupan',
      savedConfig: {
        presetId: 'custom',
        custom: {
          peakRatePerKwh: 15.20,
          offPeakRatePerKwh: 11.00,
          exportCreditPerKwh: 7.00,
        },
      },
    });

    expect(resolved.isCustom).toBe(true);
    expect(resolved.peakRate).toBe(15.20);
    expect(resolved.offPeakRate).toBe(11.00);
    expect(resolved.exportCredit).toBe(7.00);
  });

  it('resolves active tariff with specific preset choice over auto-detection', () => {
    const resolved = resolveActiveTariff({
      plantAddress: 'Dagupan City',
      savedConfig: {
        presetId: 'meralco',
      },
    });

    expect(resolved.schedule.id).toBe('meralco');
    expect(resolved.peakRate).toBe(14.80);
    expect(resolved.isAutoDetected).toBe(false);
  });
});


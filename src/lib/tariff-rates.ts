export interface UtilityTariffSchedule {
  id: string;
  name: string;
  shortName: string;
  region: string;
  coverageKeywords: string[];
  peakRatePerKwh: number;
  offPeakRatePerKwh: number;
  exportCreditPerKwh: number;
  peakStartHour: number; // e.g. 14 for 2 PM
  peakEndHour: number;   // e.g. 20 for 8 PM
  description: string;
}

export interface CustomTariffOverride {
  peakRatePerKwh?: number;
  offPeakRatePerKwh?: number;
  exportCreditPerKwh?: number;
  peakStartHour?: number;
  peakEndHour?: number;
}

export interface PlantTariffConfig {
  presetId: string; // 'auto' | utility id | 'custom'
  custom?: CustomTariffOverride;
}

export const PHILIPPINE_UTILITY_PRESETS: UtilityTariffSchedule[] = [
  {
    id: 'meralco',
    name: 'Meralco Commercial (TOU / General Power)',
    shortName: 'Meralco',
    region: 'Metro Manila, Cavite, Laguna, Rizal, Bulacan',
    coverageKeywords: ['manila', 'quezon', 'makati', 'taguig', 'pasig', 'bulacan', 'cavite', 'laguna', 'rizal', 'ncr'],
    peakRatePerKwh: 14.80,
    offPeakRatePerKwh: 10.50,
    exportCreditPerKwh: 6.40,
    peakStartHour: 14,
    peakEndHour: 20,
    description: 'Standard Meralco commercial Time-Of-Use rate schedule.',
  },
  {
    id: 'decorp',
    name: 'DECORP (Dagupan Electric Corporation)',
    shortName: 'DECORP Dagupan',
    region: 'Dagupan City, Calasiao, San Fabian, Mangaldan',
    coverageKeywords: ['dagupan', 'calasiao', 'san fabian', 'mangaldan', 'bonuan'],
    peakRatePerKwh: 13.90,
    offPeakRatePerKwh: 10.20,
    exportCreditPerKwh: 6.10,
    peakStartHour: 14,
    peakEndHour: 20,
    description: 'Dagupan City and nearby Pangasinan commercial rate schedule.',
  },
  {
    id: 'panelco',
    name: 'PANELCO I / III (Pangasinan Electric Cooperative)',
    shortName: 'PANELCO Pangasinan',
    region: 'Pangasinan (Urdaneta, Lingayen, Alaminos, Rosales)',
    coverageKeywords: ['pangasinan', 'urdaneta', 'lingayen', 'alaminos', 'rosales', 'binalonan'],
    peakRatePerKwh: 14.20,
    offPeakRatePerKwh: 10.80,
    exportCreditPerKwh: 5.90,
    peakStartHour: 14,
    peakEndHour: 20,
    description: 'Pangasinan Electric Cooperative regional commercial tariff.',
  },
  {
    id: 'veco',
    name: 'VECO (Visayan Electric Company)',
    shortName: 'VECO Cebu',
    region: 'Cebu City, Mandaue, Lapu-Lapu, Talisay',
    coverageKeywords: ['cebu', 'mandaue', 'lapu-lapu', 'talisay', 'visayas'],
    peakRatePerKwh: 14.10,
    offPeakRatePerKwh: 10.60,
    exportCreditPerKwh: 6.20,
    peakStartHour: 14,
    peakEndHour: 20,
    description: 'Greater Metro Cebu commercial & industrial rate schedule.',
  },
  {
    id: 'dlpc',
    name: 'Davao Light and Power (DLPC)',
    shortName: 'Davao Light',
    region: 'Davao City, Panabo, Carmen, Dujali',
    coverageKeywords: ['davao', 'panabo', 'carmen', 'mindanao'],
    peakRatePerKwh: 13.20,
    offPeakRatePerKwh: 9.80,
    exportCreditPerKwh: 5.80,
    peakStartHour: 14,
    peakEndHour: 20,
    description: 'Davao City metro commercial grid tariff.',
  },
  {
    id: 'erc_average',
    name: 'National ERC Commercial Average (Default)',
    shortName: 'ERC Average',
    region: 'Philippines National Commercial Baseline',
    coverageKeywords: ['philippines', 'national', 'default'],
    peakRatePerKwh: 14.50,
    offPeakRatePerKwh: 10.20,
    exportCreditPerKwh: 6.20,
    peakStartHour: 14,
    peakEndHour: 20,
    description: 'Blended nationwide commercial tariff schedule across major distribution utilities.',
  },
];

export const DEFAULT_TARIFF_SCHEDULE = PHILIPPINE_UTILITY_PRESETS[PHILIPPINE_UTILITY_PRESETS.length - 1];

/**
 * Automatically detects the best-matching utility tariff based on plant address, station name, or location.
 */
export function detectUtilityTariff(addressOrName?: string | null): UtilityTariffSchedule {
  if (!addressOrName || typeof addressOrName !== 'string') {
    return DEFAULT_TARIFF_SCHEDULE;
  }
  const clean = addressOrName.toLowerCase();
  for (const preset of PHILIPPINE_UTILITY_PRESETS) {
    if (preset.id === 'erc_average') continue;
    for (const kw of preset.coverageKeywords) {
      if (clean.includes(kw)) {
        return preset;
      }
    }
  }
  return DEFAULT_TARIFF_SCHEDULE;
}

/**
 * Resolves active tariff rates for a given plant considering auto-detection, selected preset, and optional custom overrides.
 */
export function resolveActiveTariff(options: {
  plantAddress?: string | null;
  plantName?: string | null;
  savedConfig?: PlantTariffConfig | null;
}): {
  schedule: UtilityTariffSchedule;
  isAutoDetected: boolean;
  isCustom: boolean;
  peakRate: number;
  offPeakRate: number;
  exportCredit: number;
  peakStartHour: number;
  peakEndHour: number;
} {
  const { plantAddress, plantName, savedConfig } = options;
  const autoDetected = detectUtilityTariff(`${plantAddress || ''} ${plantName || ''}`);

  if (!savedConfig || savedConfig.presetId === 'auto') {
    return {
      schedule: autoDetected,
      isAutoDetected: true,
      isCustom: false,
      peakRate: autoDetected.peakRatePerKwh,
      offPeakRate: autoDetected.offPeakRatePerKwh,
      exportCredit: autoDetected.exportCreditPerKwh,
      peakStartHour: autoDetected.peakStartHour,
      peakEndHour: autoDetected.peakEndHour,
    };
  }

  if (savedConfig.presetId === 'custom') {
    return {
      schedule: {
        id: 'custom',
        name: 'Custom Utility Rates',
        shortName: 'Custom Tariff',
        region: 'User Defined',
        coverageKeywords: [],
        peakRatePerKwh: savedConfig.custom?.peakRatePerKwh ?? autoDetected.peakRatePerKwh,
        offPeakRatePerKwh: savedConfig.custom?.offPeakRatePerKwh ?? autoDetected.offPeakRatePerKwh,
        exportCreditPerKwh: savedConfig.custom?.exportCreditPerKwh ?? autoDetected.exportCreditPerKwh,
        peakStartHour: savedConfig.custom?.peakStartHour ?? autoDetected.peakStartHour,
        peakEndHour: savedConfig.custom?.peakEndHour ?? autoDetected.peakEndHour,
        description: 'Custom rates specified directly from electric utility bills.',
      },
      isAutoDetected: false,
      isCustom: true,
      peakRate: savedConfig.custom?.peakRatePerKwh ?? autoDetected.peakRatePerKwh,
      offPeakRate: savedConfig.custom?.offPeakRatePerKwh ?? autoDetected.offPeakRatePerKwh,
      exportCredit: savedConfig.custom?.exportCreditPerKwh ?? autoDetected.exportCreditPerKwh,
      peakStartHour: savedConfig.custom?.peakStartHour ?? autoDetected.peakStartHour,
      peakEndHour: savedConfig.custom?.peakEndHour ?? autoDetected.peakEndHour,
    };
  }

  const matchedPreset = PHILIPPINE_UTILITY_PRESETS.find((p) => p.id === savedConfig.presetId) || autoDetected;
  return {
    schedule: matchedPreset,
    isAutoDetected: false,
    isCustom: false,
    peakRate: savedConfig.custom?.peakRatePerKwh ?? matchedPreset.peakRatePerKwh,
    offPeakRate: savedConfig.custom?.offPeakRatePerKwh ?? matchedPreset.offPeakRatePerKwh,
    exportCredit: savedConfig.custom?.exportCreditPerKwh ?? matchedPreset.exportCreditPerKwh,
    peakStartHour: savedConfig.custom?.peakStartHour ?? matchedPreset.peakStartHour,
    peakEndHour: savedConfig.custom?.peakEndHour ?? matchedPreset.peakEndHour,
  };
}

/**
 * Official Philippine Department of Energy (DOE) Grid Emission Factor (GEF)
 * Standard Combined Margin for the Luzon-Visayas Grid: 0.7122 kg CO₂ / kWh (0.7122 tCO₂ / MWh)
 */
export const PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH = 0.7122;
export const PHILIPPINES_GRID_EMISSION_FACTOR_TONS_PER_KWH = 0.0007122;
export const KG_CO2_PER_TREE_ANNUAL = 20;



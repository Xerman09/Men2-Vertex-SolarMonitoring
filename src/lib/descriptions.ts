/**
 * System and Component Descriptions Repository
 *
 * Extracted descriptions, subtitles, and explanatory texts for telemetry,
 * analytics, harmonics, and curve visualizations.
 */

export const TELEMETRY_DESCRIPTIONS = {
  hardwareTelemetry: {
    threePhaseAcGrid:
      'Real-time phase voltages (L1, L2, L3), line frequencies, and instantaneous sinusoidal waveforms.',
  },
  trigonometricGraph: {
    header:
      'Exact 5-minute sampling intervals (PV: Green, Consumption: Yellow, Grid: Purple). Unelapsed intervals cleanly stop at current time.',
    pvPowerSolo:
      'High-resolution 5-minute solar PV generation. Captures cloud transients, irradiance changes, and MPPT dynamic tracking in real-time.',
    consumptionSolo:
      '5-minute industrial facility load demand telemetry. Reflects machinery stepping and HVAC diurnal cycles.',
    gridExportPositive:
      'Excess PV power generated beyond facility consumption and battery charging, exported to utility.',
    gridImportNegative:
      'Nighttime or overcast shortfall drawn from utility grid to satisfy industrial loads.',
    selfConsumptionUtilization:
      'How much of the facility load is served by local PV vs grid import.',
    selfConsumptionProduction:
      'How much PV production is locally consumed vs exported to grid.',
    sinusoidalModelNote:
      'Note: Actual measured PV only plots for elapsed 5-minute intervals. The dashed cyan line projects theoretical clear-sky insolation.',
    fourierDecomposition:
      'Fundamental frequency ω₀ = 2π/24h plus 12-hour (2ω) and 8-hour (3ω) harmonics.',
    fourierHarmonicPhases:
      'Phase angle φₖ of each harmonic relative to solar midnight.',
    polarPhasor:
      'Top (0°): Midnight | Right (90°): 06:00 Sunrise | Bottom (180°): 12:00 Solar Noon Peak | Left (270°): 18:00 Sunset.',
  },
  yieldArbitrage: {
    diurnalCurveLegend:
      'Green = Solar PV Production | Yellow = Facility Load Demand | Cyan = Battery ESS Flow',
  },
} as const;

export default TELEMETRY_DESCRIPTIONS;

/**
 * System and Component Descriptions Repository
 *
 * Extracted descriptions, tooltips, subtitles, and explanatory texts for telemetry,
 * analytics, energy flow, harmonics, and curve visualizations.
 */

export const TELEMETRY_DESCRIPTIONS = {
  analytics: {
    solarYield:
      'Cumulative electrical energy harvested by photovoltaic solar arrays through Deye inverters for the selected period.',
    peakPower:
      'The highest instantaneous power output (kW) recorded during peak midday solar irradiance.',
    loadDemand:
      'Total industrial electrical consumption drawn by machinery, HVAC, motors, and operational facility equipment.',
    operatingMode:
      'Operating configuration: Grid-Tied solar PV directly serving facility demand and feeding surplus to utility grid.',
    gridExchange:
      'Net energy balance with the utility grid. Positive value indicates clean solar export; negative indicates grid power purchased.',
    selfConsumption:
      'Percentage of total harvested solar energy that was consumed on-site rather than exported to the grid.',
    selfSufficiency:
      'Autarky metric: The percentage of your total facility electrical consumption covered entirely by solar generation.',
    specificYield:
      'Normalized yield (kWh produced per kWp of installed solar capacity). Standard international metric for solar plant efficiency.',
    performanceRatio:
      'Performance Ratio (PR %): Overall plant quality factor comparing actual AC output against theoretical DC irradiance under standard conditions.',
    inverterEfficiency:
      'European weighted conversion efficiency of Deye silicon IGBT power semiconductors converting DC panel string power to synchronized AC grid electricity.',
    pvModuleEfficiency:
      'Photovoltaic panel conversion efficiency converting solar irradiance into DC power under ambient temperature and standard test conditions (STC).',
    costSavings:
      'Monetary savings achieved by displacing costly utility retail electricity with on-site solar self-consumption.',
    co2Avoided:
      'Estimated reduction in greenhouse gas emissions calculated against regional fossil-fueled utility grid averages.',
    clearSkyModel:
      'Theoretical sinusoidal clear-sky insolation model based on solar noon geometric transit and plant capacity.',
    peakWindow:
      'Highlights the prime peak solar harvest window (09:00 - 15:30) where irradiance and inverter conversion efficiency are highest.',
    streamFilter:
      'Isolate specific energy vectors: View all streams, compare Solar vs Load directly, or isolate Grid Exchange.',
    mpptTracking:
      'Maximum Power Point Tracker (MPPT) dynamically adjusting DC voltage and current to maximize harvest across panel strings.',
    threePhaseAc:
      'Three-phase balanced AC distribution across L1, L2, and L3, monitoring line frequency (Hz) and Total Harmonic Distortion (THD %).',
    futureEss:
      'Energy Storage System (ESS) plug-and-play support. System is configured to auto-detect and track battery charge/discharge the moment battery hardware is added.',
    inverterIsolation:
      'Isolates telemetry to a single physical inverter and its associated data logger for localized diagnostics.',
    plantSwitcher:
      'Switch between individual solar stations or view combined cross-plant Fleet Aggregation with instant 0ms caching.',
    timeRange:
      'Select any date or temporal aggregation window via the date picker to inspect historical or real-time solar telemetry.',
  },
  energyFlow: {
    solarNode:
      'Live photovoltaic DC harvest from active rooftop or ground-mount solar arrays, fed directly into the inverter stage.',
    inverterNode:
      'Deye smart inverter transforming panel DC into clean AC electricity with dynamic grid synchronization.',
    batteryNode:
      'Battery Storage System (ESS). Ready for future battery expansion; automatically detects battery storage when installed.',
    loadNode:
      'Instantaneous active load consumption demanded by industrial machinery, cooling, and facility infrastructure.',
    gridNode:
      'Two-way utility grid interconnect. Exports surplus solar energy when generation exceeds load; imports power during shortfall.',
    liveIndicator:
      'Real-time WebSocket / polling status indicator confirming sub-minute synchronization with DeyeCloud API.',
    fleetMatrix:
      'Aggregated fleet matrix displaying capacity, operational health, and real-time generation across all stations.',
  },
  hardwareTelemetry: {
    threePhaseAcGrid:
      'Real-time phase voltages (L1, L2, L3), line frequencies, and instantaneous sinusoidal waveforms.',
  },
  trigonometricGraph: {
    header:
      'Exact 5-minute sampling intervals for PV, Consumption, and Grid. Unelapsed intervals cleanly stop at current time.',
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
      'Solar PV Production | Facility Load Demand | Grid Net Exchange',
    subtitle:
      'Tariff delta optimization, smart battery peak-shaving, and historical revenue generation.',
  },
  pageHeaders: {
    trigonometricAnalytics:
      'Harmonic series decomposition, theoretical sinusoidal curve fitting ($R^2$), 24-hour polar phasor radar, and instantaneous 3-phase AC waveforms.',
    apiDiagnostics:
      'Inspect OAuth token caches, probe latency, send real-time control dispatches, and test REST endpoints.',
    accountsManagement:
      'Two-way database account synchronization, credentials management, automatic plant discovery, and inverter hierarchy.',
    hardwareTelemetryFleet:
      'Deep component diagnostics, DC MPPT string performance, AC waveforms, and thermal matrices across fleet inverters.',
  },
} as const;

export default TELEMETRY_DESCRIPTIONS;

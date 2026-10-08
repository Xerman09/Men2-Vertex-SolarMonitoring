import { StationSummary, InverterTelemetry, HourlyEnergyPoint, ApiHealthMetrics } from './types';
import { ONE_MINUTE_MS } from './rate-limit';

// Deterministic subtle fluctuation helper
function jitter(base: number, percent: number = 0.03): number {
  const variation = (Math.random() * 2 - 1) * (base * percent);
  return parseFloat((base + variation).toFixed(2));
}

export function getMockStationSummary(): StationSummary {
  const solar = jitter(108.4, 0.04);
  const load = jitter(58.2, 0.03);
  const batterySoc = jitter(94.2, 0.005);
  // Remaining solar charges battery and exports to grid
  const batteryPower = jitter(22.5, 0.05);
  const gridPower = parseFloat((solar - load - batteryPower).toFixed(2));

  return {
    stationId: 'SP_04',
    name: 'SunPeak Industrial Array #04 - 120kW Hybrid',
    capacityKw: 120.0,
    liveSolarPowerKw: solar,
    dailyYieldKwh: 486.2,
    totalYieldMwh: 142.8,
    batterySoc: Math.min(100, Math.max(0, batterySoc)),
    batteryPowerKw: batteryPower,
    gridPowerKw: gridPower,
    loadPowerKw: load,
    status: 'ONLINE',
    lastUpdated: new Date().toISOString(),
  };
}

export function getMockInverterTelemetry(): InverterTelemetry {
  const pv1V = jitter(584.2, 0.01);
  const pv1I = jitter(98.4, 0.02);
  const pv1P = parseFloat(((pv1V * pv1I) / 1000).toFixed(2));

  const pv2V = jitter(578.8, 0.01);
  const pv2I = jitter(88.6, 0.02);
  const pv2P = parseFloat(((pv2V * pv2I) / 1000).toFixed(2));

  return {
    deviceSn: '2209X891104',
    model: 'SUN-120K-SG01HP3-EU-AM2',
    firmwareVersion: 'Ver 1.4.2-Deye-C',
    connectionStatus: 'ONLINE',
    efficiencyPct: jitter(98.4, 0.002),
    heatsinkTempC: jitter(46.8, 0.02),
    ambientTempC: jitter(29.4, 0.01),
    powerFactor: 0.99,
    thdPct: jitter(1.64, 0.03),
    gridFrequencyHz: jitter(60.01, 0.002),
    mpptStrings: [
      { stringId: 'MPPT-1 (South Array)', voltageV: pv1V, currentA: pv1I, powerKw: pv1P },
      { stringId: 'MPPT-2 (West Array)', voltageV: pv2V, currentA: pv2I, powerKw: pv2P },
    ],
    phases: [
      { phase: 'L1', voltageV: jitter(230.8, 0.005), currentA: jitter(156.4, 0.02), frequencyHz: 60.01 },
      { phase: 'L2', voltageV: jitter(229.4, 0.005), currentA: jitter(154.8, 0.02), frequencyHz: 60.01 },
      { phase: 'L3', voltageV: jitter(231.2, 0.005), currentA: jitter(155.9, 0.02), frequencyHz: 60.01 },
    ],
    totalActivePowerKw: parseFloat((pv1P + pv2P).toFixed(2)),
    totalReactivePowerKvar: 4.2,
    todayEnergyKwh: 486.2,
    totalEnergyMwh: 142.8,
    runningHours: 8420,
    activeWorkMode: 'PEAK_SHAVING',
    gridChargeEnabled: true,
    activeFaults: [
      {
        id: 'ALM-0941',
        code: 'W08_GRID_VOLT_SURGE',
        severity: 'WARNING',
        title: 'Utility Grid Voltage Fluctuation',
        description: 'Phase L3 momentarily spiked to 244V; automatically clamped within nominal IEEE 1547 tolerances.',
        timestamp: new Date(Date.now() - 42 * ONE_MINUTE_MS).toISOString(),
        resolved: false,
      },
      {
        id: 'ALM-0812',
        code: 'I02_TOU_WINDOW_START',
        severity: 'INFO',
        title: 'Peak Tariff Window Triggered',
        description: 'Shifted to battery discharge mode to shave peak grid tariff from $0.34/kWh down to self-generation.',
        timestamp: new Date(Date.now() - 118 * ONE_MINUTE_MS).toISOString(),
        resolved: true,
      },
    ],
  };
}

export function getMockHourlyEnergyPoints(
  range: string = 'TODAY',
  currentHour?: number,
  stepMinutes: number = 5
): HourlyEnergyPoint[] {
  const now = new Date();
  const currentMinutes =
    currentHour !== undefined
      ? currentHour * 60 + now.getMinutes()
      : now.getHours() * 60 + now.getMinutes();

  const isToday = range.toUpperCase() === 'TODAY';
  const totalSteps = Math.floor((24 * 60) / stepMinutes);
  const points: HourlyEnergyPoint[] = [];

  for (let i = 0; i < totalSteps; i++) {
    const totalMins = i * stepMinutes;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const hourLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const hourDecimal = Number((h + m / 60).toFixed(4));
    const isElapsed = !isToday || totalMins <= currentMinutes;

    if (!isElapsed) {
      // Future unelapsed 5-minute intervals — strictly null
      points.push({
        hour: hourLabel,
        solarYieldKw: null,
        loadDemandKw: null,
        batteryFlowKw: null,
        gridFlowKw: null,
        gridExportKw: null,
        tariffRateUsd: h >= 14 && h <= 20 ? 0.36 : 0.14,
        isElapsed: false,
      });
    } else {
      // Solar profile (sunrise ~05:45, sunset ~18:15, peak ~12:15)
      let solar = 0;
      if (hourDecimal >= 5.75 && hourDecimal <= 18.25) {
        const progress = (hourDecimal - 5.75) / (18.25 - 5.75);
        const baseSine = Math.sin(progress * Math.PI);
        // Realistic dynamic telemetry: morning cloud transient and MPPT tracking ripples
        const cloudDip = hourDecimal >= 9.25 && hourDecimal <= 9.75 ? 0.84 : 1.0;
        const ripple = Math.sin(hourDecimal * 7.5) * 1.8 + Math.cos(hourDecimal * 18.3) * 0.9;
        solar = Math.max(0, Number((baseSine * 119.5 * cloudDip + (baseSine > 0.05 ? ripple : 0)).toFixed(2)));
      }

      // Industrial Load Demand profile (morning ramp, daytime industrial operation, evening drop)
      let load = 40.0;
      if (hourDecimal < 6.0) {
        load = 39.0 + Math.sin(hourDecimal * 2) * 2.5;
      } else if (hourDecimal >= 6.0 && hourDecimal < 8.5) {
        load = 45.0 + (hourDecimal - 6.0) * 9.5; // Morning ramp
      } else if (hourDecimal >= 8.5 && hourDecimal < 17.5) {
        // High industrial activity with authentic 5-min machine variations
        load = 68.0 + Math.sin(hourDecimal * 4.2) * 4.5 + Math.cos(hourDecimal * 11.7) * 2.0;
      } else if (hourDecimal >= 17.5 && hourDecimal < 21.0) {
        load = 65.0 - (hourDecimal - 17.5) * 3.5;
      } else {
        load = 48.0 - (hourDecimal - 21.0) * 2.0;
      }
      load = Number(Math.max(20, load).toFixed(2));

      // Battery storage dispatch
      let battery = 0;
      if (solar > load) {
        // Absorb excess solar up to 32 kW
        battery = Math.min(32.0, (solar - load) * 0.55);
      } else {
        // Discharge to assist peak hours
        const deficit = load - solar;
        battery = hourDecimal >= 17.0 && hourDecimal <= 22.0 ? -Math.min(28.0, deficit * 0.6) : -Math.min(18.0, deficit * 0.35);
      }
      battery = Number(battery.toFixed(2));

      // Net grid exchange: solar - load - battery (+ = export, - = import)
      const gridFlow = Number((solar - load - battery).toFixed(2));
      const gridExport = Number(Math.max(0, gridFlow).toFixed(2));
      const tariff = h >= 14 && h <= 20 ? 0.36 : 0.14;

      points.push({
        hour: hourLabel,
        solarYieldKw: solar,
        loadDemandKw: load,
        batteryFlowKw: battery,
        gridFlowKw: gridFlow,
        gridExportKw: gridExport,
        tariffRateUsd: tariff,
        isElapsed: true,
      });
    }
  }

  return points;
}

export function getMockApiHealth(): ApiHealthMetrics {
  return {
    gatewayUrl: 'https://api.deyecloud.com/v1.0',
    region: 'Asia-Pacific / Global',
    isLive: false,
    status: 'OPTIMAL',
    pingMs: 14,
    rateLimitUsed: 842,
    rateLimitMax: 10000,
    tokenExpiresAt: new Date(Date.now() + 58 * 24 * 3600 * 1000).toISOString(),
    lastChecked: new Date().toISOString(),
  };
}

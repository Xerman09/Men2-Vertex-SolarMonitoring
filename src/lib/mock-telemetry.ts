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
  stepMinutes: number = 5,
  date?: string
): HourlyEnergyPoint[] {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const normalizedRange = (range || 'TODAY').toUpperCase();
  const isToday = normalizedRange === 'TODAY' && (!date || date === todayStr);

  const currentMinutes =
    currentHour !== undefined
      ? currentHour * 60 + now.getMinutes()
      : now.getHours() * 60 + now.getMinutes();

  // Deterministic seed derived from BOTH effective date and range so every date/period renders a distinct profile.
  const seedKey = `${date || todayStr}:${normalizedRange}`;
  let hash = 2166136261;
  for (let c = 0; c < seedKey.length; c++) {
    hash ^= seedKey.charCodeAt(c);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const unit0 = (hash % 1000) / 1000;
  const unit1 = ((hash >>> 8) % 1000) / 1000;
  const unit2 = ((hash >>> 16) % 1000) / 1000;
  const unit3 = ((hash >>> 24) % 256) / 256;

  // Determine weekday vs weekend baseline from requested date
  let isWeekend = false;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [yy, mm, dd] = date.split('-').map(Number);
    const dow = new Date(yy, (mm || 1) - 1, dd || 1).getDay();
    isWeekend = dow === 0 || dow === 6;
  }

  // Date-seeded irradiance factor: keep today near clear-sky 1.0, vary past dates realistically (0.62 - 1.04)
  const dateVariance = isToday ? 1.0 : 0.62 + unit0 * 0.42;
  // Distinct primary and secondary cloud transients per date
  const cloudCenter1 = isToday ? 9.5 : 8.2 + unit1 * 7.2; // Between 08:12 and 15:24
  const cloudWidth1 = isToday ? 0.35 : 0.35 + unit2 * 1.15;
  const cloudDepth1 = isToday ? 0.16 : 0.18 + unit3 * 0.42;
  const cloudCenter2 = isToday ? 14.5 : 11.5 + unit2 * 5.0;
  const cloudDepth2 = isToday || unit1 < 0.45 ? 0 : 0.14 + unit0 * 0.30;
  const phaseShift = isToday ? 0 : unit1 * Math.PI * 2;
  const loadMultiplier = isToday ? 1.0 : (isWeekend ? 0.72 : 0.88) + unit2 * 0.24;

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
        hourDecimal,
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
        const g1 = Math.exp(-Math.pow((hourDecimal - cloudCenter1) / cloudWidth1, 2));
        const g2 = cloudDepth2 > 0 ? Math.exp(-Math.pow((hourDecimal - cloudCenter2) / 0.55, 2)) : 0;
        const cloudAtten = Math.max(0.28, (1 - cloudDepth1 * g1) * (1 - cloudDepth2 * g2));
        const ripple =
          Math.sin(hourDecimal * 7.5 + phaseShift) * 2.2 +
          Math.cos(hourDecimal * 18.3 - phaseShift) * 1.1;
        solar = Math.max(
          0,
          Number((baseSine * 119.5 * dateVariance * cloudAtten + (baseSine > 0.05 ? ripple : 0)).toFixed(2))
        );
      }

      // Industrial Load Demand profile shifted by date seed & weekday/weekend schedule
      let load = 40.0;
      if (hourDecimal < 6.0) {
        load = 39.0 + Math.sin(hourDecimal * 2 + phaseShift * 0.5) * 2.5;
      } else if (hourDecimal >= 6.0 && hourDecimal < 8.5) {
        load = 45.0 + (hourDecimal - 6.0) * 9.5; // Morning ramp
      } else if (hourDecimal >= 8.5 && hourDecimal < 17.5) {
        load = 68.0 + Math.sin(hourDecimal * 4.2 + phaseShift) * 5.2 + Math.cos(hourDecimal * 11.7 + phaseShift) * 2.4;
      } else if (hourDecimal >= 17.5 && hourDecimal < 21.0) {
        load = 65.0 - (hourDecimal - 17.5) * 3.5;
      } else {
        load = 48.0 - (hourDecimal - 21.0) * 2.0;
      }
      load = Number(Math.max(15, load * loadMultiplier).toFixed(2));

      // Net grid exchange: solar - load (+ = export, - = import)
      const gridFlow = Number((solar - load).toFixed(2));
      const gridExport = Number(Math.max(0, gridFlow).toFixed(2));
      const tariff = h >= 14 && h <= 20 ? 0.36 : 0.14;

      points.push({
        hour: hourLabel,
        hourDecimal,
        solarYieldKw: solar,
        loadDemandKw: load,
        batteryFlowKw: 0,
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

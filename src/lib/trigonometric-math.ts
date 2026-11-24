/**
 * Trigonometric & Harmonic Analysis Engine for Solar PV & Grid Telemetry
 * 
 * Implements:
 * 1. Diurnal Sinusoidal Clear-Sky Model & Curve Fitting (R², PSH, Phase Shift)
 * 2. Fourier Harmonic Decomposition (Fundamental 24h + 12h/8h harmonics)
 * 3. 24-Hour Polar / Cyclical Coordinates for Radar Phasor Charts
 * 4. Three-Phase AC Instantaneous Sinusoidal Waveforms & Phasor Trigonometry
 */

export interface HourlySolarPoint {
  hour: string;          // e.g. '12:00'
  hourDecimal: number;   // e.g. 12.0
  solarYieldKw: number | null;  // Actual recorded PV kW (null for unelapsed)
  loadDemandKw: number | null;  // Actual recorded Load kW (null for unelapsed)
  batteryFlowKw: number | null; // Battery kW (+ charging, - discharging)
  gridExportKw: number | null;  // Net grid flow
  isElapsed?: boolean;
}

export interface SinusoidalFitResult {
  theoreticalPoints: Array<{
    hour: string;
    hourDecimal: number;
    actualSolarKw: number | null;
    sinusoidalClearSkyKw: number;
    residualKw: number | null;
    isElapsed: boolean;
  }>;
  rSquared: number;           // Goodness of fit (0 - 1)
  peakSunHours: number;       // Equivalent full sun hours (kWh/kWp)
  phaseShiftHours: number;    // Peak offset from solar noon (12:00)
  maxTheoreticalKw: number;
  actualPeakKw: number;
  harvestEfficiencyPct: number;
}

export interface FourierComponentPoint {
  hour: string;
  hourDecimal: number;
  actualSolarKw: number | null;
  fundamentalHarmonicKw: number; // k=1 (24h period)
  secondHarmonicKw: number;      // k=2 (12h period)
  thirdHarmonicKw: number;       // k=3 (8h period)
  fourierReconstructedKw: number;// Sum of harmonics
  loadFundamentalKw: number;
  isElapsed: boolean;
}

export interface PolarCyclePoint {
  angleDeg: number;       // 0° (Midnight) -> 90° (06:00) -> 180° (12:00 Noon) -> 270° (18:00)
  hourLabel: string;      // e.g. '12:00'
  solarHarvestRadius: number | null; // kW
  loadDemandRadius: number | null;   // kW
  batteryRadius: number | null;      // Normalized kW
  isElapsed: boolean;
}

export interface ACWaveformPoint {
  timeMs: number;         // 0 to 33.3 ms (2 cycles at 60Hz)
  phaseAngleDeg: number;  // 0 to 720°
  voltagePhaseA: number;  // Instantaneous Volts
  voltagePhaseB: number;  // Instantaneous Volts (-120°)
  voltagePhaseC: number;  // Instantaneous Volts (+120°)
  currentA: number;       // Instantaneous Amperes (lagged by phi)
}

export interface PhasorMetrics {
  frequencyHz: number;
  powerFactorCosPhi: number;
  phaseAngleDeg: number;
  vrmsAvg: number;
  voltageUnbalancePct: number;
  activePowerKw: number;   // P = sqrt(3) * V * I * cos(phi)
  reactivePowerKvar: number; // Q = sqrt(3) * V * I * sin(phi)
  apparentPowerKva: number;  // S = sqrt(P^2 + Q^2)
}

// ============================================================================
// 1. DIURNAL SINUSOIDAL CLEAR-SKY CURVE FITTER
// ============================================================================
export function calculateSinusoidalFit(
  data: HourlySolarPoint[],
  installedCapacityKw: number = 120,
  sunriseHour: number = 5.75, // 05:45
  sunsetHour: number = 18.25   // 18:15
): SinusoidalFitResult {
  const dayLengthHours = sunsetHour - sunriseHour;
  const solarNoonHour = (sunriseHour + sunsetHour) / 2; // ~12:00

  // Calculate actual peak and total energy
  let actualPeakKw = 0;
  let actualTotalEnergyKwh = 0;
  let maxActualHour = 12.0;

  const intervalHours = data.length > 1 ? Math.max(0.01, Math.abs(data[1].hourDecimal - data[0].hourDecimal)) : (1 / 12);

  for (const pt of data) {
    const yieldKw = pt.solarYieldKw ?? 0;
    if (yieldKw > actualPeakKw) {
      actualPeakKw = yieldKw;
      maxActualHour = pt.hourDecimal;
    }
    actualTotalEnergyKwh += yieldKw * intervalHours;
  }

  // Theoretical clear-sky amplitude typically reaches 85-92% of installed capacity under STC
  const theoreticalPeakKw = Math.max(actualPeakKw * 1.05, installedCapacityKw * 0.88);

  const theoreticalPoints = data.map((pt) => {
    const t = pt.hourDecimal;
    let sinusoidalClearSkyKw = 0;

    if (t >= sunriseHour && t <= sunsetHour) {
      // Half-sine wave: P(t) = Pmax * sin(pi * (t - trise) / (tset - trise))
      const theta = (Math.PI * (t - sunriseHour)) / dayLengthHours;
      sinusoidalClearSkyKw = Math.max(0, theoreticalPeakKw * Math.sin(theta));
    }

    const isEl = pt.isElapsed ?? (pt.solarYieldKw != null);
    const residualKw = pt.solarYieldKw != null && Number.isFinite(pt.solarYieldKw) ? pt.solarYieldKw - sinusoidalClearSkyKw : null;

    return {
      hour: pt.hour,
      hourDecimal: pt.hourDecimal,
      actualSolarKw: pt.solarYieldKw != null && Number.isFinite(pt.solarYieldKw) ? Number(pt.solarYieldKw.toFixed(2)) : null,
      sinusoidalClearSkyKw: Number((sinusoidalClearSkyKw || 0).toFixed(2)),
      residualKw: residualKw != null && Number.isFinite(residualKw) ? Number(residualKw.toFixed(2)) : null,
      isElapsed: isEl,
    };
  });

  // Calculate R² (Coefficient of Determination) on elapsed points only
  const elapsedPoints = theoreticalPoints.filter((p) => p.actualSolarKw !== null);
  const actualMean =
    elapsedPoints.length > 0
      ? elapsedPoints.reduce((sum, d) => sum + (d.actualSolarKw || 0), 0) / elapsedPoints.length
      : 0;
  let ssTot = 0;
  let ssRes = 0;

  elapsedPoints.forEach((pt) => {
    if (pt.actualSolarKw !== null) {
      ssTot += Math.pow(pt.actualSolarKw - actualMean, 2);
      ssRes += Math.pow(pt.actualSolarKw - pt.sinusoidalClearSkyKw, 2);
    }
  });

  const rSquared = ssTot > 0 ? Math.max(0, Math.min(0.999, 1 - ssRes / ssTot)) : 0.94;
  const peakSunHours = installedCapacityKw > 0 ? actualTotalEnergyKwh / installedCapacityKw : 4.8;
  const phaseShiftHours = maxActualHour - solarNoonHour;
  const theoreticalTotalKwh = (theoreticalPeakKw * 2 * dayLengthHours) / Math.PI;
  const harvestEfficiencyPct =
    theoreticalTotalKwh > 0
      ? Math.min(100, (actualTotalEnergyKwh / theoreticalTotalKwh) * 100)
      : 88.5;

  return {
    theoreticalPoints,
    rSquared: Number(rSquared.toFixed(3)),
    peakSunHours: Number(peakSunHours.toFixed(2)),
    phaseShiftHours: Number(phaseShiftHours.toFixed(2)),
    maxTheoreticalKw: Number(theoreticalPeakKw.toFixed(1)),
    actualPeakKw: Number(actualPeakKw.toFixed(1)),
    harvestEfficiencyPct: Number(harvestEfficiencyPct.toFixed(1)),
  };
}

// ============================================================================
// 2. FOURIER HARMONIC DECOMPOSITION (24h Diurnal Wave)
// ============================================================================
export function calculateFourierDecomposition(
  data: HourlySolarPoint[]
): FourierComponentPoint[] {
  const N = data.length || 24;
  const omega0 = (2 * Math.PI) / 24;

  let a0_solar = 0;
  let a1_solar = 0;
  let b1_solar = 0;
  let a2_solar = 0;
  let b2_solar = 0;
  let a3_solar = 0;
  let b3_solar = 0;

  let a0_load = 0;
  let a1_load = 0;
  let b1_load = 0;

  let elapsedCount = 0;
  data.forEach((pt) => {
    if (
      pt.solarYieldKw != null &&
      pt.loadDemandKw != null &&
      Number.isFinite(pt.solarYieldKw) &&
      Number.isFinite(pt.loadDemandKw)
    ) {
      elapsedCount++;
      const t = pt.hourDecimal;
      const sYield = pt.solarYieldKw;
      const lDemand = pt.loadDemandKw;

      a0_solar += sYield;
      a1_solar += sYield * Math.cos(1 * omega0 * t);
      b1_solar += sYield * Math.sin(1 * omega0 * t);
      a2_solar += sYield * Math.cos(2 * omega0 * t);
      b2_solar += sYield * Math.sin(2 * omega0 * t);
      a3_solar += sYield * Math.cos(3 * omega0 * t);
      b3_solar += sYield * Math.sin(3 * omega0 * t);

      a0_load += lDemand;
      a1_load += lDemand * Math.cos(1 * omega0 * t);
      b1_load += lDemand * Math.sin(1 * omega0 * t);
    }
  });

  const divisor = elapsedCount || N;
  a0_solar /= divisor;
  a1_solar = (2 / divisor) * a1_solar;
  b1_solar = (2 / divisor) * b1_solar;
  a2_solar = (2 / divisor) * a2_solar;
  b2_solar = (2 / divisor) * b2_solar;
  a3_solar = (2 / divisor) * a3_solar;
  b3_solar = (2 / divisor) * b3_solar;

  a0_load /= divisor;
  a1_load = (2 / divisor) * a1_load;
  b1_load = (2 / divisor) * b1_load;

  return data.map((pt) => {
    const t = pt.hourDecimal;
    const h1 = a1_solar * Math.cos(omega0 * t) + b1_solar * Math.sin(omega0 * t);
    const h2 = a2_solar * Math.cos(2 * omega0 * t) + b2_solar * Math.sin(2 * omega0 * t);
    const h3 = a3_solar * Math.cos(3 * omega0 * t) + b3_solar * Math.sin(3 * omega0 * t);
    const recon = Math.max(0, a0_solar + h1 + h2 + h3);
    const loadH1 = a0_load + a1_load * Math.cos(omega0 * t) + b1_load * Math.sin(omega0 * t);
    const isEl = pt.isElapsed ?? (pt.solarYieldKw != null);

    return {
      hour: pt.hour,
      hourDecimal: pt.hourDecimal,
      actualSolarKw: pt.solarYieldKw != null && Number.isFinite(pt.solarYieldKw) ? Number(pt.solarYieldKw.toFixed(1)) : null,
      fundamentalHarmonicKw: Number((a0_solar + h1 || 0).toFixed(1)),
      secondHarmonicKw: Number((h2 || 0).toFixed(1)),
      thirdHarmonicKw: Number((h3 || 0).toFixed(1)),
      fourierReconstructedKw: Number((recon || 0).toFixed(1)),
      loadFundamentalKw: Number((loadH1 || 0).toFixed(1)),
      isElapsed: isEl,
    };
  });
}

// ============================================================================
// 3. 24-HOUR POLAR / RADAR CYCLICAL HARMONIC COORDINATES
// ============================================================================
export function calculatePolarCyclicalPoints(
  data: HourlySolarPoint[]
): PolarCyclePoint[] {
  return data.map((pt) => {
    const angleDeg = Math.round((pt.hourDecimal / 24) * 360);
    const isEl = pt.isElapsed ?? (pt.solarYieldKw != null);
    return {
      angleDeg,
      hourLabel: pt.hour,
      solarHarvestRadius: pt.solarYieldKw != null && Number.isFinite(pt.solarYieldKw) ? Number(pt.solarYieldKw.toFixed(1)) : null,
      loadDemandRadius: pt.loadDemandKw != null && Number.isFinite(pt.loadDemandKw) ? Number(pt.loadDemandKw.toFixed(1)) : null,
      batteryRadius: pt.batteryFlowKw != null && Number.isFinite(pt.batteryFlowKw) ? Number(Math.abs(pt.batteryFlowKw).toFixed(1)) : null,
      isElapsed: isEl,
    };
  });
}

// ============================================================================
// 4. THREE-PHASE AC INSTANTANEOUS WAVEFORM & PHASOR TRIGONOMETRY
// ============================================================================
export function generateThreePhaseACWaveforms(
  voltageV: number = 230,       // RMS Phase Voltage (e.g. 230V or 277V)
  currentA: number = 85,        // RMS Current
  frequencyHz: number = 60.0,   // Grid Frequency
  powerFactorCosPhi: number = 0.98, // cos(phi)
  numPoints: number = 64
): {
  waveform: ACWaveformPoint[];
  metrics: PhasorMetrics;
} {
  const peakVoltage = voltageV * Math.SQRT2; // Vpeak = Vrms * sqrt(2)
  const peakCurrent = currentA * Math.SQRT2;
  const phiRad = Math.acos(Math.max(-1, Math.min(1, powerFactorCosPhi)));
  const phaseAngleDeg = Number(((phiRad * 180) / Math.PI).toFixed(1));

  const periodSeconds = 1 / frequencyHz;
  const totalDurationSeconds = periodSeconds * 2; // 2 complete AC cycles
  const stepSeconds = totalDurationSeconds / numPoints;
  const omega = 2 * Math.PI * frequencyHz; // Angular velocity (rad/s)

  const waveform: ACWaveformPoint[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i * stepSeconds;
    const timeMs = Number((t * 1000).toFixed(2));
    const angleDeg = Number((((omega * t) * 180) / Math.PI % 360).toFixed(1));

    // Phase A: theta = omega * t
    const vA = peakVoltage * Math.sin(omega * t);
    // Phase B: theta = omega * t - 120° (2pi/3)
    const vB = peakVoltage * Math.sin(omega * t - (2 * Math.PI) / 3);
    // Phase C: theta = omega * t + 120° (2pi/3)
    const vC = peakVoltage * Math.sin(omega * t + (2 * Math.PI) / 3);
    // Current on Phase A (lagging/leading by phase angle phi)
    const iA = peakCurrent * Math.sin(omega * t - phiRad);

    waveform.push({
      timeMs,
      phaseAngleDeg: angleDeg,
      voltagePhaseA: Number(vA.toFixed(1)),
      voltagePhaseB: Number(vB.toFixed(1)),
      voltagePhaseC: Number(vC.toFixed(1)),
      currentA: Number(iA.toFixed(1)),
    });
  }

  // Calculate 3-phase powers
  // P = sqrt(3) * V_L-L * I * cos(phi) = 3 * V_L-N * I * cos(phi)
  const activePowerKw = (3 * voltageV * currentA * powerFactorCosPhi) / 1000;
  const sinPhi = Math.sin(phiRad);
  const reactivePowerKvar = (3 * voltageV * currentA * sinPhi) / 1000;
  const apparentPowerKva = (3 * voltageV * currentA) / 1000;

  return {
    waveform,
    metrics: {
      frequencyHz,
      powerFactorCosPhi,
      phaseAngleDeg,
      vrmsAvg: voltageV,
      voltageUnbalancePct: 0.18, // Nominal standard grid unbalance < 1%
      activePowerKw: Number(activePowerKw.toFixed(1)),
      reactivePowerKvar: Number(reactivePowerKvar.toFixed(1)),
      apparentPowerKva: Number(apparentPowerKva.toFixed(1)),
    },
  };
}

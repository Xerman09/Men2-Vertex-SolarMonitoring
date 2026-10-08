'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { useRole } from '@/lib/role-context';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import {
  SinusoidalFitResult,
  FourierComponentPoint,
  PolarCyclePoint,
} from '@/lib/trigonometric-math';
import {
  ChartTab,
  TimeResolution,
  ThreePhaseACResult,
  COLOR_PV,
  COLOR_LOAD,
  COLOR_GRID,
} from '../useTrigonometricGraph';

interface AdvancedMathChartsProps {
  compact?: boolean;
  activeTab: Extract<ChartTab, 'sinusoidal' | 'fourier' | 'polar' | 'waveform'>;
  timeResolution: TimeResolution;
  nowSlotStr: string;
  majorXTicks: string[];
  fitResults: SinusoidalFitResult;
  fourierData: FourierComponentPoint[];
  polarData: PolarCyclePoint[];
  acResults: ThreePhaseACResult;
  sinusoidalYDomain: [number, number];
  fourierYDomain: [number, number];
  acVoltage: number;
  acCurrent: number;
  powerFactor: number;
  onAcVoltageChange: (val: number) => void;
  onAcCurrentChange: (val: number) => void;
  onPowerFactorChange: (val: number) => void;
}

export function AdvancedMathCharts({
  compact = false,
  activeTab,
  timeResolution,
  nowSlotStr,
  majorXTicks,
  fitResults,
  fourierData,
  polarData,
  acResults,
  sinusoidalYDomain,
  fourierYDomain,
  acVoltage,
  acCurrent,
  powerFactor,
  onAcVoltageChange,
  onAcCurrentChange,
  onPowerFactorChange,
}: AdvancedMathChartsProps) {
  const { isAdmin } = useRole();

  if (activeTab === 'sinusoidal') {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
              Sinusoidal Goodness R²
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-cyan-500">
              {fitResults.rSquared}
            </span>
            <span className="text-[9.5px] text-muted-foreground block mt-0.5">
              Elapsed Correlation
            </span>
          </div>

          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
              Peak Sun Hours (PSH)
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-amber-500">
              {fitResults.peakSunHours} h
            </span>
            <span className="text-[9.5px] text-muted-foreground block mt-0.5">
              1 kW/m² Insolation Equiv
            </span>
          </div>

          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
              Solar Noon Phase Shift
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-foreground">
              {fitResults.phaseShiftHours > 0 ? `+${fitResults.phaseShiftHours}` : fitResults.phaseShiftHours} h
            </span>
            <span className="text-[9.5px] text-muted-foreground block mt-0.5">
              Offset from 12:00 Zenith
            </span>
          </div>

          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
              Harvest Model Efficiency
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-emerald-500">
              {fitResults.harvestEfficiencyPct}%
            </span>
            <span className="text-[9.5px] text-muted-foreground block mt-0.5">
              Of Clear-Sky Integral
            </span>
          </div>
        </div>

        <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fitResults.theoreticalPoints} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="solarActualGreenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR_PV} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
              <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
              <YAxis domain={sinusoidalYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(23, 31, 51, 0.95)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <ReferenceLine x={nowSlotStr} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Now', fill: '#94a3b8', fontSize: 10, position: 'top' }} />
              <Area
                type="monotone"
                dataKey="actualSolarKw"
                name="Actual Measured PV (Green)"
                stroke={COLOR_PV}
                strokeWidth={2}
                fill="url(#solarActualGreenGrad)"
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="sinusoidalClearSkyKw"
                name="Theoretical Clear-Sky Model"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="residualKw"
                name="Model Deviation Residual"
                stroke={COLOR_GRID}
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {isAdmin && (
          <p className="text-xs text-muted-foreground">
            {TELEMETRY_DESCRIPTIONS.trigonometricGraph.sinusoidalModelNote}
          </p>
        )}
      </div>
    );
  }

  if (activeTab === 'fourier') {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <div>
            <span className="text-xs font-semibold text-foreground">
              Discrete Fourier Decomposition of 24-Hour Diurnal Cycle
            </span>
            {isAdmin && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {TELEMETRY_DESCRIPTIONS.trigonometricGraph.fourierDecomposition}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] px-1.5 py-0 w-fit">
            Harmonics k = 1, 2, 3
          </Badge>
        </div>

        <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fourierData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
              <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
              <YAxis domain={fourierYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(23, 31, 51, 0.95)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <ReferenceLine x={nowSlotStr} stroke="#64748b" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="actualSolarKw"
                name="Actual Harvest (Green)"
                stroke={COLOR_PV}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="fundamentalHarmonicKw"
                name="k=1 Fundamental Diurnal Wave (kW)"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="secondHarmonicKw"
                name="k=2 12-Hour Asymmetry Wave (kW)"
                stroke={COLOR_GRID}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="fourierReconstructedKw"
                name="Fourier Reconstructed Series (kW)"
                stroke={COLOR_LOAD}
                strokeWidth={2}
                strokeDasharray="2 2"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {isAdmin && (
          <p className="text-[11px] text-muted-foreground">
            {TELEMETRY_DESCRIPTIONS.trigonometricGraph.fourierHarmonicPhases}
          </p>
        )}
      </div>
    );
  }

  if (activeTab === 'polar') {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <div>
            <span className="text-xs font-semibold text-foreground">
              360-Degree Circular Phasor: Solar Lobe (Green) vs Load (Yellow)
            </span>
            {isAdmin && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {TELEMETRY_DESCRIPTIONS.trigonometricGraph.polarPhasor}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-indigo-500 border-indigo-500/30 bg-indigo-500/10 font-mono text-[10px] px-1.5 py-0 w-fit">
            Polar Coordinates (r, θ)
          </Badge>
        </div>

        <div className={compact ? 'h-[240px] w-full' : 'h-[290px] w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={polarData.filter((_, idx) => idx % (timeResolution === 5 ? 12 : 1) === 0)}>
              <PolarGrid stroke="currentColor" className="opacity-20" />
              <PolarAngleAxis dataKey="hourLabel" stroke="currentColor" className="text-[10px] opacity-70" />
              <PolarRadiusAxis angle={30} domain={[0, 140]} stroke="currentColor" className="text-[9px] opacity-50" />
              <Radar
                name="Solar Generation (Green)"
                dataKey="solarHarvestRadius"
                stroke={COLOR_PV}
                fill={COLOR_PV}
                fillOpacity={0.35}
              />
              <Radar
                name="Industrial Load Demand (Yellow)"
                dataKey="loadDemandRadius"
                stroke={COLOR_LOAD}
                fill={COLOR_LOAD}
                fillOpacity={0.25}
              />
              <Radar
                name="Battery Energy Flow (Cyan)"
                dataKey="batteryRadius"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.25}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(23, 31, 51, 0.95)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: '12px',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // activeTab === 'waveform'
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-card border border-border/60">
        <div>
          <label htmlFor="grid-rms-voltage-range" className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
            Grid RMS Voltage: {acVoltage} V
          </label>
          <input
            id="grid-rms-voltage-range"
            type="range"
            min="200"
            max="260"
            step="1"
            value={acVoltage}
            onChange={(e) => onAcVoltageChange(Number(e.target.value))}
            className="w-full accent-primary cursor-pointer h-1.5"
          />
        </div>

        <div>
          <label htmlFor="rms-load-current-range" className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
            RMS Load Current: {acCurrent} A
          </label>
          <input
            id="rms-load-current-range"
            type="range"
            min="20"
            max="150"
            step="1"
            value={acCurrent}
            onChange={(e) => onAcCurrentChange(Number(e.target.value))}
            className="w-full accent-primary cursor-pointer h-1.5"
          />
        </div>

        <div>
          <label htmlFor="power-factor-range" className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
            Power Factor cos(φ): {powerFactor} ({acResults.metrics.phaseAngleDeg}°)
          </label>
          <input
            id="power-factor-range"
            type="range"
            min="0.80"
            max="1.00"
            step="0.01"
            value={powerFactor}
            onChange={(e) => onPowerFactorChange(Number(e.target.value))}
            className="w-full accent-primary cursor-pointer h-1.5"
          />
        </div>
      </div>

      <div className={compact ? 'h-[210px] w-full' : 'h-[250px] w-full'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={acResults.waveform} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
            <XAxis dataKey="timeMs" stroke="currentColor" className="text-[10px] opacity-60" unit="ms" />
            <YAxis stroke="currentColor" className="text-[10px] opacity-60" unit="V" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(23, 31, 51, 0.95)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '12px',
              }}
            />
            <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Line
              type="monotone"
              dataKey="voltagePhaseA"
              name="Phase A: Vm·sin(ωt) [0°]"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="voltagePhaseB"
              name="Phase B: Vm·sin(ωt - 120°)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="voltagePhaseC"
              name="Phase C: Vm·sin(ωt + 120°)"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="currentA"
              name="Phase A Current: Im·sin(ωt - φ)"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
            Active Power P
          </span>
          <span className="text-base sm:text-lg font-bold font-mono text-emerald-500">
            {acResults.metrics.activePowerKw} kW
          </span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">
            P = √3 · V · I · cos(φ)
          </span>
        </div>

        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
            Reactive Power Q
          </span>
          <span className="text-base sm:text-lg font-bold font-mono text-amber-500">
            {acResults.metrics.reactivePowerKvar} kVAR
          </span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">
            Q = √3 · V · I · sin(φ)
          </span>
        </div>

        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
            Apparent Power S
          </span>
          <span className="text-base sm:text-lg font-bold font-mono text-cyan-500">
            {acResults.metrics.apparentPowerKva} kVA
          </span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">
            S = √(P² + Q²)
          </span>
        </div>

        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
            Grid Synchronicity
          </span>
          <span className="text-base sm:text-lg font-bold font-mono text-foreground">
            60.00 Hz
          </span>
          <span className="text-[9.5px] text-emerald-500 block mt-0.5">
            Phase Locked (0.18% VUF)
          </span>
        </div>
      </div>
    </div>
  );
}

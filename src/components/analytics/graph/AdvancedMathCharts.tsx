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
import { HoverInfo } from '@/components/ui/tooltip';
import { renderNowReferenceLabel } from '../GraphTooltip';
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
  verticalNav?: React.ReactNode;
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
  verticalNav,
  onAcVoltageChange,
  onAcCurrentChange,
  onPowerFactorChange,
}: AdvancedMathChartsProps) {
  if (activeTab === 'sinusoidal') {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          <HoverInfo
            className="block w-full cursor-help"
            title="Sinusoidal Goodness R²"
            content={
              <div className="text-[11px] space-y-1 min-w-[160px]">
                <p className="text-muted-foreground">Statistical coefficient of determination comparing measured PV curve against theoretical half-wave sine.</p>
                <div className="pt-1 border-t border-border/50 text-cyan-400 font-mono font-medium">
                  Elapsed Correlation: R² = {fitResults.rSquared}
                </div>
              </div>
            }
          >
            <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono block">
                Sinusoidal Goodness R²
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-cyan-500">
                {fitResults.rSquared}
              </span>
            </div>
          </HoverInfo>

          <HoverInfo
            className="block w-full cursor-help"
            title="Peak Sun Hours (PSH)"
            content={
              <div className="text-[11px] space-y-1 min-w-[160px]">
                <p className="text-muted-foreground">Integrated solar insolation normalized to standard test condition of 1,000 W/m².</p>
                <div className="pt-1 border-t border-border/50 text-amber-400 font-mono font-medium">
                  1 kW/m² Insolation Equiv: {fitResults.peakSunHours} h
                </div>
              </div>
            }
          >
            <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono block">
                Peak Sun Hours (PSH)
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-amber-500">
                {fitResults.peakSunHours} h
              </span>
            </div>
          </HoverInfo>

          <HoverInfo
            className="block w-full cursor-help"
            title="Solar Noon Phase Shift"
            content={
              <div className="text-[11px] space-y-1 min-w-[160px]">
                <p className="text-muted-foreground">Temporal deviation between astronomical clock solar noon (12:00) and peak generation time.</p>
                <div className="pt-1 border-t border-border/50 text-foreground font-mono font-medium">
                  Offset from 12:00 Zenith: {fitResults.phaseShiftHours > 0 ? `+${fitResults.phaseShiftHours}` : fitResults.phaseShiftHours} h
                </div>
              </div>
            }
          >
            <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono block">
                Solar Noon Phase Shift
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-foreground">
                {fitResults.phaseShiftHours > 0 ? `+${fitResults.phaseShiftHours}` : fitResults.phaseShiftHours} h
              </span>
            </div>
          </HoverInfo>

          <HoverInfo
            className="block w-full cursor-help"
            title="Harvest Model Efficiency"
            content={
              <div className="text-[11px] space-y-1 min-w-[160px]">
                <p className="text-muted-foreground">Ratio of actual energy integral harvested versus ideal clear-sky theoretical envelope.</p>
                <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                  Of Clear-Sky Integral: {fitResults.harvestEfficiencyPct}%
                </div>
              </div>
            }
          >
            <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono block">
                Harvest Model Efficiency
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-500">
                {fitResults.harvestEfficiencyPct}%
              </span>
            </div>
          </HoverInfo>
        </div>

        <div className={`flex items-stretch gap-2.5 sm:gap-3 ${compact ? 'h-[260px]' : 'h-[340px]'}`}>
          {verticalNav}
          <div className="flex-1 min-w-0 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fitResults.theoreticalPoints} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="solarActualYellowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_PV} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[9px] font-mono opacity-75" />
                <YAxis domain={sinusoidalYDomain} stroke="currentColor" className="text-[9px] font-mono opacity-75" unit="kW" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(23, 31, 51, 0.95)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke="#64748b"
                  strokeDasharray="3 3"
                  label={renderNowReferenceLabel('● Now', '#94a3b8') as any}
                />
                <Area
                  type="monotone"
                  dataKey="actualSolarKw"
                  name="Actual Measured PV"
                  stroke={COLOR_PV}
                  strokeWidth={2}
                  fill="url(#solarActualYellowGrad)"
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
        </div>
      </div>
    );
  }

  if (activeTab === 'fourier') {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <div>
            <HoverInfo
              title="Discrete Fourier Decomposition"
              content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.fourierDecomposition}
              showIcon
            >
              <span className="text-xs font-semibold text-foreground cursor-help">
                Discrete Fourier Decomposition of 24-Hour Diurnal Cycle
              </span>
            </HoverInfo>
          </div>
          <HoverInfo
            title="Harmonic Phase Angles"
            content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.fourierHarmonicPhases}
            showIcon
          >
            <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] px-1.5 py-0 w-fit cursor-help">
              Harmonics k = 1, 2, 3
            </Badge>
          </HoverInfo>
        </div>

        <div className={`flex items-stretch gap-2.5 sm:gap-3 ${compact ? 'h-[260px]' : 'h-[340px]'}`}>
          {verticalNav}
          <div className="flex-1 min-w-0 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fourierData} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[9px] font-mono opacity-75" />
                <YAxis domain={fourierYDomain} stroke="currentColor" className="text-[9px] font-mono opacity-75" unit="kW" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(23, 31, 51, 0.95)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke="#64748b"
                  strokeDasharray="3 3"
                  label={renderNowReferenceLabel('● Now', '#94a3b8') as any}
                />
                <Line
                  type="monotone"
                  dataKey="actualSolarKw"
                  name="Actual Harvest"
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
        </div>
      </div>
    );
  }

  if (activeTab === 'polar') {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
          <div>
            <HoverInfo
              title="360-Degree Circular Phasor"
              content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.polarPhasor}
              showIcon
            >
              <span className="text-xs font-semibold text-foreground cursor-help">
                360-Degree Circular Phasor: Solar Lobe vs Load Profile
              </span>
            </HoverInfo>
          </div>
          <Badge variant="outline" className="text-indigo-500 border-indigo-500/30 bg-indigo-500/10 font-mono text-[10px] px-1.5 py-0 w-fit">
            Polar Coordinates (r, θ)
          </Badge>
        </div>

        <div className={`flex items-stretch gap-2.5 sm:gap-3 ${compact ? 'h-[280px]' : 'h-[360px]'}`}>
          {verticalNav}
          <div className="flex-1 min-w-0 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={polarData.filter((_, idx) => idx % (timeResolution === 5 ? 12 : 1) === 0)}>
                <PolarGrid stroke="currentColor" className="opacity-20" />
                <PolarAngleAxis dataKey="hourLabel" stroke="currentColor" className="text-[9px] font-mono opacity-75" />
                <PolarRadiusAxis angle={30} domain={[0, 140]} stroke="currentColor" className="text-[8.5px] font-mono opacity-60" />
                <Radar
                  name="Solar Generation"
                  dataKey="solarHarvestRadius"
                  stroke={COLOR_PV}
                  fill={COLOR_PV}
                  fillOpacity={0.35}
                />
                <Radar
                  name="Industrial Load Demand"
                  dataKey="loadDemandRadius"
                  stroke={COLOR_LOAD}
                  fill={COLOR_LOAD}
                  fillOpacity={0.25}
                />
                <Radar
                  name="Battery Energy Flow"
                  dataKey="batteryRadius"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.25}
                />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(23, 31, 51, 0.95)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '11px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // activeTab === 'waveform'
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
        <div>
          <HoverInfo
            title="Three-Phase AC Instantaneous Waveforms"
            content="Real-time 60Hz instantaneous sinusoidal waveforms across Phase A (0°), Phase B (-120°), Phase C (+120°), and Phase A Current with power factor phase shift φ."
            showIcon
          >
            <span className="text-xs font-semibold text-foreground cursor-help">
              Three-Phase AC Instantaneous Waveforms & Harmonic Phasors
            </span>
          </HoverInfo>
        </div>
        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] px-1.5 py-0 w-fit">
          60.00 Hz • Balanced
        </Badge>
      </div>

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

      <div className={`flex items-stretch gap-2.5 sm:gap-3 ${compact ? 'h-[260px]' : 'h-[340px]'}`}>
        {verticalNav}
        <div className="flex-1 min-w-0 h-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={acResults.waveform} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
              <XAxis dataKey="timeMs" stroke="currentColor" className="text-[9px] font-mono opacity-75" unit="ms" />
              <YAxis stroke="currentColor" className="text-[9px] font-mono opacity-75" unit="V" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(23, 31, 51, 0.95)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: '11px',
                }}
              />
              <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <HoverInfo
          className="block w-full cursor-help"
          title="Active Power P"
          content={
            <div className="text-[11px] space-y-1 min-w-[170px]">
              <p className="text-muted-foreground">True work-producing power transmitted across the 3-phase grid interface.</p>
              <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                P = √3 · V · I · cos(φ)
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block">
              Active Power P
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-emerald-500">
              {acResults.metrics.activePowerKw} kW
            </span>
          </div>
        </HoverInfo>

        <HoverInfo
          className="block w-full cursor-help"
          title="Reactive Power Q"
          content={
            <div className="text-[11px] space-y-1 min-w-[170px]">
              <p className="text-muted-foreground">Volt-Amperes reactive sustaining internal transformer magnetic fields.</p>
              <div className="pt-1 border-t border-border/50 text-amber-400 font-mono font-medium">
                Q = √3 · V · I · sin(φ)
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block">
              Reactive Power Q
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-amber-500">
              {acResults.metrics.reactivePowerKvar} kVAR
            </span>
          </div>
        </HoverInfo>

        <HoverInfo
          className="block w-full cursor-help"
          title="Apparent Power S"
          content={
            <div className="text-[11px] space-y-1 min-w-[170px]">
              <p className="text-muted-foreground">Total vector sum magnitude of combined active and reactive components.</p>
              <div className="pt-1 border-t border-border/50 text-cyan-400 font-mono font-medium">
                S = √(P² + Q²)
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block">
              Apparent Power S
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-cyan-500">
              {acResults.metrics.apparentPowerKva} kVA
            </span>
          </div>
        </HoverInfo>

        <HoverInfo
          className="block w-full cursor-help"
          title="Grid Synchronicity"
          content={
            <div className="text-[11px] space-y-1 min-w-[170px]">
              <p className="text-muted-foreground">Frequency lock stability and voltage unbalance factor across three phases.</p>
              <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                Phase Locked (0.18% VUF)
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block">
              Grid Synchronicity
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-foreground">
              60.00 Hz
            </span>
          </div>
        </HoverInfo>
      </div>
    </div>
  );
}

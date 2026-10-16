'use client';

import React from 'react';
import {
  AreaChart,
  Area,
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
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { HourlySolarPoint } from '@/lib/trigonometric-math';
import { CustomExactTooltip } from '../GraphTooltip';
import {
  PowerSeriesPoint,
  PowerSubView,
  ChartRenderMode,
  TimeResolution,
  COLOR_PV,
  COLOR_LOAD,
  COLOR_GRID,
} from '../useTrigonometricGraph';

interface PowerFlowChartProps {
  compact?: boolean;
  powerSeriesData: PowerSeriesPoint[];
  currentLivePoint: HourlySolarPoint;
  peakPv: number;
  peakLoad: number;
  powerSubView: PowerSubView;
  chartRenderMode: ChartRenderMode;
  timeResolution: TimeResolution;
  nowSlotStr: string;
  nowExactTimeStr: string;
  majorXTicks: string[];
  combinedYDomain: [number, number];
  pvYDomain: [number, number];
  consumptionYDomain: [number, number];
  gridYDomain: [number, number];
  onSubViewChange: (view: PowerSubView) => void;
  onRenderModeChange: (mode: ChartRenderMode) => void;
}

export function PowerFlowChart({
  compact = false,
  powerSeriesData,
  currentLivePoint,
  peakPv,
  peakLoad,
  powerSubView,
  chartRenderMode,
  timeResolution,
  nowSlotStr,
  nowExactTimeStr,
  majorXTicks,
  combinedYDomain,
  pvYDomain,
  consumptionYDomain,
  gridYDomain,
  onSubViewChange,
  onRenderModeChange,
}: PowerFlowChartProps) {
  return (
    <div className="space-y-3.5">
      {/* Real-Time Live Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* PV Power */}
        <HoverInfo
          className="block w-full cursor-help"
          title={`PV Generation (${currentLivePoint.hour})`}
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Instantaneous photovoltaic DC to AC generation sampled across current 5-minute interval.</p>
              <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                Peak: {peakPv.toFixed(1)} kW
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                PV Power ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-ping" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-500">
                {currentLivePoint.solarYieldKw !== null ? currentLivePoint.solarYieldKw.toFixed(2) : '0.00'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>

        {/* Consumption */}
        <HoverInfo
          className="block w-full cursor-help"
          title={`Facility Load (${currentLivePoint.hour})`}
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Aggregated electrical consumption demands across on-site circuits and equipment.</p>
              <div className="pt-1 border-t border-border/50 text-yellow-400 font-mono font-medium">
                Peak: {peakLoad.toFixed(1)} kW
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Load ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg sm:text-xl font-bold font-mono text-yellow-500">
                {currentLivePoint.loadDemandKw !== null ? currentLivePoint.loadDemandKw.toFixed(2) : '0.00'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>

        {/* Grid Power */}
        <HoverInfo
          className="block w-full cursor-help"
          title={`Grid Exchange (${currentLivePoint.hour})`}
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Net power flow through bidirectional utility meter (+ export / - import).</p>
              <div className="pt-1 border-t border-border/50 text-purple-400 font-mono font-medium">
                Direction: {(currentLivePoint.gridExportKw ?? 0) >= 0 ? 'Surplus Export' : 'Grid Import'}
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Grid Flow ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg sm:text-xl font-bold font-mono text-purple-500">
                {currentLivePoint.gridExportKw !== null
                  ? `${currentLivePoint.gridExportKw > 0 ? '+' : ''}${currentLivePoint.gridExportKw.toFixed(2)}`
                  : '0.00'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>

        {/* Battery Flow */}
        <HoverInfo
          className="block w-full cursor-help"
          title={`Battery ESS Flow (${currentLivePoint.hour})`}
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Active charge or discharge rate across connected energy storage battery banks.</p>
              <div className="pt-1 border-t border-border/50 text-cyan-400 font-mono font-medium">
                State: {(currentLivePoint.batteryFlowKw ?? 0) >= 0 ? 'Charging' : 'Discharging'}
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-cyan-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Battery ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg sm:text-xl font-bold font-mono text-cyan-500">
                {currentLivePoint.batteryFlowKw !== null
                  ? `${currentLivePoint.batteryFlowKw > 0 ? '+' : ''}${currentLivePoint.batteryFlowKw.toFixed(2)}`
                  : '0.00'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>
      </div>

      {/* Sub-view selector & Style Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50 w-fit flex-wrap">
          <HoverInfo title="Combined Vectors" content="Simultaneous overlay of PV generation, facility load demand, and net utility grid exchange.">
            <button
              onClick={() => onSubViewChange('combined')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                powerSubView === 'combined'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Combined
            </button>
          </HoverInfo>
          <HoverInfo title="Solar PV Profile" content="High-resolution solar PV generation. Captures cloud transients, irradiance changes, and MPPT dynamic tracking.">
            <button
              onClick={() => onSubViewChange('pv')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                powerSubView === 'pv'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              PV
            </button>
          </HoverInfo>
          <HoverInfo title="Facility Load Demand" content="Industrial facility electrical consumption. Reflects machinery stepping, cooling, and operational diurnal baselines.">
            <button
              onClick={() => onSubViewChange('consumption')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                powerSubView === 'consumption'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Load
            </button>
          </HoverInfo>
          <HoverInfo title="Net Grid Flow" content="Two-way utility exchange balance. Positive (+) clean solar export vs negative (−) shortfall grid draw.">
            <button
              onClick={() => onSubViewChange('grid')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                powerSubView === 'grid'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Grid
            </button>
          </HoverInfo>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium">Style:</span>
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50">
            <button
              onClick={() => onRenderModeChange('line')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                chartRenderMode === 'line'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Line
            </button>
            <button
              onClick={() => onRenderModeChange('area')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                chartRenderMode === 'area'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Area
            </button>
          </div>
        </div>
      </div>

      {/* Combined View */}
      {powerSubView === 'combined' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground">
                5-Minute Continuous Telemetry — Solar Yield · Facility Load · Net Grid
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-border/70 text-muted-foreground bg-muted/40 px-1.5 py-0">
                Dynamic Scale: {combinedYDomain[0]} kW → {combinedYDomain[1]} kW
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Solar Yield
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Facility Load
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Net Grid Flow
              </span>
            </div>
          </div>

          <div className={compact ? 'h-[220px] w-full' : 'h-[280px] w-full'}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="pvGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_PV} stopOpacity={chartRenderMode === 'area' ? 0.35 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="loadYellowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={chartRenderMode === 'area' ? 0.30 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gridPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_GRID} stopOpacity={chartRenderMode === 'area' ? 0.25 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_GRID} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis
                  dataKey="hour"
                  ticks={majorXTicks}
                  stroke="currentColor"
                  className="text-[10px] opacity-60"
                />
                <YAxis
                  domain={combinedYDomain}
                  stroke="currentColor"
                  className="text-[10px] opacity-60"
                  unit="kW"
                />
                <Tooltip content={<CustomExactTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
                <ReferenceLine
                  x={nowSlotStr}
                  stroke={COLOR_GRID}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `● Now (${nowExactTimeStr})`,
                    fill: '#c084fc',
                    fontSize: 10,
                    position: 'top',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pvPowerKw"
                  name="PV Power (kW)"
                  stroke={COLOR_PV}
                  strokeWidth={2}
                  fill="url(#pvGreenGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_PV, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="consumptionKw"
                  name="Consumption (kW)"
                  stroke={COLOR_LOAD}
                  strokeWidth={2}
                  fill="url(#loadYellowGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_LOAD, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="gridPowerKw"
                  name="Grid Power (kW, +export/-import)"
                  stroke={COLOR_GRID}
                  strokeWidth={1.8}
                  fill="url(#gridPurpleGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_GRID, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
            <HoverInfo
              title="Daily Telemetry Resolution"
              content="288 distinct 5-minute sampling intervals covering 24 hours. Points up to current time reflect measured inverter values."
            >
              <span className="cursor-help">288 points/day (every {timeResolution} mins) • Elapsed: 00:00 → {nowSlotStr}</span>
            </HoverInfo>
            <HoverInfo
              title="Unelapsed Intervals"
              content="Future intervals through 23:55 remain pending and cleanly stop at the current time."
            >
              <span className="text-purple-400 cursor-help">Unelapsed: {nowSlotStr} → 23:55 (Pending)</span>
            </HoverInfo>
          </div>
        </div>
      )}

      {/* Individual PV Power */}
      {powerSubView === 'pv' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <HoverInfo
              title="Solar PV Generation Profile"
              content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.pvPowerSolo}
              showIcon
            >
              <span className="text-xs font-semibold text-foreground cursor-help">
                Solar Yield — Continuous 5-Minute Generation Profile
              </span>
            </HoverInfo>
            <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-500 bg-amber-500/10 px-1.5 py-0">
              Dynamic Scale: {pvYDomain[0]} kW → {pvYDomain[1]} kW (+18% Headroom)
            </Badge>
          </div>
          <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloPvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_PV} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                <YAxis domain={pvYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <ReferenceLine
                  x={nowSlotStr}
                  stroke={COLOR_PV}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `● Now (${nowExactTimeStr})`, fill: COLOR_PV, fontSize: 10, position: 'top' }}
                />
                <Area
                  type="monotone"
                  dataKey="pvPowerKw"
                  name="Solar Yield (kW)"
                  stroke={COLOR_PV}
                  strokeWidth={2.5}
                  fill="url(#soloPvGrad)"
                  dot={false}
                  activeDot={{ r: 5, stroke: COLOR_PV, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Individual Consumption */}
      {powerSubView === 'consumption' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <HoverInfo
              title="Industrial Facility Load Profile"
              content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.consumptionSolo}
              showIcon
            >
              <span className="text-xs font-semibold text-foreground cursor-help">
                Facility Load — Continuous 5-Minute Industrial Load Demand Profile
              </span>
            </HoverInfo>
            <Badge variant="outline" className="text-[10px] font-mono border-indigo-500/30 text-indigo-400 bg-indigo-500/10 px-1.5 py-0">
              Dynamic Scale: {consumptionYDomain[0]} kW → {consumptionYDomain[1]} kW (+18% Headroom)
            </Badge>
          </div>
          <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloLoadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                <YAxis domain={consumptionYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <ReferenceLine
                  x={nowSlotStr}
                  stroke={COLOR_LOAD}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `● Now (${nowExactTimeStr})`, fill: COLOR_LOAD, fontSize: 10, position: 'top' }}
                />
                <Area
                  type="monotone"
                  dataKey="consumptionKw"
                  name="Facility Load (kW)"
                  stroke={COLOR_LOAD}
                  strokeWidth={2.5}
                  fill="url(#soloLoadGrad)"
                  dot={false}
                  activeDot={{ r: 5, stroke: COLOR_LOAD, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Individual Grid Power */}
      {powerSubView === 'grid' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-foreground">
              Grid Net — Continuous 5-Minute Net Exchange (+ Export / − Import)
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-1.5 py-0">
              Dynamic Scale: {gridYDomain[0]} kW → {gridYDomain[1]} kW (+18% Head / +14% Foot)
            </Badge>
          </div>
          <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloGridGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_GRID} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_GRID} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                <YAxis domain={gridYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <ReferenceLine y={0} stroke="currentColor" className="opacity-40" />
                <ReferenceLine
                  x={nowSlotStr}
                  stroke={COLOR_GRID}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `● Now (${nowExactTimeStr})`, fill: COLOR_GRID, fontSize: 10, position: 'top' }}
                />
                <Area
                  type="monotone"
                  dataKey="gridPowerKw"
                  name="Grid Power (kW)"
                  stroke={COLOR_GRID}
                  strokeWidth={2.5}
                  fill="url(#soloGridGrad)"
                  dot={false}
                  activeDot={{ r: 5, stroke: COLOR_GRID, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            <HoverInfo
              title="Clean Solar Feed-in Export (+)"
              content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.gridExportPositive}
            >
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium text-[9.5px] cursor-help">
                Positive (+): Clean Solar Export
              </span>
            </HoverInfo>
            <HoverInfo
              title="Utility Grid Import (−)"
              content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.gridImportNegative}
            >
              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono font-medium text-[9.5px] cursor-help">
                Negative (−): Utility Grid Import
              </span>
            </HoverInfo>
          </div>
        </div>
      )}
    </div>
  );
}

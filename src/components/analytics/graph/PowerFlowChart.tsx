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
import { HoverInfo } from '@/components/ui/tooltip';
import { Layers } from 'lucide-react';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { HourlySolarPoint } from '@/lib/trigonometric-math';
import { CustomExactTooltip, renderNowReferenceLabel } from '../GraphTooltip';
import {
  PowerSeriesPoint,
  PowerSubView,
  ChartRenderMode,
  TimeResolution,
  COLOR_PV,
  COLOR_LOAD,
  COLOR_GRID,
  COLOR_BATTERY,
} from '../useTrigonometricGraph';

interface PowerFlowChartProps {
  compact?: boolean;
  powerSeriesData: PowerSeriesPoint[];
  currentLivePoint: HourlySolarPoint;
  peakPv: number;
  peakLoad: number;
  powerSubView: PowerSubView;
  chartRenderMode?: ChartRenderMode;
  timeResolution: TimeResolution;
  nowSlotStr: string;
  nowExactTimeStr: string;
  majorXTicks: string[];
  combinedYDomain: [number, number];
  pvYDomain: [number, number];
  consumptionYDomain: [number, number];
  gridYDomain: [number, number];
  batteryYDomain?: [number, number];
  verticalNav?: React.ReactNode;
  onSubViewChange: (view: PowerSubView) => void;
  onRenderModeChange?: (mode: ChartRenderMode) => void;
}

export function PowerFlowChart({
  compact = false,
  powerSeriesData,
  currentLivePoint,
  peakPv,
  peakLoad,
  powerSubView,
  chartRenderMode = 'area',
  timeResolution,
  nowSlotStr,
  nowExactTimeStr,
  majorXTicks,
  combinedYDomain,
  pvYDomain,
  consumptionYDomain,
  gridYDomain,
  batteryYDomain = [-10, 10],
  verticalNav,
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
              <div className="pt-1 border-t border-border/50 text-yellow-400 font-mono font-medium">
                Peak: {peakPv.toFixed(1)} kW
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-medium">
                PV Power ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 motion-safe:animate-ping" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-sm sm:text-base font-bold font-mono text-yellow-500">
                {currentLivePoint.solarYieldKw !== null ? currentLivePoint.solarYieldKw.toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">kW</span>
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
              <div className="pt-1 border-t border-border/50 text-purple-400 font-mono font-medium">
                Peak: {peakLoad.toFixed(1)} kW
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-medium">
                Load ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-sm sm:text-base font-bold font-mono text-purple-400">
                {currentLivePoint.loadDemandKw !== null ? currentLivePoint.loadDemandKw.toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>

        {/* Grid Power */}
        <HoverInfo
          className="block w-full cursor-help"
          title={`Grid Exchange (${currentLivePoint.hour})`}
          content={
            <div className="text-[11px] space-y-1.5 min-w-[200px]">
              <p className="text-muted-foreground">Net power flow through bidirectional utility meter.</p>
              <div className="pt-1 border-t border-border/50 text-[10.5px] space-y-0.5 font-mono">
                <div className="text-emerald-400 font-medium">Positive (+): Clean Solar Export</div>
                <div className="text-rose-400 font-medium">Negative (−): Utility Grid Import</div>
              </div>
              <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                Direction: {(currentLivePoint.gridExportKw ?? 0) >= 0 ? 'Surplus Export (+)' : 'Grid Import (−)'}
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-medium">
                Grid Flow ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-500">
                {currentLivePoint.gridExportKw !== null
                  ? `${currentLivePoint.gridExportKw > 0 ? '+' : ''}${currentLivePoint.gridExportKw.toFixed(2)}`
                  : '0.00'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>

        {/* Battery Flow */}
        <HoverInfo
          className="block w-full cursor-help"
          title={`Battery ESS Flow (${currentLivePoint.hour})`}
          content={
            <div className="text-[11px] space-y-1.5 min-w-[200px]">
              <p className="text-muted-foreground">Active charge or discharge rate across connected energy storage battery banks.</p>
              <div className="pt-1 border-t border-border/50 text-[10.5px] space-y-0.5 font-mono">
                <div className="text-cyan-400 font-medium">Positive (+): Charging ESS</div>
                <div className="text-amber-400 font-medium">Negative (−): Discharging to Load</div>
              </div>
              <div className="pt-1 border-t border-border/50 text-cyan-400 font-mono font-medium">
                State: {(currentLivePoint.batteryFlowKw ?? 0) >= 0 ? 'Charging (+)' : 'Discharging (−)'}
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-cyan-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-medium">
                Battery ({currentLivePoint.hour})
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-sm sm:text-base font-bold font-mono text-cyan-500">
                {currentLivePoint.batteryFlowKw !== null
                  ? `${currentLivePoint.batteryFlowKw > 0 ? '+' : ''}${currentLivePoint.batteryFlowKw.toFixed(2)}`
                  : '0.00'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">kW</span>
            </div>
          </div>
        </HoverInfo>
      </div>

      {/* Unified Interactive Legend & View Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/60 w-fit flex-wrap">
          <HoverInfo title="Combined Overlay" content="Simultaneous overlay of PV generation, facility load demand, net utility grid exchange, and battery ESS flow.">
            <button
              type="button"
              onClick={() => onSubViewChange('combined')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                powerSubView === 'combined'
                  ? 'bg-background text-foreground shadow-xs border border-border/70'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Layers size={13} className={powerSubView === 'combined' ? 'text-primary' : 'text-muted-foreground'} />
              <span>Combined</span>
            </button>
          </HoverInfo>

          <HoverInfo
            title="Solar PV Generation"
            content={
              <div className="space-y-1 text-[11px] min-w-[200px]">
                <p className="text-muted-foreground">{TELEMETRY_DESCRIPTIONS.trigonometricGraph.pvPowerSolo}</p>
                <div className="pt-1 border-t border-border/50 text-yellow-500 font-mono text-[10.5px]">
                  Peak Recorded: {peakPv.toFixed(1)} kW
                </div>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => onSubViewChange(powerSubView === 'pv' ? 'combined' : 'pv')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                powerSubView === 'pv'
                  ? 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/40 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-yellow-500/5'
              }`}
            >
              <span className={`size-2 rounded-full bg-yellow-500 ${powerSubView === 'pv' ? 'ring-2 ring-yellow-500/40' : ''}`} />
              <span>Solar Yield (kW)</span>
            </button>
          </HoverInfo>

          <HoverInfo
            title="Facility Load Demand"
            content={
              <div className="space-y-1 text-[11px] min-w-[200px]">
                <p className="text-muted-foreground">{TELEMETRY_DESCRIPTIONS.trigonometricGraph.consumptionSolo}</p>
                <div className="pt-1 border-t border-border/50 text-purple-400 font-mono text-[10.5px]">
                  Peak Demand: {peakLoad.toFixed(1)} kW
                </div>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => onSubViewChange(powerSubView === 'consumption' ? 'combined' : 'consumption')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                powerSubView === 'consumption'
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/40 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-purple-500/5'
              }`}
            >
              <span className={`size-2 rounded-full bg-purple-500 ${powerSubView === 'consumption' ? 'ring-2 ring-purple-500/40' : ''}`} />
              <span>Facility Load (kW)</span>
            </button>
          </HoverInfo>

          <HoverInfo
            title="Net Utility Grid Flow"
            content={
              <div className="space-y-1.5 text-[11px] min-w-[220px]">
                <p className="text-muted-foreground">
                  Isolate utility grid exchange balance. Click to view grid solo or return to combined view.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-[10.5px] space-y-1 font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <span className="font-bold">Positive (+)</span>: Clean Solar Export
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-400">
                    <span className="font-bold">Negative (−)</span>: Utility Grid Import
                  </div>
                </div>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => onSubViewChange(powerSubView === 'grid' ? 'combined' : 'grid')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                powerSubView === 'grid'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-emerald-500/5'
              }`}
            >
              <span className={`size-2 rounded-full bg-emerald-500 ${powerSubView === 'grid' ? 'ring-2 ring-emerald-500/40' : ''}`} />
              <span>Net Grid Flow (kW)</span>
            </button>
          </HoverInfo>

          <HoverInfo
            title="Battery ESS Flow"
            content={
              <div className="space-y-1.5 text-[11px] min-w-[220px]">
                <p className="text-muted-foreground">
                  Isolate active battery charge and discharge telemetry. Click to view battery solo or return to combined view.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-[10.5px] space-y-1 font-mono">
                  <div className="flex items-center gap-1.5 text-cyan-400">
                    <span className="font-bold">Positive (+)</span>: Charging ESS
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <span className="font-bold">Negative (−)</span>: Discharging to Load
                  </div>
                </div>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => onSubViewChange(powerSubView === 'battery' ? 'combined' : 'battery')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                powerSubView === 'battery'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-cyan-500/5'
              }`}
            >
              <span className={`size-2 rounded-full bg-cyan-500 ${powerSubView === 'battery' ? 'ring-2 ring-cyan-500/40' : ''}`} />
              <span>Battery Flow (kW)</span>
            </button>
          </HoverInfo>
        </div>
      </div>

      {/* Chart Row: Vertical Navigation Rail beside the Graph in the SAME ROW */}
      <div className={`flex items-stretch gap-2.5 sm:gap-3 ${compact ? 'h-[260px]' : 'h-[340px]'}`}>
        {verticalNav}
        <div className="flex-1 min-w-0 h-full">
          {/* Combined View */}
          {powerSubView === 'combined' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="pvYellowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_PV} stopOpacity={chartRenderMode === 'area' ? 0.35 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="loadPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={chartRenderMode === 'area' ? 0.30 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gridGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_GRID} stopOpacity={chartRenderMode === 'area' ? 0.25 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_GRID} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="batteryCyanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_BATTERY} stopOpacity={chartRenderMode === 'area' ? 0.25 : 0.08} />
                    <stop offset="95%" stopColor={COLOR_BATTERY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis
                  dataKey="hour"
                  ticks={majorXTicks}
                  stroke="currentColor"
                  className="text-xs font-mono opacity-80"
                />
                <YAxis
                  domain={combinedYDomain}
                  stroke="currentColor"
                  className="text-xs font-mono opacity-80"
                  unit="kW"
                />
                <Tooltip content={<CustomExactTooltip />} />
                <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={renderNowReferenceLabel(`● Now (${nowExactTimeStr})`, '#94a3b8') as any}
                />
                <Area
                  type="monotone"
                  dataKey="pvPowerKw"
                  name="Solar Yield (kW)"
                  stroke={COLOR_PV}
                  strokeWidth={2}
                  fill="url(#pvYellowGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_PV, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="consumptionKw"
                  name="Facility Load (kW)"
                  stroke={COLOR_LOAD}
                  strokeWidth={2}
                  fill="url(#loadPurpleGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_LOAD, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="gridPowerKw"
                  name="Net Grid Flow (kW)"
                  stroke={COLOR_GRID}
                  strokeWidth={1.8}
                  fill="url(#gridGreenGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_GRID, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="batteryFlowKw"
                  name="Battery Flow (kW)"
                  stroke={COLOR_BATTERY}
                  strokeWidth={1.8}
                  fill="url(#batteryCyanGrad)"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: COLOR_BATTERY, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* Individual PV Power */}
          {powerSubView === 'pv' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloPvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_PV} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-xs font-mono opacity-80" />
                <YAxis domain={pvYDomain} stroke="currentColor" className="text-xs font-mono opacity-80" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke={COLOR_PV}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={renderNowReferenceLabel(`● Now (${nowExactTimeStr})`, COLOR_PV) as any}
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
          )}

          {/* Individual Consumption */}
          {powerSubView === 'consumption' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloLoadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-xs font-mono opacity-80" />
                <YAxis domain={consumptionYDomain} stroke="currentColor" className="text-xs font-mono opacity-80" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke={COLOR_LOAD}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={renderNowReferenceLabel(`● Now (${nowExactTimeStr})`, COLOR_LOAD) as any}
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
          )}

          {/* Individual Grid Power */}
          {powerSubView === 'grid' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloGridGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_GRID} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_GRID} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-xs font-mono opacity-80" />
                <YAxis domain={gridYDomain} stroke="currentColor" className="text-xs font-mono opacity-80" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <ReferenceLine y={0} stroke="currentColor" className="opacity-40" />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke={COLOR_GRID}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={renderNowReferenceLabel(`● Now (${nowExactTimeStr})`, COLOR_GRID) as any}
                />
                <Area
                  type="monotone"
                  dataKey="gridPowerKw"
                  name="Net Grid Flow (kW)"
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
          )}

          {/* Individual Battery ESS Power */}
          {powerSubView === 'battery' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerSeriesData} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="soloBatteryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_BATTERY} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                    <stop offset="95%" stopColor={COLOR_BATTERY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-xs font-mono opacity-80" />
                <YAxis domain={batteryYDomain} stroke="currentColor" className="text-xs font-mono opacity-80" unit="kW" />
                <Tooltip content={<CustomExactTooltip />} />
                <ReferenceLine y={0} stroke="currentColor" className="opacity-40" />
                <ReferenceLine
                  isFront
                  x={nowSlotStr}
                  stroke={COLOR_BATTERY}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={renderNowReferenceLabel(`● Now (${nowExactTimeStr})`, COLOR_BATTERY) as any}
                />
                <Area
                  type="monotone"
                  dataKey="batteryFlowKw"
                  name="Battery Flow (kW)"
                  stroke={COLOR_BATTERY}
                  strokeWidth={2.5}
                  fill="url(#soloBatteryGrad)"
                  dot={false}
                  activeDot={{ r: 5, stroke: COLOR_BATTERY, strokeWidth: 2, fill: '#fff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

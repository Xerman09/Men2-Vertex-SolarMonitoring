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
import { useRole } from '@/lib/role-context';
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
  const { isAdmin } = useRole();

  return (
    <div className="space-y-3.5">
      {/* Real-Time Live Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* PV Power (Green) */}
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
          <span className="text-[10px] text-emerald-500/80 font-medium block truncate">
            Peak: {peakPv.toFixed(1)} kW
          </span>
        </div>

        {/* Consumption (Yellow) */}
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
          <span className="text-[10px] text-yellow-500/80 font-medium block truncate">
            Peak: {peakLoad.toFixed(1)} kW
          </span>
        </div>

        {/* Grid Power (Purple) */}
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
          <span className="text-[10px] text-purple-500/80 font-medium block truncate">
            {(currentLivePoint.gridExportKw ?? 0) >= 0 ? 'Surplus Export' : 'Grid Import'}
          </span>
        </div>

        {/* Battery Flow (Cyan) */}
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
          <span className="text-[10px] text-cyan-500/80 font-medium block truncate">
            {(currentLivePoint.batteryFlowKw ?? 0) >= 0 ? 'Charging' : 'Discharging'}
          </span>
        </div>
      </div>

      {/* Sub-view selector & Style Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50 w-fit flex-wrap">
          {(['combined', 'pv', 'consumption', 'grid'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onSubViewChange(v)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                powerSubView === v
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'combined' && 'Combined'}
              {v === 'pv' && 'PV (Green)'}
              {v === 'consumption' && 'Load (Yellow)'}
              {v === 'grid' && 'Grid (Purple)'}
            </button>
          ))}
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
                5-Minute Continuous Telemetry — PV (Green) · Consumption (Yellow) · Grid (Purple)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-border/70 text-muted-foreground bg-muted/40 px-1.5 py-0">
                Dynamic Scale: {combinedYDomain[0]} kW → {combinedYDomain[1]} kW
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> PV Power
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> Consumption
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Net Grid Flow
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
            <span>288 points/day (every {timeResolution} mins) • Elapsed: 00:00 → {nowSlotStr}</span>
            <span className="text-purple-400">Unelapsed: {nowSlotStr} → 23:55 (Pending)</span>
          </div>
        </div>
      )}

      {/* Individual PV Power (Green) */}
      {powerSubView === 'pv' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-foreground">
              PV Power (Green) — Continuous 5-Minute Solar Generation Profile
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-1.5 py-0">
              Dynamic Scale: {pvYDomain[0]} kW → {pvYDomain[1]} kW (+18% Headroom)
            </Badge>
          </div>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">
              {TELEMETRY_DESCRIPTIONS.trigonometricGraph.pvPowerSolo}
            </p>
          )}
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
                  name="PV Power (kW)"
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

      {/* Individual Consumption (Yellow) */}
      {powerSubView === 'consumption' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-foreground">
              Consumption (Yellow) — Continuous 5-Minute Industrial Load Demand Profile
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-yellow-500/30 text-yellow-400 bg-yellow-500/10 px-1.5 py-0">
              Dynamic Scale: {consumptionYDomain[0]} kW → {consumptionYDomain[1]} kW (+18% Headroom)
            </Badge>
          </div>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">
              {TELEMETRY_DESCRIPTIONS.trigonometricGraph.consumptionSolo}
            </p>
          )}
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
                  name="Consumption (kW)"
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

      {/* Individual Grid Power (Purple) */}
      {powerSubView === 'grid' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-foreground">
              Grid Power (Purple) — Continuous 5-Minute Net Exchange (+ Export / − Import)
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-400 bg-purple-500/10 px-1.5 py-0">
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
          <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono font-medium text-[9.5px]">
              Positive (+): Solar Export
            </span>
            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono font-medium text-[9.5px]">
              Negative (−): Grid Import
            </span>
          </div>
          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/20">
                <span className="font-semibold text-purple-400 block font-mono text-xs">Positive (+): Clean Solar Feed-in Export</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  {TELEMETRY_DESCRIPTIONS.trigonometricGraph.gridExportPositive}
                </span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/20">
                <span className="font-semibold text-purple-300 block font-mono text-xs">Negative (−): Utility Grid Import</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  {TELEMETRY_DESCRIPTIONS.trigonometricGraph.gridImportNegative}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

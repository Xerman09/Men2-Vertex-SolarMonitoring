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
import { Zap, TrendingUp } from 'lucide-react';
import { HoverInfo } from '@/components/ui/tooltip';
import { renderNowReferenceLabel } from '../GraphTooltip';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { SelfConsumptionMetrics, COLOR_PV, COLOR_LOAD } from '../useTrigonometricGraph';

interface SelfConsumptionChartProps {
  compact?: boolean;
  selfConsumptionMetrics: SelfConsumptionMetrics;
  majorXTicks: string[];
  nowSlotStr: string;
  verticalNav?: React.ReactNode;
}

export function SelfConsumptionChart({
  compact = false,
  selfConsumptionMetrics,
  majorXTicks,
  nowSlotStr,
  verticalNav,
}: SelfConsumptionChartProps) {
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <HoverInfo
          className="block w-full cursor-help h-full"
          title="Utilization Rate"
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Percentage of total facility electrical load directly met by on-site solar PV generation.</p>
              <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                Load covered by PV
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30 flex flex-col items-center justify-center text-center h-full min-h-[58px] gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono font-medium block">Utilization Rate</span>
            <span className="text-sm sm:text-base font-bold font-mono text-emerald-500">{selfConsumptionMetrics.utilizationPct}%</span>
          </div>
        </HoverInfo>

        <HoverInfo
          className="block w-full cursor-help h-full"
          title="Self-Consumption"
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Fraction of total solar PV generation absorbed immediately on-site rather than exported.</p>
              <div className="pt-1 border-t border-border/50 text-yellow-400 font-mono font-medium">
                PV consumed locally
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/30 flex flex-col items-center justify-center text-center h-full min-h-[58px] gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono font-medium block">Self-Consumption</span>
            <span className="text-sm sm:text-base font-bold font-mono text-yellow-500">{selfConsumptionMetrics.productionPct}%</span>
          </div>
        </HoverInfo>

        <HoverInfo
          className="block w-full cursor-help h-full"
          title="Self-Consumed kWh"
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Actual volume of solar generation utilized by local industrial plant circuits.</p>
              <div className="pt-1 border-t border-border/50 text-emerald-400 font-mono font-medium">
                of {selfConsumptionMetrics.totalPvKwh} kWh PV
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30 flex flex-col items-center justify-center text-center h-full min-h-[58px] gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono font-medium block">Self-Consumed kWh</span>
            <span className="text-sm sm:text-base font-bold font-mono text-emerald-400">{selfConsumptionMetrics.selfConsumedKwh}</span>
          </div>
        </HoverInfo>

        <HoverInfo
          className="block w-full cursor-help h-full"
          title="Grid Import"
          content={
            <div className="text-[11px] space-y-1 min-w-[160px]">
              <p className="text-muted-foreground">Supplementary energy purchased from the utility grid to cover facility deficit.</p>
              <div className="pt-1 border-t border-border/50 text-purple-400 font-mono font-medium">
                of {selfConsumptionMetrics.totalLoadKwh} kWh load
              </div>
            </div>
          }
        >
          <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/30 flex flex-col items-center justify-center text-center h-full min-h-[58px] gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono font-medium block">Grid Import</span>
            <span className="text-sm sm:text-base font-bold font-mono text-purple-400">{selfConsumptionMetrics.totalImportKwh}</span>
          </div>
        </HoverInfo>
      </div>

      {/* Ratio definition cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Utilization */}
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/20 flex flex-col justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="p-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <Zap className="h-3 w-3 text-emerald-500" />
            </div>
            <div>
              <HoverInfo
                title="Utilization — PV to Import"
                content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.selfConsumptionUtilization}
                showIcon
              >
                <span className="text-xs font-semibold text-foreground block cursor-help">
                  Utilization — PV to Import
                </span>
              </HoverInfo>
            </div>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, selfConsumptionMetrics.utilizationPct)}%` }}
            />
          </div>
          <div className="flex flex-col gap-0.5 text-[9.5px] text-muted-foreground font-mono">
            <div className="flex items-center justify-between">
              <span>PV Covered:</span>
              <strong className="text-emerald-500">{selfConsumptionMetrics.utilizationPct}%</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Grid Import:</span>
              <strong className="text-purple-400">{(100 - selfConsumptionMetrics.utilizationPct).toFixed(1)}%</strong>
            </div>
          </div>
        </div>

        {/* Production self-consumption */}
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/20 flex flex-col justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="p-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20">
              <TrendingUp className="h-3 w-3 text-yellow-500" />
            </div>
            <div>
              <HoverInfo
                title="Production — Consumption to Export"
                content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.selfConsumptionProduction}
                showIcon
              >
                <span className="text-xs font-semibold text-foreground block cursor-help">
                  Production — Consumption to Export
                </span>
              </HoverInfo>
            </div>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, selfConsumptionMetrics.productionPct)}%` }}
            />
          </div>
          <div className="flex flex-col gap-0.5 text-[9.5px] text-muted-foreground font-mono">
            <div className="flex items-center justify-between">
              <span>Self-Consumed:</span>
              <strong className="text-purple-400">{selfConsumptionMetrics.productionPct}%</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Exported:</span>
              <strong className="text-emerald-400">{(100 - selfConsumptionMetrics.productionPct).toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Continuous ratios chart */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">5-Minute Continuous Ratios (%)</span>
        <div className={`flex items-stretch gap-2.5 sm:gap-3 ${compact ? 'h-[270px]' : 'h-[360px]'}`}>
          {verticalNav}
          <div className="flex-1 min-w-0 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selfConsumptionMetrics.hourlyRatios} margin={{ top: 20, right: 14, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_PV} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[9px] font-mono opacity-75" />
                <YAxis domain={[0, 100]} stroke="currentColor" className="text-[9px] font-mono opacity-75" unit="%" />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(23,31,51,0.95)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)', fontSize: '11px' }} />
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
                  dataKey="utilizationPct"
                  name="Utilization % (PV→Load)"
                  stroke={COLOR_PV}
                  strokeWidth={2}
                  fill="url(#utilGrad)"
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="productionPct"
                  name="Self-Consumption % (Local PV)"
                  stroke={COLOR_LOAD}
                  strokeWidth={2}
                  fill="url(#prodGrad)"
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

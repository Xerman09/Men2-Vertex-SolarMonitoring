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
import { useRole } from '@/lib/role-context';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { SelfConsumptionMetrics, COLOR_PV, COLOR_LOAD } from '../useTrigonometricGraph';

interface SelfConsumptionChartProps {
  compact?: boolean;
  selfConsumptionMetrics: SelfConsumptionMetrics;
  majorXTicks: string[];
  nowSlotStr: string;
}

export function SelfConsumptionChart({
  compact = false,
  selfConsumptionMetrics,
  majorXTicks,
  nowSlotStr,
}: SelfConsumptionChartProps) {
  const { isAdmin } = useRole();

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* KPI Cards with Green, Yellow, Purple alignment */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Utilization Rate</span>
          <span className="text-lg sm:text-xl font-bold font-mono text-emerald-500">{selfConsumptionMetrics.utilizationPct}%</span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">Load covered by PV</span>
        </div>
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/30">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Self-Consumption</span>
          <span className="text-lg sm:text-xl font-bold font-mono text-yellow-500">{selfConsumptionMetrics.productionPct}%</span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">PV consumed locally</span>
        </div>
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Self-Consumed kWh</span>
          <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400">{selfConsumptionMetrics.selfConsumedKwh}</span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">of {selfConsumptionMetrics.totalPvKwh} kWh PV</span>
        </div>
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/30">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Grid Import</span>
          <span className="text-lg sm:text-xl font-bold font-mono text-purple-400">{selfConsumptionMetrics.totalImportKwh}</span>
          <span className="text-[9.5px] text-muted-foreground block mt-0.5">of {selfConsumptionMetrics.totalLoadKwh} kWh load</span>
        </div>
      </div>

      {/* Ratio definition cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Utilization */}
        <div className="p-2.5 sm:p-3 rounded-lg bg-card border border-emerald-500/20 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-bold text-foreground block">Utilization — PV to Import</span>
              {isAdmin && (
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {TELEMETRY_DESCRIPTIONS.trigonometricGraph.selfConsumptionUtilization}
                </span>
              )}
            </div>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, selfConsumptionMetrics.utilizationPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>PV Covered: <strong className="text-emerald-500">{selfConsumptionMetrics.utilizationPct}%</strong></span>
            <span>Grid Import: <strong className="text-purple-400">{(100 - selfConsumptionMetrics.utilizationPct).toFixed(1)}%</strong></span>
          </div>
        </div>

        {/* Production self-consumption */}
        <div className="p-2.5 sm:p-3 rounded-lg bg-card border border-yellow-500/20 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
              <TrendingUp className="h-3.5 w-3.5 text-yellow-500" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-bold text-foreground block">Production — Consumption to Export</span>
              {isAdmin && (
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {TELEMETRY_DESCRIPTIONS.trigonometricGraph.selfConsumptionProduction}
                </span>
              )}
            </div>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, selfConsumptionMetrics.productionPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>Self-Consumed: <strong className="text-yellow-500">{selfConsumptionMetrics.productionPct}%</strong></span>
            <span>Exported: <strong className="text-purple-400">{(100 - selfConsumptionMetrics.productionPct).toFixed(1)}%</strong></span>
          </div>
        </div>
      </div>

      {/* Continuous ratios chart */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-foreground">5-Minute Continuous Ratios (%)</span>
        <div className={compact ? 'h-[180px] w-full' : 'h-[230px] w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={selfConsumptionMetrics.hourlyRatios} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
              <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
              <YAxis domain={[0, 100]} stroke="currentColor" className="text-[10px] opacity-60" unit="%" />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(23,31,51,0.95)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <ReferenceLine x={nowSlotStr} stroke="#64748b" strokeDasharray="3 3" />
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
  );
}

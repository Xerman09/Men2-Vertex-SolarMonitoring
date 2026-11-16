'use client';

import React from 'react';
import {
  Sun,
  Zap,
  Activity,
  ArrowUpDown,
  BatteryCharging,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { HoverInfo } from '@/components/ui/tooltip';

interface FleetKpiStripProps {
  totalSolarKw: number;
  totalCapacityKw: number;
  totalDailyKwh: number;
  totalLoadKw: number;
  netGridKw: number;
  avgBatterySoc: number;
  totalBatteryKw: number;
  totalInverters: number;
  onlineInverters: number;
  faultCount: number;
  offlineCount: number;
  standbyCount: number;
}

export function FleetKpiStrip({
  totalSolarKw,
  totalCapacityKw,
  totalDailyKwh,
  totalLoadKw,
  netGridKw,
  avgBatterySoc,
  totalBatteryKw,
  totalInverters,
  onlineInverters,
  faultCount,
  offlineCount,
  standbyCount,
}: FleetKpiStripProps) {
  const utilizationPct =
    totalCapacityKw > 0
      ? Math.min(100, (totalSolarKw / totalCapacityKw) * 100)
      : 0;
  const specificYield =
    totalCapacityKw > 0 ? totalDailyKwh / totalCapacityKw : null;

  const hasIssues = faultCount > 0 || offlineCount > 0;
  const isExporting = netGridKw > 0.05;
  const isImporting = netGridKw < -0.05;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 fleet-containment">
      {/* 1. Live Solar Output */}
      <HoverInfo
        title="Aggregate Solar Output"
        content="Real-time AC photovoltaic output summed across active scope inverters relative to installed DC capacity."
      >
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 flex flex-col justify-between gap-1 cursor-help">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Live Solar
            </span>
            <Sun size={13} className="text-amber-500 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-amber-500 leading-tight">
            {totalSolarKw.toFixed(1)}{' '}
            <span className="text-xs font-medium text-muted-foreground">kW</span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {utilizationPct.toFixed(0)}% of{' '}
            {totalCapacityKw > 0 ? `${totalCapacityKw.toFixed(0)} kWp` : '--'}
          </div>
        </div>
      </HoverInfo>

      {/* 2. Daily Harvest & Specific Yield */}
      <HoverInfo
        title="Daily Energy & Specific Yield"
        content="Cumulative today's PV energy (kWh) and normalized Specific Yield (kWh per kWp installed) for fair cross-plant comparison."
      >
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 flex flex-col justify-between gap-1 cursor-help">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Today&apos;s Harvest
            </span>
            <Zap size={13} className="text-amber-500 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-foreground leading-tight">
            {totalDailyKwh.toFixed(1)}{' '}
            <span className="text-xs font-medium text-muted-foreground">kWh</span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            Spec:{' '}
            <span className="text-foreground font-semibold">
              {specificYield !== null ? `${specificYield.toFixed(2)} kWh/kWp` : '--'}
            </span>
          </div>
        </div>
      </HoverInfo>

      {/* 3. Facility Load */}
      <HoverInfo
        title="Facility Load Demand"
        content="Combined active electrical power drawn across metered facilities in the current view scope."
      >
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 flex flex-col justify-between gap-1 cursor-help">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Facility Load
            </span>
            <Activity size={13} className="text-indigo-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-indigo-400 leading-tight">
            {totalLoadKw.toFixed(1)}{' '}
            <span className="text-xs font-medium text-muted-foreground">kW</span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            Active consumption
          </div>
        </div>
      </HoverInfo>

      {/* 4. Net Grid Exchange */}
      <HoverInfo
        title="Net Utility Grid Exchange"
        content="Net power flow across utility interties. Positive values indicate net solar export; negative values indicate grid import."
      >
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 flex flex-col justify-between gap-1 cursor-help">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Grid Net
            </span>
            <ArrowUpDown
              size={13}
              className={
                isExporting
                  ? 'text-emerald-500 shrink-0'
                  : isImporting
                  ? 'text-rose-400 shrink-0'
                  : 'text-muted-foreground shrink-0'
              }
              aria-hidden="true"
            />
          </div>
          <div
            className={`text-base sm:text-lg font-bold font-mono tabular-nums leading-tight ${
              isExporting
                ? 'text-emerald-500'
                : isImporting
                ? 'text-rose-400'
                : 'text-foreground'
            }`}
          >
            {netGridKw >= 0 ? `+${netGridKw.toFixed(1)}` : netGridKw.toFixed(1)}{' '}
            <span className="text-xs font-medium text-muted-foreground">kW</span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {isExporting ? 'Net exporting' : isImporting ? 'Net importing' : 'Balanced'}
          </div>
        </div>
      </HoverInfo>

      {/* 5. Battery SoC */}
      <HoverInfo
        title="Fleet BESS State of Charge"
        content="Average battery State of Charge across hybrid stations with physical BESS hardware."
      >
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 flex flex-col justify-between gap-1 cursor-help">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground truncate">
              BESS Avg SoC
            </span>
            <BatteryCharging size={13} className="text-cyan-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-cyan-400 leading-tight">
            {avgBatterySoc > 0 ? `${avgBatterySoc.toFixed(0)}%` : '--'}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {totalBatteryKw !== 0
              ? `${totalBatteryKw > 0 ? '+' : ''}${totalBatteryKw.toFixed(1)} kW flow`
              : avgBatterySoc > 0
              ? 'Standby'
              : 'Grid-tied / No BESS'}
          </div>
        </div>
      </HoverInfo>

      {/* 6. Asset Health Rollup */}
      <HoverInfo
        title="Fleet Asset Health"
        content="Inverter availability count across the filtered scope. Highlights active faults or offline telemetry links."
      >
        <div
          className={`rounded-xl border px-3 py-2.5 flex flex-col justify-between gap-1 cursor-help ${
            faultCount > 0
              ? 'border-destructive/50 bg-destructive/5'
              : offlineCount > 0
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-border/70 bg-card'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Asset Health
            </span>
            {hasIssues ? (
              <ShieldAlert
                size={13}
                className={faultCount > 0 ? 'text-destructive shrink-0' : 'text-amber-500 shrink-0'}
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck size={13} className="text-emerald-500 shrink-0" aria-hidden="true" />
            )}
          </div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-foreground leading-tight">
            {onlineInverters}
            <span className="text-xs font-medium text-muted-foreground">
              /{totalInverters} online
            </span>
          </div>
          <div className="text-[10px] font-mono truncate">
            {faultCount > 0 ? (
              <span className="text-destructive font-semibold">
                {faultCount} Fault{offlineCount > 0 ? ` · ${offlineCount} Offline` : ''}
              </span>
            ) : offlineCount > 0 ? (
              <span className="text-amber-500 font-semibold">{offlineCount} Offline</span>
            ) : standbyCount > 0 ? (
              <span className="text-muted-foreground">{standbyCount} Standby</span>
            ) : (
              <span className="text-emerald-500 font-medium">All operational</span>
            )}
          </div>
        </div>
      </HoverInfo>
    </div>
  );
}

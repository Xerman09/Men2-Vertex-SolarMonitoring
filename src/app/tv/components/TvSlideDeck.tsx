'use client';

import React from 'react';
import {
  Sun,
  Zap,
  Activity,
  TrendingUp,
  BatteryCharging,
  ShieldCheck,
  AlertTriangle,
  WifiOff,
  Building2,
  Layers,
  Leaf,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HoverInfo } from '@/components/ui/tooltip';
import { PlantSolarCurve } from '@/app/fleet/components/PlantSolarCurve';
import {
  KG_CO2_PER_TREE_ANNUAL,
  PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH,
} from '@/lib/tariff-rates';
import type { DailyAnalyticsPoint } from '@/lib/analytics-data';
import type { TvSlide } from '../types';

interface TvSlideDeckProps {
  slide: TvSlide;
  slideIndex: number;
  totalSlides: number;
  tariffRatePhp: number;
  tariffLabel: string;
  weeklySeries: DailyAnalyticsPoint[] | null;
}

function formatPhp(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-US')}`;
}

function formatSignedGridKw(val: number): string {
  if (!Number.isFinite(val)) return '0.0';
  if (val > 0) return `+${val.toFixed(1)}`;
  return val.toFixed(1);
}

function TvKpiTile({
  label,
  value,
  unit,
  accentClass = 'text-foreground',
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  accentClass?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/85 p-4 flex flex-col justify-between gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon size={16} className={`${accentClass} shrink-0`} aria-hidden="true" />
      </div>
      <div className="flex items-baseline gap-1.5 font-mono tabular-nums min-w-0">
        <span className={`text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight truncate ${accentClass}`}>
          {value}
        </span>
        {unit && (
          <span className="text-xs sm:text-sm font-semibold text-muted-foreground shrink-0">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function TvSlideDeck({
  slide,
  slideIndex,
  totalSlides,
  tariffRatePhp,
  tariffLabel,
  weeklySeries,
}: TvSlideDeckProps) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${slideIndex + 1} of ${totalSlides}`}
      className="mx-auto flex h-full w-full max-w-[1920px] flex-col gap-5 px-6 pt-6 pb-20"
    >
      {slide.kind === 'overview' && (
        <>
          <header className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Sun size={26} aria-hidden="true" />
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
                <HoverInfo
                  title={slide.title}
                  side="bottom"
                  align="start"
                  content={
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                      <dt className="text-muted-foreground">Accounts</dt>
                      <dd className="text-right font-semibold">{slide.accounts.length}</dd>
                      <dt className="text-muted-foreground">Stations</dt>
                      <dd className="text-right font-semibold">{slide.plants.length}</dd>
                      <dt className="text-muted-foreground">Installed</dt>
                      <dd className="text-right font-semibold">
                        {slide.capacityKw > 0 ? `${slide.capacityKw.toFixed(0)} kWp` : '--'}
                      </dd>
                      <dt className="text-muted-foreground">Tariff</dt>
                      <dd className="text-right font-semibold">
                        {tariffLabel} (₱{tariffRatePhp.toFixed(2)}/kWh)
                      </dd>
                    </dl>
                  }
                >
                  <span>{slide.title}</span>
                </HoverInfo>
              </h1>
              {slide.faultCount > 0 && (
                <Badge variant="destructive" className="font-mono text-xs">
                  {slide.faultCount} Fault
                </Badge>
              )}
              {slide.offlineCount > 0 && (
                <Badge variant="warning" className="font-mono text-xs">
                  {slide.offlineCount} Offline
                </Badge>
              )}
            </div>

            <div className="font-mono text-sm sm:text-base font-bold text-foreground tabular-nums shrink-0">
              {slide.onlineInverters}/{slide.totalInverters} Online
            </div>
          </header>

          {/* Primary 10-foot KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <TvKpiTile
              label="Live Solar"
              value={slide.liveSolarKw.toFixed(1)}
              unit="kW"
              accentClass="text-amber-500"
              icon={Sun}
            />
            <TvKpiTile
              label="Today Harvest"
              value={slide.dailyYieldKwh.toFixed(1)}
              unit="kWh"
              accentClass="text-emerald-400"
              icon={Zap}
            />
            <TvKpiTile
              label="Facility Load"
              value={slide.demandKw.toFixed(1)}
              unit="kW"
              accentClass="text-indigo-400"
              icon={Activity}
            />
            <TvKpiTile
              label="Grid Net"
              value={formatSignedGridKw(slide.gridNetKw)}
              unit="kW"
              accentClass={slide.gridNetKw >= 0 ? 'text-emerald-500' : 'text-rose-400'}
              icon={TrendingUp}
            />
            <TvKpiTile
              label="BESS SoC"
              value={slide.avgBatterySoc !== null ? `${slide.avgBatterySoc}%` : '--'}
              accentClass="text-cyan-400"
              icon={BatteryCharging}
            />
            <TvKpiTile
              label="Est. Savings"
              value={formatPhp(slide.dailyYieldKwh * tariffRatePhp)}
              accentClass="text-primary"
              icon={ShieldCheck}
            />
          </div>

          {/* Main Live Diurnal Curve */}
          <div className="rounded-2xl border border-border/70 bg-card/85 p-5 flex-1 min-h-[290px] flex flex-col">
            <PlantSolarCurve
              capacityKw={slide.capacityKw}
              livePowerKw={slide.liveSolarKw}
              dailyYieldKwh={slide.dailyYieldKwh}
              demandKw={slide.demandKw}
              gridPowerKw={slide.gridNetKw}
              scope={slide.scope}
              height={265}
              className="w-full flex-1"
              showLabels={true}
            />
          </div>

          {/* Account Tiles */}
          {slide.accounts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {slide.accounts.slice(0, 4).map((acc) => (
                <div
                  key={acc.account.id}
                  className="rounded-xl border border-border/70 bg-card/75 px-4 py-3 flex items-center justify-between gap-3 font-mono tabular-nums"
                >
                  <div className="min-w-0">
                    <div className="font-sans text-sm font-bold text-foreground truncate">
                      {acc.account.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {acc.plants.length} Stations
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-amber-500">
                      {acc.livePowerKw.toFixed(1)} kW
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {acc.dailyYieldKwh.toFixed(0)} kWh
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {slide.kind === 'account' && (
        <>
          <header className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Building2 size={26} aria-hidden="true" />
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
                <HoverInfo
                  title={slide.account.account.name}
                  side="bottom"
                  align="start"
                  content={
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                      <dt className="text-muted-foreground">Stations</dt>
                      <dd className="text-right font-semibold">{slide.account.plants.length}</dd>
                      <dt className="text-muted-foreground">Inverters</dt>
                      <dd className="text-right font-semibold">{slide.account.invertersCount}</dd>
                      <dt className="text-muted-foreground">Installed</dt>
                      <dd className="text-right font-semibold">
                        {slide.account.capacityKw > 0
                          ? `${slide.account.capacityKw.toFixed(0)} kWp`
                          : '--'}
                      </dd>
                    </dl>
                  }
                >
                  <span>{slide.account.account.name}</span>
                </HoverInfo>
              </h1>
              {slide.account.faultCount > 0 && (
                <Badge variant="destructive" className="font-mono text-xs">
                  {slide.account.faultCount} Fault
                </Badge>
              )}
              {slide.account.offlineCount > 0 && (
                <Badge variant="warning" className="font-mono text-xs">
                  {slide.account.offlineCount} Offline
                </Badge>
              )}
            </div>

            <div className="font-mono text-sm sm:text-base font-bold text-foreground tabular-nums shrink-0">
              {slide.account.capacityKw > 0 ? `${slide.account.capacityKw.toFixed(0)} kWp` : '--'}
            </div>
          </header>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <TvKpiTile
              label="Live Solar"
              value={slide.account.livePowerKw.toFixed(1)}
              unit="kW"
              accentClass="text-amber-500"
              icon={Sun}
            />
            <TvKpiTile
              label="Today Harvest"
              value={slide.account.dailyYieldKwh.toFixed(1)}
              unit="kWh"
              accentClass="text-emerald-400"
              icon={Zap}
            />
            <TvKpiTile
              label="Facility Load"
              value={(slide.account.demandKw ?? 0).toFixed(1)}
              unit="kW"
              accentClass="text-indigo-400"
              icon={Activity}
            />
            <TvKpiTile
              label="Grid Net"
              value={formatSignedGridKw(slide.account.gridPowerKw ?? 0)}
              unit="kW"
              accentClass={(slide.account.gridPowerKw ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-400'}
              icon={TrendingUp}
            />
            <TvKpiTile
              label="Est. Savings"
              value={formatPhp(slide.account.dailyYieldKwh * tariffRatePhp)}
              accentClass="text-primary"
              icon={ShieldCheck}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0">
            <div className="xl:col-span-7 rounded-2xl border border-border/70 bg-card/85 p-5 flex flex-col min-h-[270px]">
              <PlantSolarCurve
                capacityKw={slide.account.capacityKw}
                livePowerKw={slide.account.livePowerKw}
                dailyYieldKwh={slide.account.dailyYieldKwh}
                demandKw={slide.account.demandKw}
                gridPowerKw={slide.account.gridPowerKw}
                utilizationPct={slide.account.utilizationPct}
                scope={slide.scope}
                height={260}
                className="w-full flex-1"
                showLabels={true}
              />
            </div>

            <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5 content-start">
              {slide.account.plants.slice(0, 6).map((plant) => (
                <div
                  key={plant.plantKey}
                  className="rounded-xl border border-border/70 bg-card/75 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Layers size={15} className="text-primary shrink-0" aria-hidden="true" />
                    <span className="font-semibold text-sm text-foreground truncate">
                      {plant.plant.stationName}
                    </span>
                    {plant.status === 'FAULT' && (
                      <Badge variant="destructive" className="text-[10px] font-mono shrink-0">
                        Fault
                      </Badge>
                    )}
                    {plant.status === 'OFFLINE' && (
                      <Badge variant="warning" className="text-[10px] font-mono shrink-0">
                        Offline
                      </Badge>
                    )}
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-base font-bold text-amber-500">
                      {plant.livePowerKw.toFixed(1)} kW
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {plant.dailyYieldKwh.toFixed(0)} kWh
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {slide.kind === 'triage' && (
        <>
          <header className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
                <AlertTriangle size={26} aria-hidden="true" />
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
                {slide.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {slide.totalFaults > 0 && (
                <Badge variant="destructive" className="font-mono text-xs px-2.5 py-1">
                  {slide.totalFaults} Fault
                </Badge>
              )}
              {slide.totalOffline > 0 && (
                <Badge variant="warning" className="font-mono text-xs px-2.5 py-1">
                  {slide.totalOffline} Offline
                </Badge>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start flex-1">
            {slide.entries.slice(0, 9).map((entry) => (
              <div
                key={`${entry.accountId}:${entry.stationId}`}
                className={`rounded-2xl border bg-card/85 p-5 flex flex-col gap-3 ${
                  entry.status === 'FAULT' ? 'border-rose-500/50' : 'border-amber-500/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-foreground truncate">
                      {entry.stationName}
                    </h2>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {entry.accountName}
                    </div>
                  </div>
                  <Badge
                    variant={entry.status === 'FAULT' ? 'destructive' : 'warning'}
                    className="font-mono text-xs shrink-0"
                  >
                    {entry.status === 'FAULT' ? 'Fault' : 'Offline'}
                  </Badge>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  {entry.faultInverters.map((inv) => (
                    <div
                      key={inv.deviceSn}
                      className="flex items-center justify-between rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5"
                    >
                      <span className="font-semibold text-foreground">{inv.deviceSn}</span>
                      <span className="text-rose-400 font-bold">FAULT</span>
                    </div>
                  ))}
                  {entry.offlineInverters.map((inv) => (
                    <div
                      key={inv.deviceSn}
                      className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5"
                    >
                      <span className="font-semibold text-foreground">{inv.deviceSn}</span>
                      <span className="text-amber-400 font-bold">OFFLINE</span>
                    </div>
                  ))}
                  {entry.hasOfflineLogger && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border/60 px-3 py-1.5 text-muted-foreground">
                      <WifiOff size={13} className="text-rose-400 shrink-0" aria-hidden="true" />
                      <span>Data logger offline</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {slide.kind === 'financial' && (
        <>
          <header className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                <Leaf size={26} aria-hidden="true" />
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
                <HoverInfo
                  title={slide.title}
                  side="bottom"
                  align="start"
                  content={
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                      <dt className="text-muted-foreground">Utility</dt>
                      <dd className="text-right font-semibold">{tariffLabel}</dd>
                      <dt className="text-muted-foreground">Rate</dt>
                      <dd className="text-right font-semibold">₱{tariffRatePhp.toFixed(2)}/kWh</dd>
                      <dt className="text-muted-foreground">Grid Factor</dt>
                      <dd className="text-right font-semibold">
                        {PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH} kg CO₂/kWh
                      </dd>
                    </dl>
                  }
                >
                  <span>{slide.title}</span>
                </HoverInfo>
              </h1>
            </div>

            <div className="font-mono text-sm sm:text-base font-bold text-foreground tabular-nums shrink-0">
              ₱{tariffRatePhp.toFixed(2)} / kWh
            </div>
          </header>

          {(() => {
            const weekYieldKwh = weeklySeries
              ? weeklySeries.reduce((s, d) => s + (d.solarYieldKwh || 0), 0)
              : slide.dailyYieldKwh;
            const co2AvoidedKg =
              weekYieldKwh * PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH;
            const treesEq = Math.round(co2AvoidedKg / KG_CO2_PER_TREE_ANNUAL);
            const maxDayKwh = weeklySeries
              ? Math.max(1, ...weeklySeries.map((d) => d.solarYieldKwh || 0))
              : 1;

            return (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <TvKpiTile
                    label="Today Yield Value"
                    value={formatPhp(slide.dailyYieldKwh * tariffRatePhp)}
                    accentClass="text-emerald-400"
                    icon={ShieldCheck}
                  />
                  <TvKpiTile
                    label="7D Harvest"
                    value={weeklySeries ? weekYieldKwh.toFixed(0) : '--'}
                    unit={weeklySeries ? 'kWh' : undefined}
                    accentClass="text-amber-500"
                    icon={Zap}
                  />
                  <TvKpiTile
                    label="7D Avoided Cost"
                    value={weeklySeries ? formatPhp(weekYieldKwh * tariffRatePhp) : '--'}
                    accentClass="text-primary"
                    icon={TrendingUp}
                  />
                  <TvKpiTile
                    label="CO₂ Offset"
                    value={`${co2AvoidedKg.toFixed(0)}`}
                    unit={`kg (${treesEq} trees)`}
                    accentClass="text-emerald-400"
                    icon={Leaf}
                  />
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/85 p-5 flex-1 flex flex-col justify-between gap-4 min-h-[260px]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground">Daily Solar Harvest</h2>
                    <span className="font-mono text-xs text-muted-foreground">
                      {tariffLabel}
                    </span>
                  </div>

                  {!weeklySeries || weeklySeries.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center font-mono text-sm text-muted-foreground">
                      No weekly DeyeCloud telemetry recorded for this scope
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-3 items-end flex-1 pt-4">
                      {weeklySeries.slice(-7).map((day) => {
                        const kwh = day.solarYieldKwh || 0;
                        const pct = Math.max(4, Math.min(100, (kwh / maxDayKwh) * 100));
                        return (
                          <div
                            key={day.date}
                            className="h-full flex flex-col items-center justify-end gap-2 font-mono tabular-nums"
                          >
                            <div className="text-xs font-bold text-foreground">
                              {kwh.toFixed(0)} kWh
                            </div>
                            <div className="text-[11px] text-emerald-400 font-semibold">
                              {formatPhp(kwh * tariffRatePhp)}
                            </div>
                            <div className="w-full max-w-[64px] flex-1 min-h-[90px] bg-muted/40 rounded-t-xl border border-border/40 flex items-end overflow-hidden">
                              <div
                                className="w-full bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400 rounded-t-lg"
                                style={{ height: `${pct}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {day.date.slice(5)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import {
  Sun,
  AlertTriangle,
  WifiOff,
  Building2,
  Layers,
  Leaf,
  Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HoverInfo } from '@/components/ui/tooltip';
import { PlantSolarCurve } from '@/app/fleet/components/PlantSolarCurve';
import {
  KG_CO2_PER_TREE_ANNUAL,
  PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH,
} from '@/lib/tariff-rates';
import type { DailyAnalyticsPoint } from '@/lib/analytics-data';
import { computeTvWeeklyProfitSummary, getTvScopeKey, type TvSlide } from '../types';

interface WeeklyScopeCacheEntry {
  series: DailyAnalyticsPoint[] | null;
  ts: number;
}

interface TvSlideDeckProps {
  slide: TvSlide;
  slideIndex: number;
  totalSlides: number;
  direction?: 'forward' | 'backward';
  tariffRatePhp: number;
  exportCreditPhp?: number;
  tariffLabel: string;
  weeklySeries: DailyAnalyticsPoint[] | null;
  weeklyLoading?: boolean;
  weeklySeriesByScope?: Record<string, WeeklyScopeCacheEntry>;
  weeklyLoadingKeys?: Record<string, boolean>;
}

function formatPhp(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-US')}`;
}

function formatSignedGridKw(val: number): string {
  if (!Number.isFinite(val)) return '0.0';
  if (val > 0) return `+${val.toFixed(1)}`;
  return val.toFixed(1);
}

function getSlideEyebrow(slide: TvSlide): string {
  switch (slide.kind) {
    case 'overview':
      return 'FLEET EXECUTIVE SUMMARY';
    case 'curve':
      return 'FLEET DIURNAL TELEMETRY';
    case 'account':
      return 'ACCOUNT TOTAL · ALL STATIONS';
    case 'account-stations':
      return 'STATION BENCHMARK';
    case 'station':
      return `STATION · ${slide.accountName}`;
    case 'financial':
      return '7-DAY HARVEST & FINANCIAL YIELD';
    case 'triage':
      return 'ASSET HEALTH TRIAGE';
  }
}

function SlideMetricRow({
  label,
  value,
  unit,
  accentClass = 'text-foreground',
  staggerIndex = 0,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  accentClass?: string;
  staggerIndex?: number;
}) {
  return (
    <div
      style={{ '--tv-stagger': staggerIndex } as React.CSSProperties}
      className="tv-kpi-stagger flex items-baseline justify-between gap-4 py-3"
    >
      <span className="font-mono text-xs sm:text-sm uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className={`font-mono text-2xl sm:text-3xl font-bold tabular-nums ${accentClass}`}>
        {value}
        {unit && (
          <span className="ml-1 text-xs sm:text-sm font-semibold text-muted-foreground">{unit}</span>
        )}
      </span>
    </div>
  );
}

function HeaderIcon({ slide }: { slide: TvSlide }) {
  switch (slide.kind) {
    case 'curve':
      return <Activity size={22} className="text-amber-500" aria-hidden="true" />;
    case 'account':
      return <Building2 size={22} className="text-primary" aria-hidden="true" />;
    case 'account-stations':
    case 'station':
      return <Layers size={22} className="text-primary" aria-hidden="true" />;
    case 'financial':
      return <Leaf size={22} className="text-emerald-400" aria-hidden="true" />;
    case 'triage':
      return <AlertTriangle size={22} className="text-rose-400" aria-hidden="true" />;
    default:
      return <Sun size={22} className="text-amber-500" aria-hidden="true" />;
  }
}

function WeeklySolarDemandBars({
  days,
  hasDemand,
  tariffRatePhp,
  exportCreditPhp,
  compact = false,
}: {
  days: DailyAnalyticsPoint[];
  hasDemand: boolean;
  tariffRatePhp: number;
  exportCreditPhp: number;
  compact?: boolean;
}) {
  const maxScaleKwh = Math.max(
    1,
    ...days.map((d) => Math.max(d.solarYieldKwh || 0, d.loadDemandKwh || 0))
  );

  return (
    <div className={`relative flex-1 flex flex-col justify-end ${compact ? 'pt-2' : 'pt-6'}`}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 flex flex-col justify-between ${
          compact ? 'top-6 bottom-7' : 'top-12 bottom-10'
        }`}
      >
        <div className="border-t border-dashed border-border/35" />
        <div className="border-t border-dashed border-border/35" />
        <div className="border-t border-border/50" />
      </div>

      <div className={`relative z-10 grid grid-cols-7 items-end h-full ${compact ? 'gap-1.5' : 'gap-2.5 sm:gap-4'}`}>
        {days.map((day, idx) => {
          const solarKwh = Math.max(0, day.solarYieldKwh || 0);
          const demandKwh = Math.max(0, day.loadDemandKwh || 0);
          const expKwh = Math.max(0, day.gridExportKwh || 0);
          const selfKwh =
            day.selfConsumptionKwh > 0
              ? Math.min(solarKwh, day.selfConsumptionKwh)
              : Math.max(0, solarKwh - expKwh);
          const daySavedPhp = hasDemand
            ? selfKwh * tariffRatePhp + expKwh * exportCreditPhp
            : solarKwh * tariffRatePhp;
          const dayOffsetPct =
            demandKwh > 0
              ? Math.min(100, Math.round((selfKwh / demandKwh) * 100))
              : null;
          const solarPct = Math.max(4, Math.min(100, (solarKwh / maxScaleKwh) * 100));
          const demandPct =
            demandKwh > 0
              ? Math.max(4, Math.min(100, (demandKwh / maxScaleKwh) * 100))
              : 2;

          return (
            <div
              key={day.date}
              style={{ '--tv-stagger': idx } as React.CSSProperties}
              className="tv-kpi-stagger h-full flex flex-col items-center justify-end gap-0.5 font-mono tabular-nums"
            >
              {!compact && (
                <div className="text-sm sm:text-base font-bold text-emerald-400">
                  {formatPhp(daySavedPhp)}
                </div>
              )}
              <div className={compact ? 'text-[10px] font-semibold text-muted-foreground' : 'text-xs sm:text-sm font-semibold text-muted-foreground'}>
                {dayOffsetPct !== null
                  ? `${dayOffsetPct}%`
                  : `${solarKwh.toFixed(0)}`}
                {!compact && dayOffsetPct !== null ? ' offset' : !compact ? ' kWh' : ''}
              </div>
              <div className={`w-full flex-1 flex items-end justify-center ${compact ? 'max-w-[36px] min-h-[54px] gap-0.5' : 'max-w-[78px] min-h-[100px] gap-1.5'}`}>
                <div
                  className="w-1/2 rounded-t-md bg-gradient-to-t from-amber-600 via-amber-500 to-amber-300 shadow-[0_0_20px_-6px_rgba(245,158,11,0.45)]"
                  style={{ height: `${solarPct}%` }}
                />
                <div
                  className={`w-1/2 rounded-t-md ${
                    demandKwh > 0
                      ? 'bg-gradient-to-t from-indigo-700/80 via-indigo-500/80 to-indigo-400/85'
                      : 'bg-indigo-500/25'
                  }`}
                  style={{ height: `${demandPct}%` }}
                />
              </div>
              <div className={compact ? 'text-[10px] text-foreground font-semibold pt-0.5' : 'text-xs sm:text-sm text-foreground font-semibold pt-1'}>
                {day.date.slice(5)}
              </div>
              <div className={compact ? 'text-[10px] leading-none' : 'text-xs sm:text-sm leading-none'}>
                <span className="text-amber-400">{solarKwh.toFixed(0)}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-indigo-400">{demandKwh.toFixed(0)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TvSlideDeck({
  slide,
  slideIndex,
  totalSlides,
  direction = 'forward',
  tariffRatePhp,
  exportCreditPhp = 0,
  tariffLabel,
  weeklySeries,
  weeklyLoading = false,
  weeklySeriesByScope = {},
  weeklyLoadingKeys = {},
}: TvSlideDeckProps) {
  const chapterLabel = `${String(slideIndex + 1).padStart(2, '0')} / ${String(
    Math.max(1, totalSlides)
  ).padStart(2, '0')}`;
  const eyebrow = getSlideEyebrow(slide);

  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`${slideIndex + 1} of ${totalSlides}`}
      data-direction={direction}
      className="tv-slide-stage relative flex h-full w-full flex-col overflow-hidden"
    >
      {/* Top keynote accent rule */}
      <div
        aria-hidden="true"
        className="h-[3px] w-full shrink-0 bg-gradient-to-r from-amber-500 via-primary to-emerald-400"
      />

      {/* Consistent PowerPoint Master Header */}
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-border/50 px-[clamp(1.5rem,3.5vw,3.5rem)] pt-[clamp(1rem,2.4vh,2rem)] pb-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60">
            <HeaderIcon slide={slide} />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-amber-500/90 truncate">
              {chapterLabel} · {eyebrow}
            </div>
            <div className="flex items-center gap-2.5 min-w-0 mt-0.5">
              <h1 className="text-[clamp(1.45rem,1rem+1.55vw,2.65rem)] text-balance leading-tight font-bold tracking-tight text-foreground truncate">
                <HoverInfo
                  title={slide.title}
                  side="bottom"
                  align="start"
                  content={
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                      <dt className="text-muted-foreground">Slide</dt>
                      <dd className="text-right font-semibold">{chapterLabel}</dd>
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

              {((slide.kind === 'overview' || slide.kind === 'curve') &&
                slide.faultCount > 0) && (
                <Badge variant="destructive" className="font-mono text-xs shrink-0">
                  {slide.faultCount} Fault
                </Badge>
              )}
              {((slide.kind === 'overview' || slide.kind === 'curve') &&
                slide.offlineCount > 0) && (
                <Badge variant="warning" className="font-mono text-xs shrink-0">
                  {slide.offlineCount} Offline
                </Badge>
              )}
              {(slide.kind === 'account' || slide.kind === 'account-stations') &&
                slide.account.faultCount > 0 && (
                  <Badge variant="destructive" className="font-mono text-xs shrink-0">
                    {slide.account.faultCount} Fault
                  </Badge>
                )}
              {slide.kind === 'station' && slide.plant.status === 'FAULT' && (
                <Badge variant="destructive" className="font-mono text-xs shrink-0">
                  Fault
                </Badge>
              )}
              {slide.kind === 'station' && slide.plant.status === 'OFFLINE' && (
                <Badge variant="warning" className="font-mono text-xs shrink-0">
                  Offline
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
          <span className="font-mono text-xs sm:text-sm font-semibold uppercase tracking-[0.26em] text-muted-foreground">
            VOSOLAR
          </span>
          <span className="mt-1 font-mono text-sm sm:text-base font-bold text-foreground tabular-nums">
            {slide.kind === 'overview' || slide.kind === 'curve'
              ? `${slide.onlineInverters}/${slide.totalInverters} Online · ${slide.capacityKw.toFixed(0)} kWp`
              : slide.kind === 'account' || slide.kind === 'account-stations'
                ? `All ${slide.account.plants.length} ${slide.account.plants.length === 1 ? 'Station' : 'Stations'} · ${slide.account.capacityKw.toFixed(0)} kWp`
                : slide.kind === 'station'
                  ? `${slide.plant.inverters.length} Inverters · ${slide.plant.capacityKw.toFixed(0)} kWp`
                  : slide.kind === 'financial'
                    ? `${slide.scopeLabel} · ₱${tariffRatePhp.toFixed(2)}/kWh`
                    : `${slide.totalFaults} Fault · ${slide.totalOffline} Offline`}
          </span>
        </div>
      </header>

      {/* Main Slide Body Stage (non-scrolling executive 16:9 canvas) */}
      <div className="flex flex-1 min-h-0 flex-col px-[clamp(1.5rem,3.5vw,3.5rem)] py-[clamp(1rem,2.4vh,2rem)]">
        {/* 1. MASTER A: FLEET OVERVIEW (Left Hero Metric + Right Portfolio Table) */}
        {slide.kind === 'overview' && (
          <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-stretch">
            <div className="lg:col-span-4 xl:col-span-3 flex flex-col justify-between lg:border-r lg:border-border/50 lg:pr-6 min-h-0">
              <div className="tv-kpi-stagger" style={{ '--tv-stagger': 0 } as React.CSSProperties}>
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Live Solar Generation
                </div>
                <div className="mt-2 flex items-baseline gap-2.5 font-mono tabular-nums">
                  <span className="text-[clamp(2.75rem,1.9rem+3.2vw,5rem)] font-bold leading-none tracking-tight text-amber-500">
                    {slide.liveSolarKw.toFixed(1)}
                  </span>
                  <span className="text-xl font-semibold text-muted-foreground">kW</span>
                </div>
                {slide.capacityKw > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
                      <span>Fleet Utilization</span>
                      <span className="font-semibold text-foreground">
                        {Math.min(100, Math.round((slide.liveSolarKw / slide.capacityKw) * 100))}% of{' '}
                        {slide.capacityKw.toFixed(0)} kWp
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(2, (slide.liveSolarKw / slide.capacityKw) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/50 pt-5 mt-6">
                <div className="tv-kpi-stagger" style={{ '--tv-stagger': 1 } as React.CSSProperties}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Today Harvest
                  </div>
                  <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-emerald-400 tabular-nums">
                    {slide.dailyYieldKwh.toFixed(1)}
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">kWh</span>
                  </div>
                </div>
                <div className="tv-kpi-stagger" style={{ '--tv-stagger': 2 } as React.CSSProperties}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Est. Savings
                  </div>
                  <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-primary tabular-nums">
                    {formatPhp(slide.dailyYieldKwh * tariffRatePhp)}
                  </div>
                </div>
                <div className="tv-kpi-stagger border-t border-border/40 pt-3" style={{ '--tv-stagger': 3 } as React.CSSProperties}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Facility Load
                  </div>
                  <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-indigo-400 tabular-nums">
                    {slide.demandKw.toFixed(1)}
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">kW</span>
                  </div>
                </div>
                <div className="tv-kpi-stagger border-t border-border/40 pt-3" style={{ '--tv-stagger': 4 } as React.CSSProperties}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Grid Net {slide.avgBatterySoc !== null ? `· BESS ${slide.avgBatterySoc}%` : ''}
                  </div>
                  <div
                    className={`mt-1 font-mono text-xl sm:text-2xl font-bold tabular-nums ${
                      slide.gridNetKw >= 0 ? 'text-emerald-500' : 'text-rose-400'
                    }`}
                  >
                    {formatSignedGridKw(slide.gridNetKw)}
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">kW</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 xl:col-span-9 flex flex-col justify-between min-h-0">
              <div className="grid grid-cols-12 gap-3 border-b border-border/50 pb-2 font-mono text-xs sm:text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <div className="col-span-5">Account</div>
                <div className="col-span-3">Share</div>
                <div className="col-span-2 text-right">Live</div>
                <div className="col-span-2 text-right">Today</div>
              </div>

              <div className="flex-1 divide-y divide-border/40 overflow-y-auto">
                {(() => {
                  const maxLive = Math.max(1, ...slide.accounts.map((a) => a.livePowerKw));
                  const dense = slide.accounts.length > 6;
                  return slide.accounts.map((acc, idx) => {
                    const sharePct = Math.max(3, Math.min(100, (acc.livePowerKw / maxLive) * 100));
                    return (
                      <div
                        key={acc.account.id}
                        style={{ '--tv-stagger': idx } as React.CSSProperties}
                        className={`tv-kpi-stagger grid grid-cols-12 items-center gap-3 font-mono tabular-nums ${
                          dense ? 'py-2' : 'py-3'
                        }`}
                      >
                        <div className="col-span-5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-sans text-base font-bold text-foreground truncate">
                              {acc.account.name}
                            </span>
                            {acc.faultCount > 0 && (
                              <Badge variant="destructive" className="text-[10px] shrink-0">
                                {acc.faultCount} Fault
                              </Badge>
                            )}
                            {acc.offlineCount > 0 && (
                              <Badge variant="warning" className="text-[10px] shrink-0">
                                {acc.offlineCount} Offline
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            {acc.plants.length}{' '}
                            {acc.plants.length === 1 ? 'Station' : 'Stations'} ·{' '}
                            {acc.capacityKw > 0 ? `${acc.capacityKw.toFixed(0)} kWp` : '--'}
                          </div>
                        </div>

                        <div className="col-span-3 pr-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                              style={{ width: `${sharePct}%` }}
                            />
                          </div>
                        </div>

                        <div className="col-span-2 text-right text-lg sm:text-xl font-bold text-amber-500">
                          {acc.livePowerKw.toFixed(1)} <span className="text-xs sm:text-sm text-muted-foreground">kW</span>
                        </div>

                        <div className="col-span-2 text-right">
                          <div className="text-base sm:text-lg font-bold text-emerald-400">
                            {acc.dailyYieldKwh.toFixed(0)} <span className="text-xs sm:text-sm text-muted-foreground">kWh</span>
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            {formatPhp(acc.dailyYieldKwh * tariffRatePhp)}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* 2. MASTER B: SPLIT KEYNOTE CHART SLIDE (Fleet Curve, Account Curve, Station Curve) */}
        {(slide.kind === 'curve' || slide.kind === 'account' || slide.kind === 'station') && (() => {
          const liveKw =
            slide.kind === 'curve'
              ? slide.liveSolarKw
              : slide.kind === 'account'
                ? slide.account.livePowerKw
                : slide.plant.livePowerKw;
          const capKw =
            slide.kind === 'curve'
              ? slide.capacityKw
              : slide.kind === 'account'
                ? slide.account.capacityKw
                : slide.plant.capacityKw;
          const yieldKwh =
            slide.kind === 'curve'
              ? slide.dailyYieldKwh
              : slide.kind === 'account'
                ? slide.account.dailyYieldKwh
                : slide.plant.dailyYieldKwh;
          const demandKw =
            slide.kind === 'curve'
              ? slide.demandKw
              : slide.kind === 'account'
                ? slide.account.demandKw ?? 0
                : slide.plant.demandKw ?? 0;
          const gridKw =
            slide.kind === 'curve'
              ? slide.gridNetKw
              : slide.kind === 'account'
                ? slide.account.gridPowerKw ?? 0
                : slide.plant.gridPowerKw ?? 0;
          const bessSoc =
            slide.kind === 'curve'
              ? slide.avgBatterySoc
              : slide.kind === 'account'
                ? typeof slide.account.batterySoc === 'number' && slide.account.batterySoc > 0
                  ? Math.round(slide.account.batterySoc)
                  : null
                : typeof slide.plant.batterySoc === 'number' && slide.plant.batterySoc > 0
                  ? Math.round(slide.plant.batterySoc)
                  : null;
          const utilPct =
            capKw > 0 ? Math.min(100, Math.round((liveKw / capKw) * 100)) : 0;

          return (
            <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-4 xl:col-span-3 flex flex-col justify-between lg:border-r lg:border-border/50 lg:pr-6 min-h-0">
                <div>
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Live Solar
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
                    <span className="text-[clamp(2.25rem,1.45rem+2.4vw,3.8rem)] font-bold leading-none tracking-tight text-amber-500">
                      {liveKw.toFixed(1)}
                    </span>
                    <span className="text-base font-semibold text-muted-foreground">kW</span>
                  </div>
                  {capKw > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
                        <span>Utilization</span>
                        <span className="font-semibold text-foreground">{utilPct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                          style={{ width: `${Math.max(2, utilPct)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-border/45 border-t border-border/50 mt-4">
                  <SlideMetricRow
                    staggerIndex={1}
                    label="Today Harvest"
                    value={yieldKwh.toFixed(1)}
                    unit="kWh"
                    accentClass="text-emerald-400"
                  />
                  <SlideMetricRow
                    staggerIndex={2}
                    label="Est. Savings"
                    value={formatPhp(yieldKwh * tariffRatePhp)}
                    accentClass="text-primary"
                  />
                  <SlideMetricRow
                    staggerIndex={3}
                    label="Facility Load"
                    value={demandKw.toFixed(1)}
                    unit="kW"
                    accentClass="text-indigo-400"
                  />
                  <SlideMetricRow
                    staggerIndex={4}
                    label="Grid Net"
                    value={formatSignedGridKw(gridKw)}
                    unit="kW"
                    accentClass={gridKw >= 0 ? 'text-emerald-500' : 'text-rose-400'}
                  />
                  {bessSoc !== null && (
                    <SlideMetricRow
                      staggerIndex={5}
                      label="BESS SoC"
                      value={`${bessSoc}%`}
                      accentClass="text-cyan-400"
                    />
                  )}
                </div>
              </div>

              <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-[260px]">
                {slide.kind === 'account' && slide.account.plants.length > 0 ? (
                  <div
                    className={`grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 ${
                      slide.account.plants.length > 4 ? 'xl:grid-cols-3' : ''
                    } gap-3 auto-rows-fr`}
                  >
                    {slide.account.plants.map((plant) => {
                      const stationId = String(plant.plant.stationId);
                      return (
                        <div
                          key={stationId}
                          className="flex flex-col min-h-0 rounded-xl border border-border/50 bg-card/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/40 mb-1.5 shrink-0">
                            <span className="truncate font-sans text-sm sm:text-base font-bold text-foreground">
                              {plant.plant.stationName}
                            </span>
                            <span className="font-mono text-xs sm:text-sm font-semibold text-amber-500 tabular-nums shrink-0">
                              {plant.livePowerKw.toFixed(1)} / {plant.capacityKw.toFixed(0)} kWp
                            </span>
                          </div>
                          <PlantSolarCurve
                            capacityKw={plant.capacityKw}
                            livePowerKw={plant.livePowerKw}
                            dailyYieldKwh={plant.dailyYieldKwh}
                            demandKw={plant.demandKw}
                            gridPowerKw={plant.gridPowerKw}
                            utilizationPct={plant.utilizationPct}
                            scope={{ accountId: slide.account.account.id, stationId }}
                            height="100%"
                            className="w-full h-full flex-1 min-h-0"
                            showLabels={true}
                            variant="compact"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <PlantSolarCurve
                    capacityKw={capKw}
                    livePowerKw={liveKw}
                    dailyYieldKwh={yieldKwh}
                    demandKw={demandKw}
                    gridPowerKw={gridKw}
                    utilizationPct={
                      slide.kind === 'account'
                        ? slide.account.utilizationPct
                        : slide.kind === 'station'
                          ? slide.plant.utilizationPct
                          : undefined
                    }
                    scope={slide.scope}
                    height="100%"
                    className="w-full h-full flex-1 min-h-0"
                    showLabels={true}
                    variant="tv"
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* 3. MASTER C: ACCOUNT STATIONS BENCHMARK MATRIX */}
        {slide.kind === 'account-stations' && (
          <div className="flex flex-1 min-h-0 flex-col justify-between">
            <div className="grid grid-cols-12 gap-4 border-b border-border/50 pb-2.5 font-mono text-xs sm:text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div className="col-span-4">Station</div>
              <div className="col-span-3">Solar vs Demand</div>
              <div className="col-span-2 text-right">Live Solar</div>
              <div className="col-span-2 text-right">Today Yield</div>
              <div className="col-span-1 text-right">SoC / Util</div>
            </div>

            <div className="flex-1 divide-y divide-border/40 overflow-y-auto">
              {(() => {
                const maxKw = Math.max(
                  1,
                  ...slide.account.plants.map((p) => Math.max(p.livePowerKw, p.demandKw ?? 0))
                );
                const dense = slide.account.plants.length > 6;
                return slide.account.plants.map((plant, idx) => {
                  const demandKw = plant.demandKw ?? 0;
                  const solarBarPct = Math.max(2, Math.min(100, (plant.livePowerKw / maxKw) * 100));
                  const demandBarPct =
                    demandKw > 0 ? Math.max(2, Math.min(100, (demandKw / maxKw) * 100)) : 0;
                  const offsetPct =
                    demandKw > 0 ? Math.min(100, Math.round((plant.livePowerKw / demandKw) * 100)) : null;
                  const hasSoc = typeof plant.batterySoc === 'number' && plant.batterySoc > 0;
                  return (
                    <div
                      key={plant.plantKey}
                      style={{ '--tv-stagger': idx } as React.CSSProperties}
                      className={`tv-kpi-stagger grid grid-cols-12 items-center gap-4 font-mono tabular-nums ${
                        dense ? 'py-2' : 'py-3'
                      }`}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-base sm:text-lg font-bold text-foreground truncate">
                            {plant.plant.stationName}
                          </span>
                          {plant.status === 'FAULT' && (
                            <Badge variant="destructive" className="text-[10px] shrink-0">
                              Fault
                            </Badge>
                          )}
                          {plant.status === 'OFFLINE' && (
                            <Badge variant="warning" className="text-[10px] shrink-0">
                              Offline
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {plant.capacityKw > 0 ? `${plant.capacityKw.toFixed(0)} kWp` : '--'} ·{' '}
                          {plant.inverters.length}{' '}
                          {plant.inverters.length === 1 ? 'Inverter' : 'Inverters'}
                        </div>
                      </div>

                      <div className="col-span-3 pr-3 space-y-1">
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span>
                            <span className="font-semibold text-amber-400">
                              {plant.livePowerKw.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="font-semibold text-indigo-400">
                              {demandKw.toFixed(1)} kW
                            </span>
                          </span>
                          {offsetPct !== null && (
                            <span className="font-semibold text-emerald-400">{offsetPct}%</span>
                          )}
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                            style={{ width: `${solarBarPct}%` }}
                          />
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400"
                            style={{ width: `${demandBarPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="col-span-2 text-right text-lg font-bold text-amber-500">
                        {plant.livePowerKw.toFixed(1)}{' '}
                        <span className="text-xs text-muted-foreground">kW</span>
                      </div>

                      <div className="col-span-2 text-right">
                        <div className="text-base font-bold text-emerald-400">
                          {plant.dailyYieldKwh.toFixed(0)}{' '}
                          <span className="text-xs text-muted-foreground">kWh</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatPhp(plant.dailyYieldKwh * tariffRatePhp)}
                        </div>
                      </div>

                      <div className="col-span-1 text-right text-base font-bold text-cyan-400">
                        {hasSoc
                          ? `${Math.round(plant.batterySoc!)}%`
                          : `${Math.round(plant.utilizationPct)}%`}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* 4. MASTER D: 7D FINANCIAL & SOLAR VS DEMAND IMPACT SLIDE */}
        {slide.kind === 'financial' && (() => {
          const profit = computeTvWeeklyProfitSummary(weeklySeries, tariffRatePhp, exportCreditPhp);
          const co2AvoidedKg = profit
            ? profit.weekSolarKwh * PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH
            : slide.dailyYieldKwh * PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH;
          const treesEq = Math.round(co2AvoidedKg / KG_CO2_PER_TREE_ANNUAL);
          const days = weeklySeries ? weeklySeries.slice(-7) : [];
          const hasDemand = Boolean(profit?.hasDemandData);
          const maxScaleKwh =
            days.length > 0
              ? Math.max(
                  1,
                  ...days.map((d) => Math.max(d.solarYieldKwh || 0, d.loadDemandKwh || 0))
                )
              : 1;

          return (
            <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-stretch">
              <div className="lg:col-span-4 xl:col-span-3 flex flex-col justify-between lg:border-r lg:border-border/50 lg:pr-6 min-h-0">
                <div className="tv-kpi-stagger" style={{ '--tv-stagger': 0 } as React.CSSProperties}>
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {hasDemand ? '7-Day Realized Bill Savings' : '7-Day Avoided Cost'}
                  </div>
                  <div className="mt-2 font-mono text-[clamp(2.25rem,1.45rem+2.5vw,3.9rem)] font-bold leading-none tracking-tight text-emerald-400 tabular-nums">
                    {profit ? formatPhp(profit.realizedProfitPhp) : '--'}
                  </div>
                  {hasDemand && profit && profit.demandOffsetPct !== null && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
                        <span>Demand Covered by Solar</span>
                        <span className="font-semibold text-emerald-400">
                          {profit.demandOffsetPct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                          style={{ width: `${Math.max(2, profit.demandOffsetPct)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-border/45 border-t border-border/50 mt-5">
                  {hasDemand && profit && (
                    <SlideMetricRow
                      staggerIndex={1}
                      label="Baseline → Grid Bill"
                      value={`${formatPhp(profit.baselineBillPhp)} → ${formatPhp(profit.gridBillPhp)}`}
                      accentClass="text-foreground"
                    />
                  )}
                  <SlideMetricRow
                    staggerIndex={2}
                    label="Today Yield Value"
                    value={formatPhp(slide.dailyYieldKwh * tariffRatePhp)}
                    accentClass="text-primary"
                  />
                  <SlideMetricRow
                    staggerIndex={3}
                    label="7D Solar / Demand"
                    value={
                      profit ? (
                        <>
                          <span className="text-amber-500">{profit.weekSolarKwh.toFixed(0)}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-indigo-400">{profit.weekDemandKwh.toFixed(0)}</span>
                        </>
                      ) : (
                        '--'
                      )
                    }
                    unit={profit ? 'kWh' : undefined}
                    accentClass="text-foreground"
                  />
                  <SlideMetricRow
                    staggerIndex={4}
                    label="CO₂ Offset"
                    value={co2AvoidedKg.toFixed(0)}
                    unit={`kg · ${treesEq} trees`}
                    accentClass="text-emerald-400"
                  />
                </div>
              </div>

              <div className="lg:col-span-8 xl:col-span-9 flex flex-col justify-between min-h-[260px]">
                <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-2.5">
                  <h2 className="font-sans text-base sm:text-lg font-bold text-foreground">
                    {slide.account && slide.account.plants.length > 0
                      ? 'Stations 7D Solar vs. Facility Demand'
                      : 'Daily Solar vs. Facility Demand'}
                  </h2>
                  <div className="flex items-center gap-4 font-mono text-xs sm:text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                      Solar
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-400" aria-hidden="true" />
                      Demand
                    </span>
                    <span>{tariffLabel}</span>
                  </div>
                </div>

                {slide.account && slide.account.plants.length > 0 ? (
                  <div
                    className={`grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 ${
                      slide.account.plants.length > 4 ? 'xl:grid-cols-3' : ''
                    } gap-3 pt-3 auto-rows-fr`}
                  >
                    {slide.account.plants.map((plant) => {
                      const stationId = String(plant.plant.stationId);
                      const scopeKey = getTvScopeKey({
                        accountId: slide.account!.account.id,
                        stationId,
                      });
                      const plantDays = (weeklySeriesByScope[scopeKey]?.series ?? []).slice(-7);
                      const plantLoading = Boolean(weeklyLoadingKeys[scopeKey]);
                      const plantProfit = computeTvWeeklyProfitSummary(
                        plantDays,
                        tariffRatePhp,
                        exportCreditPhp
                      );
                      const plantHasDemand = Boolean(plantProfit && plantProfit.weekDemandKwh > 0);

                      return (
                        <div
                          key={stationId}
                          className="flex flex-col min-h-0 rounded-xl border border-border/50 bg-card/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/40 shrink-0">
                            <span className="truncate font-sans text-sm sm:text-base font-bold text-foreground">
                              {plant.plant.stationName}
                            </span>
                            <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums shrink-0">
                              {plantProfit ? formatPhp(plantProfit.realizedProfitPhp) : '--'}
                              {plantProfit?.demandOffsetPct !== null && plantProfit?.demandOffsetPct !== undefined
                                ? ` · ${plantProfit.demandOffsetPct}%`
                                : ''}
                            </span>
                          </div>
                          {plantLoading && plantDays.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center font-mono text-xs text-muted-foreground">
                              Loading 7D…
                            </div>
                          ) : plantDays.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center font-mono text-xs text-muted-foreground">
                              No 7D telemetry
                            </div>
                          ) : (
                            <WeeklySolarDemandBars
                              days={plantDays}
                              hasDemand={plantHasDemand}
                              tariffRatePhp={tariffRatePhp}
                              exportCreditPhp={exportCreditPhp}
                              compact
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : weeklyLoading && days.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center font-mono text-sm text-muted-foreground">
                    Loading 7D DeyeCloud telemetry…
                  </div>
                ) : days.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center font-mono text-sm text-muted-foreground">
                    No weekly DeyeCloud telemetry recorded for this scope
                  </div>
                ) : (
                  <WeeklySolarDemandBars
                    days={days}
                    hasDemand={hasDemand}
                    tariffRatePhp={tariffRatePhp}
                    exportCreditPhp={exportCreditPhp}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* 5. MASTER E: ASSET HEALTH TRIAGE SLIDE */}
        {slide.kind === 'triage' && (
          <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start overflow-y-auto">
            {slide.entries.map((entry, idx) => (
              <div
                key={`${entry.accountId}:${entry.stationId}`}
                style={{ '--tv-stagger': idx } as React.CSSProperties}
                className={`tv-kpi-stagger rounded-xl border border-border/60 bg-background/50 p-5 flex flex-col gap-3 border-l-4 ${
                  entry.status === 'FAULT' ? 'border-l-rose-500' : 'border-l-amber-500'
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
                  {entry.faultInverters.length > 0 && (
                    <Badge variant="destructive" className="font-mono text-xs shrink-0">
                      Fault
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 font-mono text-xs border-t border-border/40 pt-2.5">
                  {entry.faultInverters.map((inv) => (
                    <div
                      key={inv.deviceSn}
                      className="flex items-center justify-between text-foreground"
                    >
                      <span className="font-semibold">{inv.deviceSn}</span>
                      <span className="text-rose-400 font-bold">FAULT</span>
                    </div>
                  ))}
                  {entry.offlineInverters.map((inv) => (
                    <div
                      key={inv.deviceSn}
                      className="flex items-center justify-between text-foreground"
                    >
                      <span className="font-semibold">{inv.deviceSn}</span>
                      <span className="text-amber-400 font-bold">OFFLINE</span>
                    </div>
                  ))}
                  {entry.offlineLoggers.map((logger) => (
                    <div
                      key={logger.deviceSn}
                      className="flex items-center justify-between gap-2 text-foreground"
                    >
                      <span className="inline-flex items-center gap-1.5 font-semibold truncate">
                        <WifiOff size={13} className="text-amber-400 shrink-0" aria-hidden="true" />
                        <span>{logger.deviceSn}</span>
                      </span>
                      <span className="text-amber-400 font-bold shrink-0">LOGGER OFFLINE</span>
                    </div>
                  ))}
                  {entry.hasOfflineLogger && entry.offlineLoggers.length === 0 && (
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <WifiOff size={13} className="text-amber-400 shrink-0" aria-hidden="true" />
                        <span>Data logger</span>
                      </span>
                      <span className="text-amber-400 font-bold shrink-0">OFFLINE</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

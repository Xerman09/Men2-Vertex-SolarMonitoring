'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Leaf,
  Battery,
  Calendar,
  Zap,
  ArrowUpRight,
  Sparkles,
  Waves,
  RefreshCw,
  Clock,
  Download,
  Cpu,
  Globe,
  Building2,
  Sun,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { HourlyEnergyPoint } from '@/lib/types';
import {
  type DailyAnalyticsPoint,
  type MonthlyAnalyticsPoint,
} from '@/lib/analytics-data';
import {
  shiftDays,
  formatHumanDate,
} from '@/components/analytics/AnalyticsDatePicker';
import { getManilaToday } from '@/lib/manila-time';
import { useAccount } from '@/lib/account-context';
import { useTariff } from '@/lib/tariff-context';
import {
  PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH,
  PHILIPPINES_GRID_EMISSION_FACTOR_TONS_PER_KWH,
  KG_CO2_PER_TREE_ANNUAL,
} from '@/lib/tariff-rates';
import { useRole } from '@/lib/role-context';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { telemetryCache, getHistoryCacheKey } from '@/lib/telemetry-cache';
import { createLogger } from '@/lib/logger';

const log = createLogger('YieldArbitrage');

function formatPeso(val: number): string {
  return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function YieldArbitragePage() {
  const { isAdmin } = useRole();
  const { activeTariff, setIsConfigModalOpen } = useTariff();
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    selectedStationId,
    selectedPlant,
    selectedInverterSn,
    isFleetView,
    totalAccounts,
  } = useAccount();

  const [timeRange, setTimeRange] = useState<'DAY' | 'WEEK' | 'MONTH' | 'YEAR'>('DAY');
  const [selectedDate, setSelectedDate] = useState<string>(() => getManilaToday());
  const [hourlyData, setHourlyData] = useState<HourlyEnergyPoint[]>([]);
  const [historyIsLive, setHistoryIsLive] = useState<boolean>(false);
  const [liveDailySummary, setLiveDailySummary] = useState<DailyAnalyticsPoint | null>(null);
  const [liveDailySeries, setLiveDailySeries] = useState<DailyAnalyticsPoint[] | null>(null);
  const [liveMonthlySeries, setLiveMonthlySeries] = useState<MonthlyAnalyticsPoint[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isMounted, setIsMounted] = useState(false);

  const todayIso = React.useMemo(() => getManilaToday(), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Resolve isolated inverter metadata if selected
  const selectedInverter = React.useMemo(() => {
    if (!selectedInverterSn || selectedInverterSn === 'ALL') return null;
    for (const acc of accounts) {
      for (const plant of acc.plants || []) {
        const inv = plant.devices?.find(
          (d) => String(d.deviceSn).trim() === String(selectedInverterSn).trim()
        );
        if (inv) {
          return {
            deviceSn: inv.deviceSn,
            model: inv.model || 'SUN-Hybrid-Inverter',
            ratedKw: inv.ratedKw || 10,
          };
        }
      }
    }
    return null;
  }, [selectedInverterSn, accounts]);

  // Selected Target Title matching the top panel fleet dropdown selection
  const selectedScopeTitle = React.useMemo(() => {
    if (selectedInverter) {
      return `Inverter ${selectedInverter.model || selectedInverter.deviceSn} (${selectedInverter.deviceSn})`;
    }
    if (selectedPlant) {
      return selectedPlant.stationName;
    }
    if (selectedAccount) {
      return selectedAccount.plants && selectedAccount.plants.length > 1
        ? `${selectedAccount.name} (${selectedAccount.plants.length} Plants)`
        : selectedAccount.name;
    }
    if (isFleetView) {
      return `Global Fleet Aggregate (${totalAccounts} Accounts)`;
    }
    return 'Commercial Solar Array';
  }, [selectedInverter, selectedPlant, selectedAccount, isFleetView, totalAccounts]);

  const targetCapacityKw = React.useMemo(() => {
    if (selectedInverter) return selectedInverter.ratedKw || 0;
    if (selectedPlant) {
      if (selectedPlant.installedCapacityKw && selectedPlant.installedCapacityKw > 0) {
        return selectedPlant.installedCapacityKw;
      }
      return selectedPlant.devices
        ?.filter((d) => d.deviceType === 'INVERTER')
        .reduce((sum, inv) => sum + (inv.ratedKw || 0), 0) || 0;
    }
    if (selectedAccount) {
      const plantSum = selectedAccount.plants?.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0) || 0;
      if (plantSum > 0) return plantSum;
      return selectedAccount.capacityKw > 0 ? selectedAccount.capacityKw : 0;
    }
    if (isFleetView) {
      let cap = 0;
      accounts.forEach((acc) => {
        const plantSum = acc.plants?.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0) || 0;
        cap += plantSum > 0 ? plantSum : (acc.capacityKw || 0);
      });
      return cap;
    }
    return 0;
  }, [selectedInverter, selectedPlant, selectedAccount, isFleetView, accounts]);

  const scaleRatio = React.useMemo(() => {
    return 1.0;
  }, []);

  const cacheKey = getHistoryCacheKey({
    accountId: isFleetView ? 'FLEET' : selectedAccountId,
    stationId: selectedStationId,
    deviceSn: selectedInverterSn,
    preset: timeRange,
    date: selectedDate,
  });

  // Apply instant cached telemetry on switch (0ms SWR)
  useEffect(() => {
    const cached = telemetryCache.get<{
      data: HourlyEnergyPoint[];
      isLive?: boolean;
      dailySummary?: DailyAnalyticsPoint | null;
      dailySeries?: DailyAnalyticsPoint[] | null;
      monthlySeries?: MonthlyAnalyticsPoint[] | null;
    }>(cacheKey);
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      setHourlyData(cached.data);
      setHistoryIsLive(Boolean(cached.isLive));
      setLiveDailySummary(cached.dailySummary ?? null);
      setLiveDailySeries(cached.dailySeries ?? null);
      setLiveMonthlySeries(cached.monthlySeries ?? null);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function loadHistory() {
      try {
        const apiRange =
          timeRange === 'YEAR'
            ? 'YEAR'
            : timeRange === 'MONTH'
            ? 'MONTH'
            : timeRange === 'WEEK'
            ? 'WEEK'
            : 'TODAY';
        const stationParam =
          !isFleetView && selectedStationId && selectedStationId !== 'ALL'
            ? `&station_id=${encodeURIComponent(selectedStationId)}`
            : '';
        const snParam =
          !isFleetView && selectedInverterSn && selectedInverterSn !== 'ALL'
            ? `&device_sn=${encodeURIComponent(selectedInverterSn)}`
            : '';
        const accountParam =
          !isFleetView && selectedAccountId && selectedAccountId !== 'ALL'
            ? `&accountId=${encodeURIComponent(selectedAccountId)}`
            : '';

        const res = await fetch(
          `/api/deye/history?range=${apiRange}&step=5&date=${encodeURIComponent(selectedDate)}${accountParam}${stationParam}${snParam}`,
          { signal: controller.signal }
        );
        if (res.ok && active) {
          const json = await res.json();
          const isLive = Boolean(json.isLive);
          if (json.data && Array.isArray(json.data) && isLive) {
            telemetryCache.set(cacheKey, {
              data: json.data,
              isLive: true,
              dailySummary: json.dailySummary ?? null,
              dailySeries: Array.isArray(json.dailySeries) ? json.dailySeries : null,
              monthlySeries: Array.isArray(json.monthlySeries) ? json.monthlySeries : null,
            });
            setHourlyData(json.data);
            setHistoryIsLive(true);
            setLiveDailySummary(json.dailySummary ?? null);
            setLiveDailySeries(Array.isArray(json.dailySeries) ? json.dailySeries : null);
            setLiveMonthlySeries(Array.isArray(json.monthlySeries) ? json.monthlySeries : null);
          } else {
            setHourlyData([]);
            setHistoryIsLive(false);
            setLiveDailySummary(null);
            setLiveDailySeries(null);
            setLiveMonthlySeries(null);
          }
          setLoading(false);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          log.error('Failed to load history', err);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    loadHistory();
    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, selectedAccountId, selectedStationId, selectedInverterSn, isFleetView, timeRange, selectedDate]);

  const chartData = React.useMemo(() => {
    return (hourlyData.length > 0 ? hourlyData : []).map((pt) => {
      const rawSolar = (pt.solarYieldKw ?? 0) * scaleRatio;
      const rawLoad = (pt.loadDemandKw ?? 0) * scaleRatio;
      const bat = (pt.batteryFlowKw ?? 0) * scaleRatio;
      return {
        ...pt,
        solarYieldKw: parseFloat(rawSolar.toFixed(2)),
        loadDemandKw: parseFloat(rawLoad.toFixed(2)),
        batteryFlowKw: parseFloat(bat.toFixed(2)),
        hourDecimal: pt.hourDecimal ?? (parseInt((pt.hour || '00:00').split(':')[0], 10) || 0),
        gridExportKw: parseFloat(Math.max(0, rawSolar - rawLoad - Math.max(0, bat)).toFixed(2)),
      };
    });
  }, [hourlyData, scaleRatio]);

  const periodDailySeries = React.useMemo<DailyAnalyticsPoint[]>(() => {
    if (timeRange === 'WEEK') {
      if (liveDailySeries && liveDailySeries.length > 0) return liveDailySeries.slice(-7);
      return [];
    }
    if (timeRange === 'MONTH') {
      if (liveDailySeries && liveDailySeries.length > 0) return liveDailySeries;
      return [];
    }
    return [];
  }, [timeRange, liveDailySeries]);

  const periodMonthlySeries = React.useMemo<MonthlyAnalyticsPoint[]>(() => {
    if (timeRange === 'YEAR') {
      if (liveMonthlySeries && liveMonthlySeries.length > 0) return liveMonthlySeries;
      return [];
    }
    return [];
  }, [timeRange, liveMonthlySeries]);

  // Calculate real ledger metrics dynamically from available telemetry
  const totals = React.useMemo(() => {
    const blendedRate = activeTariff.peakRate * 0.35 + activeTariff.offPeakRate * 0.65;

    if (timeRange === 'WEEK' || timeRange === 'MONTH') {
      if (periodDailySeries.length === 0) {
        return { todayYieldKwh: 0, selfConsPct: 0, gridExportKwh: 0, todaySavedPhp: 0, monthlyProjectionPhp: 0, projectionMode: '--', co2Tons: 0 };
      }
      let yieldKwh = 0;
      let exportKwh = 0;
      let totalSavingsPhp = 0;
      for (const d of periodDailySeries) {
        const selfCons = Math.max(0, d.solarYieldKwh - d.gridExportKwh);
        yieldKwh += d.solarYieldKwh;
        exportKwh += d.gridExportKwh;
        totalSavingsPhp += selfCons * blendedRate + d.gridExportKwh * activeTariff.exportCredit;
      }
      const selfCons = yieldKwh > 0 ? Math.min(100, Math.max(0, ((yieldKwh - exportKwh) / yieldKwh) * 100)) : 0;
      const avgDailySaved = totalSavingsPhp / periodDailySeries.length;
      return {
        todayYieldKwh: yieldKwh,
        selfConsPct: selfCons,
        gridExportKwh: exportKwh,
        todaySavedPhp: totalSavingsPhp,
        monthlyProjectionPhp: avgDailySaved * 30,
        projectionMode: `${periodDailySeries.length}-Day Avg`,
        co2Tons: yieldKwh * PHILIPPINES_GRID_EMISSION_FACTOR_TONS_PER_KWH,
      };
    }

    if (timeRange === 'YEAR') {
      if (periodMonthlySeries.length === 0) {
        return { todayYieldKwh: 0, selfConsPct: 0, gridExportKwh: 0, todaySavedPhp: 0, monthlyProjectionPhp: 0, projectionMode: '--', co2Tons: 0 };
      }
      let yieldKwh = 0;
      let exportKwh = 0;
      let totalSavingsPhp = 0;
      for (const m of periodMonthlySeries) {
        const yKwh = m.solarYieldMwh * 1000;
        const eKwh = m.gridExportMwh * 1000;
        const selfCons = Math.max(0, yKwh - eKwh);
        yieldKwh += yKwh;
        exportKwh += eKwh;
        totalSavingsPhp += selfCons * blendedRate + eKwh * activeTariff.exportCredit;
      }
      const selfCons = yieldKwh > 0 ? Math.min(100, Math.max(0, ((yieldKwh - exportKwh) / yieldKwh) * 100)) : 0;
      return {
        todayYieldKwh: yieldKwh,
        selfConsPct: selfCons,
        gridExportKwh: exportKwh,
        todaySavedPhp: totalSavingsPhp,
        monthlyProjectionPhp: totalSavingsPhp / Math.max(1, periodMonthlySeries.length),
        projectionMode: 'Monthly Avg',
        co2Tons: yieldKwh * PHILIPPINES_GRID_EMISSION_FACTOR_TONS_PER_KWH,
      };
    }

    if (chartData.length === 0) {
      return {
        todayYieldKwh: 0,
        selfConsPct: 0,
        gridExportKwh: 0,
        todaySavedPhp: 0,
        monthlyProjectionPhp: 0,
        projectionMode: '--',
        co2Tons: 0,
      };
    }
    let yieldKwh = 0;
    let loadKwh = 0;
    let exportKwh = 0;
    let totalSavingsPhp = 0;

    for (const pt of chartData) {
      if (pt.isElapsed === false && pt.solarYieldKw === null) continue;
      const solar = pt.solarYieldKw ?? 0;
      const load = pt.loadDemandKw ?? 0;
      const bat = pt.batteryFlowKw ?? 0;

      const stepHours = 5 / 60;
      const solarStepKwh = solar * stepHours;
      const loadStepKwh = load * stepHours;

      // Solar consumed directly on-site to offset facility electrical load
      const directSelfConsKwh = Math.min(solarStepKwh, loadStepKwh);
      // Surplus solar exported to grid under net-metering
      const surplusExportKwh = Math.max(0, solarStepKwh - loadStepKwh - Math.max(0, bat * stepHours));
      // Battery discharge displacing grid load (if physical battery ESS installed)
      const batDischargedKwh = bat < 0 ? Math.abs(bat) * stepHours : 0;

      yieldKwh += solarStepKwh;
      loadKwh += loadStepKwh;
      exportKwh += surplusExportKwh;

      // Determine interval tariff rate based on time of day
      const hour = pt.hourDecimal !== undefined ? pt.hourDecimal : (parseInt((pt.hour || '00:00').split(':')[0], 10) || 0);
      const isPeakWindow = hour >= activeTariff.peakStartHour && hour <= activeTariff.peakEndHour;
      const currentTariffRate = isPeakWindow ? activeTariff.peakRate : activeTariff.offPeakRate;

      // Avoided grid electricity cost from self-consumption & battery discharge
      const avoidedGridCost = (directSelfConsKwh + batDischargedKwh) * currentTariffRate;
      // Net-metering export credit for surplus energy pushed to grid
      const exportCredit = surplusExportKwh * activeTariff.exportCredit;
      const intervalSavings = avoidedGridCost + exportCredit;

      totalSavingsPhp += intervalSavings;
    }

    // Align with official station daily cumulative if live DeyeCloud summary returned for single day
    if (liveDailySummary && liveDailySummary.solarYieldKwh > 0 && yieldKwh > 0) {
      const scale = liveDailySummary.solarYieldKwh / yieldKwh;
      yieldKwh = liveDailySummary.solarYieldKwh;
      exportKwh = liveDailySummary.gridExportKwh;
      totalSavingsPhp *= scale;
    }

    const selfCons = yieldKwh > 0 ? Math.min(100, Math.max(0, ((yieldKwh - exportKwh) / yieldKwh) * 100)) : 0;
    const monthlyProjection = totalSavingsPhp * 30;

    return {
      todayYieldKwh: yieldKwh,
      selfConsPct: selfCons,
      gridExportKwh: exportKwh,
      todaySavedPhp: totalSavingsPhp,
      monthlyProjectionPhp: monthlyProjection,
      projectionMode: '1-Day Extrap',
      co2Tons: yieldKwh * PHILIPPINES_GRID_EMISSION_FACTOR_TONS_PER_KWH,
    };
  }, [timeRange, periodDailySeries, periodMonthlySeries, chartData, activeTariff, liveDailySummary]);

  const historyRows = React.useMemo(() => {
    const cap = targetCapacityKw > 0 ? targetCapacityKw : 0;
    const blendedRate = activeTariff.peakRate * 0.35 + activeTariff.offPeakRate * 0.65;

    if (timeRange === 'WEEK' || timeRange === 'MONTH') {
      return [...periodDailySeries].reverse().map((d) => {
        const selfCons = Math.max(0, d.solarYieldKwh - d.gridExportKwh);
        const saved = selfCons * blendedRate + d.gridExportKwh * activeTariff.exportCredit;
        const pct = d.solarYieldKwh > 0 ? Math.min(100, (selfCons / d.solarYieldKwh) * 100) : 0;
        const specYield = cap > 0 ? (d.solarYieldKwh / cap).toFixed(2) : '0.00';
        return {
          date: `${d.date} (${d.dayLabel})`,
          yieldKwh: d.solarYieldKwh,
          selfConsPct: pct,
          gridExportKwh: d.gridExportKwh,
          todaySavedPhp: saved,
          specificYield: d.solarYieldKwh > 0 && cap > 0 ? `${specYield} kWh/kWp` : '--',
        };
      });
    }

    if (timeRange === 'YEAR') {
      return [...periodMonthlySeries].reverse().map((m) => {
        const yKwh = m.solarYieldMwh * 1000;
        const eKwh = m.gridExportMwh * 1000;
        const selfCons = Math.max(0, yKwh - eKwh);
        const saved = selfCons * blendedRate + eKwh * activeTariff.exportCredit;
        const specYield = cap > 0 ? (yKwh / cap).toFixed(1) : '0.0';
        return {
          date: m.month,
          yieldKwh: yKwh,
          selfConsPct: m.selfConsumptionPct,
          gridExportKwh: eKwh,
          todaySavedPhp: saved,
          specificYield: yKwh > 0 && cap > 0 ? `${specYield} kWh/kWp` : '--',
        };
      });
    }

    if (chartData.length === 0 || totals.todayYieldKwh === 0) return [];
    const todaySpecYield = cap > 0 ? (totals.todayYieldKwh / cap).toFixed(2) : '0.00';
    return [
      {
        date: `${formatHumanDate(selectedDate)} · ${selectedScopeTitle}`,
        yieldKwh: totals.todayYieldKwh,
        selfConsPct: totals.selfConsPct,
        gridExportKwh: totals.gridExportKwh,
        todaySavedPhp: totals.todaySavedPhp,
        specificYield: totals.todayYieldKwh > 0 && cap > 0 ? `${todaySpecYield} kWh/kWp` : '--',
      },
    ];
  }, [timeRange, periodDailySeries, periodMonthlySeries, chartData, totals, selectedScopeTitle, targetCapacityKw, activeTariff, selectedDate]);

  // Exact label for the monitored Solar PV series
  const monitoredSolarLabel = React.useMemo(() => {
    if (selectedInverter) return `Solar PV (${selectedInverter.deviceSn}) · Monitored`;
    if (selectedPlant) return `Solar PV (${selectedPlant.stationName}) · Monitored`;
    if (selectedAccount) return `Solar PV (${selectedAccount.name}) · Monitored`;
    if (isFleetView) return 'Solar PV (Fleet Total) · Monitored';
    return 'Solar PV Harvest · Monitored';
  }, [selectedInverter, selectedPlant, selectedAccount, isFleetView]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12">
      {/* Top Header with VOS Design Standards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <HoverInfo
                  title="Yield Analytics & Time-of-Use Arbitrage"
                  content={TELEMETRY_DESCRIPTIONS.yieldArbitrage.subtitle}
                  showIcon
                >
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline cursor-help">
                    Yield Analytics & Time-of-Use Arbitrage
                  </h1>
                </HoverInfo>
              </div>
            </div>
          </div>
        </div>

        {/* Time Range, Date Stepper & Tariff Selectors */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Tariff Schedule Quick Control Button */}
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-foreground transition-all cursor-pointer group text-xs"
            title="Configure utility tariff rate schedule"
          >
            <Zap size={14} className="text-amber-500 group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-muted-foreground font-mono">Tariff:</span>
              <span className="font-semibold text-amber-400">{activeTariff.schedule.shortName}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono pl-1 border-l border-border/50">
              ₱{activeTariff.offPeakRate.toFixed(2)}/kWh
            </span>
          </button>

          {/* Compact Date Navigation Stepper */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50">
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => shiftDays(prev, -1))}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors cursor-pointer"
              title="Previous day"
              aria-label="Previous day"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-xs font-mono font-semibold text-foreground select-none">
              {selectedDate === todayIso ? `Today · ${formatHumanDate(selectedDate, { month: 'short', day: 'numeric' })}` : formatHumanDate(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => (prev < todayIso ? shiftDays(prev, 1) : prev))}
              disabled={selectedDate >= todayIso}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next day"
              aria-label="Next day"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50">
            {(['DAY', 'WEEK', 'MONTH', 'YEAR'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  timeRange === range
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4 Primary Financial & Yield KPI Cards in VOS format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Peak Shaved & Solar Savings */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Today Arbitrage Savings"
            content={
              <div className="space-y-1.5 min-w-[220px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  Dynamic utility bill savings calculated from real-time solar self-consumption and peak tariff shaving (₱{activeTariff.peakRate.toFixed(2)}/kWh peak, ₱{activeTariff.offPeakRate.toFixed(2)}/kWh off-peak) + export credits (₱{activeTariff.exportCredit.toFixed(2)}/kWh).
                </p>
                <div className="pt-1.5 border-t border-border/50 text-emerald-400 font-mono font-medium">
                  {totals.todaySavedPhp > 0
                    ? `Displaced commercial grid power (${formatPeso(totals.todaySavedPhp)})`
                    : 'Awaiting daylight solar harvest intervals'}
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                {timeRange === 'DAY'
                  ? selectedDate === todayIso
                    ? 'Today Arbitrage Savings'
                    : `Daily Savings (${formatHumanDate(selectedDate, { month: 'short', day: 'numeric' })})`
                  : timeRange === 'WEEK'
                  ? '7-Day Arbitrage Savings'
                  : timeRange === 'MONTH'
                  ? '30-Day Arbitrage Savings'
                  : '12-Month Arbitrage Savings'}
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="text-xs font-bold font-mono">₱</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black font-mono text-emerald-500">
                {loading ? <span className="text-muted-foreground/50">--</span> : formatPeso(totals.todaySavedPhp)}
              </span>
              <span className="text-xs font-mono font-medium text-muted-foreground">
                {!loading && totals.todayYieldKwh > 0 && targetCapacityKw > 0
                  ? `${(totals.todayYieldKwh / targetCapacityKw).toFixed(2)} kWh/kWp`
                  : '--'}
              </span>
            </div>
          </HoverInfo>
        </Card>

        {/* Monthly Projection */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title={timeRange === 'DAY' ? 'Single-Day Extrapolated Run-Rate' : 'Projected Monthly Savings'}
            content={
              <div className="space-y-1.5 min-w-[220px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {timeRange === 'DAY'
                    ? 'Single-day run-rate extrapolated over 30 days based on selected date’s harvest. Actual monthly accrual varies with daily insolation and weather.'
                    : timeRange === 'YEAR'
                    ? 'Average monthly utility bill savings calculated across recorded months in the selected annual cycle.'
                    : 'Estimated 30-day cumulative bill reduction projected from authentic multi-day average solar harvest.'}
                </p>
                <div className="pt-1.5 border-t border-border/50 text-primary font-mono font-medium">
                  {totals.monthlyProjectionPhp > 0
                    ? `Annualized run-rate: ${formatPeso(totals.monthlyProjectionPhp * 12)} / year`
                    : 'Requires active solar generation to project monthly ledger'}
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                {timeRange === 'DAY' ? 'Extrapolated Monthly Run-Rate' : 'Projected Monthly Savings'}
              </span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Sparkles size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black font-mono text-primary">
                {loading ? <span className="text-muted-foreground/50">--</span> : formatPeso(totals.monthlyProjectionPhp)}
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {!loading && totals.monthlyProjectionPhp > 0 ? totals.projectionMode : '--'}
              </span>
            </div>
          </HoverInfo>
        </Card>

        {/* Battery Roundtrip Efficiency / System Health */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-cyan-500/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="System Operation Mode"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  Active inverter grid-coupling status and battery energy storage system health.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-cyan-400 font-mono font-medium">
                  Grid-tied solar inverter synchronized without physical BESS storage
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                System Mode & Health
              </span>
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                <Battery size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-cyan-500">
                {loading ? <span className="text-muted-foreground/50">--</span> : totals.todayYieldKwh > 0 ? 'Nominal' : '--'}
              </span>
              <span className="text-xs font-mono font-bold text-cyan-500">
                {!loading && totals.todayYieldKwh > 0 ? 'Grid-Tied' : 'Standby'}
              </span>
            </div>
          </HoverInfo>
        </Card>

        {/* Carbon Offset */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Carbon Offset Index"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  Estimated CO₂ emissions avoided based on official Philippine DOE Luzon-Visayas grid factor ({PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH} kg CO₂/kWh).
                </p>
                <div className="pt-1.5 border-t border-border/50 text-emerald-400 font-mono font-medium">
                  {totals.co2Tons > 0
                    ? `Equivalent to ${Math.round((totals.co2Tons * 1000) / KG_CO2_PER_TREE_ANNUAL)} trees planted (EPA AVERT factor)`
                    : 'Calculated against local grid displacement emissions factor'}
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Carbon Offset Index
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Leaf size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-emerald-500">
                {loading ? <span className="text-muted-foreground/50">--</span> : totals.co2Tons > 0 ? totals.co2Tons.toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-muted-foreground font-normal">Tons CO₂e</span>
            </div>
          </HoverInfo>
        </Card>
      </div>

      {/* Diurnal Time-of-Use Arbitrage Curve */}
      <Card className="border-border/60 bg-card/80 shadow-sm relative">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-border/50 p-5">
          <div>
            <HoverInfo
              title={`${selectedScopeTitle} · Time-of-Use Arbitrage`}
              content={
                <div className="space-y-1.5 text-[11px]">
                  <p>{TELEMETRY_DESCRIPTIONS.yieldArbitrage.diurnalCurveLegend}</p>
                  <div className="pt-1 border-t border-border/50 text-amber-400 font-mono font-medium">
                    {selectedScopeTitle} · Real-time 5-minute sampling
                  </div>
                </div>
              }
              showIcon
            >
              <div className="space-y-1">
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 cursor-help flex-wrap">
                  {selectedInverter ? (
                    <Cpu className="w-5 h-5 text-cyan-400 shrink-0" />
                  ) : isFleetView ? (
                    <Globe className="w-5 h-5 text-primary shrink-0" />
                  ) : selectedPlant ? (
                    <Building2 className="w-5 h-5 text-amber-500 shrink-0" />
                  ) : (
                    <Sun className="w-5 h-5 text-amber-500 shrink-0" />
                  )}
                  <span>{selectedScopeTitle}</span>
                  {selectedPlant && selectedAccount && selectedAccount.plants && selectedAccount.plants.length > 1 && (
                    <span className="text-xs font-normal text-muted-foreground font-mono">
                      ({selectedAccount.name})
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {timeRange === 'YEAR'
                    ? '12-Month Seasonal Solar Yield vs Demand (MWh)'
                    : timeRange === 'MONTH'
                    ? `30-Day Arbitrage Envelope ending ${formatHumanDate(selectedDate)} (kWh)`
                    : timeRange === 'WEEK'
                    ? `7-Day Arbitrage Envelope ending ${formatHumanDate(selectedDate)} (kWh)`
                    : `${formatHumanDate(selectedDate)} · 5-Min Generation vs Load (kW)`}
                </CardDescription>
              </div>
            </HoverInfo>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-4 relative">
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/40 backdrop-blur-[2px] rounded-b-xl transition-all">
              <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-card/95 border border-border/80 shadow-md">
                <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-xs font-medium text-foreground">
                  Loading arbitrage telemetry for {formatHumanDate(selectedDate)}...
                </span>
              </div>
            </div>
          )}
          <div className={`h-[320px] w-full min-w-0 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
            {isMounted &&
            ((timeRange === 'DAY' && chartData.length > 0) ||
              ((timeRange === 'WEEK' || timeRange === 'MONTH') && periodDailySeries.length > 0) ||
              (timeRange === 'YEAR' && periodMonthlySeries.length > 0)) ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 320 }}>
                {timeRange === 'YEAR' ? (
                  <BarChart key="ya-year" data={periodMonthlySeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                    <XAxis dataKey="month" stroke="currentColor" className="text-[10px] opacity-60" />
                    <YAxis stroke="currentColor" className="text-[10px] opacity-60" unit=" MWh" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(23, 31, 51, 0.95)',
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [
                        `${typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : value} MWh`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="solarYieldMwh" name={monitoredSolarLabel} fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="loadDemandMwh" name="Facility Demand (MWh)" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="gridExportMwh" name="Grid Export (MWh)" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                ) : timeRange === 'WEEK' || timeRange === 'MONTH' ? (
                  <BarChart key={`ya-${timeRange}`} data={periodDailySeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                    <XAxis
                      dataKey="dayLabel"
                      stroke="currentColor"
                      className="text-[10px] opacity-60"
                      interval={timeRange === 'MONTH' ? 4 : 0}
                    />
                    <YAxis stroke="currentColor" className="text-[10px] opacity-60" unit=" kWh" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(23, 31, 51, 0.95)',
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [
                        `${typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : value} kWh`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="solarYieldKwh" name={monitoredSolarLabel} fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="loadDemandKwh" name="Facility Demand (kWh)" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="gridExportKwh" name="Grid Export (kWh)" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                ) : (
                  <AreaChart key="ya-day" data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                    <XAxis dataKey="hour" stroke="currentColor" className="text-[10px] opacity-60" />
                    <YAxis stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(23, 31, 51, 0.95)',
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [
                        `${typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : value} kW`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey="solarYieldKw"
                      name={monitoredSolarLabel}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#solarGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="loadDemandKw"
                      name="Facility Demand (kW)"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#loadGrad)"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="batteryFlowKw"
                      name="Battery ESS Arbitrage (kW)"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-mono text-xs">
                No live DeyeCloud telemetry for this selection.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Historical Yield & Arbitrage Table in VOS Data-Grid format */}
      <Card className="border-border/60 bg-card/80 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 p-5 border-b border-border/50">
          <CardTitle className="text-base font-bold text-foreground">
            Historical Generation & Arbitrage Log
          </CardTitle>
          <span className="text-xs font-mono text-muted-foreground">
            Synchronized to Database Financial Ledger
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-grid border-0 rounded-none shadow-none">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total PV Harvest</th>
                  <th>Self-Consumption</th>
                  <th>Grid Export</th>
                  <th>Avoided Cost (Savings)</th>
                  <th className="text-right">Specific Yield</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.length > 0 ? (
                  historyRows.map((row, i) => (
                    <tr key={i}>
                      <td className="font-semibold text-foreground">
                        {row.date}
                      </td>
                      <td className="td-num text-amber-500 font-bold text-left">
                        {(row.yieldKwh ?? 0).toFixed(1)} kWh
                      </td>
                      <td className="td-num text-foreground text-left">
                        {(row.selfConsPct ?? 0).toFixed(1)}%
                      </td>
                      <td className="td-num text-cyan-500 text-left">
                        {(row.gridExportKwh ?? 0).toFixed(1)} kWh
                      </td>
                      <td className="td-num text-emerald-500 font-bold text-left">
                        {formatPeso(row.todaySavedPhp)}
                      </td>
                      <td className="text-right">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-mono font-bold">
                          {row.specificYield}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground font-mono text-xs">
                      No historical generation records logged for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

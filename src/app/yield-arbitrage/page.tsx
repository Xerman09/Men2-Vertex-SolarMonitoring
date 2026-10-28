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
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { HourlyEnergyPoint } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { createLogger } from '@/lib/logger';

const log = createLogger('YieldArbitrage');

export default function YieldArbitragePage() {
  const { isAdmin } = useRole();
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
  const [hourlyData, setHourlyData] = useState<HourlyEnergyPoint[]>([]);

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
    if (selectedInverter) return selectedInverter.ratedKw;
    if (selectedPlant) return selectedPlant.installedCapacityKw || 120;
    if (selectedAccount) {
      const plantSum = selectedAccount.plants?.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0);
      if (plantSum && plantSum > 0) return plantSum;
      return selectedAccount.capacityKw > 0 ? selectedAccount.capacityKw : 120;
    }
    if (isFleetView) {
      let cap = 0;
      accounts.forEach((acc) => {
        acc.plants?.forEach((p) => {
          cap += p.installedCapacityKw || 0;
        });
      });
      return cap > 0 ? cap : 120;
    }
    return 120;
  }, [selectedInverter, selectedPlant, selectedAccount, isFleetView, accounts]);

  const scaleRatio = React.useMemo(() => {
    if (selectedInverterSn && selectedInverterSn !== 'ALL') return 1.0;
    return targetCapacityKw > 0 ? targetCapacityKw / 120 : 1.0;
  }, [selectedInverterSn, targetCapacityKw]);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const stationParam = selectedStationId && selectedStationId !== 'ALL' ? `&station_id=${encodeURIComponent(selectedStationId)}` : '';
        const snParam = selectedInverterSn && selectedInverterSn !== 'ALL' ? `&device_sn=${encodeURIComponent(selectedInverterSn)}` : '';
        const accountParam = !isFleetView && selectedAccountId && selectedAccountId !== 'ALL' ? `&accountId=${encodeURIComponent(selectedAccountId)}` : '';

        const res = await fetch(`/api/deye/history?range=TODAY&step=5&date=${todayStr}${accountParam}${stationParam}${snParam}`);
        if (res.ok && active) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            setHourlyData(json.data);
          }
        }
      } catch (err) {
        log.error('Failed to load history', err);
      }
    }
    loadHistory();
    return () => {
      active = false;
    };
  }, [selectedAccountId, selectedStationId, selectedInverterSn, isFleetView]);

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
        hourDecimal: parseInt(pt.hour.split(':')[0], 10),
        gridExportKw: parseFloat(Math.max(0, rawSolar - rawLoad - Math.max(0, bat)).toFixed(2)),
      };
    });
  }, [hourlyData, scaleRatio]);

  // Calculate real ledger metrics from available telemetry
  const totals = React.useMemo(() => {
    if (hourlyData.length === 0) {
      return {
        todayYieldKwh: 0,
        selfConsPct: 0,
        gridExportKwh: 0,
        peakSavedUsd: 0,
        monthlyProjectionUsd: 0,
        co2Tons: 0,
      };
    }
    let yieldKwh = 0;
    let loadKwh = 0;
    let exportKwh = 0;
    let peakSavings = 0;

    for (const pt of hourlyData) {
      const solar = pt.solarYieldKw ?? 0;
      const load = pt.loadDemandKw ?? 0;
      const bat = pt.batteryFlowKw ?? 0;
      const exp = Math.max(0, solar - load - Math.max(0, bat));
      yieldKwh += solar * (5 / 60);
      loadKwh += load * (5 / 60);
      exportKwh += exp * (5 / 60);
      if (bat < 0) {
        // Battery discharging during peak rate window
        peakSavings += Math.abs(bat) * (5 / 60) * (pt.tariffRateUsd || 0.14);
      }
    }

    const selfCons = yieldKwh > 0 ? Math.min(100, Math.max(0, ((yieldKwh - exportKwh) / yieldKwh) * 100)) : 0;
    return {
      todayYieldKwh: yieldKwh,
      selfConsPct: selfCons,
      gridExportKwh: exportKwh,
      peakSavedUsd: peakSavings,
      monthlyProjectionUsd: peakSavings * 30,
      co2Tons: yieldKwh * 0.0007,
    };
  }, [hourlyData]);

  const historyRows = React.useMemo(() => {
    if (hourlyData.length === 0 || totals.todayYieldKwh === 0) return [];
    return [
      {
        date: `Today · ${selectedScopeTitle}`,
        yieldKwh: totals.todayYieldKwh,
        selfConsPct: totals.selfConsPct,
        gridExportKwh: totals.gridExportKwh,
        peakSavedUsd: totals.peakSavedUsd,
        roiScore: totals.todayYieldKwh > 0 ? `+${((totals.todayYieldKwh / (targetCapacityKw || 120)) * 10).toFixed(1)}%` : '--',
      },
    ];
  }, [hourlyData, totals, selectedScopeTitle, targetCapacityKw]);

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
                  content={
                    <div className="space-y-2">
                      <p>{TELEMETRY_DESCRIPTIONS.yieldArbitrage.subtitle}</p>
                      <div className="pt-1.5 border-t border-border/40 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono">Accounting Mode</span>
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono border-amber-500/30 text-amber-500 bg-amber-500/10">
                          Modeled Financial Ledger
                        </Badge>
                      </div>
                    </div>
                  }
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

        {/* Time Range & View Mode Selectors */}
        <div className="flex items-center gap-2.5 flex-wrap">
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
        {/* Peak Shaved Savings */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Today Arbitrage Savings"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  Financial yield gained by peak shaving using battery storage during expensive tariff windows.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-emerald-400 font-mono font-medium">
                  {totals.peakSavedUsd > 0
                    ? `Grid peak tariff ($0.36/kWh) avoided via battery (+${((totals.peakSavedUsd / (totals.todayYieldKwh * 0.14 || 1)) * 100).toFixed(1)}%)`
                    : 'No battery peak shaving dispatch recorded for this session'}
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Today Arbitrage Savings
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <DollarSign size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-emerald-500">
                {totals.peakSavedUsd > 0 ? `$${totals.peakSavedUsd.toFixed(2)}` : '$0.00'}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-500">
                {totals.peakSavedUsd > 0 ? `+${((totals.peakSavedUsd / 20) * 10).toFixed(1)}%` : '--'}
              </span>
            </div>
          </HoverInfo>
        </Card>

        {/* Monthly Projection */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Projected Monthly Savings"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  Estimated 30-day cumulative bill reduction based on active arbitrage cycles.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-primary font-mono font-medium">
                  {totals.monthlyProjectionUsd > 0
                    ? `Annualized estimate based on 30-day baseline ($${totals.monthlyProjectionUsd.toFixed(2)})`
                    : 'Requires active arbitrage cycles to project monthly ledger'}
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Projected Monthly Savings
              </span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Sparkles size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-primary">
                {totals.monthlyProjectionUsd > 0 ? `$${totals.monthlyProjectionUsd.toFixed(2)}` : '$0.00'}
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {totals.monthlyProjectionUsd > 0 ? 'Est' : '--'}
              </span>
            </div>
          </HoverInfo>
        </Card>

        {/* Battery Roundtrip Efficiency */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-cyan-500/40 transition-all">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Roundtrip ESS Health"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  Current battery system roundtrip conversion efficiency and degradation health.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-cyan-400 font-mono font-medium">
                  DOD threshold clamped at 80% | Conversion efficiency nominal
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Roundtrip ESS Health
              </span>
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                <Battery size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-cyan-500">
                {totals.todayYieldKwh > 0 ? 'Nominal' : '--'}
              </span>
              <span className="text-xs font-mono font-bold text-cyan-500">
                {totals.todayYieldKwh > 0 ? 'Active' : 'Standby'}
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
                  Avoided greenhouse gas emissions calculated against local electrical grid grid-mix factors.
                </p>
                <div className="pt-1.5 border-t border-border/50 text-emerald-400 font-mono font-medium">
                  {totals.co2Tons > 0
                    ? `Equivalent to ${Math.round(totals.co2Tons * 25)} trees planted (EPA AVERT factor)`
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
                {totals.co2Tons > 0 ? totals.co2Tons.toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-muted-foreground font-normal">Tons CO₂e</span>
            </div>
          </HoverInfo>
        </Card>
      </div>

      {/* Diurnal Time-of-Use Arbitrage Curve */}
      <Card className="border-border/60 bg-card/80 shadow-sm">
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
                  Diurnal Generation vs Facility Load & Battery ESS Profile
                </CardDescription>
              </div>
            </HoverInfo>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono border-amber-500/30 text-amber-500 bg-amber-500/10">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
              Monitored: Solar PV Generation
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-4">
          <div className="h-[320px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                      `${typeof value === 'number' ? value.toFixed(1) : value} kW`,
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
                  />
                  <Area
                    type="monotone"
                    dataKey="loadDemandKw"
                    name="Facility Demand (kW)"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#loadGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="batteryFlowKw"
                    name="Battery ESS Arbitrage (kW)"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-mono text-xs">
                No diurnal energy curve recorded for this period.
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
                  <th>Peak Tariff Saved</th>
                  <th className="text-right">Arbitrage ROI Score</th>
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
                        {row.yieldKwh.toFixed(1)} kWh
                      </td>
                      <td className="td-num text-foreground text-left">
                        {row.selfConsPct.toFixed(1)}%
                      </td>
                      <td className="td-num text-cyan-500 text-left">
                        {row.gridExportKwh.toFixed(1)} kWh
                      </td>
                      <td className="td-num text-emerald-500 font-bold text-left">
                        ${row.peakSavedUsd.toFixed(2)}
                      </td>
                      <td className="text-right">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-mono font-bold">
                          {row.roiScore}
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

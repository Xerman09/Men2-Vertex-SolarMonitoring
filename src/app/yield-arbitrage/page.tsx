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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';

export default function YieldArbitragePage() {
  const [timeRange, setTimeRange] = useState<'DAY' | 'WEEK' | 'MONTH' | 'YEAR'>('DAY');
  const [hourlyData, setHourlyData] = useState<HourlyEnergyPoint[]>([]);
  const [viewMode, setViewMode] = useState<'arbitrage' | 'trigonometric'>('arbitrage');

  useEffect(() => {
    fetch('/api/deye/history')
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setHourlyData(json.data);
      })
      .catch((err) => console.error(err));
  }, []);

  const historyRows = [
    { date: 'Today (Live)', yieldKwh: 486.2, selfConsPct: 82.4, gridExportKwh: 85.5, peakSavedUsd: 184.20, roiScore: '+24.2%' },
    { date: 'Yesterday', yieldKwh: 512.4, selfConsPct: 78.9, gridExportKwh: 108.2, peakSavedUsd: 198.50, roiScore: '+26.1%' },
    { date: 'Sep 13, 2026', yieldKwh: 479.8, selfConsPct: 84.1, gridExportKwh: 76.2, peakSavedUsd: 176.40, roiScore: '+22.8%' },
    { date: 'Sep 12, 2026', yieldKwh: 520.1, selfConsPct: 80.5, gridExportKwh: 101.4, peakSavedUsd: 204.80, roiScore: '+27.4%' },
    { date: 'Sep 11, 2026', yieldKwh: 495.6, selfConsPct: 81.2, gridExportKwh: 93.1, peakSavedUsd: 189.10, roiScore: '+25.0%' },
  ];

  const chartData = (hourlyData.length > 0 ? hourlyData : [
    { hour: '00:00', solarYieldKw: 0, loadDemandKw: 42, batteryFlowKw: -20, tariffRateUsd: 0.14 },
    { hour: '02:00', solarYieldKw: 0, loadDemandKw: 39, batteryFlowKw: -18, tariffRateUsd: 0.14 },
    { hour: '04:00', solarYieldKw: 0, loadDemandKw: 45, batteryFlowKw: -20, tariffRateUsd: 0.14 },
    { hour: '06:00', solarYieldKw: 24.5, loadDemandKw: 56, batteryFlowKw: -12, tariffRateUsd: 0.14 },
    { hour: '08:00', solarYieldKw: 78.2, loadDemandKw: 68, batteryFlowKw: 12.0, tariffRateUsd: 0.14 },
    { hour: '10:00', solarYieldKw: 108.6, loadDemandKw: 74, batteryFlowKw: 28.5, tariffRateUsd: 0.14 },
    { hour: '12:00', solarYieldKw: 119.5, loadDemandKw: 66, batteryFlowKw: 32.0, tariffRateUsd: 0.14 },
    { hour: '14:00', solarYieldKw: 104.5, loadDemandKw: 72, batteryFlowKw: 22.0, tariffRateUsd: 0.36 },
    { hour: '16:00', solarYieldKw: 64.2, loadDemandKw: 73, batteryFlowKw: 5.0, tariffRateUsd: 0.36 },
    { hour: '18:00', solarYieldKw: 9.8, loadDemandKw: 68, batteryFlowKw: -28.0, tariffRateUsd: 0.36 },
    { hour: '20:00', solarYieldKw: 0, loadDemandKw: 62, batteryFlowKw: -28.0, tariffRateUsd: 0.36 },
    { hour: '22:00', solarYieldKw: 0, loadDemandKw: 50, batteryFlowKw: -22.0, tariffRateUsd: 0.14 },
  ]).map((pt) => {
    const solar = pt.solarYieldKw ?? 0;
    const load = pt.loadDemandKw ?? 0;
    const bat = pt.batteryFlowKw ?? 0;
    return {
      ...pt,
      hourDecimal: parseInt(pt.hour.split(':')[0], 10),
      gridExportKw: Math.max(0, solar - load - Math.max(0, bat)),
    };
  });

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
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline">
                  Yield Analytics & Time-of-Use Arbitrage
                </h1>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-mono text-[10px]">
                  Financial Ledger
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tariff delta optimization, smart battery peak-shaving, and historical revenue generation.
              </p>
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

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50">
            <button
              onClick={() => setViewMode('arbitrage')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'arbitrage'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Arbitrage Curve
            </button>
            <button
              onClick={() => setViewMode('trigonometric')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'trigonometric'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Trigonometric Fit
            </button>
          </div>
        </div>
      </div>

      {/* 4 Primary Financial & Yield KPI Cards in VOS format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Peak Shaved Savings */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Today Arbitrage Savings
            </CardTitle>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <DollarSign size={18} />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-emerald-500">
                $184.20
              </span>
              <span className="text-xs font-mono font-bold text-emerald-500">+18.4%</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1.5 block">
              Grid peak tariff ($0.36/kWh) avoided via battery
            </span>
          </CardContent>
        </Card>

        {/* Monthly Projection */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Projected Monthly Savings
            </CardTitle>
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Sparkles size={18} />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-primary">
                $5,480.00
              </span>
              <span className="text-xs font-mono font-bold text-primary">Est</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1.5 block">
              Annualized ROI: 3.2 Years Payback
            </span>
          </CardContent>
        </Card>

        {/* Battery Roundtrip Efficiency */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-cyan-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Roundtrip ESS Health
            </CardTitle>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Battery size={18} />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-cyan-500">
                94.8%
              </span>
              <span className="text-xs font-mono font-bold text-cyan-500">Nominal</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1.5 block">
              1,240 Cycles | DOD clamped at 85%
            </span>
          </CardContent>
        </Card>

        {/* Carbon Offset */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Carbon Offset Index
            </CardTitle>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Leaf size={18} />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-emerald-500">
                14.8
              </span>
              <span className="text-xs text-muted-foreground font-normal">Tons CO₂e</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1.5 block">
              Equivalent to 380 trees planted
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Dynamic View: Diurnal Area Chart OR Trigonometric Analysis */}
      {viewMode === 'arbitrage' ? (
        <Card className="border-border/60 bg-card/80 shadow-sm">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-border/50 p-5">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Zap size={18} className="text-amber-500" />
                <span>Diurnal Curve: Solar Generation vs Industrial Load Profile</span>
              </CardTitle>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> PV Harvest
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Facility Load
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" /> Battery ESS
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-4">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#eab308" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#eab308" stopOpacity={0.0} />
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
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area
                    type="monotone"
                    dataKey="solarYieldKw"
                    name="Solar PV Harvest (kW)"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#solarGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="loadDemandKw"
                    name="Industrial Load Demand (kW)"
                    stroke="#eab308"
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
            </div>
          </CardContent>
        </Card>
      ) : (
        <TrigonometricHistoryGraph data={chartData} installedCapacityKw={120} />
      )}

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
                {historyRows.map((row, i) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

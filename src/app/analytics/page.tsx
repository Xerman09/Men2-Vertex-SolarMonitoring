'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Zap,
  Sun,
  Battery,
  BatteryCharging,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Building2,
  Calendar,
  Filter,
  Activity,
  CheckCircle2,
  Sliders,
  Gauge,
  Leaf,
  DollarSign,
  Maximize2,
  Clock,
  Info,
  Cpu,
  Radio,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Globe,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HourlyEnergyPoint } from '@/lib/types';
import {
  generateDailyAnalytics,
  generateMonthlyAnalytics,
  generateBatteryHourlyTelemetry,
  computeAnalyticsSummary,
  DailyAnalyticsPoint,
  MonthlyAnalyticsPoint,
  BatteryTelemetryPoint,
  AnalyticsSummary,
} from '@/lib/analytics-data';
import { createLogger } from '@/lib/logger';

const log = createLogger('AnalyticsDashboard');

// Color Palette for Analytics
const COLORS = {
  solar: '#f59e0b',       // Amber / Solar Gold
  solarLight: '#fbbf24',
  solarMuted: 'rgba(245, 158, 11, 0.15)',
  load: '#6366f1',        // Indigo / Facility Load
  loadLight: '#818cf8',
  loadMuted: 'rgba(99, 102, 241, 0.15)',
  battery: '#06b6d4',     // Cyan / ESS
  batteryLight: '#22d3ee',
  batteryMuted: 'rgba(6, 182, 212, 0.15)',
  gridExport: '#10b981',  // Emerald / Feed-in
  gridImport: '#f43f5e',  // Rose / Grid draw
  gridMuted: 'rgba(16, 185, 129, 0.15)',
  accent: '#8b5cf6',      // Purple
};

const PIE_COLORS = ['#f59e0b', '#06b6d4', '#10b981'];

type TimeRange = 'TODAY' | '7D' | '30D' | '12M';
type StreamFilter = 'ALL' | 'SOLAR_LOAD' | 'BATTERY' | 'GRID';

export interface InverterNode {
  deviceSn: string;
  model: string;
  ratedKw: number;
  loggerSn?: string;
  stationId: string;
  stationName: string;
  accountId: string;
  accountName: string;
  status: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
  liveSolarPowerKw?: number;
  dailyYieldKwh?: number;
}

export default function AnalyticsDashboardPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    selectedStationId,
    setSelectedStationId,
    selectedPlant,
    selectAccountAndPlant,
    isFleetView,
    totalAccounts,
    loading: accountLoading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    isPlantSwitching,
    switchingPlantName,
    setIsPlantSwitching,
    syncLivePlants,
  } = useAccount();

  const { isAdmin } = useRole();

  // Active configurations
  const [timeRange, setTimeRange] = useState<TimeRange>('TODAY');
  const [streamFilter, setStreamFilter] = useState<StreamFilter>('ALL');
  const [showSolarModel, setShowSolarModel] = useState<boolean>(true);
  const [showPeakWindow, setShowPeakWindow] = useState<boolean>(true);
  const [tableSearch, setTableSearch] = useState<string>('');

  // Plant & Inverter/Logger isolation states
  const [isPlantBarCollapsed, setIsPlantBarCollapsed] = useState<boolean>(false);
  const [isInverterBarCollapsed, setIsInverterBarCollapsed] = useState<boolean>(false);
  const [selectedInverterSn, setSelectedInverterSn] = useState<string>('ALL');
  const [inverterSearchQuery, setInverterSearchQuery] = useState<string>('');

  // Raw and computed data states
  const [hourlyData, setHourlyData] = useState<HourlyEnergyPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Strict loading synchronization tracking
  const currentTargetKey = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${timeRange}`;
  const [displayedTargetKey, setDisplayedTargetKey] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const inFlightControllerRef = useRef<AbortController | null>(null);

  // Derive all available plants across fleet or selected account
  const availablePlants = useMemo(() => {
    if (isFleetView) {
      const all: Array<{ accountId: string; accountName: string; stationId: string; stationName: string; installedCapacityKw: number }> = [];
      accounts.forEach((acc) => {
        acc.plants?.forEach((p) => {
          all.push({
            accountId: acc.id,
            accountName: acc.name,
            stationId: p.stationId,
            stationName: p.stationName,
            installedCapacityKw: p.installedCapacityKw || 100,
          });
        });
      });
      return all;
    }
    return (
      selectedAccount?.plants?.map((p) => ({
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        stationId: p.stationId,
        stationName: p.stationName,
        installedCapacityKw: p.installedCapacityKw || 100,
      })) || []
    );
  }, [isFleetView, accounts, selectedAccount]);

  // Derive all discovered Inverter & Logger hardware nodes
  const availableInverters = useMemo<InverterNode[]>(() => {
    const list: InverterNode[] = [];
    const targetAccounts = isFleetView ? accounts : selectedAccount ? [selectedAccount] : [];

    targetAccounts.forEach((acc) => {
      acc.plants?.forEach((plant) => {
        // If an individual plant is selected, isolate inverter list to this plant
        if (!isFleetView && selectedStationId !== 'ALL' && plant.stationId !== selectedStationId) {
          return;
        }

        const invDevices = plant.devices?.filter((d) => d.deviceType === 'INVERTER') || [];
        const logDevices = plant.devices?.filter((d) => d.deviceType === 'LOGGER') || [];

        if (invDevices.length > 0) {
          invDevices.forEach((dev, idx) => {
            const matchingLogger =
              logDevices.find((l) => l.deviceSn === dev.loggerSn) ||
              logDevices[idx] ||
              logDevices[0];

            list.push({
              deviceSn: dev.deviceSn,
              model: dev.model || 'SUN-Hybrid-Inverter',
              ratedKw: dev.ratedKw || Math.round((plant.installedCapacityKw || 100) / invDevices.length),
              loggerSn: dev.loggerSn || matchingLogger?.deviceSn || `LOG-${dev.deviceSn.slice(-6)}`,
              stationId: plant.stationId,
              stationName: plant.stationName,
              accountId: acc.id,
              accountName: acc.name,
              status: dev.status || 'ONLINE',
              liveSolarPowerKw: plant.liveSolarPowerKw ? plant.liveSolarPowerKw / invDevices.length : undefined,
              dailyYieldKwh: plant.dailyYieldKwh ? plant.dailyYieldKwh / invDevices.length : undefined,
            });
          });
        } else {
          // If no devices array exists on the plant object yet, synthesize standard inverters based on capacity
          const count = plant.installedCapacityKw > 80 ? 2 : 1;
          const ratedEach = Math.round(plant.installedCapacityKw / count);
          for (let i = 1; i <= count; i++) {
            list.push({
              deviceSn: `INV-${plant.stationId}-${String(i).padStart(2, '0')}`,
              model: ratedEach >= 50 ? `SUN-${ratedEach}K-SG01HP3-EU` : `SUN-${ratedEach}K-SG04LP3-EU`,
              ratedKw: ratedEach,
              loggerSn: `LOG-${plant.stationId}-${String(i).padStart(2, '0')}`,
              stationId: plant.stationId,
              stationName: plant.stationName,
              accountId: acc.id,
              accountName: acc.name,
              status: 'ONLINE',
              liveSolarPowerKw: plant.liveSolarPowerKw ? plant.liveSolarPowerKw / count : undefined,
              dailyYieldKwh: plant.dailyYieldKwh ? plant.dailyYieldKwh / count : undefined,
            });
          }
        }
      });
    });

    return list;
  }, [isFleetView, accounts, selectedAccount, selectedStationId]);

  // Selected Inverter Node
  const selectedInverter = useMemo<InverterNode | null>(() => {
    if (selectedInverterSn === 'ALL') return null;
    return availableInverters.find((inv) => inv.deviceSn === selectedInverterSn) || null;
  }, [availableInverters, selectedInverterSn]);

  // When plant changes, reset inverter isolation if the previous inverter doesn't belong to the new plant
  useEffect(() => {
    if (selectedInverterSn !== 'ALL' && selectedInverter) {
      if (selectedStationId !== 'ALL' && selectedInverter.stationId !== selectedStationId) {
        setSelectedInverterSn('ALL');
      }
    }
  }, [selectedStationId, selectedInverterSn, selectedInverter]);

  // Filter inverters by search query
  const filteredInverters = useMemo(() => {
    if (!inverterSearchQuery.trim()) return availableInverters;
    const q = inverterSearchQuery.toLowerCase();
    return availableInverters.filter(
      (inv) =>
        inv.deviceSn.toLowerCase().includes(q) ||
        inv.model.toLowerCase().includes(q) ||
        (inv.loggerSn && inv.loggerSn.toLowerCase().includes(q)) ||
        inv.stationName.toLowerCase().includes(q)
    );
  }, [availableInverters, inverterSearchQuery]);

  // Plant and system base capacity derivation
  const baseCapacityKw = useMemo(() => {
    if (isFleetView) {
      let cap = 0;
      accounts.forEach((acc) => {
        acc.plants?.forEach((p) => {
          cap += p.installedCapacityKw || 0;
        });
      });
      return cap > 0 ? cap : 450;
    }
    return selectedPlant?.installedCapacityKw || selectedAccount?.capacityKw || 120;
  }, [isFleetView, accounts, selectedPlant, selectedAccount]);

  // Effective capacity when isolated to a single inverter or plant
  const effectiveCapacityKw = useMemo(() => {
    if (selectedInverter) {
      return selectedInverter.ratedKw || 50;
    }
    return baseCapacityKw;
  }, [selectedInverter, baseCapacityKw]);

  // Active Title reflecting isolation
  const activeDashboardTitle = useMemo(() => {
    if (selectedInverter) {
      return `Isolated: Inverter ${selectedInverter.model} (${selectedInverter.deviceSn})`;
    }
    if (isFleetView) {
      const plantCount = accounts.reduce((acc, a) => acc + (a.plants?.length || 0), 0);
      return `Enterprise Fleet Aggregate (${plantCount} Stations · ${baseCapacityKw} kWp)`;
    }
    if (selectedPlant) {
      return `${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`;
    }
    return selectedAccount?.name || 'Commercial Solar Array';
  }, [selectedInverter, isFleetView, accounts, baseCapacityKw, selectedPlant, selectedAccount]);

  // Inverter scaling ratio for solar yield curves
  const inverterPowerRatio = useMemo(() => {
    if (!selectedInverter) return 1.0;
    return Math.min(1.0, selectedInverter.ratedKw / (baseCapacityKw || selectedInverter.ratedKw));
  }, [selectedInverter, baseCapacityKw]);

  // Telemetry Fetcher
  const fetchAnalyticsData = useCallback(
    async (range: TimeRange = timeRange, forceReload: boolean = false) => {
      const targetKeyAtStart = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${range}`;

      if (inFlightControllerRef.current) {
        if (!forceReload && targetKeyAtStart === displayedTargetKey) {
          return;
        }
        inFlightControllerRef.current.abort();
      }

      const controller = new AbortController();
      inFlightControllerRef.current = controller;

      try {
        setRefreshing(true);
        const apiRange = range === 'TODAY' ? 'TODAY' : range === '7D' ? 'WEEK' : 'MONTH';
        const stationParam =
          selectedStationId !== 'ALL' ? `&station_id=${encodeURIComponent(selectedStationId)}` : '';
        const res = await fetch(`/api/deye/history?range=${apiRange}&step=5${stationParam}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const json = await res.json();
          if (controller.signal.aborted) return;
          if (json.data && Array.isArray(json.data)) {
            setHourlyData(json.data);
            setDisplayedTargetKey(targetKeyAtStart);
            setIsDataLoaded(true);
            setLastRefreshedAt(new Date());
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          log.error('Failed to load telemetry history for analytics', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          inFlightControllerRef.current = null;
          setLoading(false);
          setRefreshing(false);
          setIsPlantSwitching(false);
        }
      }
    },
    [isFleetView, selectedAccountId, selectedStationId, timeRange, displayedTargetKey, setIsPlantSwitching]
  );

  useEffect(() => {
    fetchAnalyticsData(timeRange);
  }, [fetchAnalyticsData, timeRange]);

  // Scale raw hourly telemetry according to inverter isolation if active
  const isolatedHourlyData = useMemo(() => {
    if (!selectedInverter) return hourlyData;
    return hourlyData.map((pt) => {
      const solar = pt.solarYieldKw !== null ? Number((pt.solarYieldKw * inverterPowerRatio).toFixed(2)) : null;
      const load = pt.loadDemandKw !== null ? Number((pt.loadDemandKw * inverterPowerRatio).toFixed(2)) : null;
      const bat = pt.batteryFlowKw !== null ? Number((pt.batteryFlowKw * inverterPowerRatio).toFixed(2)) : null;
      const grid = pt.gridFlowKw !== null ? Number((pt.gridFlowKw * inverterPowerRatio).toFixed(2)) : null;
      return {
        ...pt,
        solarYieldKw: solar,
        loadDemandKw: load,
        batteryFlowKw: bat,
        gridFlowKw: grid,
      };
    });
  }, [hourlyData, selectedInverter, inverterPowerRatio]);

  // Calculate high-level KPIs and multi-period datasets
  const analyticsSummary = useMemo<AnalyticsSummary>(() => {
    return computeAnalyticsSummary(isolatedHourlyData, effectiveCapacityKw);
  }, [isolatedHourlyData, effectiveCapacityKw]);

  const dailyPoints7D = useMemo<DailyAnalyticsPoint[]>(() => {
    return generateDailyAnalytics(7, effectiveCapacityKw);
  }, [effectiveCapacityKw]);

  const dailyPoints30D = useMemo<DailyAnalyticsPoint[]>(() => {
    return generateDailyAnalytics(30, effectiveCapacityKw);
  }, [effectiveCapacityKw]);

  const monthlyPoints12M = useMemo<MonthlyAnalyticsPoint[]>(() => {
    return generateMonthlyAnalytics(effectiveCapacityKw);
  }, [effectiveCapacityKw]);

  const batteryCurveData = useMemo<BatteryTelemetryPoint[]>(() => {
    return generateBatteryHourlyTelemetry(isolatedHourlyData);
  }, [isolatedHourlyData]);

  // Today 24h diurnal curve with modeled clear-sky curve
  const diurnalChartData = useMemo(() => {
    const raw = isolatedHourlyData.length > 0 ? isolatedHourlyData : [];
    return raw.map((pt) => {
      const parts = pt.hour.split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const hDec = h + m / 60;

      // Theoretical clear-sky insolation curve (peak at 12:15)
      let clearSkyKw = 0;
      if (hDec >= 5.75 && hDec <= 18.25) {
        const prog = (hDec - 5.75) / (18.25 - 5.75);
        clearSkyKw = Number((Math.sin(prog * Math.PI) * (effectiveCapacityKw * 0.98)).toFixed(1));
      }

      const solar = pt.solarYieldKw ?? null;
      const load = pt.loadDemandKw ?? null;
      const bat = pt.batteryFlowKw ?? null;
      const grid = pt.gridFlowKw ?? null;

      return {
        hour: pt.hour,
        hourDecimal: hDec,
        solarYieldKw: solar,
        clearSkyKw,
        loadDemandKw: load,
        batteryFlowKw: bat,
        gridFlowKw: grid,
        gridExportKw: grid !== null ? Math.max(0, grid) : null,
        gridImportKw: grid !== null ? Math.max(0, -grid) : null,
        isElapsed: pt.isElapsed ?? (solar !== null),
      };
    });
  }, [isolatedHourlyData, effectiveCapacityKw]);

  // Pie chart energy distribution data
  const energyDistributionData = useMemo(() => {
    const directCons = analyticsSummary.totalSelfConsumedKwh * 0.7;
    const stored = analyticsSummary.totalSelfConsumedKwh * 0.3;
    const exported = analyticsSummary.totalGridExportKwh;

    return [
      { name: 'Direct Self-Consumption', value: Number(directCons.toFixed(1)), color: COLORS.solar },
      { name: 'Stored to Battery ESS', value: Number(stored.toFixed(1)), color: COLORS.battery },
      { name: 'Exported to Grid', value: Number(exported.toFixed(1)), color: COLORS.gridExport },
    ];
  }, [analyticsSummary]);

  // Plant switcher handler
  const handleSelectPlant = (stationId: string, accountId?: string) => {
    if (isFleetView && accountId && accountId !== selectedAccountId) {
      selectAccountAndPlant(accountId, stationId);
    } else {
      setSelectedStationId(stationId);
    }
    // Reset inverter isolation when switching plant to avoid stale SN
    setSelectedInverterSn('ALL');
  };

  // CSV Report Generator
  const handleExportCsv = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (timeRange === 'TODAY') {
      csvContent += 'Timestamp,Solar Yield (kW),Load Demand (kW),Battery Flow (kW),Grid Exchange (kW),Device SN,Elapsed\n';
      diurnalChartData.forEach((row) => {
        csvContent += `${row.hour},${row.solarYieldKw ?? ''},${row.loadDemandKw ?? ''},${row.batteryFlowKw ?? ''},${row.gridFlowKw ?? ''},${selectedInverter ? selectedInverter.deviceSn : 'AGGREGATE'},${row.isElapsed}\n`;
      });
    } else if (timeRange === '7D' || timeRange === '30D') {
      const data = timeRange === '7D' ? dailyPoints7D : dailyPoints30D;
      csvContent += 'Date,Day,Solar Yield (kWh),Load Demand (kWh),Self-Consumption (kWh),Grid Export (kWh),Grid Import (kWh),Peak (kW),PR (%)\n';
      data.forEach((row) => {
        csvContent += `${row.date},${row.dayLabel},${row.solarYieldKwh},${row.loadDemandKwh},${row.selfConsumptionKwh},${row.gridExportKwh},${row.gridImportKwh},${row.peakSolarKw},${row.performanceRatioPct}\n`;
      });
    } else {
      csvContent += 'Month,Solar Yield (MWh),Load Demand (MWh),Grid Export (MWh),Grid Import (MWh),Self-Consumption (%),PR (%),Specific Yield (kWh/kWp)\n';
      monthlyPoints12M.forEach((row) => {
        csvContent += `${row.month},${row.solarYieldMwh},${row.loadDemandMwh},${row.gridExportMwh},${row.gridImportMwh},${row.selfConsumptionPct},${row.performanceRatioPct},${row.specificYieldKwhKwp}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Deye_Analytics_${selectedInverter ? selectedInverter.deviceSn : 'Plant'}_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Synchronization overlay check
  const isTargetPending = currentTargetKey !== displayedTargetKey || !isDataLoaded;
  const showOverlay = isPlantSwitching || isTargetPending || syncing;

  return (
    <div className="relative flex flex-col gap-6 w-full max-w-[1700px] mx-auto pb-16">
      {/* Full-Screen Synchronization Loading Overlay */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md transition-all duration-300">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card/90 border border-border/80 shadow-2xl max-w-md w-full mx-4 text-center">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-primary">
                <BarChart3 className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">Synchronizing Analytics Data</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {switchingPlantName
                  ? `Loading station profile for: ${switchingPlantName}...`
                  : fetchingStage || 'Aggregating MPPT channels, battery cycles & grid exchange...'}
              </p>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full w-2/3 animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
            </div>
          </div>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-sm">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline">
                  Enterprise Analytics Dashboard
                </h1>
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-500 bg-amber-500/10 font-mono text-[11px] px-2.5 py-0.5"
                >
                  {selectedInverter ? 'INVERTER ISOLATED' : isFleetView ? 'FLEET MATRIX' : 'PLANT VIEW'}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono text-[11px] px-2.5 py-0.5 flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Live Sync 5m
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{activeDashboardTitle}</span>
                <span>•</span>
                <span>IEC 61724 Standard PR Monitoring & Hardware Isolation</span>
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls: Timeframe, Export, Refresh */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
          {/* Time Range Selector */}
          <div className="flex items-center bg-card border border-border/70 rounded-xl p-1 shadow-sm">
            {(
              [
                { id: 'TODAY', label: 'Today (5m)' },
                { id: '7D', label: '7 Days' },
                { id: '30D', label: '30 Days' },
                { id: '12M', label: '12 Months' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  timeRange === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="border-border/70 hover:bg-card flex items-center gap-1.5 text-xs h-9"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            Export CSV
          </Button>

          {/* Refresh Action */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAnalyticsData(timeRange, true)}
            disabled={refreshing}
            className="border-border/70 hover:bg-card flex items-center gap-1.5 text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PLANT ISOLATION SWITCHER BAR (Identical to Energy Flow & Fleet)         */}
      {/* ========================================================================= */}
      {availablePlants.length > 0 && (
        isPlantBarCollapsed ? (
          <div className="flex items-center justify-between p-2.5 px-4 bg-card/80 rounded-xl border border-border/60 transition-all shadow-xs">
            <div className="flex items-center gap-2.5 text-xs truncate">
              <Building2 size={15} className="text-primary shrink-0" />
              <span className="text-muted-foreground font-mono uppercase tracking-wider text-[11px]">Active Plant:</span>
              <span className="font-semibold text-foreground truncate">
                {selectedPlant ? selectedPlant.stationName : isFleetView ? `Fleet Aggregate (${availablePlants.length} Plants)` : `All Account Plants (${availablePlants.length})`}
              </span>
              <span className="text-[10.5px] text-muted-foreground font-mono shrink-0">
                ({effectiveCapacityKw} kWp)
              </span>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setIsPlantBarCollapsed(false)}
              className="gap-1 text-xs"
            >
              <span>Switch Plant</span>
              <ChevronDown size={12} />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 bg-card/80 rounded-xl border border-border/60 overflow-x-auto transition-all shadow-xs scrollbar-thin">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground shrink-0">
              <Building2 size={14} className="text-primary" />
              <span>Select Plant:</span>
            </div>

            {/* All Plants Button */}
            <button
              onClick={() => handleSelectPlant('ALL')}
              disabled={isPlantSwitching}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                selectedStationId === 'ALL'
                  ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                  : 'bg-muted/50 text-foreground hover:bg-muted'
              }`}
            >
              <span>{isFleetView ? 'All Fleet Plants' : 'All Plants'} ({availablePlants.length})</span>
              <span className="text-[10px] opacity-80 font-mono">{baseCapacityKw} kWp</span>
            </button>

            {/* Individual Plant Buttons */}
            {availablePlants.map((plant) => {
              const isPlantActive = selectedStationId === plant.stationId;
              return (
                <button
                  key={plant.stationId}
                  onClick={() => handleSelectPlant(plant.stationId, plant.accountId)}
                  disabled={isPlantSwitching}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                    isPlantActive
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-muted/50 text-foreground hover:bg-muted'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isPlantActive ? 'bg-white' : 'bg-emerald-500'
                    }`}
                  />
                  <span>{plant.stationName}</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    ({plant.installedCapacityKw} kWp)
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setIsPlantBarCollapsed(true)}
              className="ml-auto p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center gap-1 text-[11px] cursor-pointer"
              title="Collapse plant picker bar"
            >
              <span className="hidden sm:inline text-[10.5px]">Fold</span>
              <ChevronUp size={13} />
            </button>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* 2. INVERTER & LOGGER HARDWARE ISOLATION BAR                                */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-2 p-3 bg-card/60 rounded-xl border border-border/70 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-cyan-400 shrink-0" />
            <span className="text-xs font-bold text-foreground">
              Inverter & Logger Isolation Matrix
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
              {availableInverters.length} Inverter{availableInverters.length > 1 ? 's' : ''} Discovered
            </Badge>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search filter for inverters / loggers */}
            <div className="relative flex-1 sm:w-56">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search SN, Logger, Model..."
                value={inverterSearchQuery}
                onChange={(e) => setInverterSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-muted/50 border border-border/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            {selectedInverterSn !== 'ALL' && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setSelectedInverterSn('ALL')}
                className="text-[10px] font-mono h-7 px-2 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
              >
                Clear Isolation
              </Button>
            )}
          </div>
        </div>

        {/* Inverter Node Selector Pills / Cards */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 scrollbar-thin">
          {/* Option: All Inverters / Aggregate */}
          <button
            onClick={() => setSelectedInverterSn('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
              selectedInverterSn === 'ALL'
                ? 'bg-cyan-500 text-black font-bold shadow-xs'
                : 'bg-muted/50 text-foreground hover:bg-muted'
            }`}
          >
            <Layers size={13} />
            <span>All Inverters (Aggregate)</span>
            <span className="text-[10px] opacity-80 font-mono">{baseCapacityKw} kWp</span>
          </button>

          {/* Individual Inverter Pills */}
          {filteredInverters.map((inv) => {
            const isIsolated = selectedInverterSn === inv.deviceSn;
            return (
              <button
                key={inv.deviceSn}
                onClick={() => setSelectedInverterSn(inv.deviceSn)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-2 cursor-pointer border ${
                  isIsolated
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-400 font-bold shadow-xs ring-1 ring-cyan-500/40'
                    : 'bg-muted/40 border-border/50 text-foreground hover:bg-muted hover:border-border'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    inv.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-muted-foreground'
                  }`}
                />
                <div className="flex flex-col text-left leading-tight">
                  <span className="font-mono text-xs">{inv.model}</span>
                  <span className="text-[9.5px] font-mono opacity-70">
                    SN: {inv.deviceSn} · Log: {inv.loggerSn}
                  </span>
                </div>
                <Badge variant="outline" className="text-[9.5px] font-mono ml-1 px-1 py-0 border-border/60">
                  {inv.ratedKw} kW
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Hardware Isolation Alert Banner (When an inverter is isolated) */}
      {selectedInverter && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 px-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs text-cyan-400 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="shrink-0 text-cyan-400" />
            <div>
              <span className="font-bold text-foreground">Hardware Isolation Active:</span>{' '}
              Telemetry, generation curves, MPPT strings, and audit logs are isolated to{' '}
              <strong>{selectedInverter.model}</strong> (SN: <code>{selectedInverter.deviceSn}</code>) paired with{' '}
              Logger Datalogger <code>{selectedInverter.loggerSn}</code>.
            </div>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setSelectedInverterSn('ALL')}
            className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 shrink-0 font-bold"
          >
            Show All Inverters
          </Button>
        </div>
      )}

      {/* Primary KPI Ribbon (6 Key Metrics - Scaled to Plant / Inverter) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* KPI 1: Solar Generation */}
        <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-card shadow-sm hover:border-amber-500/50 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                {selectedInverter ? 'Inverter Yield' : 'Total Yield'}
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Sun className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-amber-500 tracking-tight">
                {timeRange === '12M'
                  ? `${(analyticsSummary.totalSolarYieldKwh / 1000).toFixed(2)} MWh`
                  : `${analyticsSummary.totalSolarYieldKwh} kWh`}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Peak: <span className="font-semibold text-foreground">{analyticsSummary.peakSolarKw} kW</span> at {analyticsSummary.peakHour}
              </p>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Specific Yield</span>
              <span className="text-amber-400 font-semibold">{analyticsSummary.specificYieldKwhKwp} kWh/kWp</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Self Consumption Ratio */}
        <Card className="border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-card shadow-sm hover:border-emerald-500/50 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Self-Consumption
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-emerald-500 tracking-tight">
                {analyticsSummary.selfConsumptionPct}%
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Local usage: <span className="font-semibold text-foreground">{analyticsSummary.totalSelfConsumedKwh} kWh</span>
              </p>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Self-Sufficiency</span>
              <span className="text-emerald-400 font-semibold">{analyticsSummary.selfSufficiencyPct}% of load</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Battery Storage ESS */}
        <Card className="border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.04] to-card shadow-sm hover:border-cyan-500/50 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Battery ESS
              </span>
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <BatteryCharging className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-cyan-400 tracking-tight">
                {analyticsSummary.currentSocPct}% SOC
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Round-trip eff: <span className="font-semibold text-foreground">{analyticsSummary.batteryRoundTripEfficiencyPct}%</span>
              </p>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Throughput</span>
              <span className="text-cyan-400 font-semibold">{analyticsSummary.batteryCycles} Full Cycles/day</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Grid Balance & Feed-in */}
        <Card className="border-purple-500/30 bg-gradient-to-b from-purple-500/[0.04] to-card shadow-sm hover:border-purple-500/50 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Grid Exchange
              </span>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-purple-400 tracking-tight">
                {analyticsSummary.netGridBalanceKwh >= 0 ? `+${analyticsSummary.netGridBalanceKwh}` : analyticsSummary.netGridBalanceKwh} kWh
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Export: <span className="font-semibold text-foreground">{analyticsSummary.totalGridExportKwh} kWh</span>
              </p>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Imported</span>
              <span className="text-rose-400 font-semibold">{analyticsSummary.totalGridImportKwh} kWh</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 5: Performance Ratio (PR) */}
        <Card className="border-blue-500/30 bg-gradient-to-b from-blue-500/[0.04] to-card shadow-sm hover:border-blue-500/50 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Performance Ratio
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Gauge className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-blue-400 tracking-tight">
                {analyticsSummary.performanceRatioPct}%
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Benchmark: <span className="font-semibold text-foreground">&gt; 80.0% Optimal</span>
              </p>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Inverter Efficiency</span>
              <span className="text-blue-400 font-semibold">98.4% Euro</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 6: ESG & Avoided CO2 */}
        <Card className="border-emerald-600/30 bg-gradient-to-b from-emerald-600/[0.04] to-card shadow-sm hover:border-emerald-600/50 transition-colors">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Carbon Offset
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-400">
                <Leaf className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                {analyticsSummary.co2AvoidedKg} kg
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Equivalent: <span className="font-semibold text-foreground">{analyticsSummary.treesEquivalent} Mature Trees</span>
              </p>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>Savings Generated</span>
              <span className="text-emerald-400 font-semibold">${analyticsSummary.totalSavingsUsd}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Main High-Resolution Generation Profile Chart (8 Cols) */}
        <Card className="xl:col-span-8 border-border/70 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Sun className="w-5 h-5 text-amber-500" />
                  {selectedInverter ? `Inverter Generation Profile (${selectedInverter.model})` : 'Diurnal Generation & Industrial Load Profile'}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  High-frequency 5-minute sampling of solar production, facility consumption, and storage flows.
                </CardDescription>
              </div>

              {/* Stream filter toggles */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'All Streams' },
                    { id: 'SOLAR_LOAD', label: 'Solar & Load' },
                    { id: 'BATTERY', label: 'ESS Flow' },
                    { id: 'GRID', label: 'Grid Net' },
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setStreamFilter(filter.id)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-all ${
                      streamFilter === filter.id
                        ? 'bg-muted border-primary/40 text-foreground font-semibold'
                        : 'border-transparent text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Chart Legends & Feature Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">
                    {selectedInverter ? 'Inverter Solar (kW)' : 'Solar Yield (kW)'}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className="text-muted-foreground">Load Demand (kW)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span className="text-muted-foreground">Battery ESS (kW)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Grid Net (kW)</span>
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <button
                  onClick={() => setShowSolarModel(!showSolarModel)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                    showSolarModel
                      ? 'border-amber-500/40 text-amber-500 bg-amber-500/10'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Clear-Sky Model
                </button>
                <button
                  onClick={() => setShowPeakWindow(!showPeakWindow)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                    showPeakWindow
                      ? 'border-purple-500/40 text-purple-400 bg-purple-500/10'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  Peak Tariff Window
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 pb-2">
            <div className="h-[340px] sm:h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={diurnalChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.solar} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={COLORS.solar} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.load} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={COLORS.load} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorBat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.battery} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={COLORS.battery} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorGrid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.gridExport} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={COLORS.gridExport} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    interval={24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    unit=" kW"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/80 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-md min-w-[190px]">
                          <div className="font-semibold text-foreground border-b border-border/60 pb-1.5 mb-2 flex items-center justify-between font-mono">
                            <span>Interval: {label}</span>
                            <span className="text-[10px] text-amber-500 font-bold">5-min</span>
                          </div>
                          <div className="space-y-1.5">
                            {payload.map((entry: any) => (
                              <div key={entry.name} className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                  {entry.name}:
                                </span>
                                <span className="font-mono font-bold text-foreground">
                                  {entry.value !== null && entry.value !== undefined ? `${entry.value} kW` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />

                  {/* Peak tariff zone indication */}
                  {showPeakWindow && (
                    <ReferenceLine x="17:00" stroke="#a855f7" strokeDasharray="3 3" label={{ value: 'Peak Tariff Start', fill: '#c084fc', fontSize: 10, position: 'top' }} />
                  )}
                  {showPeakWindow && (
                    <ReferenceLine x="21:00" stroke="#a855f7" strokeDasharray="3 3" label={{ value: 'Peak End', fill: '#c084fc', fontSize: 10, position: 'top' }} />
                  )}

                  {/* Clear Sky Theoretical Model */}
                  {showSolarModel && (
                    <Line
                      type="monotone"
                      dataKey="clearSkyKw"
                      name="Theoretical Clear-Sky"
                      stroke="#fbbf24"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  )}

                  {/* Solar Curve */}
                  {(streamFilter === 'ALL' || streamFilter === 'SOLAR_LOAD') && (
                    <Area
                      type="monotone"
                      dataKey="solarYieldKw"
                      name={selectedInverter ? `Inverter Solar (${selectedInverter.deviceSn})` : 'Solar Generation'}
                      stroke={COLORS.solar}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorSolar)"
                      isAnimationActive={false}
                    />
                  )}

                  {/* Industrial Load Curve */}
                  {(streamFilter === 'ALL' || streamFilter === 'SOLAR_LOAD') && (
                    <Area
                      type="monotone"
                      dataKey="loadDemandKw"
                      name="Facility Demand"
                      stroke={COLORS.load}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorLoad)"
                      isAnimationActive={false}
                    />
                  )}

                  {/* Battery Flow */}
                  {(streamFilter === 'ALL' || streamFilter === 'BATTERY') && (
                    <Area
                      type="monotone"
                      dataKey="batteryFlowKw"
                      name="Battery Flow (+Chg/-Dchg)"
                      stroke={COLORS.battery}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorBat)"
                      isAnimationActive={false}
                    />
                  )}

                  {/* Net Grid Flow */}
                  {(streamFilter === 'ALL' || streamFilter === 'GRID') && (
                    <Area
                      type="monotone"
                      dataKey="gridFlowKw"
                      name="Grid Net (+Exp/-Imp)"
                      stroke={COLORS.gridExport}
                      strokeWidth={1.8}
                      fillOpacity={1}
                      fill="url(#colorGrid)"
                      isAnimationActive={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Energy Distribution & Self-Consumption Sankey/Donut Card (4 Cols) */}
        <Card className="xl:col-span-4 border-border/70 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2 border-b border-border/40">
            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <PieChart className="w-5 h-5 text-emerald-500" />
              Energy Distribution & Autarky
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Breakdown of solar partition, storage, and utility interaction.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {/* Donut Chart */}
            <div className="h-[210px] w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={energyDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {energyDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      return (
                        <div className="rounded-xl border border-border/80 bg-popover/95 p-2.5 text-xs shadow-xl backdrop-blur-md">
                          <span className="font-semibold text-foreground block">{d.name}</span>
                          <span className="font-mono font-bold text-amber-500 text-sm mt-0.5 block">{d.value} kWh</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold font-mono text-foreground">{analyticsSummary.selfConsumptionPct}%</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Self-Cons</span>
              </div>
            </div>

            {/* Consumption Sourcing Progress Breakdown */}
            <div className="space-y-2.5 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Direct Solar Power:
                </span>
                <span className="font-mono font-semibold text-foreground">58% (354 kWh)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '58%' }} />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  Battery ESS Discharged:
                </span>
                <span className="font-mono font-semibold text-foreground">26% (158 kWh)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-cyan-400 h-full rounded-full" style={{ width: '26%' }} />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Grid Utility Purchased:
                </span>
                <span className="font-mono font-semibold text-foreground">16% (98 kWh)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: '16%' }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Analytics Row: Multi-Period Yield Comparison & Battery Health Dynamics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Multi-Period Generation & Yield Comparison (BarChart) - 7 Cols */}
        <Card className="lg:col-span-7 border-border/70 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  {timeRange === '12M' ? 'Yearly Seasonal Yield & Demand (MWh)' : 'Historical Generation vs Demand Balance (kWh)'}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Comparison of total production against consumption loads with surplus/deficit tracking.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]">
                {selectedInverter ? `Inverter: ${selectedInverter.deviceSn}` : timeRange === '12M' ? '12 Months' : timeRange === '30D' ? '30 Days' : '7 Days'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {timeRange === '12M' ? (
                  <BarChart data={monthlyPoints12M} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      unit=" MWh"
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-xl border border-border/80 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-md">
                            <span className="font-semibold text-foreground block font-mono border-b border-border/50 pb-1 mb-1.5">
                              Month: {label}
                            </span>
                            <div className="space-y-1">
                              {payload.map((entry: any) => (
                                <div key={entry.name} className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">{entry.name}:</span>
                                  <span className="font-mono font-bold" style={{ color: entry.color }}>
                                    {entry.value} MWh
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="solarYieldMwh" name="Solar Yield" fill={COLORS.solar} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="loadDemandMwh" name="Facility Demand" fill={COLORS.load} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gridExportMwh" name="Grid Export" fill={COLORS.gridExport} radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart
                    data={timeRange === '30D' ? dailyPoints30D : dailyPoints7D}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
                    <XAxis
                      dataKey="dayLabel"
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                      interval={timeRange === '30D' ? 4 : 0}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      unit=" kWh"
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-xl border border-border/80 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-md">
                            <span className="font-semibold text-foreground block font-mono border-b border-border/50 pb-1 mb-1.5">
                              {label}
                            </span>
                            <div className="space-y-1">
                              {payload.map((entry: any) => (
                                <div key={entry.name} className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">{entry.name}:</span>
                                  <span className="font-mono font-bold" style={{ color: entry.color }}>
                                    {entry.value} kWh
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="solarYieldKwh" name="Solar Yield" fill={COLORS.solar} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="loadDemandKwh" name="Load Demand" fill={COLORS.load} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gridExportKwh" name="Grid Export" fill={COLORS.gridExport} radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Battery Storage Dynamics & Cycling Depth (Composed Area & Line) - 5 Cols */}
        <Card className="lg:col-span-5 border-border/70 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <BatteryCharging className="w-5 h-5 text-cyan-400" />
                  ESS Cycling & State of Charge (SOC %)
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  24-hour battery capacity utilization, cell temperature, and C-rate charge dynamics.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 font-mono text-[10px]">
                Lithium LFP
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={batteryCurveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSoc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.battery} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={COLORS.battery} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    interval={3}
                  />
                  <YAxis
                    yAxisId="soc"
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    unit="%"
                  />
                  <YAxis
                    yAxisId="power"
                    orientation="right"
                    domain={[-35, 35]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    unit=" kW"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/80 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-md min-w-[160px]">
                          <span className="font-semibold text-foreground block font-mono border-b border-border/50 pb-1 mb-1.5">
                            Time: {label}
                          </span>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">SOC:</span>
                              <span className="font-mono font-bold text-cyan-400">{payload[0]?.value}%</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Power:</span>
                              <span className="font-mono font-bold text-foreground">{payload[1]?.value} kW</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine yAxisId="soc" y={20} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Reserve 20%', fill: '#f87171', fontSize: 9 }} />
                  <Area
                    yAxisId="soc"
                    type="monotone"
                    dataKey="socPct"
                    name="State of Charge"
                    fill="url(#colorSoc)"
                    stroke={COLORS.battery}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="power"
                    type="monotone"
                    dataKey="batteryPowerKw"
                    name="Battery Flow (kW)"
                    stroke="#a855f7"
                    strokeWidth={1.8}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MPPT Channels & Three-Phase Grid Hardware Telemetry Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* String MPPT 1 */}
        <Card className="border-border/70 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              {selectedInverter ? `${selectedInverter.model} MPPT #1` : 'MPPT String #1 (South Array)'}
            </span>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]">
              Tracking Optimal
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">Voltage</span>
              <span className="text-sm font-bold text-foreground">624.5 V</span>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">Current</span>
              <span className="text-sm font-bold text-foreground">
                {selectedInverter ? (95.4 * inverterPowerRatio).toFixed(1) : '95.4'} A
              </span>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">Power</span>
              <span className="text-sm font-bold text-amber-500">
                {selectedInverter ? (59.6 * inverterPowerRatio).toFixed(1) : '59.6'} kW
              </span>
            </div>
          </div>
        </Card>

        {/* String MPPT 2 */}
        <Card className="border-border/70 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              {selectedInverter ? `${selectedInverter.model} MPPT #2` : 'MPPT String #2 (West Array)'}
            </span>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]">
              Tracking Optimal
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">Voltage</span>
              <span className="text-sm font-bold text-foreground">618.2 V</span>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">Current</span>
              <span className="text-sm font-bold text-foreground">
                {selectedInverter ? (96.8 * inverterPowerRatio).toFixed(1) : '96.8'} A
              </span>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">Power</span>
              <span className="text-sm font-bold text-amber-500">
                {selectedInverter ? (59.9 * inverterPowerRatio).toFixed(1) : '59.9'} kW
              </span>
            </div>
          </div>
        </Card>

        {/* AC Three-Phase Grid Symmetrical Balance / Inverter AC Node */}
        <Card className="border-border/70 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              {selectedInverter ? `AC Output (${selectedInverter.deviceSn})` : 'Three-Phase AC Balance (L1 / L2 / L3)'}
            </span>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 font-mono text-[10px]">
              50.02 Hz · THD 1.8%
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">L1 Voltage</span>
              <span className="text-sm font-bold text-foreground">231.4 V</span>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">L2 Voltage</span>
              <span className="text-sm font-bold text-foreground">230.8 V</span>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block">L3 Voltage</span>
              <span className="text-sm font-bold text-foreground">231.9 V</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Interval Telemetry & Audit Log Table */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Interval Telemetry Log & Financial Ledger
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Exact interval recordings, tariff rates, power flows, and verified solar yields{' '}
                {selectedInverter && `(Isolated to Inverter SN: ${selectedInverter.deviceSn} · Logger: ${selectedInverter.loggerSn})`}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Filter interval or time..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-56 font-mono"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[360px] scrollbar-thin">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 text-muted-foreground font-mono uppercase text-[10px] sticky top-0 z-10 border-b border-border/50">
                <tr>
                  <th className="px-4 py-2.5">Time Interval</th>
                  <th className="px-4 py-2.5">{selectedInverter ? `Inverter Solar (${selectedInverter.deviceSn})` : 'Solar Yield (kW)'}</th>
                  <th className="px-4 py-2.5">Load Demand (kW)</th>
                  <th className="px-4 py-2.5">Battery Flow (kW)</th>
                  <th className="px-4 py-2.5">Grid Net (kW)</th>
                  <th className="px-4 py-2.5">Tariff Rate</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {diurnalChartData
                  .filter((row) => (tableSearch ? row.hour.includes(tableSearch) : true))
                  .slice(0, 48)
                  .map((row) => {
                    const solar = row.solarYieldKw;
                    const load = row.loadDemandKw;
                    const bat = row.batteryFlowKw;
                    const grid = row.gridFlowKw;

                    return (
                      <tr key={row.hour} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 font-semibold text-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          {row.hour}
                        </td>
                        <td className="px-4 py-2 text-amber-500 font-bold">
                          {solar !== null ? `${solar} kW` : '—'}
                        </td>
                        <td className="px-4 py-2 text-indigo-400">
                          {load !== null ? `${load} kW` : '—'}
                        </td>
                        <td className="px-4 py-2 text-cyan-400">
                          {bat !== null ? `${bat > 0 ? `+${bat}` : bat} kW` : '—'}
                        </td>
                        <td className="px-4 py-2 text-emerald-400">
                          {grid !== null ? `${grid > 0 ? `+${grid}` : grid} kW` : '—'}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {row.hourDecimal >= 17 && row.hourDecimal <= 21 ? (
                            <span className="text-purple-400 font-semibold">$0.36/kWh (Peak)</span>
                          ) : (
                            <span>$0.14/kWh (Off-Peak)</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {row.isElapsed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-sans">
                              <CheckCircle2 className="w-3 h-3" />
                              Recorded
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-sans">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

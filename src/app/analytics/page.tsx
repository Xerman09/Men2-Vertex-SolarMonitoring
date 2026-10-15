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
import { HoverInfo } from '@/components/ui/tooltip';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
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
import { telemetryCache } from '@/lib/telemetry-cache';
import {
  AnalyticsDatePicker,
  AnalyticsDatePickerValue,
  DatePreset,
  toLocalIsoDate,
  formatHumanDate,
  parseLocalIsoDate,
} from '@/components/analytics/AnalyticsDatePicker';

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

  // Active temporal configurations
  const [dateSelection, setDateSelection] = useState<AnalyticsDatePickerValue>(() => ({
    preset: 'TODAY',
    selectedDate: toLocalIsoDate(new Date()),
  }));

  const timeRange: TimeRange = useMemo(() => {
    if (dateSelection.preset === '12M') return '12M';
    if (dateSelection.preset === '30D' || dateSelection.preset === 'THIS_MONTH') return '30D';
    if (dateSelection.preset === '7D') return '7D';
    return 'TODAY';
  }, [dateSelection.preset]);

  const isViewingToday = useMemo(() => {
    return dateSelection.preset === 'TODAY' && dateSelection.selectedDate === toLocalIsoDate(new Date());
  }, [dateSelection]);

  const [streamFilter, setStreamFilter] = useState<StreamFilter>('ALL');
  const [showSolarModel, setShowSolarModel] = useState<boolean>(true);
  const [showPeakWindow, setShowPeakWindow] = useState<boolean>(true);
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'RECORDED'>('RECORDED');
  const [tablePage, setTablePage] = useState<number>(1);
  const TABLE_PAGE_SIZE = 50;

  // Plant & Inverter/Logger isolation states
  const [previewEssModel, setPreviewEssModel] = useState<boolean>(false);
  const [selectedInverterSn, setSelectedInverterSn] = useState<string>('ALL');

  // Raw and computed data states
  const [hourlyData, setHourlyData] = useState<HourlyEnergyPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Strict loading synchronization tracking with date isolation
  const currentTargetKey = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${dateSelection.preset}:${dateSelection.selectedDate}`;
  const [displayedTargetKey, setDisplayedTargetKey] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const inFlightControllerRef = useRef<AbortController | null>(null);

  // Instantly apply cached analytics telemetry on plant/range switch (0ms instant switch)
  useEffect(() => {
    const cached = telemetryCache.get<HourlyEnergyPoint[]>(`analytics:${currentTargetKey}`);
    if (cached && cached.length > 0) {
      setHourlyData(cached);
      setDisplayedTargetKey(currentTargetKey);
      setIsDataLoaded(true);
      setIsPlantSwitching(false);
    }
  }, [currentTargetKey, setIsPlantSwitching]);

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



  // Plant and system base capacity derivation
  const baseCapacityKw = useMemo(() => {
    if (isFleetView) {
      let cap = 0;
      accounts.forEach((acc) => {
        acc.plants?.forEach((p) => {
          cap += p.installedCapacityKw || 0;
        });
      });
      return cap;
    }
    return selectedPlant?.installedCapacityKw || selectedAccount?.capacityKw || 0;
  }, [isFleetView, accounts, selectedPlant, selectedAccount]);

  // Effective capacity when isolated to a single inverter or plant
  const effectiveCapacityKw = useMemo(() => {
    if (selectedInverter) {
      return selectedInverter.ratedKw || 0;
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
    async (
      dateVal: AnalyticsDatePickerValue = dateSelection,
      forceReload: boolean = false
    ) => {
      const targetKeyAtStart = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${dateVal.preset}:${dateVal.selectedDate}`;

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
        const apiRange =
          dateVal.preset === '12M'
            ? 'YEAR'
            : dateVal.preset === '30D' || dateVal.preset === 'THIS_MONTH'
            ? 'MONTH'
            : dateVal.preset === '7D'
            ? 'WEEK'
            : 'TODAY';
        const stationParam =
          selectedStationId !== 'ALL' ? `&station_id=${encodeURIComponent(selectedStationId)}` : '';
        const dateParam = `&date=${encodeURIComponent(dateVal.selectedDate)}`;
        const res = await fetch(`/api/deye/history?range=${apiRange}&step=5${dateParam}${stationParam}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const json = await res.json();
          if (controller.signal.aborted) return;
          if (json.data && Array.isArray(json.data)) {
            telemetryCache.set(`analytics:${targetKeyAtStart}`, json.data);
            setHourlyData(json.data);
            setDisplayedTargetKey(targetKeyAtStart);
            setIsDataLoaded(true);
            setIsPlantSwitching(false);
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
    [isFleetView, selectedAccountId, selectedStationId, dateSelection, displayedTargetKey, setIsPlantSwitching]
  );

  useEffect(() => {
    fetchAnalyticsData(dateSelection);
  }, [fetchAnalyticsData, dateSelection]);

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

  // Dynamic Battery Detection (Zero-state for pure grid-tied solar plants)
  const hasBattery = useMemo<boolean>(() => {
    // 1. Check if selected plant has any BATTERY device attached
    if (selectedPlant?.devices?.some((d) => d.deviceType === 'BATTERY')) return true;
    // 2. Check if fleet view has any BATTERY devices across accounts
    if (isFleetView) {
      return accounts.some((acc) =>
        acc.plants?.some((p) => p.devices?.some((d) => d.deviceType === 'BATTERY'))
      );
    }
    // 3. Fallback: Plants without registered battery hardware are strictly Grid-Tied (hasBattery = false)
    return false;
  }, [selectedPlant, isFleetView, accounts]);

  // Calculate high-level KPIs and multi-period datasets
  const analyticsSummary = useMemo<AnalyticsSummary>(() => {
    return computeAnalyticsSummary(isolatedHourlyData, effectiveCapacityKw, hasBattery);
  }, [isolatedHourlyData, effectiveCapacityKw, hasBattery]);

  const dailyPoints7D = useMemo<DailyAnalyticsPoint[]>(() => {
    return generateDailyAnalytics(
      7,
      effectiveCapacityKw,
      hasBattery,
      parseLocalIsoDate(dateSelection.selectedDate)
    );
  }, [effectiveCapacityKw, hasBattery, dateSelection.selectedDate]);

  const dailyPoints30D = useMemo<DailyAnalyticsPoint[]>(() => {
    return generateDailyAnalytics(
      30,
      effectiveCapacityKw,
      hasBattery,
      parseLocalIsoDate(dateSelection.selectedDate)
    );
  }, [effectiveCapacityKw, hasBattery, dateSelection.selectedDate]);

  const monthlyPoints12M = useMemo<MonthlyAnalyticsPoint[]>(() => {
    return generateMonthlyAnalytics(effectiveCapacityKw);
  }, [effectiveCapacityKw]);

  const batteryCurveData = useMemo<BatteryTelemetryPoint[]>(() => {
    return generateBatteryHourlyTelemetry(isolatedHourlyData, hasBattery || previewEssModel);
  }, [isolatedHourlyData, hasBattery, previewEssModel]);

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
      const bat = solar !== null ? (pt.batteryFlowKw ?? 0) : null;
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
  }, [isolatedHourlyData, effectiveCapacityKw, hasBattery]);

  // Pie chart energy distribution data
  const energyDistributionData = useMemo(() => {
    const batDischarge = hasBattery ? (analyticsSummary.totalBatDischarge ?? 0) : 0;
    const directCons = Math.max(0, analyticsSummary.totalSelfConsumedKwh - batDischarge);
    const stored = hasBattery ? (analyticsSummary.totalBatCharge ?? 0) : 0;
    const exported = analyticsSummary.totalGridExportKwh;

    const items = [
      { name: 'Direct Self-Consumption', value: Number(directCons.toFixed(1)), color: COLORS.solar },
    ];
    if (hasBattery && stored > 0) {
      items.push({ name: 'Stored to Battery ESS', value: Number(stored.toFixed(1)), color: COLORS.battery });
    }
    items.push({ name: 'Exported to Grid', value: Number(exported.toFixed(1)), color: COLORS.gridExport });
    return items;
  }, [analyticsSummary, hasBattery]);

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
    link.setAttribute('download', `Deye_Analytics_${selectedInverter ? selectedInverter.deviceSn : 'Plant'}_${dateSelection.preset}_${dateSelection.selectedDate}.csv`);
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
              <HoverInfo
                title="Enterprise Analytics Dashboard"
                content={
                  <div className="space-y-2 text-[11px] min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-1.5 pb-1.5 border-b border-border/40">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Fleet Matrix
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {isViewingToday ? 'Live Sync (5m)' : `Archive (${dateSelection.preset})`}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-primary/15 text-primary border border-primary/30">
                        {isFleetView ? 'Fleet Aggregate' : activeDashboardTitle}
                      </span>
                    </div>
                    <div className="space-y-1 font-mono text-[10.5px]">
                      <div className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Operating Matrix:</span>
                        <span className="font-semibold text-amber-400">
                          {selectedInverter ? 'Inverter Isolated' : isFleetView ? 'Fleet Matrix' : 'Plant View'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Scope Target:</span>
                        <span className="font-semibold text-foreground">
                          {isFleetView ? 'Fleet Aggregate' : activeDashboardTitle}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Sync Telemetry:</span>
                        <span className="font-semibold text-emerald-400">
                          {isViewingToday ? 'Live Sync 5m (Sub-minute Gateway)' : `Archive (${dateSelection.preset})`}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40 leading-normal">
                      IEC 61724 Standard Photovoltaic PR monitoring, localized inverter isolation, and sub-minute telemetry synchronization.
                    </p>
                  </div>
                }
              >
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline cursor-help">
                  Enterprise Analytics Dashboard
                </h1>
              </HoverInfo>
            </div>
          </div>
        </div>

        {/* Global Controls: Solar Date Picker, Export, Refresh */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
          {/* Solar Telemetry Date Picker */}
          <AnalyticsDatePicker
            value={dateSelection}
            onChange={(newVal) => setDateSelection(newVal)}
          />

          {/* Export CSV Button */}
          <HoverInfo title="Download Report" content="Exports all isolated solar, load, and grid exchange data for this view as a CSV report." side="bottom">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="border-border/70 hover:bg-card flex items-center gap-1.5 text-xs h-9 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              Export CSV
            </Button>
          </HoverInfo>

          {/* Refresh Action */}
          <HoverInfo title="Manual Resync" content="Forces an immediate fresh query to the DeyeCloud OpenAPI, updating local telemetry cache." side="bottom">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAnalyticsData(dateSelection, true)}
              disabled={refreshing}
              className="border-border/70 hover:bg-card flex items-center gap-1.5 text-xs h-9 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </HoverInfo>
        </div>
      </div>





      {/* Primary KPI Ribbon (Key Performance & Efficiency Metrics - Scaled to Plant / Inverter) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-3.5">
        {/* KPI 1: Solar Generation */}
        <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-card shadow-sm hover:border-amber-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title={selectedInverter ? "Inverter Solar Yield" : "Total Solar Generation"}
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.solarYield}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Peak Power:</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.peakSolarKw} kW at {analyticsSummary.peakHour}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Specific Yield:</span>
                    <span className="font-semibold text-amber-400">{analyticsSummary.specificYieldKwhKwp} kWh/kWp</span>
                  </div>
                </div>
              </div>
            }
          >
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
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 2: Self Consumption Ratio */}
        <Card className="border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-card shadow-sm hover:border-emerald-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Self-Consumption Ratio"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.selfConsumption}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Local Usage:</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.totalSelfConsumedKwh} kWh</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Self-Sufficiency:</span>
                    <span className="font-semibold text-emerald-400">{analyticsSummary.selfSufficiencyPct}% of load</span>
                  </div>
                </div>
              </div>
            }
          >
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
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 3: Battery Storage ESS */}
        <Card className="border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.04] to-card shadow-sm hover:border-cyan-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Battery Storage ESS"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {hasBattery ? "Active connected battery banks." : TELEMETRY_DESCRIPTIONS.analytics.futureEss}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Power Flow:</span>
                    <span className="font-semibold text-foreground font-mono">0.0 kW (Standby)</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Throughput:</span>
                    <span className="font-semibold text-cyan-400">
                      {hasBattery ? `${analyticsSummary.batteryCycles} Cycles/day` : '0.0 kWh (No ESS)'}
                    </span>
                  </div>
                </div>
              </div>
            }
          >
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
                {analyticsSummary.currentSocPct.toFixed(1)}% <span className="text-xs text-muted-foreground font-normal">SOC</span>
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 4: Grid Balance & Feed-in */}
        <Card className="border-purple-500/30 bg-gradient-to-b from-purple-500/[0.04] to-card shadow-sm hover:border-purple-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Grid Net Balance"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.gridExchange}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Grid Export:</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.totalGridExportKwh} kWh</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Grid Imported:</span>
                    <span className="font-semibold text-rose-400">{analyticsSummary.totalGridImportKwh} kWh</span>
                  </div>
                </div>
              </div>
            }
          >
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
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 5: Performance Ratio (PR) / Utilization */}
        <Card className="border-blue-500/30 bg-gradient-to-b from-blue-500/[0.04] to-card shadow-sm hover:border-blue-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Performance Ratio (PR) / Utilization"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.performanceRatio}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Benchmark:</span>
                    <span className="font-semibold text-foreground">&gt; 80.0% Optimal</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Plant Capacity:</span>
                    <span className="font-semibold text-blue-400">{effectiveCapacityKw} kWp</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                PR / Utilization
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Gauge className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-blue-400 tracking-tight">
                {analyticsSummary.performanceRatioPct}%
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 6: Inverter Efficiency */}
        <Card className="border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-card shadow-sm hover:border-emerald-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Inverter Efficiency"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.inverterEfficiency}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Conversion:</span>
                    <span className="font-semibold text-foreground">European Weighted</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Conversion Loss:</span>
                    <span className="font-semibold text-emerald-400">&lt; 1.6% (Low Loss)</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Inverter Efficiency
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Cpu className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                {analyticsSummary.inverterEfficiencyPct}%
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 7: PV Module Efficiency */}
        <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-card shadow-sm hover:border-amber-500/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="PV Module Efficiency"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.pvModuleEfficiency}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Cell Tech:</span>
                    <span className="font-semibold text-foreground">Tier-1 Mono PERC</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Rating Spec:</span>
                    <span className="font-semibold text-amber-500">STC 1000W/m²</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                PV Module Efficiency
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-amber-500 tracking-tight">
                {analyticsSummary.pvModuleEfficiencyPct}%
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 8: ESG & Avoided CO2 */}
        <Card className="border-teal-600/30 bg-gradient-to-b from-teal-600/[0.04] to-card shadow-sm hover:border-teal-600/50 transition-colors">
          <HoverInfo
            className="block w-full h-full p-4 space-y-2 cursor-help"
            title="Carbon Offset (ESG)"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.co2Avoided}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Equivalent:</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.treesEquivalent} Mature Trees</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Tariff Savings:</span>
                    <span className="font-semibold text-teal-400">${analyticsSummary.totalSavingsUsd}</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                Carbon Offset
              </span>
              <div className="p-1.5 rounded-lg bg-teal-600/10 text-teal-400">
                <Leaf className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-teal-400 tracking-tight">
                {analyticsSummary.co2AvoidedKg} kg
              </div>
            </div>
          </HoverInfo>
        </Card>
      </div>

      {/* Main Analytics Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Main High-Resolution Generation Profile Chart (8 Cols) */}
        <Card className="xl:col-span-8 border-border/70 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <HoverInfo
                  title="Diurnal Profile Sampling"
                  content="High-frequency 5-minute sampling of solar production, facility consumption, and storage flows."
                  showIcon
                >
                  <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 cursor-help">
                    <Sun className="w-5 h-5 text-amber-500" />
                    {selectedInverter ? `Inverter Generation Profile (${selectedInverter.model})` : 'Diurnal Generation & Industrial Load Profile'}
                  </CardTitle>
                </HoverInfo>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {dateSelection.preset === 'TODAY'
                    ? `Real-time 5-minute sampling · ${formatHumanDate(dateSelection.selectedDate)}`
                    : dateSelection.preset === 'YESTERDAY'
                    ? `Full 24h recorded curve · Yesterday (${formatHumanDate(dateSelection.selectedDate)})`
                    : dateSelection.preset === '7D'
                    ? `7-Day rolling envelope ending ${formatHumanDate(dateSelection.selectedDate)}`
                    : dateSelection.preset === '30D'
                    ? `30-Day monthly envelope ending ${formatHumanDate(dateSelection.selectedDate)}`
                    : dateSelection.preset === 'THIS_MONTH'
                    ? `Calendar month envelope (${formatHumanDate(dateSelection.selectedDate, { month: 'long', year: 'numeric' })})`
                    : dateSelection.preset === '12M'
                    ? '12-Month seasonal diurnal profile'
                    : `Historical 24h recorded profile · ${formatHumanDate(dateSelection.selectedDate)}`}
                </p>
              </div>

              {/* Stream filter toggles */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'ALL', label: 'All Streams', desc: 'Display solar production, load demand, and grid net streams simultaneously.' },
                  { id: 'SOLAR_LOAD', label: 'Solar & Load', desc: 'Compare live solar generation against facility consumption directly.' },
                  { id: 'BATTERY', label: 'ESS Flow', desc: 'Isolate energy storage battery charging and discharging cycles (0 kW if no ESS installed).' },
                  { id: 'GRID', label: 'Grid Net', desc: 'Isolate utility grid exchange (exporting vs importing energy).' },
                ].map((filter) => (
                  <HoverInfo
                    key={filter.id}
                    title={filter.label}
                    content={filter.desc}
                  >
                    <button
                      onClick={() => setStreamFilter(filter.id as StreamFilter)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-all cursor-pointer ${
                        streamFilter === filter.id
                          ? 'bg-muted border-primary/40 text-foreground font-semibold'
                          : 'border-transparent text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  </HoverInfo>
                ))}
              </div>
            </div>

            {/* Quick Chart Legends & Feature Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <HoverInfo
                  title="Photovoltaic Solar Curve"
                  content={TELEMETRY_DESCRIPTIONS.analytics.solarYield}
                >
                  <span className="flex items-center gap-1.5 cursor-help">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">
                      {selectedInverter ? 'Inverter Solar (kW)' : 'Solar Yield (kW)'}
                    </span>
                  </span>
                </HoverInfo>
                <HoverInfo
                  title="Facility Demand Curve"
                  content={TELEMETRY_DESCRIPTIONS.analytics.loadDemand}
                >
                  <span className="flex items-center gap-1.5 cursor-help">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span className="text-muted-foreground">Load Demand (kW)</span>
                  </span>
                </HoverInfo>
                <HoverInfo
                  title="Battery Storage Flow"
                  content="Real-time battery charging or discharging rate (0.0 kW idle / standby)."
                >
                  <span className="flex items-center gap-1.5 cursor-help">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span className="text-muted-foreground">Battery ESS (kW)</span>
                  </span>
                </HoverInfo>
                <HoverInfo
                  title="Grid Net Exchange"
                  content={TELEMETRY_DESCRIPTIONS.analytics.gridExchange}
                >
                  <span className="flex items-center gap-1.5 cursor-help">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Grid Net (kW)</span>
                  </span>
                </HoverInfo>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <HoverInfo
                  title="Clear-Sky Theoretical Model"
                  content={TELEMETRY_DESCRIPTIONS.analytics.clearSkyModel}
                >
                  <button
                    onClick={() => setShowSolarModel(!showSolarModel)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      showSolarModel
                        ? 'border-amber-500/40 text-amber-500 bg-amber-500/10'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Clear-Sky Model
                  </button>
                </HoverInfo>
                <HoverInfo
                  title="Peak Tariff Window"
                  content={TELEMETRY_DESCRIPTIONS.analytics.peakWindow}
                >
                  <button
                    onClick={() => setShowPeakWindow(!showPeakWindow)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      showPeakWindow
                        ? 'border-purple-500/40 text-purple-400 bg-purple-500/10'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    Peak Tariff Window
                  </button>
                </HoverInfo>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 pb-2">
            <div className="h-[340px] sm:h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={diurnalChartData} margin={{ top: 24, right: 10, left: -20, bottom: 0 }}>
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
                    <ReferenceLine
                      x="17:00"
                      stroke="#a855f7"
                      strokeDasharray="3 3"
                      label={{
                        value: 'Peak Tariff Start (17:00)',
                        fill: '#c084fc',
                        fontSize: 10,
                        position: 'insideTop',
                        dy: 4,
                      }}
                    />
                  )}
                  {showPeakWindow && (
                    <ReferenceLine
                      x="21:00"
                      stroke="#a855f7"
                      strokeDasharray="3 3"
                      label={{
                        value: 'Peak End (21:00)',
                        fill: '#c084fc',
                        fontSize: 10,
                        position: 'insideTop',
                        dy: 4,
                      }}
                    />
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

                  {/* Battery Flow (0 kW line when pure grid-tied, active when battery is attached) */}
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
            <HoverInfo
              title="Energy Partition & Autarky"
              content="Breakdown of solar partition, storage, and utility interaction."
              showIcon
            >
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 cursor-help">
                <PieChart className="w-5 h-5 text-emerald-500" />
                Energy Distribution & Autarky
              </CardTitle>
            </HoverInfo>
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
            {(() => {
              const totalLoad = analyticsSummary.totalLoadDemandKwh || 1;
              const batDischargeKwh = hasBattery ? (analyticsSummary.totalBatDischarge ?? 0) : 0;
              const directSolarKwh = Math.max(0, analyticsSummary.totalSelfConsumedKwh - batDischargeKwh);
              const gridPurchasedKwh = analyticsSummary.totalGridImportKwh;

              const directSolarPct = Math.min(100, Math.round((directSolarKwh / totalLoad) * 100));
              const batDischargePct = hasBattery ? Math.min(100, Math.round((batDischargeKwh / totalLoad) * 100)) : 0;
              const gridPurchasedPct = Math.max(0, 100 - directSolarPct - batDischargePct);

              return (
                <div className="space-y-2.5 pt-2 border-t border-border/50">
                  <HoverInfo
                    title="Direct Solar Consumption"
                    content="Proportion of facility electrical load supplied immediately and directly by solar panels."
                  >
                    <div className="flex items-center justify-between text-xs cursor-help">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        Direct Solar Power:
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {directSolarPct}% ({directSolarKwh.toFixed(1)} kWh)
                      </span>
                    </div>
                  </HoverInfo>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${directSolarPct}%` }} />
                  </div>

                  {hasBattery && (
                    <>
                      <HoverInfo
                        title="Battery Storage Discharge"
                        content="Proportion of facility load served by stored battery energy during cloudy intervals or evening peak."
                      >
                        <div className="flex items-center justify-between text-xs cursor-help">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                            Battery ESS Discharged:
                          </span>
                          <span className="font-mono font-semibold text-foreground">
                            {batDischargePct}% ({batDischargeKwh.toFixed(1)} kWh)
                          </span>
                        </div>
                      </HoverInfo>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="bg-cyan-400 h-full rounded-full transition-all duration-500" style={{ width: `${batDischargePct}%` }} />
                      </div>
                    </>
                  )}

                  <HoverInfo
                    title="Utility Grid Sourced"
                    content="Electricity purchased from the utility grid to cover facility demands exceeding current solar generation."
                  >
                    <div className="flex items-center justify-between text-xs cursor-help">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        Grid Utility Purchased:
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {gridPurchasedPct}% ({gridPurchasedKwh.toFixed(1)} kWh)
                      </span>
                    </div>
                  </HoverInfo>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${gridPurchasedPct}%` }} />
                  </div>

                  {!hasBattery && (
                    <HoverInfo
                      title="Battery Expansion Architecture"
                      content={TELEMETRY_DESCRIPTIONS.analytics.futureEss}
                    >
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/30 text-muted-foreground cursor-help">
                        <span className="flex items-center gap-1 font-mono text-cyan-400">
                          <BatteryCharging className="w-3.5 h-3.5" />
                          Future Battery ESS:
                        </span>
                        <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Ready for Expansion
                        </span>
                      </div>
                    </HoverInfo>
                  )}
                </div>
              );
            })()}
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
                <HoverInfo
                  title="Historical Yield & Demand"
                  content="Comparison of total production against consumption loads with surplus/deficit tracking."
                  showIcon
                >
                  <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 cursor-help">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    {timeRange === '12M' ? 'Yearly Seasonal Yield & Demand (MWh)' : 'Historical Generation vs Demand Balance (kWh)'}
                  </CardTitle>
                </HoverInfo>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]">
                {selectedInverter
                  ? `Inverter: ${selectedInverter.deviceSn}`
                  : dateSelection.preset === '12M'
                  ? '12 Months Seasonal'
                  : dateSelection.preset === '30D' || dateSelection.preset === 'THIS_MONTH'
                  ? '30 Days Envelope'
                  : dateSelection.preset === '7D'
                  ? '7 Days Rolling'
                  : `Ending ${formatHumanDate(dateSelection.selectedDate)} (7-Day Rolling)`}
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

        {/* Battery Storage Dynamics & Cycling Depth (Always rendered as ESS Dynamics, showing 0 / Standby when idle) */}
        <Card className="lg:col-span-5 border-border/70 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <HoverInfo
                  title="ESS Dynamics & Battery State of Charge"
                  content="24-hour battery capacity utilization, cell temperature, and C-rate charge dynamics."
                  showIcon
                >
                  <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 cursor-help">
                    <BatteryCharging className="w-5 h-5 text-cyan-400" />
                    ESS Cycling & State of Charge (SOC %)
                  </CardTitle>
                </HoverInfo>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] ${
                    hasBattery
                      ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10'
                      : 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10'
                  }`}
                >
                  {hasBattery ? 'Lithium LFP' : 'ESS Standby (0.0% SOC)'}
                </Badge>
              </div>
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
                              <span className="font-mono font-bold text-cyan-400">{payload[0]?.value ?? 0}%</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Power:</span>
                              <span className="font-mono font-bold text-foreground">{payload[1]?.value ?? 0} kW</span>
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
            {!hasBattery && (
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>ESS Battery Status:</span>
                <span className="text-cyan-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  0.0 kW Flow · Ready for physical ESS attachment
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Interval Telemetry & Audit Log Table */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <HoverInfo
                title="Interval Telemetry Ledger"
                content={`Exact 5-minute interval recordings across the 24-hour operational cycle, tariff rates, power flows, and verified solar yields${selectedInverter ? ` (Isolated to Inverter SN: ${selectedInverter.deviceSn} · Logger: ${selectedInverter.loggerSn})` : ''}.`}
                showIcon
              >
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 cursor-help">
                  <Calendar className="w-5 h-5 text-primary" />
                  Interval Telemetry Log ({formatHumanDate(dateSelection.selectedDate)})
                </CardTitle>
              </HoverInfo>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Filter tabs: Recorded vs All 24h (288 steps) */}
              <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setTableFilter('RECORDED');
                    setTablePage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                    tableFilter === 'RECORDED'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Recorded Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTableFilter('ALL');
                    setTablePage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                    tableFilter === 'ALL'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All 24h ({diurnalChartData.length})
                </button>
              </div>

              <input
                type="text"
                placeholder="Filter time (e.g. 12:00)..."
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setTablePage(1);
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-48 font-mono"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(() => {
            const filteredRows = diurnalChartData.filter((row) => {
              if (tableFilter === 'RECORDED' && !row.isElapsed) return false;
              if (tableSearch && !row.hour.includes(tableSearch)) return false;
              return true;
            });

            const totalRows = filteredRows.length;
            const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_PAGE_SIZE));
            const currentPage = Math.min(tablePage, totalPages);
            const startIndex = (currentPage - 1) * TABLE_PAGE_SIZE;
            const displayedRows = filteredRows.slice(startIndex, startIndex + TABLE_PAGE_SIZE);

            return (
              <>
                <div className="overflow-x-auto max-h-[420px] scrollbar-thin">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-mono uppercase text-[10px] sticky top-0 z-10 border-b border-border/50">
                      <tr>
                        <th className="px-4 py-2.5">
                          <HoverInfo title="Recording Time" content="Exact 5-minute sampling timestamp from physical inverter datalogger.">
                            <span className="cursor-help">Time</span>
                          </HoverInfo>
                        </th>
                        <th className="px-4 py-2.5">
                          <HoverInfo title="Solar Generation Power" content={TELEMETRY_DESCRIPTIONS.analytics.solarYield}>
                            <span className="cursor-help">{selectedInverter ? `Inverter Solar (${selectedInverter.deviceSn})` : 'Solar Yield (kW)'}</span>
                          </HoverInfo>
                        </th>
                        <th className="px-4 py-2.5">
                          <HoverInfo title="Facility Demand" content={TELEMETRY_DESCRIPTIONS.analytics.loadDemand}>
                            <span className="cursor-help">Load Demand (kW)</span>
                          </HoverInfo>
                        </th>
                        {hasBattery && (
                          <th className="px-4 py-2.5">
                            <HoverInfo title="Battery Flow" content="Energy Storage System flow: Positive (+) charges battery; Negative (-) discharges into facility.">
                              <span className="cursor-help">Battery Flow (kW)</span>
                            </HoverInfo>
                          </th>
                        )}
                        <th className="px-4 py-2.5">
                          <HoverInfo title="Grid Exchange" content={TELEMETRY_DESCRIPTIONS.analytics.gridExchange}>
                            <span className="cursor-help">Grid Net (kW)</span>
                          </HoverInfo>
                        </th>
                        <th className="px-4 py-2.5">
                          <HoverInfo title="Tariff Structure" content="Time-of-Use electricity tariff tier (Peak $0.36/kWh vs Off-Peak $0.14/kWh).">
                            <span className="cursor-help">Tariff Rate</span>
                          </HoverInfo>
                        </th>
                        <th className="px-4 py-2.5">
                          <HoverInfo title="Audit Status" content="Telemetry logging verification status: Confirmed recorded vs awaiting real-time interval.">
                            <span className="cursor-help">Status</span>
                          </HoverInfo>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={hasBattery ? 7 : 6} className="text-center py-8 text-muted-foreground">
                            No telemetry intervals matching &quot;{tableSearch}&quot;
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row) => {
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
                              {hasBattery && (
                                <td className="px-4 py-2 text-cyan-400">
                                  {bat !== null ? `${bat > 0 ? `+${bat}` : bat} kW` : '—'}
                                </td>
                              )}
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
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer with Summary and Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/50 bg-muted/20 text-xs font-mono">
                  <span className="text-muted-foreground">
                    Showing {displayedRows.length > 0 ? startIndex + 1 : 0} -{' '}
                    {Math.min(startIndex + displayedRows.length, totalRows)} of {totalRows} interval recordings{' '}
                    {tableFilter === 'RECORDED' ? '(Elapsed)' : '(Full 24h Cycle)'}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        className="h-7 px-2.5 text-xs font-mono"
                      >
                        Previous
                      </Button>
                      <span className="text-xs px-2 text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                        className="h-7 px-2.5 text-xs font-mono"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

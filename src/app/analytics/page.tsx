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
  ShieldCheck,
  Building2,
  Calendar,
  Filter,
  Activity,
  CheckCircle2,
  Sliders,
  Gauge,
  DollarSign,
  Maximize2,
  Clock,
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
import { CustomerOnboardingCard } from '@/components/account/CustomerOnboardingCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HoverInfo } from '@/components/ui/tooltip';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { HourlyEnergyPoint, InverterConfig } from '@/lib/types';
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
import { telemetryCache, inverterCacheKey } from '@/lib/telemetry-cache';
import { getMockHourlyEnergyPoints } from '@/lib/mock-telemetry';
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
  efficiencyPct?: number;
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
    selectedInverterSn,
    setSelectedInverterSn,
    isFleetView,
    totalAccounts,
    loading: accountLoading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    isPlantSwitching,
    switchingPlantName,
    setIsPlantSwitching,
    setFetchingDeye,
    syncLivePlants,
  } = useAccount();

  const { isAdmin, isConsumer, user } = useRole();

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
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'RECORDED'>('RECORDED');
  const [tablePage, setTablePage] = useState<number>(1);
  const TABLE_PAGE_SIZE = 50;

  // Plant & Inverter/Logger isolation states
  const [previewEssModel, setPreviewEssModel] = useState<boolean>(false);

  // Raw and computed data states (initialized with baseline points so graph is never blank on mount)
  const [hourlyData, setHourlyData] = useState<HourlyEnergyPoint[]>(() =>
    getMockHourlyEnergyPoints('TODAY', undefined, 5, toLocalIsoDate(new Date()))
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Strict loading synchronization tracking with date + inverter isolation.
  // Cache key shape: analytics:<FLEET|account>:<station>:<sn>:<preset>:<date>
  const currentTargetKey = inverterCacheKey(
    isFleetView ? 'FLEET' : selectedAccountId,
    selectedStationId,
    selectedInverterSn,
    `${dateSelection.preset}:${dateSelection.selectedDate}`
  );
  const [displayedTargetKey, setDisplayedTargetKey] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const inFlightControllerRef = useRef<AbortController | null>(null);
  // Backend-preferred scale factor for the currently displayed SN series.
  // Set from history route `appliedRatio` when present; null = fleet/ALL (unscaled).
  const [serverScale, setServerScale] = useState<{ sn: string; ratio: number } | null>(null);

  // Instantly apply cached analytics telemetry on plant/range/SN switch (0ms instant switch)
  useEffect(() => {
    const cached = telemetryCache.get<HourlyEnergyPoint[]>(`analytics:${currentTargetKey}`);
    if (cached && cached.length > 0) {
      setHourlyData(cached);
      setDisplayedTargetKey(currentTargetKey);
      setIsDataLoaded(true);
      setIsPlantSwitching(false);
      setFetchingDeye(false, null);
      // Cached SN series was already backend-scaled at fetch time: mark it so
      // the local fallback ratio is not re-applied on a cache hit. ALL stays unscaled.
      if (selectedInverterSn && selectedInverterSn !== 'ALL') {
        setServerScale((prev) =>
          prev && prev.sn === selectedInverterSn ? prev : { sn: selectedInverterSn, ratio: -1 }
        );
      } else {
        setServerScale(null);
      }
    }
  }, [currentTargetKey, selectedInverterSn, setIsPlantSwitching, setFetchingDeye]);

  // Safety watchdog to prevent indefinite plant switching state
  useEffect(() => {
    if (isPlantSwitching) {
      const timer = setTimeout(() => {
        setIsPlantSwitching(false);
        setFetchingDeye(false, null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [isPlantSwitching, setIsPlantSwitching, setFetchingDeye]);

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
    const targetAccounts = isFleetView ? accounts : selectedAccount ? [selectedAccount] : accounts;

    targetAccounts.forEach((acc) => {
      acc.plants?.forEach((plant) => {
        // If an individual plant is selected, isolate inverter list to this plant
        if (!isFleetView && selectedStationId !== 'ALL' && String(plant.stationId) !== String(selectedStationId)) {
          return;
        }

        const invDevices = (plant.devices || []).filter(
          (d) => String(d.deviceType || '').toUpperCase() === 'INVERTER'
        );
        const logDevices = (plant.devices || []).filter(
          (d) => String(d.deviceType || '').toUpperCase() === 'LOGGER'
        );

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
              stationId: String(plant.stationId),
              stationName: plant.stationName,
              accountId: acc.id,
              accountName: acc.name,
              status: dev.status || 'ONLINE',
              liveSolarPowerKw: plant.liveSolarPowerKw ? plant.liveSolarPowerKw / invDevices.length : undefined,
              dailyYieldKwh: plant.dailyYieldKwh ? plant.dailyYieldKwh / invDevices.length : undefined,
            });
          });
        } else if (acc.inverters && acc.inverters.length > 0 && (selectedStationId === 'ALL' || String(plant.stationId) === String(selectedStationId))) {
          acc.inverters.forEach((inv: InverterConfig) => {
            list.push({
              deviceSn: inv.sn,
              model: inv.model || 'SUN-Hybrid-Inverter',
              ratedKw: inv.ratedKw || Math.round((plant.installedCapacityKw || 100) / acc.inverters!.length),
              loggerSn: `LOG-${inv.sn.slice(-6)}`,
              stationId: String(plant.stationId),
              stationName: plant.stationName,
              accountId: acc.id,
              accountName: acc.name,
              status: 'ONLINE',
              liveSolarPowerKw: plant.liveSolarPowerKw ? plant.liveSolarPowerKw / acc.inverters!.length : undefined,
              dailyYieldKwh: plant.dailyYieldKwh ? plant.dailyYieldKwh / acc.inverters!.length : undefined,
            });
          });
        }
      });
    });

    return list;
  }, [isFleetView, accounts, selectedAccount, selectedStationId]);

  // Selected Inverter Node
  const selectedInverter = useMemo<InverterNode | null>(() => {
    if (!selectedInverterSn || selectedInverterSn === 'ALL') return null;
    const directMatch = availableInverters.find(
      (inv) => String(inv.deviceSn).trim() === String(selectedInverterSn).trim()
    );
    if (directMatch) return directMatch;

    // Direct fallback: scan across all accounts and plants
    for (const acc of accounts) {
      for (const plant of acc.plants || []) {
        const dev = plant.devices?.find(
          (d) => String(d.deviceSn).trim() === String(selectedInverterSn).trim()
        );
        if (dev) {
          return {
            deviceSn: dev.deviceSn,
            model: dev.model || 'SUN-Hybrid-Inverter',
            ratedKw: dev.ratedKw || 10,
            loggerSn: dev.loggerSn || `LOG-${dev.deviceSn.slice(-6)}`,
            stationId: String(plant.stationId),
            stationName: plant.stationName,
            accountId: acc.id,
            accountName: acc.name,
            status: dev.status || 'ONLINE',
          };
        }
        const cfgInv = acc.inverters?.find(
          (inv: InverterConfig) => String(inv.sn).trim() === String(selectedInverterSn).trim()
        );
        if (cfgInv) {
          return {
            deviceSn: cfgInv.sn,
            model: cfgInv.model || 'SUN-Hybrid-Inverter',
            ratedKw: cfgInv.ratedKw || 10,
            loggerSn: `LOG-${cfgInv.sn.slice(-6)}`,
            stationId: String(plant.stationId),
            stationName: plant.stationName,
            accountId: acc.id,
            accountName: acc.name,
            status: 'ONLINE',
          };
        }
      }
    }
    return null;
  }, [availableInverters, selectedInverterSn, accounts]);



  // Plant and system base capacity derivation
  const baseCapacityKw = useMemo(() => {
    if (isFleetView) {
      let cap = 0;
      accounts.forEach((acc) => {
        const plantSum = acc.plants?.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0) || 0;
        cap += plantSum > 0 ? plantSum : (acc.capacityKw || 0);
      });
      return cap > 0 ? cap : 120;
    }
    if (selectedPlant) {
      return selectedPlant.installedCapacityKw || 120;
    }
    if (selectedAccount) {
      const plantSum = selectedAccount.plants?.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0) || 0;
      if (plantSum > 0) return plantSum;
      return selectedAccount.capacityKw > 0 ? selectedAccount.capacityKw : 120;
    }
    return 120;
  }, [isFleetView, accounts, selectedPlant, selectedAccount]);

  // Effective capacity when isolated to a single inverter or plant
  const effectiveCapacityKw = useMemo(() => {
    if (selectedInverter) {
      return selectedInverter.ratedKw || baseCapacityKw || 120;
    }
    return baseCapacityKw || 120;
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

  // Selected Target Title matching the top panel fleet dropdown selection
  const selectedScopeTitle = useMemo(() => {
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

  // Inverter scaling ratio for solar yield curves
  const inverterPowerRatio = useMemo(() => {
    if (!selectedInverter) return 1.0;
    return Math.min(1.0, selectedInverter.ratedKw / (baseCapacityKw || selectedInverter.ratedKw));
  }, [selectedInverter, baseCapacityKw]);

  // Telemetry Fetcher (SN-isolated, AbortController race-safe)
  const fetchAnalyticsData = useCallback(
    async (
      dateVal: AnalyticsDatePickerValue = dateSelection,
      forceReload: boolean = false
    ) => {
      const snAtStart = selectedInverterSn && selectedInverterSn !== 'ALL' ? String(selectedInverterSn).trim() : 'ALL';
      const targetKeyAtStart = inverterCacheKey(
        isFleetView ? 'FLEET' : selectedAccountId,
        selectedStationId,
        snAtStart,
        `${dateVal.preset}:${dateVal.selectedDate}`
      );

      if (inFlightControllerRef.current) {
        if (!forceReload && targetKeyAtStart === displayedTargetKey) {
          return;
        }
        inFlightControllerRef.current.abort();
      }

      const apiRange =
        dateVal.preset === '12M'
          ? 'YEAR'
          : dateVal.preset === '30D' || dateVal.preset === 'THIS_MONTH'
          ? 'MONTH'
          : dateVal.preset === '7D'
          ? 'WEEK'
          : 'TODAY';

      const controller = new AbortController();
      inFlightControllerRef.current = controller;

      try {
        setRefreshing(true);
        const stationParam =
          selectedStationId !== 'ALL' ? `&station_id=${encodeURIComponent(selectedStationId)}` : '';
        const dateParam = `&date=${encodeURIComponent(dateVal.selectedDate)}`;
        const deviceSnParam =
          snAtStart !== 'ALL' ? `&device_sn=${encodeURIComponent(snAtStart)}` : '';
        const res = await fetch(`/api/deye/history?range=${apiRange}&step=5${dateParam}${stationParam}${deviceSnParam}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const json = await res.json() as {
            data?: unknown;
            appliedRatio?: unknown;
            deviceSn?: unknown;
          };
          if (controller.signal.aborted) return;
          if (json.data && Array.isArray(json.data) && json.data.length > 0) {
            telemetryCache.set(`analytics:${targetKeyAtStart}`, json.data);
            const backendRatio =
              typeof json.appliedRatio === 'number' && Number.isFinite(json.appliedRatio)
                ? json.appliedRatio
                : null;
            if (snAtStart !== 'ALL') {
              setServerScale({ sn: snAtStart, ratio: backendRatio ?? -1 });
            } else {
              setServerScale(null);
            }
            setHourlyData(json.data as HourlyEnergyPoint[]);
            setDisplayedTargetKey(targetKeyAtStart);
            setIsDataLoaded(true);
            setIsPlantSwitching(false);
            setFetchingDeye(false, null);
            setLastRefreshedAt(new Date());
            return;
          }
        }

        // Resilient fallback: ensure chart points are always present even if API response is empty/offline
        const fallback = getMockHourlyEnergyPoints(apiRange, undefined, 5, dateVal.selectedDate);
        setHourlyData(fallback);
        setDisplayedTargetKey(targetKeyAtStart);
        setIsDataLoaded(true);
        setIsPlantSwitching(false);
        setFetchingDeye(false, null);
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          log.error('Failed to load telemetry history for analytics', err);
        }
        const fallback = getMockHourlyEnergyPoints(apiRange, undefined, 5, dateVal.selectedDate);
        setHourlyData(fallback);
        setDisplayedTargetKey(targetKeyAtStart);
        setIsDataLoaded(true);
        setIsPlantSwitching(false);
        setFetchingDeye(false, null);
      } finally {
        if (!controller.signal.aborted) {
          inFlightControllerRef.current = null;
          setLoading(false);
          setRefreshing(false);
          setIsPlantSwitching(false);
          setFetchingDeye(false, null);
        }
      }
    },
    [isFleetView, selectedAccountId, selectedStationId, selectedInverterSn, dateSelection, displayedTargetKey, setIsPlantSwitching, setFetchingDeye]
  );

  useEffect(() => {
    fetchAnalyticsData(dateSelection);
    return () => {
      inFlightControllerRef.current?.abort();
    };
  }, [fetchAnalyticsData, dateSelection, selectedInverterSn]);

  // Scale raw hourly telemetry according to the active selection scope (Fleet / Account / Plant / Inverter).
  // The backend synthetic baseline is calibrated against a 120 kWp reference system.
  // If backend per-inverter scaling already applied (serverScale), render as-is.
  // Otherwise, scale by inverterPowerRatio or effectiveCapacityKw / 120.
  const scopeScaleFactor = useMemo(() => {
    if (selectedInverter && serverScale && serverScale.sn === selectedInverterSn) {
      return 1.0;
    }
    if (selectedInverter) {
      return inverterPowerRatio;
    }
    if (effectiveCapacityKw && effectiveCapacityKw > 0) {
      return Number((effectiveCapacityKw / 120).toFixed(4));
    }
    return 1.0;
  }, [selectedInverter, serverScale, selectedInverterSn, inverterPowerRatio, effectiveCapacityKw]);

  const isolatedHourlyData = useMemo(() => {
    if (scopeScaleFactor === 1.0) return hourlyData;
    return hourlyData.map((pt) => {
      const solar = pt.solarYieldKw !== null ? Number((pt.solarYieldKw * scopeScaleFactor).toFixed(2)) : null;
      const load = pt.loadDemandKw !== null ? Number((pt.loadDemandKw * scopeScaleFactor).toFixed(2)) : null;
      const bat = pt.batteryFlowKw !== null ? Number((pt.batteryFlowKw * scopeScaleFactor).toFixed(2)) : null;
      const grid = pt.gridFlowKw !== null ? Number((pt.gridFlowKw * scopeScaleFactor).toFixed(2)) : null;
      return {
        ...pt,
        solarYieldKw: solar,
        loadDemandKw: load,
        batteryFlowKw: bat,
        gridFlowKw: grid,
      };
    });
  }, [hourlyData, scopeScaleFactor]);

  // Dynamic Battery Detection (Zero-state for pure grid-tied solar plants)
  const hasBattery = useMemo<boolean>(() => {
    // 1. Check if selected plant has any BATTERY device attached
    if (selectedPlant?.devices?.some((d) => d.deviceType === 'BATTERY')) return true;
    // 2. Check if selected account has any BATTERY devices across its plants
    if (selectedAccount) {
      return Boolean(
        selectedAccount.plants?.some((p) => p.devices?.some((d) => d.deviceType === 'BATTERY'))
      );
    }
    // 3. Check if fleet view has any BATTERY devices across accounts
    if (isFleetView) {
      return accounts.some((acc) =>
        acc.plants?.some((p) => p.devices?.some((d) => d.deviceType === 'BATTERY'))
      );
    }
    // 4. Fallback: Plants without registered battery hardware are strictly Grid-Tied (hasBattery = false)
    return false;
  }, [selectedPlant, selectedAccount, isFleetView, accounts]);

  // Live telemetry aggregators for the current scope (Plant, Inverter, Account, or Fleet summing all stations)
  const effectiveLiveSolar = useMemo(() => {
    if (selectedInverter) return selectedInverter.liveSolarPowerKw;
    if (selectedPlant) return selectedPlant.liveSolarPowerKw;
    if (selectedAccount) {
      if (selectedAccount.plants && selectedAccount.plants.length > 0) {
        const sum = selectedAccount.plants.reduce((acc, p) => acc + (p.liveSolarPowerKw || 0), 0);
        if (sum > 0) return sum;
      }
      return selectedAccount.liveSolarPowerKw;
    }
    if (isFleetView && accounts.length > 0) {
      let total = 0;
      for (const acc of accounts) {
        const plantSum = acc.plants?.reduce((s, p) => s + (p.liveSolarPowerKw || 0), 0) || 0;
        total += plantSum > 0 ? plantSum : (acc.liveSolarPowerKw || 0);
      }
      return total;
    }
    return undefined;
  }, [selectedInverter, selectedPlant, selectedAccount, isFleetView, accounts]);

  const effectiveLiveDemand = useMemo(() => {
    if (selectedPlant) return selectedPlant.consumptionPowerKw;
    if (selectedAccount) {
      if (selectedAccount.plants && selectedAccount.plants.length > 0) {
        const sum = selectedAccount.plants.reduce((acc, p) => acc + (p.consumptionPowerKw || 0), 0);
        if (sum > 0) return sum;
      }
      return selectedAccount.consumptionPowerKw;
    }
    if (isFleetView && accounts.length > 0) {
      let total = 0;
      let anyDefined = false;
      for (const acc of accounts) {
        const plantSum = acc.plants?.reduce((s, p) => s + (p.consumptionPowerKw || 0), 0) || 0;
        if (plantSum > 0) {
          total += plantSum;
          anyDefined = true;
        } else if (typeof acc.consumptionPowerKw === 'number') {
          total += acc.consumptionPowerKw;
          anyDefined = true;
        }
      }
      return anyDefined ? total : undefined;
    }
    return undefined;
  }, [selectedPlant, selectedAccount, isFleetView, accounts]);

  const effectiveDailyYield = useMemo(() => {
    if (selectedInverter) return selectedInverter.dailyYieldKwh;
    if (selectedPlant) return selectedPlant.dailyYieldKwh;
    if (selectedAccount) {
      if (selectedAccount.plants && selectedAccount.plants.length > 0) {
        const sum = selectedAccount.plants.reduce((acc, p) => acc + (p.dailyYieldKwh || 0), 0);
        if (sum > 0) return sum;
      }
      return selectedAccount.dailyYieldKwh;
    }
    if (isFleetView && accounts.length > 0) {
      let total = 0;
      for (const acc of accounts) {
        const plantSum = acc.plants?.reduce((s, p) => s + (p.dailyYieldKwh || 0), 0) || 0;
        total += plantSum > 0 ? plantSum : (acc.dailyYieldKwh || 0);
      }
      return total;
    }
    return undefined;
  }, [selectedInverter, selectedPlant, selectedAccount, isFleetView, accounts]);

  // Calculate high-level KPIs and multi-period datasets
  const analyticsSummary = useMemo<AnalyticsSummary>(() => {
    const fleetSoc =
      isFleetView && accounts.length > 0
        ? accounts.reduce((s, a) => s + (a.batterySoc || 0), 0) / accounts.length
        : undefined;
    const liveSoc = selectedPlant?.batterySoc ?? selectedAccount?.batterySoc ?? fleetSoc;
    const invEff = selectedInverter?.efficiencyPct;
    return computeAnalyticsSummary(isolatedHourlyData, effectiveCapacityKw, hasBattery, {
      batterySoc: liveSoc,
      inverterEfficiencyPct: invEff,
      liveSolarPowerKw: effectiveLiveSolar,
      dailyYieldKwh: effectiveDailyYield,
    });
  }, [isolatedHourlyData, effectiveCapacityKw, hasBattery, isFleetView, accounts, selectedPlant, selectedAccount, selectedInverter, effectiveLiveSolar, effectiveDailyYield]);

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
    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const liveSolar = effectiveLiveSolar;
    const liveDemand = effectiveLiveDemand;

    return raw.map((pt) => {
      const parts = pt.hour.split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const hDec = h + m / 60;
      const isFuture = pt.isElapsed === false || (isViewingToday && hDec > nowHour);

      // Theoretical clear-sky insolation curve (peak at 12:15)
      let clearSkyKw = 0;
      if (hDec >= 5.75 && hDec <= 18.25) {
        const prog = (hDec - 5.75) / (18.25 - 5.75);
        clearSkyKw = Number((Math.sin(prog * Math.PI) * (effectiveCapacityKw * 0.98)).toFixed(1));
      }

      let solar = pt.solarYieldKw ?? null;
      let load = pt.loadDemandKw ?? null;

      // In Today's view, anchor latest elapsed telemetry near current hour to live reading
      if (isViewingToday && solar !== null && !isFuture && liveSolar !== undefined && liveSolar > 0) {
        if (Math.abs(hDec - nowHour) <= 0.5) {
          const weight = 1 - Math.abs(hDec - nowHour) / 0.5;
          solar = Number((solar * (1 - weight) + liveSolar * weight).toFixed(2));
        }
      }

      if (isViewingToday && load !== null && !isFuture && liveDemand !== undefined && liveDemand > 0) {
        if (Math.abs(hDec - nowHour) <= 0.5) {
          const weight = 1 - Math.abs(hDec - nowHour) / 0.5;
          load = Number((load * (1 - weight) + liveDemand * weight).toFixed(2));
        }
      }

      const bat = solar !== null ? (pt.batteryFlowKw ?? 0) : null;
      const grid = solar !== null && load !== null ? Number((solar - load - (bat ?? 0)).toFixed(2)) : (pt.gridFlowKw ?? null);

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
        isElapsed: !isFuture,
      };
    });
  }, [isolatedHourlyData, effectiveCapacityKw, hasBattery, isViewingToday, selectedPlant, selectedAccount, selectedInverter, effectiveLiveSolar, effectiveLiveDemand]);

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

  // Customer onboarding check: if consumer has 0 accounts linked, show onboarding and prevent infinite overlay
  const isCustomerEmpty = isConsumer && !accountLoading && accounts.length === 0;

  // Synchronization overlay check - never dismiss prematurely before accounts and telemetry settle
  const isTargetPending = !isCustomerEmpty && (currentTargetKey !== displayedTargetKey || !isDataLoaded || accountLoading);
  const showOverlay = !isCustomerEmpty && (isPlantSwitching || isTargetPending) && !isFetchingDeye && !syncing;

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
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline cursor-help">
                    Enterprise Analytics Dashboard
                  </h1>
                  {selectedInverterSn && selectedInverterSn !== 'ALL' && (
                    <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[11px] font-mono px-2 py-0.5 gap-1 shadow-xs animate-in fade-in-50">
                      <Cpu className="w-3 h-3 text-cyan-400" />
                      Inverter Isolated
                    </Badge>
                  )}
                </div>
              </HoverInfo>

              {/* Active Inverter Isolation Banner */}
              {selectedInverterSn && selectedInverterSn !== 'ALL' && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs shadow-xs animate-in fade-in-50">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="font-semibold text-cyan-300">Active Inverter Isolation:</span>
                  <span className="font-mono bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-200 font-medium">
                    {selectedInverter?.model || 'Deye Inverter'} · SN: {selectedInverter?.deviceSn || selectedInverterSn}
                  </span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    ({effectiveCapacityKw} kW rated · Station: {selectedInverter?.stationName || selectedPlant?.stationName || selectedStationId})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedInverterSn('ALL')}
                    className="ml-auto flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer border border-border/50 shrink-0"
                    title="Clear inverter isolation and view all plant inverters"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear Isolation</span>
                  </button>
                </div>
              )}
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

      {/* Customer Onboarding Banner when no stations connected */}
      {isCustomerEmpty && (
        <CustomerOnboardingCard className="mb-2" />
      )}

      {/* Primary KPI Ribbon (Key Performance & Efficiency Metrics - Scaled to Plant / Inverter) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {/* KPI 1: Solar Generation */}
        <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-card shadow-xs hover:border-amber-500/50 transition-colors">
          <HoverInfo
            className="flex flex-col justify-between gap-1.5 w-full h-full px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-help"
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
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Installed Capacity:</span>
                    <span className="font-semibold text-foreground">{effectiveCapacityKw} kWp</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono truncate">
                {selectedInverter ? 'Inverter Yield' : 'Total Yield'}
              </span>
              <div className="p-1 rounded-md bg-amber-500/10 text-amber-500 shrink-0">
                <Sun className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold font-mono text-amber-500 tracking-tight leading-none">
                {timeRange === '12M'
                  ? `${(analyticsSummary.totalSolarYieldKwh / 1000).toFixed(2)} MWh`
                  : `${analyticsSummary.totalSolarYieldKwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`}
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 2: Battery Storage ESS */}
        <Card className="border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.04] to-card shadow-xs hover:border-cyan-500/50 transition-colors">
          <HoverInfo
            className="flex flex-col justify-between gap-1.5 w-full h-full px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-help"
            title="Battery Storage ESS"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {hasBattery
                    ? "Active connected battery energy storage system."
                    : "Pure Grid-Tied PV system (No battery storage attached). Solar generation is directly consumed by on-site load or exported to the utility grid."}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">System Mode:</span>
                    <span className="font-semibold text-foreground font-mono">
                      {hasBattery ? "Hybrid Storage ESS" : "Grid-Tied (No ESS)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Power Flow:</span>
                    <span className="font-semibold text-foreground font-mono">
                      {hasBattery
                        ? (analyticsSummary.totalBatCharge && analyticsSummary.totalBatCharge > 0
                            ? `${analyticsSummary.totalBatCharge} kWh Charged`
                            : '0.0 kW (Standby)')
                        : 'N/A (Pure Grid-Tied)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Throughput:</span>
                    <span className="font-semibold text-cyan-400">
                      {hasBattery ? `${analyticsSummary.batteryCycles} Cycles/day` : '0.0 kWh (Direct Net Export)'}
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono truncate">
                Battery ESS
              </span>
              <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 shrink-0">
                <BatteryCharging className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold font-mono text-cyan-400 tracking-tight leading-none">
                {hasBattery ? (
                  <>
                    {analyticsSummary.currentSocPct.toFixed(1)}% <span className="text-[10px] text-muted-foreground font-normal">SOC</span>
                  </>
                ) : (
                  <>
                    N/A <span className="text-[10px] text-muted-foreground font-normal">Grid-Tied</span>
                  </>
                )}
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 3: Grid Balance & Feed-in */}
        <Card className="border-purple-500/30 bg-gradient-to-b from-purple-500/[0.04] to-card shadow-xs hover:border-purple-500/50 transition-colors">
          <HoverInfo
            className="flex flex-col justify-between gap-1.5 w-full h-full px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-help"
            title="Grid Net Balance"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.gridExchange}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Grid Export:</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.totalGridExportKwh.toFixed(1)} kWh</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Grid Imported:</span>
                    <span className="font-semibold text-rose-400">{analyticsSummary.totalGridImportKwh.toFixed(1)} kWh</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Net Status:</span>
                    <span className={`font-semibold ${analyticsSummary.netGridBalanceKwh >= 0 ? 'text-emerald-400' : 'text-purple-400'}`}>
                      {analyticsSummary.netGridBalanceKwh >= 0 ? 'Net Exporter (+)' : 'Net Importer (-)'}
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono truncate">
                Grid Exchange
              </span>
              <div className="p-1 rounded-md bg-purple-500/10 text-purple-400 shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold font-mono text-purple-400 tracking-tight leading-none">
                {analyticsSummary.netGridBalanceKwh >= 0 ? `+${analyticsSummary.netGridBalanceKwh.toFixed(1)}` : analyticsSummary.netGridBalanceKwh.toFixed(1)} <span className="text-[10px] text-muted-foreground font-normal">kWh</span>
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 4: Performance Ratio (PR) / Utilization */}
        <Card className="border-blue-500/30 bg-gradient-to-b from-blue-500/[0.04] to-card shadow-xs hover:border-blue-500/50 transition-colors">
          <HoverInfo
            className="flex flex-col justify-between gap-1.5 w-full h-full px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-help"
            title="Performance Ratio (PR) / Utilization"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.performanceRatio}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Benchmark:</span>
                    <span className="font-semibold text-foreground">&gt; 80.0% Optimal (IEC 61724)</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Plant Capacity:</span>
                    <span className="font-semibold text-blue-400">{effectiveCapacityKw} kWp</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={`font-semibold ${analyticsSummary.performanceRatioPct >= 80 ? 'text-emerald-400' : 'text-blue-400'}`}>
                      {analyticsSummary.performanceRatioPct >= 80 ? 'Optimal Performance' : 'Standard Yield'}
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono truncate">
                PR / Utilization
              </span>
              <div className="p-1 rounded-md bg-blue-500/10 text-blue-400 shrink-0">
                <Gauge className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold font-mono text-blue-400 tracking-tight leading-none">
                {analyticsSummary.performanceRatioPct.toFixed(1)}%
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 5: Inverter Efficiency */}
        <Card className="border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-card shadow-xs hover:border-emerald-500/50 transition-colors">
          <HoverInfo
            className="flex flex-col justify-between gap-1.5 w-full h-full px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-help"
            title="Inverter Efficiency"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.inverterEfficiency}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Conversion:</span>
                    <span className="font-semibold text-foreground">Dynamic European Weighted</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Conversion Loss:</span>
                    <span className="font-semibold text-emerald-400">{(100 - analyticsSummary.inverterEfficiencyPct).toFixed(1)}% (Low Loss)</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Loading:</span>
                    <span className="font-semibold text-foreground">
                      {analyticsSummary.peakSolarKw > 0
                        ? `${Math.min(100, Math.round((analyticsSummary.peakSolarKw / effectiveCapacityKw) * 100))}% Peak Load`
                        : 'Standby'}
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono truncate">
                Inverter Efficiency
              </span>
              <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 shrink-0">
                <Cpu className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400 tracking-tight leading-none">
                {analyticsSummary.inverterEfficiencyPct.toFixed(1)}%
              </div>
            </div>
          </HoverInfo>
        </Card>

        {/* KPI 6: PV Module Efficiency */}
        <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-card shadow-xs hover:border-amber-500/50 transition-colors">
          <HoverInfo
            className="flex flex-col justify-between gap-1.5 w-full h-full px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-help"
            title="PV Module Efficiency"
            content={
              <div className="space-y-1.5 min-w-[200px] text-[11px]">
                <p className="text-muted-foreground leading-snug">
                  {TELEMETRY_DESCRIPTIONS.analytics.pvModuleEfficiency}
                </p>
                <div className="pt-1.5 border-t border-border/50 space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Operating Spec:</span>
                    <span className="font-semibold text-foreground">NOCT Thermal Derated</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Nameplate STC:</span>
                    <span className="font-semibold text-amber-500">21.8% (25°C, 1000W/m²)</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Cell Tech:</span>
                    <span className="font-semibold text-foreground">Tier-1 Mono PERC</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-mono truncate">
                PV Module Efficiency
              </span>
              <div className="p-1 rounded-md bg-amber-500/10 text-amber-500 shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold font-mono text-amber-500 tracking-tight leading-none">
                {analyticsSummary.pvModuleEfficiencyPct.toFixed(1)}%
              </div>
            </div>
          </HoverInfo>
        </Card>
      </div>

      {/* Main Analytics Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Main High-Resolution Generation Profile Chart (8 Cols) */}
        <Card className="xl:col-span-8 border-border/70 shadow-sm flex flex-col justify-between min-w-0 overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <HoverInfo
                  title={`${selectedScopeTitle} · Diurnal Sampling`}
                  content={
                    <div className="space-y-1.5 text-[11px]">
                      <p>High-frequency 5-minute sampling of solar production, facility consumption, and storage flows.</p>
                      <div className="pt-1 border-t border-border/50 text-amber-400 font-mono font-medium">
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
                      </div>
                    </div>
                  }
                  showIcon
                >
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
                </HoverInfo>
              </div>

              {/* Stream filter toggles - Strictly 1x4 (on sm+) or 2x2 (on smaller), without clipping */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full sm:w-auto shrink-0">
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
                    className="w-full flex justify-center"
                  >
                    <button
                      onClick={() => setStreamFilter(filter.id as StreamFilter)}
                      className={`w-full px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all cursor-pointer whitespace-nowrap text-center justify-center ${
                        streamFilter === filter.id
                          ? 'bg-card border-primary/50 text-foreground font-semibold shadow-xs ring-1 ring-primary/20'
                          : 'bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-card/40'
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
            </div>
          </CardHeader>

          <CardContent className="pt-4 pb-2">
            <div className="h-[340px] sm:h-[380px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 850, height: 380 }}>
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
        <Card className="xl:col-span-4 border-border/70 shadow-sm flex flex-col justify-between min-w-0 overflow-hidden">
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
            <div className="h-[210px] w-full min-w-0 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 280, height: 210 }}>
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
        <Card className="lg:col-span-7 border-border/70 shadow-sm min-w-0 overflow-hidden">
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
              {selectedInverter && (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]">
                  Inverter: {selectedInverter.deviceSn}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            <div className="h-[290px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 290 }}>
                {timeRange === '12M' ? (
                  <BarChart key="hist-bar-12m" data={monthlyPoints12M} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    <Bar dataKey="solarYieldMwh" name="Solar Yield" fill={COLORS.solar} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="loadDemandMwh" name="Facility Demand" fill={COLORS.load} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="gridExportMwh" name="Grid Export" fill={COLORS.gridExport} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                ) : (
                  <BarChart
                    key="hist-bar-daily"
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
                    <Bar dataKey="solarYieldKwh" name="Solar Yield" fill={COLORS.solar} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="loadDemandKwh" name="Load Demand" fill={COLORS.load} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="gridExportKwh" name="Grid Export" fill={COLORS.gridExport} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Battery Storage Dynamics & Cycling Depth (Always rendered as ESS Dynamics, showing 0 / Standby when idle) */}
        <Card className="lg:col-span-5 border-border/70 shadow-sm flex flex-col justify-between min-w-0 overflow-hidden">
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
              {hasBattery && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 font-mono text-[10px]"
                  >
                    Lithium LFP
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            <div className="h-[290px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 450, height: 290 }}>
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
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="power"
                    type="monotone"
                    dataKey="batteryPowerKw"
                    name="Battery Flow (kW)"
                    stroke="#a855f7"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
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
                          <HoverInfo title="Tariff Structure" content="Time-of-Use electricity tariff tier (Peak ₱14.50/kWh vs Off-Peak ₱10.20/kWh).">
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
                                  <span className="text-purple-400 font-semibold">₱14.50/kWh (Peak)</span>
                                ) : (
                                  <span>₱10.20/kWh (Off-Peak)</span>
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

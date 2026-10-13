'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Sun,
  Zap,
  BatteryCharging,
  Building2,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  RotateCw,
  SlidersHorizontal,
  ShieldCheck,
  Power,
  RefreshCw,
  Globe,
  Layers,
  Radio,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Waves,
  Activity,
  Server,
  TrendingUp,
  CheckCircle2,
  ShieldAlert,
  LayoutGrid,
  List,
  Search,
  ArrowDown,
} from 'lucide-react';
import { StationSummary, AggregatedFleetSummary, FleetMatrixNode } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';
import { usePolling, useSafeTimeout } from '@/lib/usePolling';
import { createLogger } from '@/lib/logger';
import { telemetryCache } from '@/lib/telemetry-cache';
import { HoverInfo } from '@/components/ui/tooltip';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';

const log = createLogger('Dashboard');

export default function EnergyFlowDashboard() {
  const {
    accounts,
    selectedAccountId,
    isFleetView,
    selectedAccount,
    selectedStationId,
    setSelectedStationId,
    selectedPlant,
    totalAccounts,
    liveAccountsCount,
    isFetchingDeye,
    fetchingStage,
    setFetchingDeye,
    syncing,
    syncLivePlants,
    isPlantSwitching,
    switchingPlantName,
    setIsPlantSwitching,
  } = useAccount();
  const { isAdmin, user, setShowAuthModal } = useRole();

  const [station, setStation] = useState<StationSummary | null>(null);
  const [fleetAggregate, setFleetAggregate] = useState<AggregatedFleetSummary | null>(null);
  const [nodes, setNodes] = useState<FleetMatrixNode[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);
  const { setSafeTimeout } = useSafeTimeout();

  const [forceCharge, setForceCharge] = useState(false);
  const [exportLimiter, setExportLimiter] = useState(false);
  const [manualPolling, setManualPolling] = useState(false);
  const [mainTab, setMainTab] = useState<'synoptics' | 'compact-flow' | 'trigonometric'>('synoptics');
  const [compactSearchQuery, setCompactSearchQuery] = useState('');

  // Synchronize mainTab with URL query parameter (e.g. ?mode=vertical)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode') || params.get('view') || params.get('tab');
      if (mode === 'vertical' || mode === 'compact' || mode === 'compact-flow') {
        setMainTab('compact-flow');
      } else if (mode === 'trig' || mode === 'trigonometric') {
        setMainTab('trigonometric');
      }
    }
  }, []);

  const handleTabChange = useCallback((newTab: 'synoptics' | 'compact-flow' | 'trigonometric') => {
    setMainTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newTab === 'compact-flow') {
        url.searchParams.set('mode', 'vertical');
      } else if (newTab === 'trigonometric') {
        url.searchParams.set('mode', 'trig');
      } else {
        url.searchParams.delete('mode');
        url.searchParams.delete('view');
        url.searchParams.delete('tab');
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const currentTargetKey = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}`;
  const [displayedTargetKey, setDisplayedTargetKey] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const inFlightControllerRef = useRef<AbortController | null>(null);

  // Instantly restore cached plant telemetry (0ms instant switch)
  useEffect(() => {
    const cached = telemetryCache.get<{
      station: StationSummary | null;
      fleetAggregate: AggregatedFleetSummary | null;
      nodes: FleetMatrixNode[];
      isLive: boolean;
    }>(currentTargetKey);

    if (cached) {
      if (isFleetView) {
        if (cached.fleetAggregate) setFleetAggregate(cached.fleetAggregate);
      } else {
        if (cached.station) setStation(cached.station);
      }
      if (cached.nodes && cached.nodes.length > 0) {
        setNodes(cached.nodes);
      }
      setIsLive(cached.isLive);
      setDisplayedTargetKey(currentTargetKey);
      setIsDataLoaded(true);
      setIsPlantSwitching(false);
    }
  }, [currentTargetKey, isFleetView, setIsPlantSwitching]);

  const fetchTelemetry = useCallback(async (forceReload: boolean = false) => {
    // If target is already loaded and request is running for the same target, skip duplicate polling
    if (inFlightControllerRef.current) {
      if (!forceReload && currentTargetKey === displayedTargetKey) {
        return;
      }
      // Target changed or forced reload: abort stale in-flight request immediately
      inFlightControllerRef.current.abort();
    }

    const controller = new AbortController();
    inFlightControllerRef.current = controller;
    const targetKeyAtStart = currentTargetKey;

    try {
      if (isFleetView) {
        const res = await fetch('/api/deye/aggregate', { signal: controller.signal });
        if (res.ok) {
          const json: AggregatedFleetSummary = await res.json();
          if (controller.signal.aborted) return;
          setFleetAggregate(json);
          setNodes(json.nodes || []);
          setIsLive(json.isLive);
          setDisplayedTargetKey(targetKeyAtStart);
          setIsDataLoaded(true);
          telemetryCache.set(targetKeyAtStart, {
            station: null,
            fleetAggregate: json,
            nodes: json.nodes || [],
            isLive: json.isLive,
          });
        }
      } else {
        const stationParam =
          selectedStationId !== 'ALL'
            ? `&station_id=${encodeURIComponent(selectedStationId)}`
            : '';
        const res = await fetch(
          `/api/deye/station?accountId=${encodeURIComponent(selectedAccountId)}${stationParam}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json = await res.json();
          if (controller.signal.aborted) return;
          setStation(json.data);
          setIsLive(json.isLive);

          let currentStationNodes: FleetMatrixNode[] = [];

          if (selectedAccount?.plants && selectedAccount.plants.length > 0) {
            const targetPlants =
              selectedStationId !== 'ALL'
                ? selectedAccount.plants.filter((p) => p.stationId === selectedStationId)
                : selectedAccount.plants;

            for (const plant of targetPlants) {
              const inverters = plant.devices.filter((d) => d.deviceType === 'INVERTER');
              const loggers = plant.devices.filter((d) => d.deviceType === 'LOGGER');

              const plantSummary = json.data?.plantsSummary?.find(
                (ps: { stationId?: string | number; liveSolarPowerKw?: number; dailyYieldKwh?: number; gridPowerKw?: number; loadPowerKw?: number; batterySoc?: number }) =>
                  String(ps.stationId) === String(plant.stationId)
              );

              const plantSolarKw = plantSummary
                ? plantSummary.liveSolarPowerKw
                : targetPlants.length === 1
                ? (json.data?.liveSolarPowerKw || 0)
                : ((plant.installedCapacityKw || 100) / (selectedAccount.capacityKw || 100)) * (json.data?.liveSolarPowerKw || 0);

              const plantDailyKwh = plantSummary
                ? plantSummary.dailyYieldKwh
                : targetPlants.length === 1
                ? (json.data?.dailyYieldKwh || 0)
                : ((plant.installedCapacityKw || 100) / (selectedAccount.capacityKw || 100)) * (json.data?.dailyYieldKwh || 0);

              const plantGridKw = plantSummary
                ? plantSummary.gridPowerKw
                : (json.data?.gridPowerKw || 0);

              const plantLoadKw = plantSummary
                ? plantSummary.loadPowerKw
                : (json.data?.loadPowerKw || 0);

              const plantBatterySoc = plantSummary
                ? plantSummary.batterySoc
                : (json.data?.batterySoc || 0);

              const kwPerInv = plantSolarKw / (inverters.length || 1);
              const dailyYieldPerInv = plantDailyKwh / (inverters.length || 1);

              for (let i = 0; i < inverters.length; i++) {
                const device = inverters[i];
                const matchingLogger =
                  loggers.find((l) => l.deviceSn === device.loggerSn) ||
                  loggers[i] ||
                  loggers[0];

                currentStationNodes.push({
                  accountId: selectedAccountId,
                  accountName: selectedAccount.name,
                  stationName: plant.stationName,
                  stationId: plant.stationId,
                  deviceSn: device.deviceSn,
                  deviceType: 'INVERTER',
                  model: device.model || 'Deye Inverter',
                  ratedKw: device.ratedKw || 50,
                  loggerSn: device.loggerSn || matchingLogger?.deviceSn,
                  loggerStatus: matchingLogger?.status || (plantSummary?.status === 'ONLINE' ? 'ONLINE' : 'ONLINE'),
                  liveSolarPowerKw: kwPerInv,
                  dailyYieldKwh: dailyYieldPerInv,
                  gridPowerKw: plantGridKw,
                  consumptionPowerKw: plantLoadKw,
                  batterySoc: plantBatterySoc,
                  mode: 'PEAK SHAVING',
                  status: (plantSummary?.status === 'ONLINE' || device.status === 'ONLINE') ? 'ONLINE' : 'STANDBY',
                  isLive: json.isLive,
                });
              }
            }
            setNodes(currentStationNodes);
          } else if (json.data) {
            currentStationNodes = [
              {
                accountId: selectedAccountId,
                accountName: selectedAccount?.name || 'Selected Site',
                stationName: json.data.name,
                stationId: json.data.stationId,
                deviceSn: json.deviceSn || '2408124366',
                deviceType: 'INVERTER',
                model: 'SUN-120K-SG01HP3-EU-AM2',
                liveSolarPowerKw: json.data.liveSolarPowerKw,
                batterySoc: json.data.batterySoc,
                mode: 'PEAK SHAVING',
                status: json.data.status === 'ONLINE' ? 'ONLINE' : 'FAULT',
                isLive: json.isLive,
              },
            ];
            setNodes(currentStationNodes);
          }

          setDisplayedTargetKey(targetKeyAtStart);
          setIsDataLoaded(true);
          telemetryCache.set(targetKeyAtStart, {
            station: json.data,
            fleetAggregate: null,
            nodes: currentStationNodes,
            isLive: json.isLive,
          });
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        log.error('Error fetching telemetry', e);
      }
    } finally {
      if (!controller.signal.aborted) {
        inFlightControllerRef.current = null;
        setLoading(false);
        setIsPlantSwitching(false);
        setFetchingDeye(false, null);
      }
    }
  }, [isFleetView, selectedAccountId, selectedStationId, selectedAccount, currentTargetKey, displayedTargetKey, setIsPlantSwitching, setFetchingDeye]);

  useEffect(() => {
    fetchTelemetry(true);
  }, [currentTargetKey, fetchTelemetry]);

  usePolling(() => fetchTelemetry(false), {
    intervalMs: 3500,
    enabled: true,
    pauseOnHidden: true,
  });

  const triggerManualPoll = async () => {
    setManualPolling(true);
    setFetchingDeye(true, isFleetView ? 'Polling DeyeCloud Fleet Telemetry...' : 'Polling Station Telemetry...');
    await fetchTelemetry(true);
    setManualPolling(false);
    setFetchingDeye(false, null);
  };

  const handleSyncLivePlants = async () => {
    setIsDataLoaded(false);
    setDisplayedTargetKey('');
    await syncLivePlants();
    await fetchTelemetry(true);
  };

  // Compute live values depending on fleet vs single-account view
  const solarKw = isFleetView
    ? fleetAggregate?.totalSolarPowerKw ?? 0
    : station?.liveSolarPowerKw ?? 0;

  const loadKw = isFleetView
    ? fleetAggregate?.totalLoadPowerKw ?? 0
    : station?.loadPowerKw ?? 0;

  const batterySoc = isFleetView
    ? fleetAggregate?.avgBatterySoc ?? 0
    : station?.batterySoc ?? 0;

  const batteryKw = isFleetView
    ? fleetAggregate?.totalBatteryPowerKw ?? 0
    : station?.batteryPowerKw ?? 0;

  const gridKw = isFleetView
    ? fleetAggregate?.netGridPowerKw ?? 0
    : station?.gridPowerKw ?? 0;

  const totalCapacity = isFleetView
    ? fleetAggregate?.totalCapacityKw ?? 0
    : selectedPlant
    ? selectedPlant.installedCapacityKw
    : station?.capacityKw ?? (selectedAccount?.capacityKw ?? 0);

  const dailyYield = isFleetView
    ? fleetAggregate?.totalDailyYieldKwh ?? 0
    : station?.dailyYieldKwh ?? 0;

  const capacityUtilizationPct =
    totalCapacity > 0 ? ((dailyYield / totalCapacity) * 100).toFixed(0) : '0';

  const accountPlantsCount = selectedAccount?.plants?.length ?? 0;
  const totalFleetPlantsCount = React.useMemo(
    () => accounts.reduce((sum, a) => sum + (a.plants?.length || 0), 0),
    [accounts]
  );
  const hasNoPlants = isFleetView ? totalFleetPlantsCount === 0 : accountPlantsCount === 0;
  const isSyncingNoPlants = hasNoPlants && (loading || isFetchingDeye || syncing || manualPolling);

  const isTargetPending = currentTargetKey !== displayedTargetKey || !isDataLoaded;
  const isReloadingPlant = isPlantSwitching || isTargetPending;
  const showFullReloadOverlay = isReloadingPlant || isSyncingNoPlants || syncing || (isTargetPending && loading);
  const isDataPlacementLoading = isReloadingPlant || isSyncingNoPlants || syncing;

  // Group inverter nodes by plant / station
  const plantGroups = React.useMemo(() => {
    const map = new Map<
      string,
      {
        stationId: string;
        stationName: string;
        accountId: string;
        accountName: string;
        nodes: FleetMatrixNode[];
        totalLiveSolarKw: number;
        totalDailyYieldKwh: number;
        totalRatedKw: number;
        onlineCount: number;
      }
    >();

    for (const node of nodes) {
      const key = `${node.accountId || 'acc'}-${node.stationId || node.stationName || 'unknown'}`;
      if (!map.has(key)) {
        map.set(key, {
          stationId: String(node.stationId || ''),
          stationName: node.stationName || 'Unknown Station',
          accountId: node.accountId || '',
          accountName: node.accountName || 'Unknown Account',
          nodes: [],
          totalLiveSolarKw: 0,
          totalDailyYieldKwh: 0,
          totalRatedKw: 0,
          onlineCount: 0,
        });
      }
      const group = map.get(key)!;
      group.nodes.push(node);
      group.totalLiveSolarKw += node.liveSolarPowerKw || 0;
      group.totalDailyYieldKwh += node.dailyYieldKwh || 0;
      group.totalRatedKw += node.ratedKw || 0;
      if (node.status === 'ONLINE' || node.isLive) {
        group.onlineCount += 1;
      }
    }

    return Array.from(map.values());
  }, [nodes]);

  const filteredPlantGroups = React.useMemo(() => {
    if (!compactSearchQuery.trim()) return plantGroups;
    const q = compactSearchQuery.toLowerCase();
    return plantGroups
      .map((group) => {
        const matchingNodes = group.nodes.filter(
          (n) =>
            n.deviceSn.toLowerCase().includes(q) ||
            (n.model && n.model.toLowerCase().includes(q)) ||
            (n.stationName && n.stationName.toLowerCase().includes(q)) ||
            (n.accountName && n.accountName.toLowerCase().includes(q)) ||
            (n.loggerSn && n.loggerSn.toLowerCase().includes(q))
        );
        if (
          matchingNodes.length === 0 &&
          !group.stationName.toLowerCase().includes(q) &&
          !group.accountName.toLowerCase().includes(q)
        ) {
          return null;
        }
        return {
          ...group,
          nodes: matchingNodes.length > 0 ? matchingNodes : group.nodes,
        };
      })
      .filter(Boolean) as typeof plantGroups;
  }, [plantGroups, compactSearchQuery]);

  const [collapsedPlantKeys, setCollapsedPlantKeys] = useState<Record<string, boolean>>({});
  const [inverterViewMode, setInverterViewMode] = useState<'table' | 'cards'>('table');

  const togglePlantGroup = (key: string) => {
    setCollapsedPlantKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const collapseAllPlants = () => {
    const updated: Record<string, boolean> = {};
    for (const g of plantGroups) {
      const key = `${g.accountId}-${g.stationId || g.stationName}`;
      updated[key] = true;
    }
    setCollapsedPlantKeys(updated);
  };

  const expandAllPlants = () => {
    setCollapsedPlantKeys({});
  };

  return (
    <div className="relative w-full max-w-[1600px] mx-auto pb-12">
      {/* Full Dashboard Frosted Overlay when switching plants or syncing with 0 data / 0 plants */}
      {showFullReloadOverlay && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all animate-in fade-in duration-200">
          <div className="bg-card/95 border border-primary/30 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div
                className="absolute w-8 h-8 rounded-full border-2 border-emerald-500/20 border-b-emerald-500 animate-spin"
                style={{ animationDirection: 'reverse' }}
              />
              <Zap className="h-5 w-5 text-amber-500 absolute animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono uppercase tracking-wider font-bold mb-1.5">
                <RefreshCw size={10} className="animate-spin" />
                <span>
                  {isSyncingNoPlants
                    ? 'Discovering Solar Plants...'
                    : 'Station Re-Sync in Progress'}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground uppercase tracking-wider font-headline">
                {isReloadingPlant
                  ? `Syncing ${switchingPlantName || selectedPlant?.stationName || 'Plant'} Telemetry`
                  : isSyncingNoPlants
                  ? fetchingStage || (selectedAccount ? `Scanning Plants for ${selectedAccount.name}...` : 'Syncing Solar Plants & Gateways...')
                  : fetchingStage || (isFleetView ? 'Synchronizing Fleet Telemetry...' : 'Fetching DeyeCloud Telemetry...')}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isSyncingNoPlants
                  ? 'Querying DeyeCloud API gateway & Directus to discover registered stations and inverters...'
                  : isReloadingPlant
                  ? 'Connecting to DeyeCloud API gateway & refreshing live inverter telemetry...'
                  : 'Connecting to DeyeCloud API gateway & compiling live inverter matrix'}
              </p>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 h-full w-full animate-pulse" />
            </div>
            <div className="flex items-center justify-between w-full text-[11px] font-mono text-muted-foreground border-t border-border/40 pt-3">
              <span>{isFleetView ? `${totalAccounts} Accounts Configured` : selectedAccount?.name || 'Solar Gateway Node'}</span>
              <span className="font-semibold text-primary">
                {hasNoPlants ? 'Awaiting Station Discovery' : selectedPlant ? `${selectedPlant.installedCapacityKw} kWp` : `${totalCapacity.toFixed(0)} kWp`}
              </span>
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex flex-col gap-6 w-full transition-all duration-300 ${
          showFullReloadOverlay ? 'opacity-40 filter grayscale-[25%] pointer-events-none select-none' : ''
        }`}
      >
        {/* Top Command Banner with VOS Design Standards */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <HoverInfo
              title="Energy Synoptics Loop"
              content={
                isFleetView
                  ? `Real-time multi-site energy flow across ${totalAccounts} configured DeyeCloud accounts.`
                  : selectedPlant
                  ? `Real-time hybrid inverter loop for ${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp).`
                  : `Real-time aggregated telemetry across all ${selectedAccount?.plants?.length || 1} plants (${totalCapacity.toFixed(0)} kWp total capacity).`
              }
              showIcon
            >
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-headline cursor-help">
                {isFleetView
                  ? 'Fleet Energy Synoptics'
                  : selectedPlant
                  ? `${selectedPlant.stationName} Synoptics`
                  : `${selectedAccount?.name || 'Selected Site'} Synoptics`}
              </h1>
            </HoverInfo>
            <Badge
              variant="outline"
              className="h-5 px-2 text-[10px] font-black uppercase tracking-widest border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
            >
              {isFleetView ? 'Multi-Account Bus' : selectedStationId === 'ALL' ? `All ${selectedAccount?.plants?.length || 1} Plants Bus` : 'Hybrid Plant'}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Switcher: Synoptic Flow vs Vertical Flow & Fleet */}
          <div className="flex items-center bg-card/80 border border-border/70 rounded-xl p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => handleTabChange('synoptics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                mainTab === 'synoptics'
                  ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Switch to Synoptic Circular Flow View"
            >
              <Zap size={13} className={mainTab === 'synoptics' ? 'text-primary-foreground' : 'text-amber-500'} />
              <span>Synoptic Flow</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('compact-flow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                mainTab === 'compact-flow'
                  ? 'bg-emerald-500 text-black font-bold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Switch to Vertical Stacked Flow & Inverter Matrix"
            >
              <LayoutGrid size={13} className={mainTab === 'compact-flow' ? 'text-black' : 'text-emerald-500'} />
              <span>Vertical Flow & Fleet</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={triggerManualPoll}
            disabled={manualPolling}
            className="gap-2 h-8 text-xs font-semibold"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${manualPolling ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
            />
            <span>{isFleetView ? 'Poll Fleet' : 'Poll Node'}</span>
          </Button>

          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border ${
              isLive
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                : 'bg-primary/10 text-primary border-primary/30'
            }`}
          >
            {isLive ? '● Live DeyeCloud' : '● Simulation / Synced'}
          </span>
        </div>
      </div>

      {/* Unauthenticated Security Alert Banner */}
      {!user && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 px-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-500 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} className="shrink-0" />
            <span>
              Authentication is required to stream live fleet telemetry. Sign in with your <strong>Admin PIN (8888)</strong> or account to populate live power and daily yield.
            </span>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowAuthModal(true)}
            className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10 shrink-0 font-bold"
          >
            Sign In Now
          </Button>
        </div>
      )}

      {/* Dynamic Plant Switcher Bar (Collapsible or No Plants Discovered state) */}
      {!isFleetView && selectedAccount && (selectedAccount.plants?.length || 0) === 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 px-4 bg-card/70 rounded-xl border border-dashed border-border/70 transition-all shadow-2xs">
          <div className="flex items-center gap-2.5 text-xs truncate">
            <Building2 size={15} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground font-mono uppercase tracking-wider text-[11px]">Plants:</span>
            <span className="font-semibold text-foreground truncate">
              {isSyncingNoPlants ? 'Scanning DeyeCloud for registered plants...' : `No solar plants discovered yet for ${selectedAccount.name}`}
            </span>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={handleSyncLivePlants}
            disabled={syncing || isFetchingDeye}
            className="gap-1.5 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/10"
          >
            <RefreshCw size={12} className={syncing || isFetchingDeye ? 'animate-spin text-primary' : ''} />
            <span>{syncing || isFetchingDeye ? 'Syncing Deye...' : 'Sync Live Plants'}</span>
          </Button>
        </div>
      )}

      {/* Fleet View Zero Plants Discovered State */}
      {isFleetView && totalFleetPlantsCount === 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 px-4 bg-card/70 rounded-xl border border-dashed border-border/70 transition-all shadow-2xs">
          <div className="flex items-center gap-2.5 text-xs truncate">
            <Globe size={15} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground font-mono uppercase tracking-wider text-[11px]">Fleet Plants:</span>
            <span className="font-semibold text-foreground truncate">
              {isSyncingNoPlants ? 'Scanning DeyeCloud across all configured accounts...' : 'No solar plants discovered across configured accounts'}
            </span>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={handleSyncLivePlants}
            disabled={syncing || isFetchingDeye}
            className="gap-1.5 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/10"
          >
            <RefreshCw size={12} className={syncing || isFetchingDeye ? 'animate-spin text-primary' : ''} />
            <span>{syncing || isFetchingDeye ? 'Syncing Fleet...' : 'Sync Live Plants'}</span>
          </Button>
        </div>
      )}



      {/* 5 Primary Telemetry Summary Cards in VOS KPI Format */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 w-full">
        {/* PV Live Yield */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-amber-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <HoverInfo
              title={isFleetView ? 'Total PV Harvest' : 'Live Solar Generation'}
              content={TELEMETRY_DESCRIPTIONS.energyFlow.solarNode}
              showIcon
            >
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono cursor-help">
                {isFleetView ? 'Total PV Harvest' : 'PV Live Harvest'}
              </CardTitle>
            </HoverInfo>
            <div className="flex items-center gap-1.5">
              {isDataPlacementLoading && (
                <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-amber-500 animate-pulse bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  <RefreshCw size={8} className="animate-spin" />
                  Syncing
                </span>
              )}
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Sun className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isDataPlacementLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-8 w-28 bg-amber-500/20" />
                <Skeleton className="h-4 w-36 bg-muted/60" />
              </div>
            ) : (
              <>
                <HoverInfo
                  title="Instantaneous Solar PV Power"
                  content={TELEMETRY_DESCRIPTIONS.analytics.solarYield}
                >
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-amber-500 font-mono cursor-help">
                    {solarKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
                  </div>
                </HoverInfo>
                <div className="flex items-center justify-between gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
                  <HoverInfo
                    title="Cumulative Daily Harvest"
                    content="Total electrical energy harvested from sunrise until current minute."
                  >
                    <div className="flex items-center gap-1.5 truncate cursor-help">
                      <TrendingUp className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="truncate">Daily: {dailyYield.toFixed(1)} kWh ({totalCapacity.toFixed(0)} kWp)</span>
                    </div>
                  </HoverInfo>
                  {totalCapacity > 0 && (
                    <HoverInfo
                      title="Array Capacity Utilization"
                      content="Percentage of peak installed nameplate DC capacity currently being generated."
                    >
                      <span className="text-[10px] font-mono font-bold text-amber-500 shrink-0 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 cursor-help">
                        {capacityUtilizationPct}% util
                      </span>
                    </HoverInfo>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Battery Storage */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-cyan-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <HoverInfo
              title={isFleetView ? 'Fleet ESS Storage' : 'Battery Storage ESS'}
              content={TELEMETRY_DESCRIPTIONS.energyFlow.batteryNode}
              showIcon
            >
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono cursor-help">
                {isFleetView ? 'Fleet ESS Storage' : 'Battery Storage'}
              </CardTitle>
            </HoverInfo>
            <div className="flex items-center gap-1.5">
              {isDataPlacementLoading && (
                <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-cyan-500 animate-pulse bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                  <RefreshCw size={8} className="animate-spin" />
                  Syncing
                </span>
              )}
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                <BatteryCharging className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isDataPlacementLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-8 w-28 bg-cyan-500/20" />
                <Skeleton className="h-4 w-32 bg-muted/60" />
              </div>
            ) : (
              <>
                <HoverInfo
                  title="Battery State of Charge"
                  content={batterySoc > 0 ? "Battery capacity available for backup or peak shaving." : TELEMETRY_DESCRIPTIONS.analytics.futureEss}
                >
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-cyan-500 font-mono cursor-help">
                    {batterySoc > 0 ? (
                      <>
                        {batterySoc.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">% SOC</span>
                      </>
                    ) : (
                      <span className="text-lg sm:text-xl text-cyan-400 font-bold">Not Installed</span>
                    )}
                  </div>
                </HoverInfo>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
                  <Activity className="h-3 w-3 text-cyan-500" />
                  {batterySoc > 0 || Math.abs(batteryKw) > 0.05 ? (
                    <span>Flow: {batteryKw >= 0 ? `+${batteryKw.toFixed(1)}` : batteryKw.toFixed(1)} kW</span>
                  ) : (
                    <HoverInfo
                      title="Plug-and-Play Future ESS"
                      content={TELEMETRY_DESCRIPTIONS.analytics.futureEss}
                    >
                      <span className="text-emerald-400 font-medium flex items-center gap-1 font-mono text-[11px] cursor-help">
                        <CheckCircle2 size={12} /> Future ESS Ready
                      </span>
                    </HoverInfo>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Facility Load */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-indigo-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <HoverInfo
              title={isFleetView ? 'Total Facility Load' : 'Industrial Facility Demand'}
              content={TELEMETRY_DESCRIPTIONS.energyFlow.loadNode}
              showIcon
            >
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono cursor-help">
                {isFleetView ? 'Total Facility Load' : 'Facility Demand'}
              </CardTitle>
            </HoverInfo>
            <div className="flex items-center gap-1.5">
              {isDataPlacementLoading && (
                <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-indigo-500 animate-pulse bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                  <RefreshCw size={8} className="animate-spin" />
                  Syncing
                </span>
              )}
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isDataPlacementLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-8 w-28 bg-indigo-500/20" />
                <Skeleton className="h-4 w-32 bg-muted/60" />
              </div>
            ) : (
              <>
                <HoverInfo
                  title="Active Electrical Power Load"
                  content={TELEMETRY_DESCRIPTIONS.analytics.loadDemand}
                >
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono cursor-help">
                    {loadKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
                  </div>
                </HoverInfo>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-500 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  <HoverInfo
                    title="Self-Powered Autarky"
                    content="Solar production is currently sufficient to power operations without blackouts."
                  >
                    <span className="cursor-help">100% Self-Powered Bus</span>
                  </HoverInfo>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Grid Interconnection */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <HoverInfo
              title={isFleetView ? 'Net Grid Dispatch' : 'Utility Grid Interconnect'}
              content={TELEMETRY_DESCRIPTIONS.energyFlow.gridNode}
              showIcon
            >
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono cursor-help">
                {isFleetView ? 'Net Grid Dispatch' : 'Grid Interconnect'}
              </CardTitle>
            </HoverInfo>
            <div className="flex items-center gap-1.5">
              {isDataPlacementLoading && (
                <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-500 animate-pulse bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  <RefreshCw size={8} className="animate-spin" />
                  Syncing
                </span>
              )}
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Zap className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isDataPlacementLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-8 w-28 bg-emerald-500/20" />
                <Skeleton className="h-4 w-32 bg-muted/60" />
              </div>
            ) : (
              <>
                <HoverInfo
                  title="Net Utility Exchange Rate"
                  content={TELEMETRY_DESCRIPTIONS.analytics.gridExchange}
                >
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-500 font-mono cursor-help">
                    {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
                  </div>
                </HoverInfo>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
                  <Radio className="h-3 w-3 text-emerald-500" />
                  <HoverInfo
                    title="Grid Phase Lock"
                    content="Inverter phase-locked loop (PLL) synchronized with utility grid voltage and 60Hz frequency."
                  >
                    <span className="cursor-help">Synced @ 60.01 Hz (0.02°)</span>
                  </HoverInfo>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Fleet Hardware Health */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-all col-span-2 sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <HoverInfo
              title={isFleetView ? 'Connected Sites' : 'Hardware Operating Health'}
              content={TELEMETRY_DESCRIPTIONS.energyFlow.fleetMatrix}
              showIcon
            >
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono cursor-help">
                {isFleetView ? 'Connected Sites' : 'Hardware Health'}
              </CardTitle>
            </HoverInfo>
            <div className="flex items-center gap-1.5">
              {isDataPlacementLoading && (
                <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-primary animate-pulse bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                  <RefreshCw size={8} className="animate-spin" />
                  Syncing
                </span>
              )}
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Cpu className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isDataPlacementLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-8 w-20 bg-primary/20" />
                <Skeleton className="h-4 w-32 bg-muted/60" />
              </div>
            ) : (
              <>
                <HoverInfo
                  title="Operating Inverters"
                  content="Online hardware communication status across all discovered dataloggers."
                >
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-primary font-mono cursor-help">
                    {isFleetView ? totalAccounts : '100'} <span className="text-xs text-muted-foreground font-normal">{isFleetView ? 'Accounts' : '%'}</span>
                  </div>
                </HoverInfo>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-500 font-medium">
                  <ShieldCheck className="h-3 w-3" />
                  <HoverInfo
                    title="Active Inverters"
                    content="Number of inverter telemetry nodes reporting telemetry."
                  >
                    <span className="cursor-help">{nodes.length} Inverter Nodes Active</span>
                  </HoverInfo>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Subsystem View Switcher (Synoptic Flow vs Compact Vertical vs Trigonometric) */}
      <Tabs value={mainTab} onValueChange={(v) => handleTabChange(v as 'synoptics' | 'compact-flow' | 'trigonometric')} className="w-full space-y-6">
        <TabsList className="bg-muted/60 p-1 rounded-xl h-auto border border-border/50 gap-1 inline-flex w-fit max-w-full overflow-x-auto">
          <TabsTrigger
            value="synoptics"
            className="gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
          >
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Real-time Synoptic Power Flow</span>
          </TabsTrigger>

          <TabsTrigger
            value="compact-flow"
            className="gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all data-[state=active]:text-emerald-500"
          >
            <LayoutGrid className="h-4 w-4 text-emerald-500" />
            <span>Vertical Flow & Fleet</span>
          </TabsTrigger>

          <TabsTrigger
            value="trigonometric"
            className="gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
          >
            <Waves className="h-4 w-4 text-cyan-500" />
            <span>Trigonometric & Harmonic Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: REAL-TIME SYNOPTIC POWER FLOW                         */}
        {/* ============================================================ */}
        <TabsContent value="synoptics" className="space-y-6 m-0">
          <Card className="border-border/60 bg-card/80 p-6 lg:p-8 shadow-sm relative overflow-hidden">
            {/* In-place synoptics reload veil during plant switching or syncing */}
            {isDataPlacementLoading && (
              <div className="absolute inset-0 z-30 bg-background/65 backdrop-blur-xs flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="relative flex items-center justify-center mb-3">
                  <div className="w-12 h-12 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute w-7 h-7 rounded-full border-2 border-amber-500/20 border-b-amber-500 animate-spin" style={{ animationDirection: 'reverse' }} />
                  <Zap className="h-4 w-4 text-amber-500 absolute" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground font-headline">
                  Syncing Synoptics for {switchingPlantName || selectedPlant?.stationName || (hasNoPlants ? 'Solar Plant' : 'Selected Plant')}...
                </span>
                <span className="text-[11px] text-muted-foreground font-mono mt-1 text-center">
                  Recalibrating real-time PV generation, ESS battery flow & grid telemetry
                </span>
              </div>
            )}

            {/* Header & Interactive Control Toggles */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Cpu size={18} />
                </div>
                <div>
                  <HoverInfo
                    title="Energy Flow Architecture"
                    content="Dynamic balance between PV harvest, battery storage, facility load, and grid interconnect."
                    showIcon
                  >
                    <h2 className="text-base sm:text-lg font-bold text-foreground cursor-help">
                      {isFleetView
                        ? 'Multi-Site Aggregated Energy Flow Architecture'
                        : selectedPlant
                        ? `Energy Flow · ${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`
                        : `Energy Flow · ${selectedAccount?.name || 'Inverter Hub'}`}
                    </h2>
                  </HoverInfo>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant={forceCharge ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setForceCharge(!forceCharge)}
                  className={`gap-1.5 text-xs font-semibold ${
                    forceCharge ? 'bg-cyan-500 hover:bg-cyan-600 text-white' : ''
                  }`}
                >
                  <BatteryCharging size={14} />
                  <span>Force Grid Charge</span>
                </Button>

                <Button
                  variant={exportLimiter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportLimiter(!exportLimiter)}
                  className={`gap-1.5 text-xs font-semibold ${
                    exportLimiter ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  <span>Zero-Export Limiter</span>
                </Button>
              </div>
            </div>

            {/* Synoptic Power Flow Architectural Diagram */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center py-6">
              {/* Left: Solar PV Array */}
              <HoverInfo
                title={isFleetView ? 'Combined PV Generation' : 'Solar PV Array'}
                content={TELEMETRY_DESCRIPTIONS.energyFlow.solarNode}
                side="bottom"
              >
                <div className="flex flex-col items-center cursor-help">
                  <div className="w-56 p-5 bg-card rounded-2xl border-2 border-amber-500/50 shadow-md flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-2">
                      <Sun size={26} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                      {isFleetView ? 'Combined PV Generation' : 'Solar PV Array'}
                    </span>
                    <span className="font-mono text-2xl text-amber-500 font-bold my-1">
                      {solarKw.toFixed(1)} kW
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {totalCapacity.toFixed(0)} kWp Nameplate
                    </span>
                  </div>
                </div>
              </HoverInfo>

              {/* Center: Core Hybrid Inverter Hub */}
              <HoverInfo
                title="Deye Smart Hybrid Inverter Hub"
                content={TELEMETRY_DESCRIPTIONS.energyFlow.inverterNode}
                side="bottom"
              >
                <div className="flex flex-col items-center cursor-help">
                  <div className="w-72 p-6 bg-card rounded-3xl border-2 border-cyan-500/60 shadow-lg flex flex-col items-center text-center relative">
                    <div className="absolute -top-3 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
                      {isFleetView ? 'Multi-Site Hub' : selectedPlant ? 'Plant Hybrid Hub' : 'Core Hybrid Inverter'}
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2 mt-1">
                      <Cpu size={32} />
                    </div>
                    <span className="text-base font-bold text-foreground">
                      {isFleetView
                        ? 'Deye Multi-Account Fleet'
                        : selectedPlant
                        ? selectedPlant.stationName
                        : 'Deye Hybrid Inverter'}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {isFleetView
                        ? `${totalAccounts} Accounts · ${nodes.length} Inverters`
                        : selectedPlant
                        ? `Station ID: ${selectedPlant.stationId}`
                        : `SN: ${nodes[0]?.deviceSn || '2209X891104'}`}
                    </span>
                    <div className="w-full grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border/60">
                      <div className="bg-muted/40 p-2 rounded-xl border border-border/40">
                        <span className="text-[10px] text-muted-foreground block font-mono">
                          Inverter Eff.
                        </span>
                        <span className="font-mono text-sm text-emerald-500 font-bold">
                          98.4%
                        </span>
                      </div>
                      <div className="bg-muted/40 p-2 rounded-xl border border-border/40">
                        <span className="text-[10px] text-muted-foreground block font-mono">
                          {isFleetView ? 'Active Sites' : 'Core Temp'}
                        </span>
                        <span className="font-mono text-sm text-foreground font-bold">
                          {isFleetView ? `${totalAccounts} Sites` : '46.8°C'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </HoverInfo>

              {/* Right: 3 Output Sinks (Battery, Demand, Grid) */}
              <div className="flex flex-col gap-3">
                {/* Battery ESS Node */}
                <HoverInfo
                  title="Storage Battery (ESS)"
                  content={batterySoc > 0 ? "Active LiFePO4 battery energy storage bank." : TELEMETRY_DESCRIPTIONS.energyFlow.batteryNode}
                  side="left"
                >
                  <div className="p-3.5 bg-card rounded-2xl border border-cyan-500/40 flex items-center justify-between shadow-2xs cursor-help">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                        <BatteryCharging size={20} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {isFleetView ? 'Combined Battery Fleet' : 'Storage Battery (ESS)'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {batterySoc > 0
                            ? `${batterySoc.toFixed(1)}% SOC · LiFePO4`
                            : 'Not Installed · ESS Expansion Ready'}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-cyan-500 font-bold ml-4">
                      {batterySoc > 0 || Math.abs(batteryKw) > 0.05
                        ? `${batteryKw >= 0 ? `+${batteryKw.toFixed(1)}` : batteryKw.toFixed(1)} kW`
                        : 'Standby'}
                    </span>
                  </div>
                </HoverInfo>

                {/* Facility Demand Node */}
                <HoverInfo
                  title="Industrial Facility Consumption"
                  content={TELEMETRY_DESCRIPTIONS.energyFlow.loadNode}
                  side="left"
                >
                  <div className="p-3.5 bg-card rounded-2xl border border-border/60 flex items-center justify-between shadow-2xs cursor-help">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {isFleetView ? 'Total Facility Demand' : 'Industrial Facility Load'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Machine Lines & Operations
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-foreground font-bold ml-4">
                      {loadKw.toFixed(1)} kW
                    </span>
                  </div>
                </HoverInfo>

                {/* Utility Grid Dispatch */}
                <HoverInfo
                  title="Utility Grid Interconnection"
                  content={TELEMETRY_DESCRIPTIONS.energyFlow.gridNode}
                  side="left"
                >
                  <div className="p-3.5 bg-card rounded-2xl border border-emerald-500/40 flex items-center justify-between shadow-2xs cursor-help">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <Zap size={20} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {isFleetView ? 'Net Utility Grid Feed-In' : 'Utility Grid Dispatch'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          Synced In-Phase @ 60.01 Hz
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-emerald-500 font-bold ml-4">
                      {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} kW
                    </span>
                  </div>
                </HoverInfo>
              </div>
            </div>

            {/* Balancing Footer Telemetry */}
            <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/40 text-xs">
                <span className="text-muted-foreground font-mono">Grid Phase Angle</span>
                <span className="font-mono font-bold text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> In-Phase (Δ0.02°)
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/40 text-xs">
                <span className="text-muted-foreground font-mono">Bus Voltage Balance</span>
                <span className="font-mono font-bold text-foreground">
                  5.4 V (0.92%) Nominal
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/40 text-xs">
                <span className="text-muted-foreground font-mono">Daily Harvest Aggregate</span>
                <span className="font-mono font-bold text-amber-500">
                  {dailyYield.toFixed(1)} kWh
                </span>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: VERTICAL COMPACT ENERGY FLOW & FLEET MATRIX          */}
        {/* ============================================================ */}
        <TabsContent value="compact-flow" className="space-y-6 m-0 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ---------------------------------------------------- */}
            {/* LEFT COLUMN: VERTICAL COMPACT ENERGY FLOW PIPELINE    */}
            {/* ---------------------------------------------------- */}
            <div className="lg:col-span-5 xl:col-span-5 space-y-4">
              <Card className="border-border/60 bg-card/80 p-4 sm:p-5 shadow-sm relative overflow-hidden">
                {/* In-place veil during plant switching or syncing with zero plants */}
                {isDataPlacementLoading && (
                  <div className="absolute inset-0 z-30 bg-background/65 backdrop-blur-xs flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="relative flex items-center justify-center mb-3">
                      <div className="w-10 h-10 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                      <div
                        className="absolute w-6 h-6 rounded-full border-2 border-amber-500/20 border-b-amber-500 animate-spin"
                        style={{ animationDirection: 'reverse' }}
                      />
                      <Zap className="h-3.5 w-3.5 text-amber-500 absolute" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground font-headline text-center">
                      Syncing Vertical Flow for {switchingPlantName || selectedPlant?.stationName || (hasNoPlants ? 'Solar Plant' : 'Selected Plant')}...
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono mt-1 text-center">
                      Recalibrating top-down power bus & dispatch routing
                    </span>
                  </div>
                )}

                {/* Header & Controls */}
                <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <Zap size={15} />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-foreground">Vertical Power Flow Bus</h2>
                      <span className="text-[10.5px] text-muted-foreground font-mono block">
                        {isFleetView
                          ? `${totalAccounts} Accounts Fleet Aggregation`
                          : selectedPlant
                          ? `${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`
                          : selectedAccount?.name || 'Inverter Hub Bus'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={forceCharge ? 'default' : 'outline'}
                      size="xs"
                      onClick={() => setForceCharge(!forceCharge)}
                      className={`h-7 px-2 text-[10.5px] font-semibold gap-1 ${
                        forceCharge ? 'bg-cyan-500 hover:bg-cyan-600 text-white' : ''
                      }`}
                      title="Force Grid Charge"
                    >
                      <BatteryCharging size={11} />
                      <span className="hidden sm:inline">Charge</span>
                    </Button>
                    <Button
                      variant={exportLimiter ? 'default' : 'outline'}
                      size="xs"
                      onClick={() => setExportLimiter(!exportLimiter)}
                      className={`h-7 px-2 text-[10.5px] font-semibold gap-1 ${
                        exportLimiter ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''
                      }`}
                      title="Zero-Export Limiter"
                    >
                      <SlidersHorizontal size={11} />
                      <span className="hidden sm:inline">Limit</span>
                    </Button>
                  </div>
                </div>

                {/* 1. TOP: Solar PV Harvest Node */}
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/30 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                      <Sun size={17} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">Solar PV Array</span>
                        <span className="text-[10px] font-mono text-muted-foreground">({totalCapacity.toFixed(0)} kWp)</span>
                      </div>
                      <span className="text-[10.5px] text-muted-foreground font-mono block">
                        Today: <strong className="text-amber-500">{dailyYield.toFixed(1)} kWh</strong>
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-black font-mono text-amber-500 leading-tight">
                      {solarKw.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">kW</span>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-emerald-500">
                      {capacityUtilizationPct}% Cap.
                    </span>
                  </div>
                </div>

                {/* Vertical Bus Connector Line 1 */}
                <div className="flex flex-col items-center my-1.5">
                  <div className="w-0.5 h-4 bg-gradient-to-b from-amber-500 to-primary relative flex items-center justify-center">
                    <div className={`w-1.5 h-1.5 rounded-full ${solarKw > 0 ? 'bg-amber-500 animate-ping' : 'bg-muted-foreground'}`} />
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-[9px] font-mono text-muted-foreground">
                    <ArrowDown size={9} className={solarKw > 0 ? 'text-amber-500 animate-bounce' : ''} />
                    <span>Inverter Input Flow</span>
                  </div>
                  <div className="w-0.5 h-2 bg-primary" />
                </div>

                {/* 2. MIDDLE: Core Hybrid Inverter Bus */}
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/30 flex flex-col gap-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <Cpu size={17} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">
                            {isFleetView ? 'Hybrid Inverter Fleet Bus' : selectedPlant ? selectedPlant.stationName : 'Core Hybrid Inverter'}
                          </span>
                        </div>
                        <span className="text-[10.5px] text-muted-foreground font-mono">
                          {nodes.length} Inverter Node{nodes.length > 1 ? 's' : ''} Active
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px] font-mono">
                      98.4% Eff.
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-center font-mono text-[10px]">
                    <div className="p-1.5 rounded-lg bg-background/60 border border-border/40">
                      <span className="text-[9px] text-muted-foreground block uppercase">Core Temp</span>
                      <span className="font-bold text-foreground">46.8°C</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-background/60 border border-border/40">
                      <span className="text-[9px] text-muted-foreground block uppercase">Bus Volt</span>
                      <span className="font-bold text-emerald-500">5.4 V</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-background/60 border border-border/40">
                      <span className="text-[9px] text-muted-foreground block uppercase">Grid Sync</span>
                      <span className="font-bold text-cyan-500">60.0 Hz</span>
                    </div>
                  </div>
                </div>

                {/* Vertical Bus Connector Line 2 */}
                <div className="flex flex-col items-center my-1.5">
                  <div className="w-0.5 h-3 bg-gradient-to-b from-primary to-cyan-500" />
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-[9px] font-mono text-muted-foreground">
                    <ArrowDown size={9} className="text-cyan-500" />
                    <span>Three-Way Load, ESS & Grid Distribution</span>
                  </div>
                  <div className="w-0.5 h-2 bg-border" />
                </div>

                {/* 3. BOTTOM: Vertical Sinks Stack */}
                <div className="space-y-2">
                  {/* Battery ESS Row */}
                  <div className="p-2.5 px-3 rounded-xl bg-cyan-500/5 border border-cyan-500/30 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-500 flex items-center justify-center shrink-0">
                        <BatteryCharging size={15} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {isFleetView ? 'Battery Fleet' : 'Storage Battery (ESS)'}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {batterySoc > 0 ? (
                            <>
                              <span className="text-[10px] font-mono text-cyan-500 font-bold">
                                {batterySoc.toFixed(1)}% SOC
                              </span>
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-cyan-500 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(0, batterySoc))}%` }}
                                />
                              </div>
                            </>
                          ) : (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Not Installed · Future ESS Ready
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-cyan-500 block">
                        {batterySoc > 0 || Math.abs(batteryKw) > 0.05
                          ? `${batteryKw >= 0 ? `+${batteryKw.toFixed(1)}` : batteryKw.toFixed(1)} kW`
                          : 'Standby'}
                      </span>
                      <span className="text-[9.5px] font-mono text-muted-foreground">
                        {batteryKw > 0 ? 'Charging' : batteryKw < 0 ? 'Discharging' : 'Standby'}
                      </span>
                    </div>
                  </div>

                  {/* Facility Load Row */}
                  <div className="p-2.5 px-3 rounded-xl bg-indigo-500/5 border border-indigo-500/30 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0">
                        <Building2 size={15} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {isFleetView ? 'Total Facility Demand' : 'Facility Operations'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Industrial Load Lines
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-foreground block">
                        {loadKw.toFixed(1)} kW
                      </span>
                      <span className="text-[9.5px] font-mono text-emerald-500">
                        Active Consumer
                      </span>
                    </div>
                  </div>

                  {/* Utility Grid Dispatch Row */}
                  <div className="p-2.5 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/30 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                        <Zap size={15} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          {isFleetView ? 'Net Grid Dispatch' : 'Utility Interconnect'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Phase Δ0.02° · In-Phase
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-emerald-500 block">
                        {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} kW
                      </span>
                      <span className="text-[9.5px] font-mono text-muted-foreground">
                        {gridKw > 0 ? 'Exporting' : gridKw < 0 ? 'Importing' : 'Balanced'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Compact Footer Diagnostics */}
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-[10.5px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1 text-emerald-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Synced 60.01 Hz
                  </span>
                  <span>
                    Daily: <strong className="text-amber-500">{dailyYield.toFixed(1)} kWh</strong>
                  </span>
                  <span>{nodes.length} Nodes</span>
                </div>
              </Card>
            </div>

            {/* ---------------------------------------------------- */}
            {/* RIGHT COLUMN: COMPACT VERTICAL FLEET MATRIX          */}
            {/* ---------------------------------------------------- */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-4">
              <Card className="border-border/60 bg-card/80 p-4 sm:p-5 shadow-sm">
                {/* Header with Search and Stats */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-3.5 border-b border-border/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs sm:text-sm font-bold text-foreground">
                        {isFleetView ? 'Compact Fleet Inverter Nodes' : `${selectedAccount?.name || 'Site'} Inverter Fleet`}
                      </h2>
                      <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px] font-mono">
                        {nodes.length} Nodes
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Real-time high-density inverter status & power metrics across {plantGroups.length} plant{plantGroups.length > 1 ? 's' : ''}.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Search bar */}
                    <div className="relative flex-1 sm:w-44">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search SN, plant..."
                        value={compactSearchQuery}
                        onChange={(e) => setCompactSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-muted/50 border border-border/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={collapseAllPlants}
                      className="text-[10px] font-mono h-7 px-2"
                    >
                      Collapse
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={expandAllPlants}
                      className="text-[10px] font-mono h-7 px-2"
                    >
                      Expand
                    </Button>
                  </div>
                </div>

                {/* Body: Skeleton or Inverter List */}
                {isDataPlacementLoading ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground animate-pulse mb-2">
                      <RefreshCw size={12} className="animate-spin text-primary" />
                      <span>Syncing Fleet Telemetry...</span>
                    </div>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="p-3 rounded-xl border border-border/50 bg-card/60 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="h-7 w-7 rounded-lg bg-primary/10" />
                          <div className="space-y-1">
                            <Skeleton className="h-3.5 w-28 bg-muted/60" />
                            <Skeleton className="h-2.5 w-20 bg-muted/40" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-16 bg-amber-500/15" />
                          <Skeleton className="h-5 w-14 bg-emerald-500/15" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredPlantGroups.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground font-mono">
                    {hasNoPlants
                      ? 'No solar plants or inverters configured yet. Sync live plants to discover hardware.'
                      : 'No inverters match the search filter.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPlantGroups.map((group) => {
                      const groupKey = `${group.accountId}-${group.stationId || group.stationName}`;
                      const isCollapsed = collapsedPlantKeys[groupKey];

                      return (
                        <div
                          key={groupKey}
                          className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden shadow-2xs"
                        >
                          {/* Plant Header Strip */}
                          <div
                            onClick={() => togglePlantGroup(groupKey)}
                            className="flex items-center justify-between p-2.5 px-3 bg-card/70 hover:bg-card/90 transition-colors cursor-pointer border-b border-border/40 select-none"
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? <ChevronRight size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
                              <Building2 size={13} className="text-primary shrink-0" />
                              <span className="text-xs font-bold text-foreground truncate max-w-[170px] sm:max-w-none">
                                {group.stationName}
                              </span>
                              {isFleetView && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono text-muted-foreground">
                                  {group.accountName}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 text-xs font-mono">
                              <span className="text-emerald-500 font-semibold text-[10.5px]">
                                {group.onlineCount}/{group.nodes.length} Online
                              </span>
                              <span className="font-bold text-amber-500 text-[10.5px]">
                                {group.totalLiveSolarKw.toFixed(1)} kW
                              </span>
                              <span className="text-muted-foreground text-[10.5px] hidden sm:inline">
                                {group.totalDailyYieldKwh.toFixed(1)} kWh
                              </span>
                            </div>
                          </div>

                          {/* Inverter Node Rows (Vertical & Compact) */}
                          {!isCollapsed && (
                            <div className="divide-y divide-border/30 bg-card/40">
                              {group.nodes.map((node) => {
                                const rated = node.ratedKw || 100;
                                const pctOfRated = Math.min(100, Math.round((node.liveSolarPowerKw / rated) * 100));

                                return (
                                  <div
                                    key={node.deviceSn}
                                    className="p-2.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
                                  >
                                    {/* Left: Device Info */}
                                    <div className="flex items-center gap-2 min-w-[190px]">
                                      <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                          node.status === 'ONLINE' || node.isLive
                                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                                            : 'bg-muted-foreground'
                                        }`}
                                      />
                                      <div className="truncate">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-bold text-foreground font-mono truncate">
                                            {node.model || 'Deye Inverter'}
                                          </span>
                                          <span className="text-[10px] font-mono text-muted-foreground">
                                            ({node.deviceSn})
                                          </span>
                                        </div>
                                        {node.loggerSn && (
                                          <span className="text-[9.5px] font-mono text-muted-foreground flex items-center gap-1">
                                            <Radio size={9} className="text-emerald-500" />
                                            Logger: {node.loggerSn}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Middle: Load capacity bar */}
                                    <div className="flex-1 max-w-xs hidden md:flex flex-col gap-0.5">
                                      <div className="flex items-center justify-between text-[9.5px] font-mono text-muted-foreground">
                                        <span>Load: {pctOfRated}%</span>
                                        <span>Rated: {rated} kW</span>
                                      </div>
                                      <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className="bg-amber-500 rounded-full h-full transition-all duration-500"
                                          style={{ width: `${pctOfRated}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Right: Telemetry metrics */}
                                    <div className="flex items-center justify-between sm:justify-end gap-3 font-mono text-xs shrink-0">
                                      <div className="text-left sm:text-right">
                                        <span className="text-[9px] text-muted-foreground block uppercase">Live Power</span>
                                        <span className="font-bold text-amber-500 text-xs">
                                          {node.liveSolarPowerKw.toFixed(1)} kW
                                        </span>
                                      </div>
                                      <div className="text-left sm:text-right">
                                        <span className="text-[9px] text-muted-foreground block uppercase">Daily Yield</span>
                                        <span className="font-bold text-foreground text-xs">
                                          {node.dailyYieldKwh ? `${node.dailyYieldKwh.toFixed(1)} kWh` : '--'}
                                        </span>
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] px-1.5 py-0 font-mono ${
                                          node.status === 'ONLINE'
                                            ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10'
                                            : 'border-muted text-muted-foreground'
                                        }`}
                                      >
                                        {node.status}
                                      </Badge>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 3: EMBEDDED TRIGONOMETRIC & HARMONIC ANALYTICS           */}
        {/* ============================================================ */}
        <TabsContent value="trigonometric" className="space-y-6 m-0">
          <TrigonometricHistoryGraph installedCapacityKw={totalCapacity} loading={isDataPlacementLoading} />
        </TabsContent>
      </Tabs>

      {/* Connected Fleet Arrays & Inverter Status Table Grouped by Plant */}
      {mainTab !== 'compact-flow' && (
      <Card className="border-border/60 bg-card/80 shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 p-5 border-b border-border/50">
          <div className="flex flex-wrap items-center gap-2.5">
            <CardTitle className="text-sm sm:text-base font-bold text-foreground">
              {isFleetView
                ? 'Connected Multi-Account Fleet Matrix & Inverter Nodes'
                : `Inverters for ${selectedAccount?.name || 'Selected Site'}`}
            </CardTitle>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono text-xs">
              {plantGroups.length} Plant Group{plantGroups.length > 1 ? 's' : ''} · {nodes.length} Inverters
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Table vs Cards */}
            <div className="flex items-center p-0.5 bg-muted/60 rounded-lg border border-border/60">
              <button
                onClick={() => setInverterViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  inverterViewMode === 'table'
                    ? 'bg-card text-foreground shadow-xs font-bold border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Table data grid view"
              >
                <List size={13} />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                onClick={() => setInverterViewMode('cards')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  inverterViewMode === 'cards'
                    ? 'bg-card text-foreground shadow-xs font-bold border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Cards grid view"
              >
                <LayoutGrid size={13} />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={collapseAllPlants}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2.5 gap-1 font-medium"
            >
              <ChevronUp size={13} />
              <span>Collapse All</span>
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={expandAllPlants}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2.5 gap-1 font-medium"
            >
              <ChevronDown size={13} />
              <span>Expand All</span>
            </Button>
            <span className="text-xs font-mono text-emerald-500 font-bold ml-1 hidden sm:inline">
              {nodes.length} / {nodes.length} Nodes Active
            </span>
          </div>
        </CardHeader>
        <CardContent className={inverterViewMode === 'table' ? "p-0 relative" : "p-4 sm:p-5 relative"}>
          {isDataPlacementLoading ? (
            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground animate-pulse">
                <RefreshCw size={13} className="animate-spin text-primary" />
                <span className="font-semibold text-foreground">
                  Compiling Inverter Matrix for {switchingPlantName || selectedPlant?.stationName || (hasNoPlants ? 'Solar Plants' : 'Selected Plant')}...
                </span>
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/50 bg-card/60">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-lg bg-primary/10" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-36 bg-muted/60" />
                        <Skeleton className="h-3 w-28 bg-muted/40" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-20 bg-amber-500/15" />
                      <Skeleton className="h-6 w-20 bg-cyan-500/15" />
                      <Skeleton className="h-6 w-16 bg-emerald-500/15" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : inverterViewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="data-grid border-0 rounded-none shadow-none">
                <thead>
                  <tr>
                    <th>Account / Facility</th>
                    <th>Plant Station</th>
                    <th>Inverter Hardware</th>
                    <th>Connected Logger</th>
                    <th>Live Harvest</th>
                    <th>Daily Yield</th>
                    <th>Battery SOC</th>
                    <th>Mode</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plantGroups.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground text-xs italic">
                        No connected inverters or plant groups discovered.
                      </td>
                    </tr>
                  ) : (
                    plantGroups.map((group) => {
                      const groupKey = `${group.accountId}-${group.stationId || group.stationName}`;
                      const isCollapsed = Boolean(collapsedPlantKeys[groupKey]);

                      return (
                        <React.Fragment key={groupKey}>
                          {/* Collapsible Plant Group Header Banner */}
                          <tr
                            onClick={() => togglePlantGroup(groupKey)}
                            className="cursor-pointer bg-muted/40 hover:bg-muted/70 border-y border-border/80 transition-colors select-none"
                          >
                            <td colSpan={9} className="py-2.5 px-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                {/* Plant Identity & Toggle */}
                                <div className="flex items-center gap-2.5">
                                  <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform">
                                    {isCollapsed ? (
                                      <ChevronRight size={14} />
                                    ) : (
                                      <ChevronDown size={14} />
                                    )}
                                  </div>
                                  <Building2 size={15} className="text-primary shrink-0" />
                                  <span className="font-bold text-foreground text-sm tracking-tight">
                                    {group.stationName}
                                  </span>
                                  {group.stationId && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] font-mono px-1.5 py-0 border-border/80"
                                    >
                                      ID: {group.stationId}
                                    </Badge>
                                  )}
                                  {isFleetView && group.accountName && (
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                      ({group.accountName})
                                    </span>
                                  )}
                                  <Badge className="bg-primary/15 text-primary border-primary/25 text-[10px] font-mono font-bold">
                                    {group.nodes.length} Inverter{group.nodes.length > 1 ? 's' : ''}
                                  </Badge>
                                </div>

                                {/* Plant Group Rollup Totals */}
                                <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono shrink-0 pl-7 sm:pl-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground text-[11px]">Harvest:</span>
                                    <span className="font-bold text-amber-500">
                                      {group.totalLiveSolarKw.toFixed(1)} kW
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground text-[11px]">Daily:</span>
                                    <span className="font-bold text-foreground">
                                      {group.totalDailyYieldKwh.toFixed(1)} kWh
                                    </span>
                                  </div>
                                  {group.totalRatedKw > 0 && (
                                    <div className="hidden md:flex items-center gap-1.5">
                                      <span className="text-muted-foreground text-[11px]">Capacity:</span>
                                      <span className="text-muted-foreground">
                                        {group.totalRatedKw} kWp
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                                    <span className="text-emerald-500 font-bold text-[11px]">
                                      {group.onlineCount}/{group.nodes.length} Online
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground underline ml-0.5">
                                    {isCollapsed ? 'Expand' : 'Collapse'}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Plant Group Inverter Rows */}
                          {!isCollapsed &&
                            group.nodes.map((node, index) => {
                              return (
                                <tr
                                  key={`${node.accountId}-${node.deviceSn}-${index}`}
                                  className="hover:bg-muted/30 transition-colors border-b border-border/30 bg-card/40"
                                >
                                  <td className="pl-6">
                                    <span className="font-semibold text-foreground block leading-tight text-xs">
                                      {node.accountName}
                                    </span>
                                    <span className="font-mono text-[10px] text-primary">
                                      {node.accountId}
                                    </span>
                                  </td>
                                  <td className="text-foreground font-medium text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground/50 font-mono text-[11px]">└</span>
                                      <span>{node.stationName}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                      <Cpu size={14} className="text-secondary shrink-0" />
                                      <span className="text-xs">{node.model}</span>
                                    </div>
                                    <span className="font-mono text-[11px] text-muted-foreground block mt-0.5">
                                      SN: {node.deviceSn} · {node.ratedKw ? `${node.ratedKw} kW` : '100 kW'}
                                    </span>
                                  </td>
                                  <td>
                                    {node.loggerSn ? (
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/60 border border-border/50">
                                        <Radio
                                          size={12}
                                          className={
                                            node.loggerStatus === 'ONLINE' ? 'text-emerald-500' : 'text-muted-foreground'
                                          }
                                        />
                                        <div className="flex flex-col">
                                          <span className="font-mono text-[11px] text-foreground font-medium leading-none">
                                            {node.loggerSn}
                                          </span>
                                          <span className="text-[9px] text-emerald-500 font-bold leading-none mt-0.5">
                                            {node.loggerStatus || 'ONLINE'}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground/60 text-[11px] italic">Built-in / Direct</span>
                                    )}
                                  </td>
                                  <td className="td-num font-bold text-amber-500 text-left font-mono">
                                    {node.liveSolarPowerKw.toFixed(1)} kW
                                  </td>
                                  <td className="td-num text-foreground text-left font-mono">
                                    {node.dailyYieldKwh ? `${node.dailyYieldKwh.toFixed(1)} kWh` : '--'}
                                  </td>
                                  <td className="td-num text-cyan-500 text-left font-mono">
                                    {node.batterySoc ? `${node.batterySoc.toFixed(1)}%` : '--'}
                                  </td>
                                  <td>
                                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono font-bold">
                                      {node.mode}
                                    </span>
                                  </td>
                                  <td className="text-right">
                                    <span className="inline-flex items-center gap-1.5 text-emerald-500 font-mono text-xs font-bold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                                      {node.isLive ? 'Live Cloud' : 'Online'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              {plantGroups.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground italic bg-muted/20 rounded-xl border border-border/40">
                  No connected inverters or plant groups discovered.
                </div>
              ) : (
                plantGroups.map((group) => {
                  const groupKey = `${group.accountId}-${group.stationId || group.stationName}`;
                  const isCollapsed = Boolean(collapsedPlantKeys[groupKey]);

                  return (
                    <div
                      key={`card-group-${groupKey}`}
                      className="rounded-xl border border-border/70 bg-card overflow-hidden transition-all shadow-2xs"
                    >
                      {/* Collapsible Plant Header */}
                      <div
                        onClick={() => togglePlantGroup(groupKey)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 bg-muted/40 hover:bg-muted/70 cursor-pointer select-none transition-colors border-b border-border/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform">
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </div>
                          <Building2 size={16} className="text-primary shrink-0" />
                          <span className="font-bold text-sm text-foreground">
                            {group.stationName}
                          </span>
                          {group.stationId && (
                            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                              ID: {group.stationId}
                            </Badge>
                          )}
                          {isFleetView && group.accountName && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              ({group.accountName})
                            </span>
                          )}
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-mono font-bold">
                            {group.nodes.length} Inverter{group.nodes.length > 1 ? 's' : ''}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3.5 text-xs font-mono shrink-0 pl-7 sm:pl-0">
                          <div>
                            <span className="text-muted-foreground text-[11px]">Harvest: </span>
                            <span className="font-bold text-amber-500">{group.totalLiveSolarKw.toFixed(1)} kW</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[11px]">Daily: </span>
                            <span className="font-bold text-foreground">{group.totalDailyYieldKwh.toFixed(1)} kWh</span>
                          </div>
                          {group.totalRatedKw > 0 && (
                            <div className="hidden md:block">
                              <span className="text-muted-foreground text-[11px]">Cap: </span>
                              <span className="text-muted-foreground">{group.totalRatedKw} kWp</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-emerald-500 text-[11px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                            <span>{group.onlineCount}/{group.nodes.length} Online</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground underline ml-0.5">
                            {isCollapsed ? 'Expand' : 'Collapse'}
                          </span>
                        </div>
                      </div>

                      {/* Inverter Cards Grid */}
                      {!isCollapsed && (
                        <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 bg-muted/10">
                          {group.nodes.map((node, index) => (
                            <div
                              key={`card-node-${node.accountId}-${node.deviceSn}-${index}`}
                              className="p-3 rounded-xl border border-border/70 bg-card hover:border-primary/40 transition-all flex flex-col justify-between shadow-2xs space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Cpu size={14} className="text-secondary shrink-0 text-primary" />
                                  <span className="font-bold text-xs text-foreground truncate">
                                    {node.model || 'Deye Inverter'}
                                  </span>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-500 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                                  {node.isLive ? 'Live Cloud' : 'Online'}
                                </span>
                              </div>

                              <div className="space-y-1 text-xs">
                                <div className="font-mono text-[10.5px] text-muted-foreground truncate">
                                  SN: {node.deviceSn} · {node.ratedKw ? `${node.ratedKw} kW` : '100 kW'}
                                </div>
                                {node.loggerSn && (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/60 border border-border/50 text-[10px] font-mono">
                                    <Radio size={10} className="text-emerald-500 shrink-0" />
                                    <span className="text-foreground">{node.loggerSn}</span>
                                    <span className="text-emerald-500 font-bold">({node.loggerStatus || 'ONLINE'})</span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 font-mono text-xs">
                                <div>
                                  <span className="text-[10px] text-muted-foreground block">Live Harvest</span>
                                  <span className="font-bold text-amber-500 text-xs">
                                    {node.liveSolarPowerKw.toFixed(1)} kW
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground block">Daily Yield</span>
                                  <span className="font-bold text-foreground text-xs">
                                    {node.dailyYieldKwh ? `${node.dailyYieldKwh.toFixed(1)} kWh` : '--'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}
      </div>
    </div>
  );
}

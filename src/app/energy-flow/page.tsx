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
  ShieldCheck,
  Power,
  RefreshCw,
  Globe,
  Layers,
  Radio,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Activity,
  Server,
  TrendingUp,
  CheckCircle2,
  ShieldAlert,
  LayoutGrid,
  List,
} from 'lucide-react';
import { StationSummary, AggregatedFleetSummary, FleetMatrixNode, PlantInfo, DeviceInfo } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePolling, useSafeTimeout } from '@/lib/usePolling';
import { createLogger } from '@/lib/logger';
import { telemetryCache, inverterCacheKey } from '@/lib/telemetry-cache';

const log = createLogger('Dashboard');

export default function EnergyFlowDashboard() {
  const {
    accounts,
    selectedAccountId,
    isFleetView,
    selectedAccount,
    selectedStationId,
    setSelectedStationId,
    selectedInverterSn,
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

  const [manualPolling, setManualPolling] = useState(false);

  const snScoped = selectedInverterSn.trim() !== '' && selectedInverterSn !== 'ALL' && selectedInverterSn !== 'ALL_FLEET';
  const currentTargetKey = isFleetView
    ? `FLEET|${inverterCacheKey(selectedAccountId, selectedStationId, selectedInverterSn)}`
    : inverterCacheKey(selectedAccountId, selectedStationId, selectedInverterSn);
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
        const aggSnParam = snScoped
          ? `?device_sn=${encodeURIComponent(selectedInverterSn.trim())}`
          : '';
        const res = await fetch(`/api/deye/aggregate${aggSnParam}`, { signal: controller.signal });
        if (res.ok) {
          const json: AggregatedFleetSummary = await res.json();
          if (controller.signal.aborted) return;
          const scopedNodes = snScoped
            ? (json.nodes || []).filter(
                (n) => String(n.deviceSn).trim() === selectedInverterSn.trim()
              )
            : (json.nodes || []);
          setFleetAggregate(json);
          setNodes(scopedNodes);
          setIsLive(json.isLive);
          setDisplayedTargetKey(targetKeyAtStart);
          setIsDataLoaded(true);
          telemetryCache.set(targetKeyAtStart, {
            station: null,
            fleetAggregate: json,
            nodes: scopedNodes,
            isLive: json.isLive,
          });
        }
      } else {
        const stationParam =
          selectedStationId !== 'ALL'
            ? `&station_id=${encodeURIComponent(selectedStationId)}`
            : '';
        const stationSnParam = snScoped
          ? `&device_sn=${encodeURIComponent(selectedInverterSn.trim())}`
          : '';
        const res = await fetch(
          `/api/deye/station?accountId=${encodeURIComponent(selectedAccountId)}${stationParam}${stationSnParam}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json = await res.json();
          if (controller.signal.aborted) return;
          setStation(json.data);
          setIsLive(json.isLive);

          let currentStationNodes: FleetMatrixNode[] = [];

          if (snScoped && typeof json.deviceSn === 'string' && json.deviceSn.trim() !== '') {
            // Single-inverter view: live kW comes from the route SN overlay, not even-split.
            const routeSn = json.deviceSn.trim();
            let snPlant: PlantInfo | null = null;
            let snDevice: DeviceInfo | null = null;
            for (const plant of selectedAccount?.plants || []) {
              const found = (plant.devices || []).find(
                (d) => d.deviceSn != null && String(d.deviceSn).trim() === routeSn
              );
              if (found) {
                snPlant = plant;
                snDevice = found;
                break;
              }
            }
            const snLogger = snPlant
              ? (snPlant.devices || []).find(
                  (d) =>
                    String(d.deviceType || '').toUpperCase() === 'LOGGER' &&
                    (d.deviceSn === snDevice?.loggerSn || snDevice?.loggerSn === undefined)
                )
              : undefined;
            currentStationNodes = [
              {
                accountId: selectedAccountId,
                accountName: selectedAccount?.name || json.data?.accountName || 'Selected Site',
                stationName: snPlant?.stationName || json.data?.name || 'Selected Station',
                stationId: snPlant ? String(snPlant.stationId) : String(json.data?.stationId ?? selectedStationId),
                deviceSn: routeSn,
                deviceType: 'INVERTER',
                model: snDevice?.model || 'Deye Inverter',
                ratedKw: snDevice?.ratedKw || 50,
                loggerSn: snDevice?.loggerSn || snLogger?.deviceSn,
                loggerStatus: snLogger?.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
                liveSolarPowerKw: typeof json.liveSolarPowerKw === 'number' ? json.liveSolarPowerKw : (json.data?.liveSolarPowerKw || 0),
                dailyYieldKwh: typeof json.todayEnergyKwh === 'number' ? json.todayEnergyKwh : (json.data?.dailyYieldKwh || 0),
                gridPowerKw: json.data?.gridPowerKw || 0,
                consumptionPowerKw: json.data?.loadPowerKw || 0,
                batterySoc: json.data?.batterySoc || 0,
                mode: 'PEAK SHAVING',
                status: json.data?.status === 'ONLINE' || snDevice?.status === 'ONLINE' ? 'ONLINE' : 'STANDBY',
                isLive: json.isLive,
              },
            ];
            setNodes(currentStationNodes);
          } else if (selectedAccount?.plants && selectedAccount.plants.length > 0) {
            const targetPlants =
              selectedStationId !== 'ALL'
                ? selectedAccount.plants.filter((p) => String(p.stationId) === String(selectedStationId))
                : selectedAccount.plants;

            for (const plant of targetPlants) {
              const inverters = (plant.devices || []).filter(
                (d) => String(d.deviceType || '').toUpperCase() === 'INVERTER'
              );
              const loggers = (plant.devices || []).filter(
                (d) => String(d.deviceType || '').toUpperCase() === 'LOGGER'
              );

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
  }, [isFleetView, selectedAccountId, selectedStationId, selectedAccount, selectedInverterSn, snScoped, currentTargetKey, displayedTargetKey, setIsPlantSwitching, setFetchingDeye]);

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
  const showFullReloadOverlay = (isReloadingPlant || isSyncingNoPlants || (isTargetPending && loading)) && !isFetchingDeye && !syncing;
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

  // Group plant groups by connected account (for admin / multi-account fleet nesting)
  const accountGroups = React.useMemo(() => {
    const map = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        plants: typeof plantGroups;
        nodes: FleetMatrixNode[];
        totalLiveSolarKw: number;
        totalDailyYieldKwh: number;
        totalRatedKw: number;
        onlineCount: number;
      }
    >();

    for (const group of plantGroups) {
      const accId = group.accountId || 'unknown-account';
      if (!map.has(accId)) {
        const matchingAccount = accounts.find((a) => a.id === accId);
        map.set(accId, {
          accountId: group.accountId || '',
          accountName: matchingAccount?.name || group.accountName || 'Unknown Account',
          plants: [],
          nodes: [],
          totalLiveSolarKw: 0,
          totalDailyYieldKwh: 0,
          totalRatedKw: 0,
          onlineCount: 0,
        });
      }
      const acc = map.get(accId)!;
      acc.plants.push(group);
      acc.nodes.push(...group.nodes);
      acc.totalLiveSolarKw += group.totalLiveSolarKw;
      acc.totalDailyYieldKwh += group.totalDailyYieldKwh;
      acc.totalRatedKw += group.totalRatedKw;
      acc.onlineCount += group.onlineCount;
    }

    return Array.from(map.values());
  }, [plantGroups, accounts]);

  const [collapsedAccountKeys, setCollapsedAccountKeys] = useState<Record<string, boolean>>({});
  const [collapsedPlantKeys, setCollapsedPlantKeys] = useState<Record<string, boolean>>({});
  const [inverterViewMode, setInverterViewMode] = useState<'table' | 'cards'>('table');

  const toggleAccountGroup = (accId: string) => {
    setCollapsedAccountKeys((prev) => ({
      ...prev,
      [accId]: !prev[accId],
    }));
  };

  const togglePlantGroup = (key: string) => {
    setCollapsedPlantKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const collapseAllPlants = () => {
    const updatedAcc: Record<string, boolean> = {};
    for (const a of accountGroups) {
      updatedAcc[a.accountId] = true;
    }
    setCollapsedAccountKeys(updatedAcc);

    const updatedPlant: Record<string, boolean> = {};
    for (const g of plantGroups) {
      const key = `${g.accountId}-${g.stationId || g.stationName}`;
      updatedPlant[key] = true;
    }
    setCollapsedPlantKeys(updatedPlant);
  };

  const expandAllPlants = () => {
    setCollapsedAccountKeys({});
    setCollapsedPlantKeys({});
  };

  return (
    <div className="relative w-full max-w-[1600px] mx-auto pb-12">
      {/* Full Dashboard Frosted Overlay when switching plants or syncing with 0 data / 0 plants */}
      {showFullReloadOverlay && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all animate-in fade-in duration-200">
          <div className="bg-card/95 border border-primary/30 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground uppercase tracking-wider font-headline">
                {isReloadingPlant
                  ? `Synchronizing ${switchingPlantName || selectedPlant?.stationName || 'Plant'} Telemetry`
                  : isSyncingNoPlants
                  ? fetchingStage || (selectedAccount ? `Scanning Plants for ${selectedAccount.name}...` : 'Synchronizing Solar Plants & Gateways...')
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
              <div className="bg-primary/60 h-full w-full animate-pulse" />
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
        {/* Top Command Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-headline">
              {isFleetView
                ? 'Fleet Energy Flow'
                : selectedPlant
                ? `${selectedPlant.stationName} Energy Flow`
                : `${selectedAccount?.name || 'Selected Site'} Energy Flow`}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isFleetView
                ? `Real-time power distribution across ${totalAccounts} configured accounts`
                : selectedPlant
                ? `Real-time power balance for ${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`
                : `Real-time power balance across ${selectedAccount?.plants?.length || 1} plant(s)`}
            </p>
          </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/fleet">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 text-xs font-semibold"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-primary" />
              <span>Fleet Monitoring</span>
            </Button>
          </Link>
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



      {/* 5 Primary Telemetry Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 w-full">
        {/* PV Live Yield */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-amber-500/40 transition-all p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Total PV Generation' : 'PV Generation'}
            </span>
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
          </div>
          {isDataPlacementLoading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-8 w-28 bg-amber-500/20" />
            </div>
          ) : (
            <div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-amber-500 font-mono">
                {solarKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-1 flex items-center justify-between">
                <span>Daily: {dailyYield.toFixed(1)} kWh</span>
                {totalCapacity > 0 && <span>Cap: {totalCapacity.toFixed(0)} kWp</span>}
              </div>
            </div>
          )}
        </Card>

        {/* Battery Storage */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-cyan-500/40 transition-all p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Fleet Battery ESS' : 'Battery Storage'}
            </span>
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
          </div>
          {isDataPlacementLoading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-8 w-28 bg-cyan-500/20" />
            </div>
          ) : (
            <div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-cyan-500 font-mono">
                {batterySoc > 0 ? (
                  <>
                    {batterySoc.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">% SOC</span>
                  </>
                ) : (
                  <span className="text-lg sm:text-xl text-muted-foreground font-medium">No Battery</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-1">
                {batterySoc > 0 || Math.abs(batteryKw) > 0.05
                  ? `Power: ${batteryKw >= 0 ? '+' : ''}${batteryKw.toFixed(1)} kW`
                  : 'Standby (0.0 kW)'}
              </div>
            </div>
          )}
        </Card>

        {/* Facility Load */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-indigo-500/40 transition-all p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Total Facility Load' : 'Facility Consumption'}
            </span>
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
          </div>
          {isDataPlacementLoading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-8 w-28 bg-indigo-500/20" />
            </div>
          ) : (
            <div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
                {loadKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-1">
                <span>Active Demand</span>
              </div>
            </div>
          )}
        </Card>

        {/* Grid Interconnection */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Net Grid Dispatch' : 'Grid Interconnect'}
            </span>
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
          </div>
          {isDataPlacementLoading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-8 w-28 bg-emerald-500/20" />
            </div>
          ) : (
            <div>
              <div className={`text-2xl sm:text-3xl font-black tracking-tight font-mono ${gridKw >= 0 ? 'text-emerald-500' : 'text-blue-400'}`}>
                {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-1">
                <span>{gridKw > 0.05 ? 'Exporting to Grid' : gridKw < -0.05 ? 'Importing from Grid' : 'Standby / Balanced'}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Fleet Hardware Health */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-all col-span-2 sm:col-span-1 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Fleet Inverters' : 'Inverter Status'}
            </span>
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
          </div>
          {isDataPlacementLoading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-8 w-20 bg-primary/20" />
            </div>
          ) : (
            <div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-primary font-mono">
                {nodes.filter((n) => n.status === 'ONLINE' || n.isLive).length}
                <span className="text-xs text-muted-foreground font-normal"> / {nodes.length} Online</span>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-1">
                <span>{isFleetView ? `${totalAccounts} Accounts Configured` : `${plantGroups.length} Plant Group(s)`}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Main Subsystem View */}

      {/* Real-time Synoptic Power Flow */}
      <Card className="border-border/60 bg-card/80 p-6 lg:p-8 shadow-sm relative overflow-hidden">
        {/* In-place synoptics reload veil during plant switching or syncing */}
        {isDataPlacementLoading && (
          <div className="absolute inset-0 z-30 bg-background/65 backdrop-blur-xs flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-10 h-10 rounded-full border-3 border-primary/20 border-t-primary animate-spin mb-3" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground font-headline">
              Syncing Telemetry for {switchingPlantName || selectedPlant?.stationName || (hasNoPlants ? 'Solar Plant' : 'Selected Plant')}...
            </span>
            <span className="text-[11px] text-muted-foreground font-mono mt-1 text-center">
              Recalibrating real-time PV generation, battery flow & grid telemetry
            </span>
          </div>
        )}

        {/* Header & Status Indicator */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Cpu size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                {isFleetView
                  ? 'Multi-Site Power Flow'
                  : selectedPlant
                  ? `Power Flow · ${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`
                  : `Power Flow · ${selectedAccount?.name || 'Inverter Hub'}`}
              </h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Dynamic balance between solar generation, battery storage, site load & utility grid
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-mono text-xs gap-1.5 px-2.5 py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              {isLive ? 'Live Cloud Sync' : 'Direct Gateway Sync'}
            </Badge>
          </div>
        </div>

        {/* Synoptic Power Flow Architectural Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center py-6">
          {/* Left: Solar PV Array */}
          <div className="flex flex-col items-center">
            <div className="w-56 p-5 bg-card rounded-2xl border-2 border-amber-500/50 shadow-xs flex flex-col items-center text-center">
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
                {totalCapacity > 0 ? `${totalCapacity.toFixed(0)} kWp Nameplate` : 'Active Solar Array'}
              </span>
            </div>
          </div>

          {/* Center: Core Hybrid Inverter Hub */}
          <div className="flex flex-col items-center">
            <div className="w-72 p-6 bg-card rounded-3xl border-2 border-cyan-500/60 shadow-md flex flex-col items-center text-center relative">
              <div className="absolute -top-3 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
                {isFleetView ? 'Fleet Matrix Hub' : selectedPlant ? 'Plant Inverter Hub' : 'Hybrid Inverter Hub'}
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
                  : `SN: ${nodes[0]?.deviceSn || '--'}`}
              </span>
              <div className="w-full grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border/60">
                <div className="bg-muted/40 p-2 rounded-xl border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-mono">
                    {isFleetView ? 'Inverters' : 'Status'}
                  </span>
                  <span className="font-mono text-sm text-emerald-500 font-bold">
                    {isFleetView ? `${nodes.length} Units` : nodes[0]?.status || (isLive ? 'ONLINE' : 'SYNCED')}
                  </span>
                </div>
                <div className="bg-muted/40 p-2 rounded-xl border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-mono">
                    {isFleetView ? 'Active Sites' : 'Daily Yield'}
                  </span>
                  <span className="font-mono text-sm text-foreground font-bold">
                    {isFleetView ? `${liveAccountsCount} / ${totalAccounts} Sites` : `${dailyYield.toFixed(1)} kWh`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: 3 Output Sinks (Battery, Demand, Grid) */}
          <div className="flex flex-col gap-3">
            {/* Battery ESS Node */}
            <div className="p-3.5 bg-card rounded-2xl border border-cyan-500/40 flex items-center justify-between shadow-2xs">
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
                      ? `${batterySoc.toFixed(1)}% SOC · Active`
                      : 'No Battery Connected'}
                  </span>
                </div>
              </div>
              <span className="font-mono text-sm text-cyan-500 font-bold ml-4">
                {batterySoc > 0 || Math.abs(batteryKw) > 0.05
                  ? `${batteryKw >= 0 ? `+${batteryKw.toFixed(1)}` : batteryKw.toFixed(1)} kW`
                  : 'Standby'}
              </span>
            </div>

            {/* Facility Demand Node */}
            <div className="p-3.5 bg-card rounded-2xl border border-border/60 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <Building2 size={20} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    {isFleetView ? 'Total Facility Demand' : 'Facility Consumption'}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Site Electrical Load
                  </span>
                </div>
              </div>
              <span className="font-mono text-sm text-foreground font-bold ml-4">
                {loadKw.toFixed(1)} kW
              </span>
            </div>

            {/* Utility Grid Dispatch */}
            <div className="p-3.5 bg-card rounded-2xl border border-emerald-500/40 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Zap size={20} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    {isFleetView ? 'Net Utility Grid Feed-In' : 'Utility Grid Interconnect'}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {gridKw > 0.05 ? 'Clean Solar Export' : gridKw < -0.05 ? 'Grid Power Import' : 'Balanced Interconnect'}
                  </span>
                </div>
              </div>
              <span className={`font-mono text-sm font-bold ml-4 ${gridKw >= 0 ? 'text-emerald-500' : 'text-blue-400'}`}>
                {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} kW
              </span>
            </div>
          </div>
        </div>

        {/* Balancing Footer Telemetry */}
        <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/40 text-xs">
            <span className="text-muted-foreground font-mono">Grid Interaction</span>
            <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${gridKw > 0.05 ? 'bg-emerald-500' : gridKw < -0.05 ? 'bg-blue-400' : 'bg-muted-foreground'}`} />
              {gridKw > 0.05 ? 'Net Exporting' : gridKw < -0.05 ? 'Net Importing' : 'Standby / Neutral'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/40 text-xs">
            <span className="text-muted-foreground font-mono">Connection Status</span>
            <span className="font-mono font-bold text-foreground">
              {isLive ? 'Live Sub-minute' : 'Direct Cloud Sync'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border/40 text-xs">
            <span className="text-muted-foreground font-mono">Daily Generation</span>
            <span className="font-mono font-bold text-amber-500">
              {dailyYield.toFixed(1)} kWh
            </span>
          </div>
        </div>
      </Card>

      {/* Connected Fleet Arrays & Inverter Status Table Grouped by Plant */}
      <Card className="border-border/60 bg-card/80 shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 p-5 border-b border-border/50">
          <div className="flex flex-wrap items-center gap-2.5">
            <CardTitle className="text-sm sm:text-base font-bold text-foreground">
              {isFleetView
                ? 'Connected Multi-Account Fleet Matrix & Inverter Nodes'
                : `Inverters for ${selectedAccount?.name || 'Selected Site'}`}
            </CardTitle>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono text-xs">
              {isFleetView && isAdmin
                ? `${accountGroups.length} Connected Account${accountGroups.length > 1 ? 's' : ''} · ${plantGroups.length} Plant Group${plantGroups.length > 1 ? 's' : ''} · ${nodes.length} Inverters`
                : `${plantGroups.length} Plant Group${plantGroups.length > 1 ? 's' : ''} · ${nodes.length} Inverters`}
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
                  ) : isFleetView && isAdmin ? (
                    accountGroups.map((account) => {
                      const isAccountCollapsed = Boolean(collapsedAccountKeys[account.accountId]);

                      return (
                        <React.Fragment key={`acc-group-${account.accountId}`}>
                          {/* Level 1: Connected Account Header Banner */}
                          <tr
                            onClick={() => toggleAccountGroup(account.accountId)}
                            className="cursor-pointer bg-primary/10 hover:bg-primary/15 border-y-2 border-primary/25 transition-colors select-none"
                          >
                            <td colSpan={9} className="py-2.5 px-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-primary shrink-0 transition-transform">
                                    {isAccountCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                  </div>
                                  <ShieldCheck size={16} className="text-primary shrink-0" />
                                  <span className="font-bold text-foreground text-sm tracking-tight">
                                    Account: {account.accountName}
                                  </span>
                                  {account.accountId && (
                                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-primary/30 text-primary/80">
                                      ID: {account.accountId}
                                    </Badge>
                                  )}
                                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono font-bold">
                                    {account.plants.length} Plant{account.plants.length > 1 ? 's' : ''} · {account.nodes.length} Inverter{account.nodes.length > 1 ? 's' : ''}
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono shrink-0 pl-7 sm:pl-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground text-[11px]">Harvest:</span>
                                    <span className="font-bold text-amber-500">
                                      {account.totalLiveSolarKw.toFixed(1)} kW
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground text-[11px]">Daily:</span>
                                    <span className="font-bold text-foreground">
                                      {account.totalDailyYieldKwh.toFixed(1)} kWh
                                    </span>
                                  </div>
                                  {account.totalRatedKw > 0 && (
                                    <div className="hidden md:flex items-center gap-1.5">
                                      <span className="text-muted-foreground text-[11px]">Capacity:</span>
                                      <span className="text-muted-foreground">
                                        {account.totalRatedKw} kWp
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                                    <span className="text-emerald-500 font-bold text-[11px]">
                                      {account.onlineCount}/{account.nodes.length} Online
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground underline ml-0.5">
                                    {isAccountCollapsed ? 'Expand Account' : 'Collapse Account'}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Level 2: Plants nested inside Account */}
                          {!isAccountCollapsed &&
                            account.plants.map((group) => {
                              const groupKey = `${group.accountId}-${group.stationId || group.stationName}`;
                              const isPlantCollapsed = Boolean(collapsedPlantKeys[groupKey]);

                              return (
                                <React.Fragment key={groupKey}>
                                  <tr
                                    onClick={() => togglePlantGroup(groupKey)}
                                    className="cursor-pointer bg-muted/30 hover:bg-muted/60 border-y border-border/60 transition-colors select-none"
                                  >
                                    <td colSpan={9} className="py-2 px-4 pl-8 sm:pl-10">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform">
                                            {isPlantCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                          </div>
                                          <Building2 size={14} className="text-emerald-500 shrink-0" />
                                          <span className="font-semibold text-foreground text-xs sm:text-sm tracking-tight">
                                            Plant: {group.stationName}
                                          </span>
                                          {group.stationId && (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px] font-mono px-1.5 py-0 border-border/80"
                                            >
                                              ID: {group.stationId}
                                            </Badge>
                                          )}
                                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-mono font-bold">
                                            {group.nodes.length} Inverter{group.nodes.length > 1 ? 's' : ''}
                                          </Badge>
                                        </div>

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
                                            {isPlantCollapsed ? 'Expand Plant' : 'Collapse Plant'}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Level 3: Inverters inside Plant */}
                                  {!isPlantCollapsed &&
                                    group.nodes.map((node, index) => (
                                      <tr
                                        key={`${node.accountId}-${node.deviceSn}-${index}`}
                                        className="hover:bg-muted/30 transition-colors border-b border-border/30 bg-card/40"
                                      >
                                        <td className="pl-10 sm:pl-12">
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
                                    ))}
                                </React.Fragment>
                              );
                            })}
                        </React.Fragment>
                      );
                    })
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
              ) : isFleetView && isAdmin ? (
                accountGroups.map((account) => {
                  const isAccountCollapsed = Boolean(collapsedAccountKeys[account.accountId]);

                  return (
                    <div
                      key={`card-account-${account.accountId}`}
                      className="rounded-2xl border-2 border-primary/20 bg-card/60 p-3 sm:p-4 space-y-3 shadow-xs"
                    >
                      {/* Account Header */}
                      <div
                        onClick={() => toggleAccountGroup(account.accountId)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-primary/10 hover:bg-primary/15 cursor-pointer select-none transition-colors border border-primary/25"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-primary shrink-0 transition-transform">
                            {isAccountCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </div>
                          <ShieldCheck size={16} className="text-primary shrink-0" />
                          <span className="font-bold text-sm sm:text-base text-foreground">
                            Account: {account.accountName}
                          </span>
                          {account.accountId && (
                            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-primary/30 text-primary/80">
                              ID: {account.accountId}
                            </Badge>
                          )}
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono font-bold">
                            {account.plants.length} Plant{account.plants.length > 1 ? 's' : ''} · {account.nodes.length} Inverter{account.nodes.length > 1 ? 's' : ''}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3.5 text-xs font-mono shrink-0 pl-7 sm:pl-0">
                          <div>
                            <span className="text-muted-foreground text-[11px]">Harvest: </span>
                            <span className="font-bold text-amber-500">{account.totalLiveSolarKw.toFixed(1)} kW</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[11px]">Daily: </span>
                            <span className="font-bold text-foreground">{account.totalDailyYieldKwh.toFixed(1)} kWh</span>
                          </div>
                          {account.totalRatedKw > 0 && (
                            <div className="hidden md:block">
                              <span className="text-muted-foreground text-[11px]">Cap: </span>
                              <span className="text-muted-foreground">{account.totalRatedKw} kWp</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-emerald-500 text-[11px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                            <span>{account.onlineCount}/{account.nodes.length} Online</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground underline ml-0.5">
                            {isAccountCollapsed ? 'Expand Account' : 'Collapse Account'}
                          </span>
                        </div>
                      </div>

                      {/* Plants inside Account */}
                      {!isAccountCollapsed && (
                        <div className="space-y-3 pl-1 sm:pl-3">
                          {account.plants.map((group) => {
                            const groupKey = `${group.accountId}-${group.stationId || group.stationName}`;
                            const isPlantCollapsed = Boolean(collapsedPlantKeys[groupKey]);

                            return (
                              <div
                                key={`card-group-${groupKey}`}
                                className="rounded-xl border border-border/70 bg-card overflow-hidden transition-all shadow-2xs"
                              >
                                <div
                                  onClick={() => togglePlantGroup(groupKey)}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-muted/40 hover:bg-muted/70 cursor-pointer select-none transition-colors border-b border-border/40"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform">
                                      {isPlantCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                    </div>
                                    <Building2 size={15} className="text-emerald-500 shrink-0" />
                                    <span className="font-bold text-sm text-foreground">
                                      {group.stationName}
                                    </span>
                                    {group.stationId && (
                                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                                        ID: {group.stationId}
                                      </Badge>
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
                                      {isPlantCollapsed ? 'Expand Plant' : 'Collapse Plant'}
                                    </span>
                                  </div>
                                </div>

                                {!isPlantCollapsed && (
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
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
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
      </div>
    </div>
  );
}

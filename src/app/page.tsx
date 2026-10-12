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
} from 'lucide-react';
import { StationSummary, AggregatedFleetSummary, FleetMatrixNode } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';
import { usePolling, useSafeTimeout } from '@/lib/usePolling';
import { createLogger } from '@/lib/logger';

const log = createLogger('Dashboard');

export default function EnergyFlowDashboard() {
  const {
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
  const [isPlantBarCollapsed, setIsPlantBarCollapsed] = useState(false);
  const [mainTab, setMainTab] = useState<'synoptics' | 'trigonometric'>('synoptics');

  const fetchTelemetry = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (isFleetView) {
        const res = await fetch('/api/deye/aggregate');
        if (res.ok) {
          const json: AggregatedFleetSummary = await res.json();
          setFleetAggregate(json);
          setNodes(json.nodes || []);
          setIsLive(json.isLive);
        }
      } else {
        const stationParam =
          selectedStationId !== 'ALL'
            ? `&station_id=${encodeURIComponent(selectedStationId)}`
            : '';
        const res = await fetch(
          `/api/deye/station?accountId=${encodeURIComponent(selectedAccountId)}${stationParam}`
        );
        if (res.ok) {
          const json = await res.json();
          setStation(json.data);
          setIsLive(json.isLive);

          if (selectedAccount?.plants && selectedAccount.plants.length > 0) {
            const accNodes: FleetMatrixNode[] = [];
            const targetPlants =
              selectedStationId !== 'ALL'
                ? selectedAccount.plants.filter((p) => p.stationId === selectedStationId)
                : selectedAccount.plants;

            for (const plant of targetPlants) {
              const inverters = plant.devices.filter((d) => d.deviceType === 'INVERTER');
              const loggers = plant.devices.filter((d) => d.deviceType === 'LOGGER');

              // Match plant against multi-plant aggregated breakdown
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

                accNodes.push({
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
            setNodes(accNodes);
          } else if (json.data) {
            setNodes([
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
            ]);
          }
        }
      }
    } catch (e) {
      log.error('Error fetching telemetry', e);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [isFleetView, selectedAccountId, selectedStationId]);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  usePolling(fetchTelemetry, {
    intervalMs: 3500,
    enabled: true,
    pauseOnHidden: true,
  });

  const triggerManualPoll = async () => {
    setManualPolling(true);
    setFetchingDeye(true, isFleetView ? 'Polling DeyeCloud Fleet Telemetry...' : 'Polling Station Telemetry...');
    await fetchTelemetry();
    setSafeTimeout(() => {
      setManualPolling(false);
      setFetchingDeye(false, null);
    }, 800);
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

  const isDataEmpty =
    !station && !fleetAggregate && nodes.length === 0 && solarKw === 0 && dailyYield === 0;
  const isSyncingWithZeroData = (loading || isFetchingDeye || manualPolling) && isDataEmpty;

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
      {/* Full Dashboard Greyout Overlay when syncing/fetching with 0 data */}
      {isSyncingWithZeroData && (
        <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-xs flex items-center justify-center p-4 transition-all animate-in fade-in duration-300">
          <div className="bg-card/95 border border-primary/30 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div
                className="absolute w-8 h-8 rounded-full border-2 border-emerald-500/20 border-b-emerald-500 animate-spin"
                style={{ animationDirection: 'reverse' }}
              />
              <Zap className="h-5 w-5 text-amber-500 absolute" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground uppercase tracking-wider font-headline">
                {fetchingStage || (isFleetView ? 'Synchronizing Fleet Telemetry...' : 'Fetching DeyeCloud Telemetry...')}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Connecting to DeyeCloud API gateway & compiling live inverter matrix
              </p>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 h-full w-full animate-pulse" />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {isFleetView ? `${totalAccounts} Accounts Configured` : selectedAccount?.name || 'Solar Gateway Node'}
            </span>
          </div>
        </div>
      )}

      <div
        className={`flex flex-col gap-6 w-full transition-all duration-300 ${
          isSyncingWithZeroData ? 'opacity-40 filter grayscale-[40%] pointer-events-none select-none' : ''
        }`}
      >
        {/* Top Command Banner with VOS Design Standards */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-headline">
              {isFleetView
                ? 'Fleet Energy Synoptics'
                : selectedPlant
                ? `${selectedPlant.stationName} Synoptics`
                : `${selectedAccount?.name || 'Selected Site'} Synoptics`}
            </h1>
            <Badge
              variant="outline"
              className="h-5 px-2 text-[10px] font-black uppercase tracking-widest border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
            >
              {isFleetView ? 'Multi-Account Bus' : selectedStationId === 'ALL' ? `All ${selectedAccount?.plants?.length || 1} Plants Bus` : 'Hybrid Plant'}
            </Badge>
          </div>
          {isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">
              {isFleetView
                ? `Real-time multi-site energy flow across ${totalAccounts} configured DeyeCloud accounts.`
                : selectedPlant
                ? `Real-time hybrid inverter loop for ${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp).`
                : `Real-time aggregated telemetry across all ${selectedAccount?.plants?.length || 1} plants (${totalCapacity.toFixed(0)} kWp total capacity).`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
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

      {/* Dynamic Plant Switcher Bar (Collapsible) */}
      {!isFleetView && selectedAccount && (selectedAccount.plants?.length || 0) > 0 && (
        isPlantBarCollapsed ? (
          <div className="flex items-center justify-between p-2 px-3.5 bg-card/70 rounded-xl border border-border/60 transition-all shadow-2xs">
            <div className="flex items-center gap-2 text-xs truncate">
              <Building2 size={15} className="text-primary shrink-0" />
              <span className="text-muted-foreground font-mono uppercase tracking-wider text-[11px]">Active Plant:</span>
              <span className="font-semibold text-foreground truncate">
                {selectedPlant ? selectedPlant.stationName : `All Plants (${selectedAccount.plants?.length})`}
              </span>
              <span className="text-[10.5px] text-muted-foreground font-mono shrink-0">
                ({selectedPlant ? `${selectedPlant.installedCapacityKw} kWp` : `${selectedAccount.capacityKw} kWp`})
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
          <div className="flex items-center gap-2 p-2 bg-card/70 rounded-xl border border-border/60 overflow-x-auto transition-all shadow-2xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground shrink-0">
              <Building2 size={14} className="text-primary" />
              <span>Select Plant:</span>
            </div>

            <button
              onClick={() => setSelectedStationId('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                selectedStationId === 'ALL'
                  ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                  : 'bg-muted/50 text-foreground hover:bg-muted'
              }`}
            >
              <span>All Plants ({selectedAccount.plants?.length})</span>
              <span className="text-[10px] opacity-80">{selectedAccount.capacityKw} kWp</span>
            </button>

            {selectedAccount.plants?.map((plant) => {
              const isPlantActive = selectedStationId === plant.stationId;
              return (
                <button
                  key={plant.stationId}
                  onClick={() => setSelectedStationId(plant.stationId)}
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

      {/* 5 Primary Telemetry Summary Cards in VOS KPI Format */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 w-full">
        {/* PV Live Yield */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-amber-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Total PV Harvest' : 'PV Live Harvest'}
            </CardTitle>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Sun className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-amber-500 font-mono">
              {solarKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
              <div className="flex items-center gap-1.5 truncate">
                <TrendingUp className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="truncate">Daily: {dailyYield.toFixed(1)} kWh ({totalCapacity.toFixed(0)} kWp)</span>
              </div>
              {totalCapacity > 0 && (
                <span className="text-[10px] font-mono font-bold text-amber-500 shrink-0 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {capacityUtilizationPct}% util
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Battery Storage */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-cyan-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Fleet ESS Storage' : 'Battery Storage'}
            </CardTitle>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <BatteryCharging className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-cyan-500 font-mono">
              {batterySoc.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">% SOC</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
              <Activity className="h-3 w-3 text-cyan-500" />
              <span>Flow: {batteryKw >= 0 ? `+${batteryKw.toFixed(1)}` : batteryKw.toFixed(1)} kW</span>
            </div>
          </CardContent>
        </Card>

        {/* Facility Load */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-indigo-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Total Facility Load' : 'Facility Demand'}
            </CardTitle>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
              {loadKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-500 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              <span>100% Self-Powered Bus</span>
            </div>
          </CardContent>
        </Card>

        {/* Grid Interconnection */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-emerald-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Net Grid Dispatch' : 'Grid Interconnect'}
            </CardTitle>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Zap className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-500 font-mono">
              {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">kW</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
              <Radio className="h-3 w-3 text-emerald-500" />
              <span>Synced @ 60.01 Hz (0.02°)</span>
            </div>
          </CardContent>
        </Card>

        {/* Fleet Hardware Health */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-primary/40 transition-all col-span-2 sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {isFleetView ? 'Connected Sites' : 'Hardware Health'}
            </CardTitle>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Cpu className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-primary font-mono">
              {isFleetView ? totalAccounts : '100'} <span className="text-xs text-muted-foreground font-normal">{isFleetView ? 'Accounts' : '%'}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-500 font-medium">
              <ShieldCheck className="h-3 w-3" />
              <span>{nodes.length} Inverter Nodes Active</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Subsystem View Switcher (Synoptic Flow vs Trigonometric Analytics) */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'synoptics' | 'trigonometric')} className="w-full space-y-6">
        <TabsList className="bg-muted/60 p-1 rounded-xl h-auto border border-border/50 gap-1 inline-flex w-fit max-w-full overflow-x-auto">
          <TabsTrigger
            value="synoptics"
            className="gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
          >
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Real-time Synoptic Power Flow</span>
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
            {/* Header & Interactive Control Toggles */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Cpu size={18} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-foreground">
                    {isFleetView
                      ? 'Multi-Site Aggregated Energy Flow Architecture'
                      : selectedPlant
                      ? `Energy Flow · ${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`
                      : `Energy Flow · ${selectedAccount?.name || 'Inverter Hub'}`}
                  </h2>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Dynamic balance between PV harvest, battery storage, facility load, and grid interconnect.
                    </p>
                  )}
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
              <div className="flex flex-col items-center">
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

              {/* Center: Core Hybrid Inverter Hub */}
              <div className="flex flex-col items-center">
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
                        {batterySoc.toFixed(1)}% SOC · LiFePO4
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-cyan-500 font-bold">
                    {batteryKw >= 0 ? `+${batteryKw.toFixed(1)}` : batteryKw.toFixed(1)} kW
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
                        {isFleetView ? 'Total Facility Demand' : 'Industrial Facility Load'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Machine Lines & Operations
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-foreground font-bold">
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
                        {isFleetView ? 'Net Utility Grid Feed-In' : 'Utility Grid Dispatch'}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Synced In-Phase @ 60.01 Hz
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-emerald-500 font-bold">
                    {gridKw >= 0 ? `+${gridKw.toFixed(1)}` : gridKw.toFixed(1)} kW
                  </span>
                </div>
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
        {/* TAB 2: EMBEDDED TRIGONOMETRIC & HARMONIC ANALYTICS           */}
        {/* ============================================================ */}
        <TabsContent value="trigonometric" className="space-y-6 m-0">
          <TrigonometricHistoryGraph installedCapacityKw={totalCapacity} />
        </TabsContent>
      </Tabs>

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
        <CardContent className={inverterViewMode === 'table' ? "p-0" : "p-4 sm:p-5"}>
          {inverterViewMode === 'table' ? (
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
      </div>
    </div>
  );
}

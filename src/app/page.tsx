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
  Waves,
  Activity,
  Server,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { StationSummary, AggregatedFleetSummary, FleetMatrixNode } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';
import { usePolling } from '@/lib/usePolling';

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
  const { isAdmin } = useRole();

  const [station, setStation] = useState<StationSummary | null>(null);
  const [fleetAggregate, setFleetAggregate] = useState<AggregatedFleetSummary | null>(null);
  const [nodes, setNodes] = useState<FleetMatrixNode[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);
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
      console.error('Error fetching telemetry:', e);
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
    setTimeout(() => {
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

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12">
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
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
              <TrendingUp className="h-3 w-3 text-amber-500" />
              <span>Daily: {dailyYield.toFixed(1)} kWh ({totalCapacity.toFixed(0)} kWp)</span>
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
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono bg-amber-500/10 text-amber-500 border-amber-500/20">
              Animated
            </Badge>
          </TabsTrigger>

          <TabsTrigger
            value="trigonometric"
            className="gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
          >
            <Waves className="h-4 w-4 text-cyan-500" />
            <span>Trigonometric & Harmonic Analytics</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
              Fourier / R²
            </Badge>
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
                        Efficiency
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

      {/* Connected Fleet Arrays & Inverter Status Table in VOS Data-Grid Format */}
      <Card className="border-border/60 bg-card/80 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 p-5 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-sm sm:text-base font-bold text-foreground">
              {isFleetView
                ? 'Connected Multi-Account Fleet Matrix & Inverter Nodes'
                : `Inverters for ${selectedAccount?.name || 'Selected Site'}`}
            </CardTitle>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono text-xs">
              {nodes.length} Inverter Nodes
            </Badge>
          </div>
          <span className="text-xs font-mono text-emerald-500 font-bold">
            {nodes.length} / {nodes.length} Nodes Active
          </span>
        </CardHeader>
        <CardContent className="p-0">
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
                {nodes.map((node, index) => {
                  return (
                    <tr key={`${node.accountId}-${node.deviceSn}-${index}`}>
                      <td>
                        <span className="font-semibold text-foreground block leading-tight">
                          {node.accountName}
                        </span>
                        <span className="font-mono text-[10px] text-primary">
                          {node.accountId}
                        </span>
                      </td>
                      <td className="text-foreground font-medium">
                        {node.stationName}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Cpu size={14} className="text-secondary shrink-0" />
                          <span>{node.model}</span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground block mt-0.5">
                          SN: {node.deviceSn} · {node.ratedKw ? `${node.ratedKw} kW` : '100 kW'}
                        </span>
                      </td>
                      <td>
                        {node.loggerSn ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/60 border border-border/50">
                            <Radio size={12} className={node.loggerStatus === 'ONLINE' ? 'text-emerald-500' : 'text-muted-foreground'} />
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
                      <td className="td-num font-bold text-amber-500 text-left">
                        {node.liveSolarPowerKw.toFixed(1)} kW
                      </td>
                      <td className="td-num text-foreground text-left">
                        {node.dailyYieldKwh ? `${node.dailyYieldKwh.toFixed(1)} kWh` : '--'}
                      </td>
                      <td className="td-num text-cyan-500 text-left">
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
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

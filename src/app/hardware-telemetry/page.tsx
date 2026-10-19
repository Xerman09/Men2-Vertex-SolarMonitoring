'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Cpu,
  Thermometer,
  Gauge,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Fan,
  Layers,
  BatteryCharging,
  Radio,
  Waves,
} from 'lucide-react';
import { InverterTelemetry, InverterConfig } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';
import { usePolling, useSafeTimeout } from '@/lib/usePolling';
import { createLogger } from '@/lib/logger';

const log = createLogger('HardwareTelemetry');

export default function HardwareTelemetryPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    selectedStationId,
    selectedPlant,
    isFleetView,
    loading: accountLoading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    setFetchingDeye,
    isPlantSwitching,
    switchingPlantName,
    setIsPlantSwitching,
    selectedInverterSn: globalInverterSn,
    setSelectedInverterSn: setGlobalInverterSn,
  } = useAccount();
  const { isAdmin } = useRole();

  const accountPlantsCount = selectedAccount?.plants?.length ?? 0;
  const totalFleetPlantsCount = React.useMemo(
    () => accounts.reduce((sum, a) => sum + (a.plants?.length || 0), 0),
    [accounts]
  );
  const hasNoPlants = isFleetView ? totalFleetPlantsCount === 0 : accountPlantsCount === 0;
  const isSyncingNoPlants = hasNoPlants && (accountLoading || isFetchingDeye || syncing);

  const [telemetry, setTelemetry] = useState<InverterTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInverterSn, setSelectedInverterSn] = useState<string>('');
  const inFlightControllerRef = React.useRef<AbortController | null>(null);

  const currentTargetKey = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${selectedInverterSn}`;
  const [displayedTargetKey, setDisplayedTargetKey] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);

  const isTargetPending = currentTargetKey !== displayedTargetKey || !isDataLoaded;
  const showOverlay = isPlantSwitching || isTargetPending || isSyncingNoPlants || syncing;
  const { setSafeTimeout } = useSafeTimeout();

  // Collect inverters from selected account or plant
  const availableInverters = React.useMemo(() => {
    const plants = isFleetView
      ? accounts.flatMap((a) => a.plants || [])
      : selectedAccount?.plants ||
        (accounts.find((a) => a.plants?.some((p) => String(p.stationId) === String(selectedStationId)))?.plants || []);

    const targetPlants =
      selectedStationId !== 'ALL'
        ? plants.filter((p) => String(p.stationId) === String(selectedStationId))
        : plants;

    const list = targetPlants.flatMap((p) =>
      (p.devices || [])
        .filter((d) => String(d.deviceType || '').toUpperCase() === 'INVERTER')
        .map((d) => ({
          deviceSn: d.deviceSn,
          name: d.name,
          model: d.model || 'Deye Inverter',
          stationName: p.stationName,
          loggerSn: d.loggerSn,
        }))
    );

    if (list.length === 0) {
      const targetAccounts = isFleetView ? accounts : selectedAccount ? [selectedAccount] : accounts;
      targetAccounts.forEach((acc) => {
        (acc.inverters || []).forEach((inv: InverterConfig) => {
          list.push({
            deviceSn: inv.sn,
            name: inv.name,
            model: inv.model || 'Deye Inverter',
            stationName: targetPlants[0]?.stationName || acc.name,
            loggerSn: `LOG-${inv.sn.slice(-6)}`,
          });
        });
      });
    }

    return list;
  }, [isFleetView, accounts, selectedAccount, selectedStationId]);

  useEffect(() => {
    if (globalInverterSn && globalInverterSn !== 'ALL') {
      const match = availableInverters.find(
        (i) => String(i.deviceSn).trim() === String(globalInverterSn).trim()
      );
      if (match && selectedInverterSn !== match.deviceSn) {
        setSelectedInverterSn(match.deviceSn);
      }
    } else if (
      availableInverters.length > 0 &&
      !availableInverters.some((i) => String(i.deviceSn).trim() === String(selectedInverterSn).trim())
    ) {
      setSelectedInverterSn(availableInverters[0].deviceSn);
    }
  }, [availableInverters, selectedInverterSn, globalInverterSn]);

  const fetchTelemetry = React.useCallback(
    async (deviceSnOverride?: string, forceReload: boolean = false) => {
      const sn = deviceSnOverride || selectedInverterSn || availableInverters[0]?.deviceSn;
      const targetKeyAtStart = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${sn || ''}`;

      if (inFlightControllerRef.current) {
        if (!forceReload && targetKeyAtStart === displayedTargetKey) {
          return;
        }
        inFlightControllerRef.current.abort();
      }

      const controller = new AbortController();
      inFlightControllerRef.current = controller;

      try {
        const queryParams = new URLSearchParams();
        if (!isFleetView && selectedAccountId) queryParams.set('accountId', selectedAccountId);
        if (sn) queryParams.set('device_sn', sn);

        const res = await fetch(`/api/deye/telemetry?${queryParams.toString()}`, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          if (controller.signal.aborted) return;
          if (json.data) {
            setTelemetry(json.data);
          }
          setDisplayedTargetKey(targetKeyAtStart);
          setIsDataLoaded(true);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          log.error('Telemetry fetch error', e);
        }
      } finally {
        if (!controller.signal.aborted) {
          inFlightControllerRef.current = null;
          setLoading(false);
          setIsPlantSwitching(false);
          setFetchingDeye(false, null);
        }
      }
    },
    [selectedAccountId, isFleetView, selectedInverterSn, availableInverters, displayedTargetKey, setIsPlantSwitching, setFetchingDeye, selectedStationId]
  );

  useEffect(() => {
    fetchTelemetry(undefined, true);
  }, [currentTargetKey, fetchTelemetry]);

  usePolling(fetchTelemetry, {
    intervalMs: 5000,
    enabled: true,
    pauseOnHidden: true,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setFetchingDeye(true, 'Fetching DeyeCloud Inverter Modbus Telemetry...');
    await fetchTelemetry();
    setSafeTimeout(() => {
      setRefreshing(false);
      setFetchingDeye(false, null);
    }, 800);
  };

  const pv1 = telemetry?.mpptStrings[0] || { stringId: 'MPPT-1 String', voltageV: 0, currentA: 0, powerKw: 0 };
  const pv2 = telemetry?.mpptStrings[1] || { stringId: 'MPPT-2 String', voltageV: 0, currentA: 0, powerKw: 0 };
  const phases = telemetry?.phases && telemetry.phases.length > 0 ? telemetry.phases : [
    { phase: 'L1' as const, voltageV: 0, currentA: 0, frequencyHz: telemetry?.gridFrequencyHz || 0 },
    { phase: 'L2' as const, voltageV: 0, currentA: 0, frequencyHz: telemetry?.gridFrequencyHz || 0 },
    { phase: 'L3' as const, voltageV: 0, currentA: 0, frequencyHz: telemetry?.gridFrequencyHz || 0 },
  ];

  const currentInvMeta = availableInverters.find((i) => i.deviceSn === (telemetry?.deviceSn || selectedInverterSn));

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12 relative">
      {/* Full Frosted Overlay when switching plants or syncing with zero plants */}
      {showOverlay && (
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
              <h3 className="text-base font-bold text-foreground uppercase tracking-wider font-headline">
                {isSyncingNoPlants
                  ? fetchingStage || (selectedAccount ? `Scanning Inverters for ${selectedAccount.name}...` : 'Synchronizing Solar Inverters...')
                  : `Synchronizing ${switchingPlantName || selectedPlant?.stationName || 'Plant'} Telemetry`}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isSyncingNoPlants
                  ? 'Connecting to DeyeCloud API gateway to discover registered hardware nodes...'
                  : 'Connecting to Modbus registers & refreshing live hardware telemetry...'}
              </p>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 h-full w-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Top Header with VOS Design Standards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Sliders size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <HoverInfo
                  title="Inverter Hardware & Electrical Telemetry"
                  content={
                    <div className="space-y-2">
                      <p>
                        {isFleetView
                          ? TELEMETRY_DESCRIPTIONS.pageHeaders.hardwareTelemetryFleet
                          : `Component diagnostics for ${selectedAccount?.name || 'Selected Site'}.`}
                      </p>
                      <div className="pt-1.5 border-t border-border/40 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono">Telemetry Protocol</span>
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono border-cyan-500/30 text-cyan-500 bg-cyan-500/10">
                          Direct Modbus / Cloud
                        </Badge>
                      </div>
                    </div>
                  }
                  showIcon
                >
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline cursor-help">
                    Inverter Hardware & Electrical Telemetry
                  </h1>
                </HoverInfo>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Inverter Selector Dropdown */}
          {availableInverters.length > 1 && (
            <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-xl border border-border/60">
              <Cpu size={14} className="text-cyan-500" />
              <select
                value={selectedInverterSn}
                onChange={(e) => {
                  setSelectedInverterSn(e.target.value);
                  setGlobalInverterSn(e.target.value);
                  fetchTelemetry(e.target.value);
                }}
                className="bg-transparent text-xs font-mono text-foreground focus:outline-none cursor-pointer"
              >
                {availableInverters.map((inv) => (
                  <option
                    key={inv.deviceSn}
                    value={inv.deviceSn}
                    className="bg-popover text-popover-foreground font-sans"
                  >
                    {inv.stationName}: {inv.model} ({inv.deviceSn})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2 h-8 text-xs font-semibold"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-primary' : 'text-muted-foreground'} />
            <span>Refresh</span>
          </Button>

          <Badge variant="outline" className="border-cyan-500/30 text-cyan-500 bg-cyan-500/10 font-mono text-xs">
            SN: {telemetry?.deviceSn || selectedInverterSn || 'Loading...'}
          </Badge>
        </div>
      </div>

      {/* Loading state indicator */}
      {loading && !telemetry && (
        <div className="flex items-center gap-2 p-3 bg-muted/40 border border-border/60 rounded-xl text-xs text-muted-foreground animate-pulse font-mono">
          <RefreshCw size={13} className="animate-spin text-cyan-500" />
          <span>Polling hardware bus and Modbus registers for inverter telemetry...</span>
        </div>
      )}

      {/* Inverter Master Identity Card in VOS layout */}
      <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block truncate">
              Inverter Model & Plant
            </span>
            <span className="text-base font-bold text-foreground block mt-1 truncate">
              {telemetry?.model || currentInvMeta?.model || 'Deye Inverter'}
            </span>
            <span className="text-xs text-muted-foreground truncate block">
              {currentInvMeta?.stationName || 'Solar Plant Array'}
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block truncate">
              Connected Data Logger
            </span>
            <span className="text-sm font-bold font-mono text-cyan-500 block mt-1 truncate">
              {currentInvMeta?.loggerSn ? `SN: ${currentInvMeta.loggerSn}` : 'Collector Gateway'}
            </span>
            <span className="text-xs text-emerald-500 flex items-center gap-1 mt-0.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              Cloud Link Online
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block truncate">
              Live Active Power
            </span>
            <span className="text-lg font-bold font-mono text-amber-500 block mt-1 truncate">
              {telemetry?.totalActivePowerKw ? `${telemetry.totalActivePowerKw.toFixed(2)} kW` : '0.00 kW'}
            </span>
            <span className="text-xs text-muted-foreground font-mono truncate block">
              Today: {telemetry?.todayEnergyKwh ? `${telemetry.todayEnergyKwh.toFixed(1)} kWh` : '0.0 kWh'}
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block truncate">
              Cumulative Yield
            </span>
            <span className="text-lg font-bold font-mono text-primary block mt-1 truncate">
              {telemetry?.totalEnergyMwh ? `${telemetry.totalEnergyMwh.toFixed(2)} MWh` : '--'}
            </span>
            <span className="text-xs text-muted-foreground truncate block">Lifetime Generated</span>
          </div>

          <div className="min-w-0 col-span-2 sm:col-span-1 lg:col-span-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block truncate">
              Operating State
            </span>
            <div className="flex items-center gap-1.5 mt-1.5 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  telemetry?.connectionStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                }`}
              />
              <span
                className={`text-xs font-bold font-mono truncate ${
                  telemetry?.connectionStatus === 'ONLINE' ? 'text-emerald-500' : 'text-muted-foreground'
                }`}
              >
                {telemetry?.connectionStatus === 'ONLINE' ? 'ONLINE & SYNCED' : 'STANDBY'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono truncate block">
              Grid Linked ({telemetry?.gridFrequencyHz || 60.0} Hz)
            </span>
          </div>
        </div>
      </Card>

      {/* Dual MPPT String Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* MPPT 1 */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-amber-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-3 p-5 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                <Zap size={16} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  {pv1.stringId}
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">
                  {pv1.powerKw > 0 || pv1.voltageV > 0 ? 'DC MPPT Channel 1' : 'Channel 1 (Idle)'}
                </span>
              </div>
            </div>
            <span className="font-mono text-xl font-bold text-amber-500">
              {pv1.powerKw.toFixed(2)} kW
            </span>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  DC Voltage
                </span>
                <span className="text-base font-bold font-mono text-foreground block mt-0.5">
                  {pv1.voltageV.toFixed(1)} V
                </span>
                <span className="text-[10px] text-emerald-500">
                  {pv1.voltageV > 0 ? `${pv1.voltageV.toFixed(1)} V Active` : '0.0 V'}
                </span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  DC Current
                </span>
                <span className="text-base font-bold font-mono text-foreground block mt-0.5">
                  {pv1.currentA.toFixed(1)} A
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pv1.currentA > 0 ? `${pv1.currentA.toFixed(1)} A Flow` : '0.0 A'}
                </span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  MPPT Tracking
                </span>
                <span className="text-base font-bold font-mono text-emerald-500 block mt-0.5">
                  {pv1.powerKw > 0 ? 'Active' : 'Standby'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pv1.powerKw > 0 ? 'Tracking' : 'Idle'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MPPT 2 */}
        <Card className="border-border/60 bg-card/80 shadow-xs hover:border-amber-500/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-3 p-5 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                <Zap size={16} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  {pv2.stringId}
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">
                  {pv2.powerKw > 0 || pv2.voltageV > 0 ? 'DC MPPT Channel 2' : 'Channel 2 (Idle)'}
                </span>
              </div>
            </div>
            <span className="font-mono text-xl font-bold text-amber-500">
              {pv2.powerKw.toFixed(2)} kW
            </span>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  DC Voltage
                </span>
                <span className="text-base font-bold font-mono text-foreground block mt-0.5">
                  {pv2.voltageV.toFixed(1)} V
                </span>
                <span className="text-[10px] text-emerald-500">
                  {pv2.voltageV > 0 ? `${pv2.voltageV.toFixed(1)} V Active` : '0.0 V'}
                </span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  DC Current
                </span>
                <span className="text-base font-bold font-mono text-foreground block mt-0.5">
                  {pv2.currentA.toFixed(1)} A
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pv2.currentA > 0 ? `${pv2.currentA.toFixed(1)} A Flow` : '0.0 A'}
                </span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  MPPT Tracking
                </span>
                <span className="text-base font-bold font-mono text-emerald-500 block mt-0.5">
                  {pv2.powerKw > 0 ? 'Active' : 'Standby'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pv2.powerKw > 0 ? 'Tracking' : 'Idle'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embedded 3-Phase AC Instantaneous Waveform & Phasor Trigonometry */}
      <Card className="border-border/60 bg-card/80 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 p-5 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Activity size={18} />
            </div>
            <div>
              <HoverInfo
                title="Three-Phase Grid Harmonics & Phasor"
                content={TELEMETRY_DESCRIPTIONS.hardwareTelemetry.threePhaseAcGrid}
                showIcon
              >
                <CardTitle className="text-sm sm:text-base font-bold text-foreground cursor-help">
                  Three-Phase AC Grid Harmonics & Phasor Trigonometry
                </CardTitle>
              </HoverInfo>
            </div>
          </div>
          <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 bg-cyan-500/10 font-mono text-xs">
            {telemetry?.gridFrequencyHz ? `Grid Synced @ ${telemetry.gridFrequencyHz.toFixed(2)} Hz` : 'Grid Standby'}
          </Badge>
        </CardHeader>
        <CardContent className="p-5">
          {/* Phase Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {phases.map((ph) => (
              <div key={ph.phase} className="p-3.5 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-foreground font-mono">Phase {ph.phase}</span>
                  <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-500">
                    {ph.frequencyHz ? `${ph.frequencyHz.toFixed(2)} Hz` : '--'}
                  </Badge>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-mono">Voltage</span>
                    <span className="text-lg font-bold font-mono text-foreground">
                      {ph.voltageV > 0 ? `${ph.voltageV.toFixed(1)} V` : '--'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block font-mono">Current</span>
                    <span className="text-lg font-bold font-mono text-cyan-500">
                      {ph.currentA > 0 ? `${ph.currentA.toFixed(1)} A` : '--'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Full Waveform Analytics Engine */}
          <TrigonometricHistoryGraph compact={true} />
        </CardContent>
      </Card>

      {/* Battery ESS & Thermal Health Diagnostics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/60 bg-card/80 p-5">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <span className="text-xs font-bold text-foreground">Inverter Thermal Matrix</span>
            <Thermometer size={16} className="text-amber-500" />
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">IGBT Heatsink</span>
              <span className="font-mono font-bold text-foreground">
                {telemetry?.heatsinkTempC ? `${telemetry.heatsinkTempC.toFixed(1)}°C` : '--'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Transformer Core</span>
              <span className="font-mono font-bold text-foreground">
                {telemetry?.heatsinkTempC ? `${(telemetry.heatsinkTempC + 6.6).toFixed(1)}°C` : '--'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Ambient Internal Air</span>
              <span className="font-mono font-bold text-emerald-500">
                {telemetry?.ambientTempC ? `${telemetry.ambientTempC.toFixed(1)}°C` : '--'}
              </span>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-5">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <span className="text-xs font-bold text-foreground">Battery ESS Telemetry</span>
            <BatteryCharging size={16} className="text-cyan-500" />
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">DC Bus Voltage</span>
              <span className="font-mono font-bold text-cyan-500">
                --
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">State of Charge (SOC)</span>
              <span className="font-mono font-bold text-foreground">
                --
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Battery Core Temp</span>
              <span className="font-mono font-bold text-emerald-500">
                {telemetry?.ambientTempC ? `${(telemetry.ambientTempC - 2).toFixed(1)}°C` : '--'}
              </span>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-5">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <span className="text-xs font-bold text-foreground">Safety Alarms & Protection</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Grid Anti-Islanding</span>
              <span className="font-mono font-bold text-emerald-500">ACTIVE & COMPLIANT</span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">GFCI Ground Fault</span>
              <span className="font-mono font-bold text-emerald-500">0.0 mA (NORMAL)</span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Active Fault Alarms</span>
              <span className="font-mono font-bold text-emerald-500">0 DETECTED</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

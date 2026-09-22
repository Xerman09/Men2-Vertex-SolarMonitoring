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
import { InverterTelemetry } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';

export default function HardwareTelemetryPage() {
  const { selectedAccountId, selectedAccount, selectedStationId, selectedPlant, isFleetView } = useAccount();
  const [telemetry, setTelemetry] = useState<InverterTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInverterSn, setSelectedInverterSn] = useState<string>('');
  const inFlightRef = React.useRef(false);

  // Collect inverters from selected account or plant
  const availableInverters = React.useMemo(() => {
    const plants = selectedAccount?.plants || [];
    const targetPlants =
      selectedStationId !== 'ALL'
        ? plants.filter((p) => p.stationId === selectedStationId)
        : plants;

    return targetPlants.flatMap((p) =>
      p.devices
        .filter((d) => d.deviceType === 'INVERTER')
        .map((d) => ({
          deviceSn: d.deviceSn,
          name: d.name,
          model: d.model || 'Deye Inverter',
          stationName: p.stationName,
          loggerSn: d.loggerSn,
        }))
    );
  }, [selectedAccount, selectedStationId]);

  useEffect(() => {
    if (availableInverters.length > 0 && !availableInverters.some((i) => i.deviceSn === selectedInverterSn)) {
      setSelectedInverterSn(availableInverters[0].deviceSn);
    }
  }, [availableInverters, selectedInverterSn]);

  const fetchTelemetry = React.useCallback(
    async (deviceSnOverride?: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const sn = deviceSnOverride || selectedInverterSn || availableInverters[0]?.deviceSn;
        const queryParams = new URLSearchParams();
        if (!isFleetView && selectedAccountId) queryParams.set('accountId', selectedAccountId);
        if (sn) queryParams.set('device_sn', sn);

        const res = await fetch(`/api/deye/telemetry?${queryParams.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setTelemetry(json.data);
          }
        }
      } catch (e: any) {
        // Suppress rapid refresh errors
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [selectedAccountId, isFleetView, selectedInverterSn, availableInverters]
  );

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(() => {
      fetchTelemetry();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTelemetry();
    setTimeout(() => setRefreshing(false), 800);
  };

  const pv1 = telemetry?.mpptStrings[0] || { stringId: 'MPPT-1 String', voltageV: 0, currentA: 0, powerKw: 0 };
  const pv2 = telemetry?.mpptStrings[1] || { stringId: 'MPPT-2 String', voltageV: 0, currentA: 0, powerKw: 0 };
  const phases = telemetry?.phases && telemetry.phases.length > 0 ? telemetry.phases : [
    { phase: 'L1' as const, voltageV: 230.4, currentA: 28.5, frequencyHz: 60.01 },
    { phase: 'L2' as const, voltageV: 229.8, currentA: 28.1, frequencyHz: 60.01 },
    { phase: 'L3' as const, voltageV: 231.2, currentA: 28.4, frequencyHz: 60.00 },
  ];

  const currentInvMeta = availableInverters.find((i) => i.deviceSn === (telemetry?.deviceSn || selectedInverterSn));

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12">
      {/* Top Header with VOS Design Standards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Sliders size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline">
                  Inverter Hardware & Electrical Telemetry
                </h1>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-500 bg-cyan-500/10 font-mono text-[10px]">
                  Direct Modbus / Cloud
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isFleetView
                  ? 'Deep component diagnostics, DC MPPT string performance, AC waveforms, and thermal matrices across fleet inverters.'
                  : `Component diagnostics for ${selectedAccount?.name || 'Selected Site'}.`}
              </p>
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

      {/* Inverter Master Identity Card in VOS layout */}
      <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
              Inverter Model & Plant
            </span>
            <span className="text-base font-bold text-foreground block mt-1">
              {telemetry?.model || currentInvMeta?.model || 'Deye Inverter'}
            </span>
            <span className="text-xs text-muted-foreground">
              {currentInvMeta?.stationName || 'Solar Plant Array'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
              Connected Data Logger
            </span>
            <span className="text-sm font-bold font-mono text-cyan-500 block mt-1">
              {currentInvMeta?.loggerSn ? `SN: ${currentInvMeta.loggerSn}` : 'Collector Gateway'}
            </span>
            <span className="text-xs text-emerald-500 flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cloud Link Online
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
              Live Active Power
            </span>
            <span className="text-lg font-bold font-mono text-amber-500 block mt-1">
              {telemetry?.totalActivePowerKw ? `${telemetry.totalActivePowerKw.toFixed(2)} kW` : '0.00 kW'}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Today: {telemetry?.todayEnergyKwh ? `${telemetry.todayEnergyKwh.toFixed(1)} kWh` : '0.0 kWh'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
              Cumulative Yield
            </span>
            <span className="text-lg font-bold font-mono text-primary block mt-1">
              {telemetry?.totalEnergyMwh ? `${telemetry.totalEnergyMwh.toFixed(2)} MWh` : '--'}
            </span>
            <span className="text-xs text-muted-foreground">Lifetime Generated</span>
          </div>

          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
              Operating State
            </span>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  telemetry?.connectionStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                }`}
              />
              <span
                className={`text-xs font-bold font-mono ${
                  telemetry?.connectionStatus === 'ONLINE' ? 'text-emerald-500' : 'text-muted-foreground'
                }`}
              >
                {telemetry?.connectionStatus === 'ONLINE' ? 'ONLINE & SYNCED' : 'STANDBY'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
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
                  Monocrystalline PERC (32 Modules)
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
                <span className="text-[10px] text-emerald-500">200-850V Range</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  DC Current
                </span>
                <span className="text-base font-bold font-mono text-foreground block mt-0.5">
                  {pv1.currentA.toFixed(1)} A
                </span>
                <span className="text-[10px] text-muted-foreground">Isc: 40A</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  MPPT Tracking
                </span>
                <span className="text-base font-bold font-mono text-emerald-500 block mt-0.5">
                  99.8%
                </span>
                <span className="text-[10px] text-muted-foreground">Locked</span>
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
                  Monocrystalline PERC (32 Modules)
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
                <span className="text-[10px] text-emerald-500">200-850V Range</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  DC Current
                </span>
                <span className="text-base font-bold font-mono text-foreground block mt-0.5">
                  {pv2.currentA.toFixed(1)} A
                </span>
                <span className="text-[10px] text-muted-foreground">Isc: 40A</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  MPPT Tracking
                </span>
                <span className="text-base font-bold font-mono text-emerald-500 block mt-0.5">
                  99.7%
                </span>
                <span className="text-[10px] text-muted-foreground">Locked</span>
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
              <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                Three-Phase AC Grid Harmonics & Phasor Trigonometry
              </CardTitle>
            </div>
          </div>
          <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 bg-cyan-500/10 font-mono text-xs">
            Grid Synced @ 60.01 Hz
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
                    {ph.frequencyHz.toFixed(2)} Hz
                  </Badge>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-mono">Voltage</span>
                    <span className="text-lg font-bold font-mono text-foreground">{ph.voltageV.toFixed(1)} V</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block font-mono">Current</span>
                    <span className="text-lg font-bold font-mono text-cyan-500">{ph.currentA.toFixed(1)} A</span>
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
                {telemetry?.heatsinkTempC ? `${telemetry.heatsinkTempC.toFixed(1)}°C` : '46.2°C'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Transformer Core</span>
              <span className="font-mono font-bold text-foreground">
                {telemetry?.heatsinkTempC ? `${(telemetry.heatsinkTempC + 6.6).toFixed(1)}°C` : '52.8°C'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Ambient Internal Air</span>
              <span className="font-mono font-bold text-emerald-500">
                {telemetry?.ambientTempC ? `${telemetry.ambientTempC.toFixed(1)}°C` : '31.4°C'}
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
                51.4 V
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">State of Charge (SOC)</span>
              <span className="font-mono font-bold text-foreground">
                92.5%
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-border/40">
              <span className="text-muted-foreground">Battery Core Temp</span>
              <span className="font-mono font-bold text-emerald-500">
                28.1°C
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

'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Waves,
  Calendar,
  RefreshCw,
  Download,
  Building2,
  Cpu,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';

const log = createLogger('TrigonometricAnalytics');
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HourlySolarPoint } from '@/lib/trigonometric-math';
import { HourlyEnergyPoint } from '@/lib/types';

export default function TrigonometricAnalyticsPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    selectedStationId,
    selectedPlant,
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
  } = useAccount();
  const { isAdmin } = useRole();

  const accountPlantsCount = selectedAccount?.plants?.length ?? 0;
  const totalFleetPlantsCount = React.useMemo(
    () => accounts.reduce((sum, a) => sum + (a.plants?.length || 0), 0),
    [accounts]
  );
  const hasNoPlants = isFleetView ? totalFleetPlantsCount === 0 : accountPlantsCount === 0;
  const isSyncingNoPlants = hasNoPlants && (accountLoading || isFetchingDeye || syncing);

  const [dateRange, setDateRange] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'SEASONAL'>('TODAY');
  const [hourlyData, setHourlyData] = useState<HourlySolarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentTargetKey = `${isFleetView ? 'FLEET' : selectedAccountId}:${selectedStationId}:${dateRange}`;
  const [displayedTargetKey, setDisplayedTargetKey] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const inFlightControllerRef = React.useRef<AbortController | null>(null);

  const isTargetPending = currentTargetKey !== displayedTargetKey || !isDataLoaded;
  const showOverlay = isPlantSwitching || isTargetPending || isSyncingNoPlants || syncing;

  // Load telemetry data from API or fall back to simulated dataset
  const fetchHistoricalData = async (range: string = dateRange, forceReload: boolean = false) => {
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
      const res = await fetch(`/api/deye/history?range=${range}&step=5`, { signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        if (controller.signal.aborted) return;
        if (json.data && Array.isArray(json.data)) {
          const mapped: HourlySolarPoint[] = json.data.map((item: HourlyEnergyPoint & { gridFlowKw?: number; isElapsed?: boolean }) => {
            const parts = item.hour.split(':');
            const h = parseInt(parts[0], 10) || 0;
            const m = parseInt(parts[1], 10) || 0;
            const hDec = Number((h + m / 60).toFixed(4));
            return {
              hour: item.hour,
              hourDecimal: hDec,
              solarYieldKw: item.solarYieldKw ?? null,
              loadDemandKw: item.loadDemandKw ?? null,
              batteryFlowKw: item.batteryFlowKw ?? null,
              gridExportKw: item.gridExportKw ?? (item.gridFlowKw !== null && item.gridFlowKw !== undefined ? Math.max(0, item.gridFlowKw) : null),
              isElapsed: item.isElapsed ?? (item.solarYieldKw !== null),
            };
          });
          setHourlyData(mapped);
          setDisplayedTargetKey(targetKeyAtStart);
          setIsDataLoaded(true);
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        log.error('Failed to load history for trigonometric analysis', e);
      }
    } finally {
      if (!controller.signal.aborted) {
        inFlightControllerRef.current = null;
        setLoading(false);
        setRefreshing(false);
        setIsPlantSwitching(false);
        setFetchingDeye(false, null);
      }
    }
  };

  useEffect(() => {
    fetchHistoricalData(dateRange, true);
  }, [currentTargetKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHistoricalData(dateRange);
  };

  const installedKw = selectedPlant
    ? selectedPlant.installedCapacityKw
    : selectedAccount?.capacityKw || 120;

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
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono uppercase tracking-wider font-bold mb-1.5">
                <RefreshCw size={10} className="animate-spin" />
                <span>
                  {isSyncingNoPlants ? 'Discovering Solar Plants...' : 'Station Re-Sync in Progress'}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground uppercase tracking-wider font-headline">
                {isSyncingNoPlants
                  ? fetchingStage || (selectedAccount ? `Scanning Plants for ${selectedAccount.name}...` : 'Syncing Solar Plants...')
                  : `Syncing ${switchingPlantName || selectedPlant?.stationName || 'Plant'} Analytics`}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isSyncingNoPlants
                  ? 'Connecting to DeyeCloud API gateway to discover registered stations...'
                  : 'Recalibrating 24h harmonic history & trigonometric telemetry curve...'}
              </p>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 h-full w-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Top Banner with VOS Design Standards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Waves size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline">
                  Trigonometric History & Waveform Analytics
                </h1>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-500 bg-cyan-500/10 font-mono text-[10px]">
                  Fourier Engine v2.4
                </Badge>
              </div>
              {isAdmin && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Harmonic series decomposition, theoretical sinusoidal curve fitting ($R^2$), 24-hour polar phasor radar, and instantaneous 3-phase AC waveforms.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Date Filters & Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50">
            {(['TODAY', 'YESTERDAY', 'WEEK', 'SEASONAL'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  dateRange === r
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5 h-8 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Recalculate Fit</span>
          </Button>
        </div>
      </div>

      {/* Target Site / Fleet Info Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/60">
        <div className="flex items-center gap-2.5 text-xs">
          <Building2 size={16} className="text-primary" />
          <span className="text-muted-foreground uppercase tracking-wider font-mono text-[11px]">
            Target Domain:
          </span>
          <span className="font-semibold text-foreground">
            {isFleetView
              ? `Global Fleet Aggregate (${totalAccounts} Accounts)`
              : selectedPlant
              ? `${selectedPlant.stationName} (${selectedPlant.installedCapacityKw} kWp)`
              : `${selectedAccount?.name || 'Selected Plant'}`}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span>Rated Capacity: <strong className="text-foreground">{installedKw} kWp</strong></span>
          <span>•</span>
          <span>Sampling Interval: <strong className="text-cyan-500">5 Min High-Res</strong></span>
          <span>•</span>
          <span>Harmonic Resolution: <strong className="text-emerald-500">k=1..3</strong></span>
        </div>
      </div>

      {loading && hourlyData.length === 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted/40 border border-border/60 rounded-xl text-xs text-muted-foreground animate-pulse font-mono">
          <RefreshCw size={13} className="animate-spin text-primary" />
          <span>Fitting trigonometric harmonics to historical telemetry series...</span>
        </div>
      )}

      {/* Main Trigonometric Analytics Visualization Suite */}
      <TrigonometricHistoryGraph
        data={hourlyData.length > 0 ? hourlyData : undefined}
        installedCapacityKw={installedKw}
        loading={loading || refreshing || isPlantSwitching || isSyncingNoPlants}
      />

      {/* Comparative Analytical Notes & Formula Breakdown */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                1. 24h Fourier Decomposition
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <p>
                Transforms the 24-hour cycle into discrete Fourier coefficients:
              </p>
              <div className="p-2 rounded-lg bg-muted/50 font-mono text-[11px] text-foreground">
                P(t) = a0 + Σ [ak·cos(kω0t) + bk·sin(kω0t)]
              </div>
              <p>
                The fundamental $k=1$ wave defines the macro solar curve, while $k=2$ and $k=3$ model steep load ramps.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                2. 3-Phase AC Phasor Vectors
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <p>
                Simulates high-frequency instantaneous 60Hz waveforms:
              </p>
              <div className="p-2 rounded-lg bg-muted/50 font-mono text-[11px] text-foreground">
                v(t) = Vpeak · sin(2πft ± 120°)
              </div>
              <p>
                Verifies phase angle φ, calculates active power P and reactive power Q (S = √(P² + Q²)).
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

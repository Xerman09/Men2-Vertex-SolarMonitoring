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
} from 'lucide-react';
import { TrigonometricHistoryGraph } from '@/components/analytics/TrigonometricHistoryGraph';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HourlySolarPoint } from '@/lib/trigonometric-math';

export default function TrigonometricAnalyticsPage() {
  const {
    selectedAccountId,
    selectedAccount,
    selectedStationId,
    selectedPlant,
    isFleetView,
    totalAccounts,
  } = useAccount();
  const { isAdmin } = useRole();

  const [dateRange, setDateRange] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'SEASONAL'>('TODAY');
  const [hourlyData, setHourlyData] = useState<HourlySolarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load telemetry data from API or fall back to simulated dataset
  const fetchHistoricalData = async (range: string = dateRange) => {
    try {
      const res = await fetch(`/api/deye/history?range=${range}&step=5`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          const mapped: HourlySolarPoint[] = json.data.map((item: any) => {
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
        }
      }
    } catch (e) {
      console.error('Failed to load history for trigonometric analysis:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData(dateRange);
  }, [selectedAccountId, selectedStationId, dateRange]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHistoricalData(dateRange);
  };

  const installedKw = selectedPlant
    ? selectedPlant.installedCapacityKw
    : selectedAccount?.capacityKw || 120;

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12">
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

      {/* Main Trigonometric Analytics Visualization Suite */}
      <TrigonometricHistoryGraph
        data={hourlyData.length > 0 ? hourlyData : undefined}
        installedCapacityKw={installedKw}
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

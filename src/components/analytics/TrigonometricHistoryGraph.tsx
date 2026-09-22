'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Waves,
  Sun,
  Zap,
  Compass,
  TrendingUp,
  Play,
  Pause,
  RefreshCw,
  Radio,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HourlySolarPoint,
  calculateSinusoidalFit,
  calculateFourierDecomposition,
  calculatePolarCyclicalPoints,
  generateThreePhaseACWaveforms,
} from '@/lib/trigonometric-math';
import { getMockHourlyEnergyPoints } from '@/lib/mock-telemetry';

interface TrigonometricHistoryGraphProps {
  data?: HourlySolarPoint[];
  installedCapacityKw?: number;
  compact?: boolean;
}

// Custom tooltip for exact 5-minute continuous data with elapsed & unelapsed distinction
const CustomExactTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  const isElapsed = point?.isElapsed !== false && point?.pvPowerKw !== null;

  return (
    <div className="rounded-xl border border-border/80 bg-background/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-2 min-w-[220px]">
      <div className="flex items-center justify-between border-b border-border/50 pb-1.5 font-mono">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="font-bold text-foreground">{label}</span>
        </div>
        {isElapsed ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            5-Min Telemetry
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
            Unelapsed (Pending)
          </span>
        )}
      </div>

      {isElapsed ? (
        <div className="space-y-1.5 font-mono">
          {payload.map((entry: any, i: number) => {
            if (entry.value === null || entry.value === undefined) return null;
            const valNum = Number(entry.value);
            return (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: entry.color || entry.stroke }}
                  />
                  {entry.name}:
                </span>
                <span className="font-bold text-foreground">
                  {valNum > 0 && entry.dataKey === 'gridPowerKw' ? `+${valNum.toFixed(2)}` : valNum.toFixed(2)} kW
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground italic py-1">
          Future 5-minute interval. The line stops at the current elapsed time.
        </div>
      )}
    </div>
  );
};

export function TrigonometricHistoryGraph({
  data,
  installedCapacityKw = 120,
  compact = false,
}: TrigonometricHistoryGraphProps) {
  // Time resolution in minutes: 5 (default), 15, or 60
  const [timeResolution, setTimeResolution] = useState<5 | 15 | 60>(5);

  // 1. Initial baseline dataset (5-minute resolution = 288 points per day)
  const initialData = useMemo<HourlySolarPoint[]>(() => {
    if (data && data.length > 0) return data;
    return getMockHourlyEnergyPoints('TODAY', undefined, timeResolution).map((pt) => {
      const parts = pt.hour.split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return {
        hour: pt.hour,
        hourDecimal: Number((h + m / 60).toFixed(4)),
        solarYieldKw: pt.solarYieldKw,
        loadDemandKw: pt.loadDemandKw,
        batteryFlowKw: pt.batteryFlowKw,
        gridExportKw: pt.gridFlowKw,
        isElapsed: pt.isElapsed,
      };
    });
  }, [data, timeResolution]);

  const [activeData, setActiveData] = useState<HourlySolarPoint[]>(initialData);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [chartRenderMode, setChartRenderMode] = useState<'line' | 'area'>('line');
  const [activeTab, setActiveTab] = useState<'power' | 'selfconsumption' | 'sinusoidal' | 'fourier' | 'polar' | 'waveform'>('power');
  const [powerSubView, setPowerSubView] = useState<'combined' | 'pv' | 'consumption' | 'grid'>('combined');
  const [acVoltage, setAcVoltage] = useState(230);
  const [acCurrent, setAcCurrent] = useState(85);
  const [powerFactor, setPowerFactor] = useState(0.98);

  // Sync with incoming parent data
  useEffect(() => {
    if (data && data.length > 0) {
      if (timeResolution === 5) {
        setActiveData(data);
      } else {
        // Downsample if needed
        const step = timeResolution / 5;
        setActiveData(data.filter((_, idx) => idx % step === 0));
      }
    }
  }, [data, timeResolution]);

  // Handle resolution change
  const handleResolutionChange = (newRes: 5 | 15 | 60) => {
    setTimeResolution(newRes);
    if (!data || data.length === 0) {
      const newPoints = getMockHourlyEnergyPoints('TODAY', undefined, newRes).map((pt) => {
        const parts = pt.hour.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return {
          hour: pt.hour,
          hourDecimal: Number((h + m / 60).toFixed(4)),
          solarYieldKw: pt.solarYieldKw,
          loadDemandKw: pt.loadDemandKw,
          batteryFlowKw: pt.batteryFlowKw,
          gridExportKw: pt.gridFlowKw,
          isElapsed: pt.isElapsed,
        };
      });
      setActiveData(newPoints);
    }
  };

  // Dynamic live telemetry simulation updating current 5-minute interval
  useEffect(() => {
    if (!isLiveStreaming) return;

    const interval = setInterval(() => {
      setActiveData((prev) => {
        const now = new Date();
        const currentTotalMins = now.getHours() * 60 + now.getMinutes();
        const currentSlotIndex = Math.floor(currentTotalMins / timeResolution);

        return prev.map((pt, idx) => {
          if (idx !== currentSlotIndex) return pt;

          const currentH = now.getHours() + now.getMinutes() / 60;
          const isDaytime = currentH >= 5.75 && currentH <= 18.25;
          const baseSolar = pt.solarYieldKw !== null ? pt.solarYieldKw : (isDaytime ? 115.0 : 0);
          const baseLoad = pt.loadDemandKw !== null ? pt.loadDemandKw : 68.0;

          // Natural dynamic jitter
          const solarJitter = baseSolar > 0 ? (Math.random() - 0.48) * 2.2 : 0;
          const loadJitter = (Math.random() - 0.5) * 1.8;

          const newSolar = Number(Math.max(0, baseSolar + solarJitter).toFixed(2));
          const newLoad = Number(Math.max(10, baseLoad + loadJitter).toFixed(2));
          const newBattery = Number((newSolar > newLoad ? (newSolar - newLoad) * 0.45 : -(newLoad - newSolar) * 0.4).toFixed(2));
          const newGrid = Number((newSolar - newLoad - newBattery).toFixed(2));

          return {
            ...pt,
            solarYieldKw: newSolar,
            loadDemandKw: newLoad,
            batteryFlowKw: newBattery,
            gridExportKw: newGrid,
            isElapsed: true,
          };
        });
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isLiveStreaming, timeResolution]);

  // Manual tick trigger for current 5-minute slot
  const handleManualTick = () => {
    setActiveData((prev) => {
      const now = new Date();
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();
      const currentSlotIndex = Math.floor(currentTotalMins / timeResolution);

      return prev.map((pt, idx) => {
        if (idx !== currentSlotIndex) return pt;
        const currentH = now.getHours() + now.getMinutes() / 60;
        const isDaytime = currentH >= 5.75 && currentH <= 18.25;
        const baseSolar = pt.solarYieldKw ?? (isDaytime ? 112.0 : 0);
        const baseLoad = pt.loadDemandKw ?? 66.0;
        const solarJitter = baseSolar > 0 ? (Math.random() - 0.48) * 3.5 : 0;
        const loadJitter = (Math.random() - 0.5) * 3.0;
        const newSolar = Number(Math.max(0, baseSolar + solarJitter).toFixed(2));
        const newLoad = Number(Math.max(10, baseLoad + loadJitter).toFixed(2));
        const newBattery = Number((newSolar > newLoad ? (newSolar - newLoad) * 0.45 : -(newLoad - newSolar) * 0.4).toFixed(2));
        const newGrid = Number((newSolar - newLoad - newBattery).toFixed(2));
        return {
          ...pt,
          solarYieldKw: newSolar,
          loadDemandKw: newLoad,
          batteryFlowKw: newBattery,
          gridExportKw: newGrid,
          isElapsed: true,
        };
      });
    });
  };

  // Find latest active elapsed point for current live KPI display
  const now = new Date();
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
  const currentSlotIndex = Math.floor(currentTotalMins / timeResolution);

  const currentLivePoint = useMemo(() => {
    if (activeData[currentSlotIndex] && activeData[currentSlotIndex].solarYieldKw !== null) {
      return activeData[currentSlotIndex];
    }
    const elapsed = activeData.filter((d) => d.solarYieldKw !== null);
    return elapsed.length > 0 ? elapsed[elapsed.length - 1] : activeData[0];
  }, [activeData, currentSlotIndex]);

  // Current 5-minute reference label
  const nowSlotMinutes = Math.floor(now.getMinutes() / timeResolution) * timeResolution;
  const nowSlotStr = `${String(now.getHours()).padStart(2, '0')}:${String(nowSlotMinutes).padStart(2, '0')}`;
  const nowExactTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Math engines
  const fitResults = useMemo(() => {
    return calculateSinusoidalFit(activeData, installedCapacityKw);
  }, [activeData, installedCapacityKw]);

  const fourierData = useMemo(() => {
    return calculateFourierDecomposition(activeData);
  }, [activeData]);

  const polarData = useMemo(() => {
    return calculatePolarCyclicalPoints(activeData);
  }, [activeData]);

  const acResults = useMemo(() => {
    return generateThreePhaseACWaveforms(acVoltage, acCurrent, 60.0, powerFactor, 64);
  }, [acVoltage, acCurrent, powerFactor]);

  // Exact power series data (PV green, Consumption yellow, Grid purple)
  // For unelapsed 5-min intervals: values are null so lines strictly terminate at current time
  const powerSeriesData = useMemo(() => {
    return activeData.map((pt) => {
      const isEl = pt.isElapsed ?? (pt.solarYieldKw !== null);
      if (!isEl || pt.solarYieldKw === null) {
        return {
          hour: pt.hour,
          hourDecimal: pt.hourDecimal,
          pvPowerKw: null,
          consumptionKw: null,
          gridPowerKw: null,
          gridImportKw: null,
          gridExportKw: null,
          batteryFlowKw: null,
          isElapsed: false,
        };
      }
      const pv = Number(pt.solarYieldKw.toFixed(2));
      const load = Number((pt.loadDemandKw ?? 0).toFixed(2));
      const grid = Number((pt.gridExportKw ?? 0).toFixed(2));
      return {
        hour: pt.hour,
        hourDecimal: pt.hourDecimal,
        pvPowerKw: pv,
        consumptionKw: load,
        gridPowerKw: grid,
        gridImportKw: Number(Math.max(0, -grid).toFixed(2)),
        gridExportKw: Number(Math.max(0, grid).toFixed(2)),
        batteryFlowKw: pt.batteryFlowKw !== null ? Number(pt.batteryFlowKw.toFixed(2)) : null,
        isElapsed: true,
      };
    });
  }, [activeData]);

  // Self-consumption metrics over elapsed period
  const selfConsumptionMetrics = useMemo(() => {
    let totalPv = 0;
    let totalLoad = 0;
    let totalGridExport = 0;
    let totalGridImport = 0;
    const intervalHours = timeResolution / 60;

    activeData.forEach((pt) => {
      if (pt.solarYieldKw !== null) {
        totalPv += pt.solarYieldKw * intervalHours;
        totalLoad += (pt.loadDemandKw ?? 0) * intervalHours;
        totalGridExport += Math.max(0, pt.gridExportKw ?? 0) * intervalHours;
        totalGridImport += Math.max(0, -(pt.gridExportKw ?? 0)) * intervalHours;
      }
    });

    const selfConsumedPv = Math.max(0, totalPv - totalGridExport);
    const utilizationRate = totalLoad > 0 ? Math.min(1, selfConsumedPv / totalLoad) : 0;
    const pvToImportRatio = totalLoad > 0 ? utilizationRate * 100 : 0;
    const productionSelfConsumptionRate = totalPv > 0 ? Math.min(1, selfConsumedPv / totalPv) : 0;
    const consumptionToExportRatio = productionSelfConsumptionRate * 100;

    const hourlyRatios = activeData.map((pt) => {
      if (pt.solarYieldKw === null) {
        return {
          hour: pt.hour,
          utilizationPct: null,
          productionPct: null,
          pvKw: null,
          loadKw: null,
          selfConsumedKw: null,
          exportKw: null,
          importKw: null,
          isElapsed: false,
        };
      }
      const pvKw = pt.solarYieldKw;
      const loadKw = pt.loadDemandKw ?? 0;
      const exportKw = Math.max(0, pt.gridExportKw ?? 0);
      const importKw = Math.max(0, -(pt.gridExportKw ?? 0));
      const selfConsumed = Math.max(0, pvKw - exportKw);
      const utilRate = loadKw > 0 ? Math.min(100, (selfConsumed / loadKw) * 100) : 0;
      const prodRate = pvKw > 0 ? Math.min(100, (selfConsumed / pvKw) * 100) : 0;
      return {
        hour: pt.hour,
        utilizationPct: Number(utilRate.toFixed(1)),
        productionPct: Number(prodRate.toFixed(1)),
        pvKw: Number(pvKw.toFixed(1)),
        loadKw: Number(loadKw.toFixed(1)),
        selfConsumedKw: Number(selfConsumed.toFixed(1)),
        exportKw: Number(exportKw.toFixed(1)),
        importKw: Number(importKw.toFixed(1)),
        isElapsed: true,
      };
    });

    return {
      utilizationPct: Number(pvToImportRatio.toFixed(1)),
      productionPct: Number(consumptionToExportRatio.toFixed(1)),
      selfConsumedKwh: Number(selfConsumedPv.toFixed(1)),
      totalPvKwh: Number(totalPv.toFixed(1)),
      totalLoadKwh: Number(totalLoad.toFixed(1)),
      totalExportKwh: Number(totalGridExport.toFixed(1)),
      totalImportKwh: Number(totalGridImport.toFixed(1)),
      hourlyRatios,
    };
  }, [activeData, timeResolution]);

  // Color tokens requested by USER:
  // PV Power: Green (#10b981)
  // Consumption: Yellow (#eab308)
  // Grid Power: Purple (#a855f7)
  const COLOR_PV = '#10b981';
  const COLOR_LOAD = '#eab308';
  const COLOR_GRID = '#a855f7';

  // Peak metrics for elapsed points
  const elapsedData = powerSeriesData.filter((d) => d.pvPowerKw !== null);
  const peakPv = elapsedData.length > 0 ? Math.max(...elapsedData.map((d) => d.pvPowerKw || 0)) : 0;
  const peakLoad = elapsedData.length > 0 ? Math.max(...elapsedData.map((d) => d.consumptionKw || 0)) : 0;

  // Discrete 2-hour major ticks for uncluttered X-axis labels while data has 288 points
  const majorXTicks = useMemo(() => {
    return [
      '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
      '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'
    ];
  }, []);

  // Dynamic Y-axis domains with extra headroom & footroom so graphs are never ceiled or floored
  const combinedYDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    powerSeriesData.forEach((d) => {
      if (d.pvPowerKw !== null) vals.push(d.pvPowerKw);
      if (d.consumptionKw !== null) vals.push(d.consumptionKw);
      if (d.gridPowerKw !== null) vals.push(d.gridPowerKw);
    });
    if (vals.length === 0) return [-20, 140];
    const rawMax = Math.max(...vals);
    const rawMin = Math.min(...vals);
    const span = Math.max(30, rawMax - rawMin);
    // 18% extra space on top (never ceiled), 14% on bottom (never floored)
    const topPad = Math.max(12, span * 0.18);
    const botPad = Math.max(10, span * 0.14);
    const maxVal = Math.ceil((rawMax + topPad) / 10) * 10;
    const minVal = Math.floor((rawMin - botPad) / 10) * 10;
    return [minVal, maxVal];
  }, [powerSeriesData]);

  const pvYDomain = useMemo<[number, number]>(() => {
    const vals = powerSeriesData.map((d) => d.pvPowerKw).filter((v): v is number => v !== null);
    if (vals.length === 0) return [-8, 140];
    const rawMax = Math.max(...vals, 10);
    const span = Math.max(20, rawMax);
    const topPad = Math.max(10, span * 0.18);
    const maxVal = Math.ceil((rawMax + topPad) / 10) * 10;
    const minVal = -Math.max(6, Math.round(maxVal * 0.05)); // 5% cushion below 0
    return [minVal, maxVal];
  }, [powerSeriesData]);

  const consumptionYDomain = useMemo<[number, number]>(() => {
    const vals = powerSeriesData.map((d) => d.consumptionKw).filter((v): v is number => v !== null);
    if (vals.length === 0) return [-5, 100];
    const rawMax = Math.max(...vals, 20);
    const rawMin = Math.min(...vals, 0);
    const span = Math.max(20, rawMax - rawMin);
    const topPad = Math.max(10, span * 0.18);
    const maxVal = Math.ceil((rawMax + topPad) / 10) * 10;
    const minVal = -Math.max(5, Math.round(maxVal * 0.05));
    return [minVal, maxVal];
  }, [powerSeriesData]);

  const gridYDomain = useMemo<[number, number]>(() => {
    const vals = powerSeriesData.map((d) => d.gridPowerKw).filter((v): v is number => v !== null);
    if (vals.length === 0) return [-50, 50];
    const rawMax = Math.max(...vals, 10);
    const rawMin = Math.min(...vals, -10);
    const span = Math.max(30, rawMax - rawMin);
    const topPad = Math.max(10, span * 0.18);
    const botPad = Math.max(10, span * 0.14);
    const maxVal = Math.ceil((rawMax + topPad) / 10) * 10;
    const minVal = Math.floor((rawMin - botPad) / 10) * 10;
    return [minVal, maxVal];
  }, [powerSeriesData]);

  const sinusoidalYDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    fitResults.theoreticalPoints.forEach((d) => {
      if (d.actualSolarKw !== null) vals.push(d.actualSolarKw);
      vals.push(d.sinusoidalClearSkyKw);
    });
    if (vals.length === 0) return [-8, 140];
    const rawMax = Math.max(...vals, 20);
    const topPad = Math.max(12, rawMax * 0.18);
    const maxVal = Math.ceil((rawMax + topPad) / 10) * 10;
    const minVal = -Math.max(6, Math.round(maxVal * 0.05));
    return [minVal, maxVal];
  }, [fitResults.theoreticalPoints]);

  const fourierYDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    fourierData.forEach((d) => {
      if (d.actualSolarKw !== null) vals.push(d.actualSolarKw);
      vals.push(d.fundamentalHarmonicKw);
      vals.push(d.fourierReconstructedKw);
    });
    if (vals.length === 0) return [-8, 140];
    const rawMax = Math.max(...vals, 20);
    const rawMin = Math.min(...vals, 0);
    const span = Math.max(20, rawMax - rawMin);
    const topPad = Math.max(12, span * 0.18);
    const maxVal = Math.ceil((rawMax + topPad) / 10) * 10;
    const minVal = rawMin < 0 ? Math.floor((rawMin - span * 0.14) / 10) * 10 : -Math.max(6, Math.round(maxVal * 0.05));
    return [minVal, maxVal];
  }, [fourierData]);

  return (
    <Card className={compact ? "w-full border-border/40 bg-card/60 shadow-none" : "w-full border-border/60 bg-card/80 shadow-xs"}>
      <CardHeader className={compact ? "py-2 px-3 sm:px-3.5 border-b border-border/50" : "py-3 px-4 border-b border-border/50"}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Radio className="h-4 w-4 animate-pulse" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm sm:text-base font-bold">
                  5-Minute Telemetry & Power Curves
                </CardTitle>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-mono text-[10px] px-1.5 py-0 flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    {isLiveStreaming && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isLiveStreaming ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                  </span>
                  {isLiveStreaming ? `LIVE (${timeResolution}m)` : 'PAUSED'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Dynamic Stream & Resolution Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Resolution Selector: 5m, 15m, 1h */}
            <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50">
              {([5, 15, 60] as const).map((mins) => (
                <button
                  key={mins}
                  onClick={() => handleResolutionChange(mins)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    timeResolution === mins
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mins === 5 ? '5m' : mins === 15 ? '15m' : '1h'}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className="gap-1 h-7 px-2 text-[11px] font-semibold"
            >
              {isLiveStreaming ? <Pause className="h-3 w-3 text-amber-500" /> : <Play className="h-3 w-3 text-emerald-500" />}
              <span>{isLiveStreaming ? 'Pause' : 'Resume'}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleManualTick}
              className="gap-1 h-7 px-2 text-[11px] font-semibold"
              title="Manually trigger instantaneous 5-minute fluctuation"
            >
              <RefreshCw className="h-3 w-3 text-cyan-500" />
              <span>Tick</span>
            </Button>
          </div>
        </div>

        {/* Subsystem Tabs */}
        <div className="pt-2">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
            <TabsList className="bg-muted/50 p-0.5 rounded-lg h-auto border border-border/50 inline-flex w-fit max-w-full overflow-x-auto gap-0.5">
              <TabsTrigger value="power" className="text-xs gap-1 px-2.5 py-1 font-medium">
                <Zap className="h-3.5 w-3.5 text-yellow-500" />
                <span>Power Curves</span>
              </TabsTrigger>
              <TabsTrigger value="selfconsumption" className="text-xs gap-1 px-2.5 py-1 font-medium">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span>Self-Consumption</span>
              </TabsTrigger>
              <TabsTrigger value="sinusoidal" className="text-xs gap-1 px-2.5 py-1 font-medium">
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span>Diurnal Fit</span>
              </TabsTrigger>
              <TabsTrigger value="fourier" className="text-xs gap-1 px-2.5 py-1 font-medium">
                <Waves className="h-3.5 w-3.5 text-cyan-500" />
                <span>Fourier</span>
              </TabsTrigger>
              <TabsTrigger value="polar" className="text-xs gap-1 px-2.5 py-1 font-medium">
                <Compass className="h-3.5 w-3.5 text-indigo-500" />
                <span>Polar Radar</span>
              </TabsTrigger>
              <TabsTrigger value="waveform" className="text-xs gap-1 px-2.5 py-1 font-medium">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                <span>3-Phase AC</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className={compact ? 'p-3 pt-2.5 space-y-3' : 'p-4 pt-3.5 space-y-4'}>
        {/* ============================================================ */}
        {/* TAB 1: 5-MINUTE POWER CURVES (DYNAMIC LIVE STREAM)          */}
        {/* ============================================================ */}
        {activeTab === 'power' && (
          <div className="space-y-3.5">
            {/* Real-Time Live Telemetry Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* PV Power (Green) */}
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    PV Power ({currentLivePoint.hour})
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-emerald-500">
                    {currentLivePoint.solarYieldKw !== null ? currentLivePoint.solarYieldKw.toFixed(2) : '0.00'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">kW</span>
                </div>
                <span className="text-[10px] text-emerald-500/80 font-medium block truncate">
                  Peak: {peakPv.toFixed(1)} kW
                </span>
              </div>

              {/* Consumption (Yellow) */}
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    Load ({currentLivePoint.hour})
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-yellow-500">
                    {currentLivePoint.loadDemandKw !== null ? currentLivePoint.loadDemandKw.toFixed(2) : '0.00'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">kW</span>
                </div>
                <span className="text-[10px] text-yellow-500/80 font-medium block truncate">
                  Peak: {peakLoad.toFixed(1)} kW
                </span>
              </div>

              {/* Grid Power (Purple) */}
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    Grid Flow ({currentLivePoint.hour})
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-purple-500">
                    {currentLivePoint.gridExportKw !== null
                      ? `${currentLivePoint.gridExportKw > 0 ? '+' : ''}${currentLivePoint.gridExportKw.toFixed(2)}`
                      : '0.00'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">kW</span>
                </div>
                <span className="text-[10px] text-purple-500/80 font-medium block truncate">
                  {(currentLivePoint.gridExportKw ?? 0) >= 0 ? 'Surplus Export' : 'Grid Import'}
                </span>
              </div>

              {/* Battery Flow (Cyan) */}
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-cyan-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    Battery ({currentLivePoint.hour})
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-cyan-500">
                    {currentLivePoint.batteryFlowKw !== null
                      ? `${currentLivePoint.batteryFlowKw > 0 ? '+' : ''}${currentLivePoint.batteryFlowKw.toFixed(2)}`
                      : '0.00'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">kW</span>
                </div>
                <span className="text-[10px] text-cyan-500/80 font-medium block truncate">
                  {(currentLivePoint.batteryFlowKw ?? 0) >= 0 ? 'Charging' : 'Discharging'}
                </span>
              </div>
            </div>

            {/* Sub-view selector & Style Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50 w-fit flex-wrap">
                {(['combined', 'pv', 'consumption', 'grid'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setPowerSubView(v)}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                      powerSubView === v
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {v === 'combined' && 'Combined'}
                    {v === 'pv' && 'PV (Green)'}
                    {v === 'consumption' && 'Load (Yellow)'}
                    {v === 'grid' && 'Grid (Purple)'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium">Style:</span>
                <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50">
                  <button
                    onClick={() => setChartRenderMode('line')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                      chartRenderMode === 'line'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartRenderMode('area')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                      chartRenderMode === 'area'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Area
                  </button>
                </div>
              </div>
            </div>

            {/* Combined View: PV Green, Consumption Yellow, Grid Purple (5-Minute Continuous) */}
            {powerSubView === 'combined' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      5-Minute Continuous Telemetry — PV (Green) · Consumption (Yellow) · Grid (Purple)
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-border/70 text-muted-foreground bg-muted/40 px-1.5 py-0">
                      Dynamic Scale: {combinedYDomain[0]} kW → {combinedYDomain[1]} kW
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> PV Power
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> Consumption
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Net Grid Flow
                    </span>
                  </div>
                </div>

                <div className={compact ? 'h-[220px] w-full' : 'h-[280px] w-full'}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pvGreenGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLOR_PV} stopOpacity={chartRenderMode === 'area' ? 0.35 : 0.08} />
                          <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="loadYellowGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={chartRenderMode === 'area' ? 0.30 : 0.08} />
                          <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gridPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLOR_GRID} stopOpacity={chartRenderMode === 'area' ? 0.25 : 0.08} />
                          <stop offset="95%" stopColor={COLOR_GRID} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                      <XAxis
                        dataKey="hour"
                        ticks={majorXTicks}
                        stroke="currentColor"
                        className="text-[10px] opacity-60"
                      />
                      <YAxis
                        domain={combinedYDomain}
                        stroke="currentColor"
                        className="text-[10px] opacity-60"
                        unit="kW"
                      />
                      <Tooltip content={<CustomExactTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
                      <ReferenceLine
                        x={nowSlotStr}
                        stroke={COLOR_GRID}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `● Now (${nowExactTimeStr})`,
                          fill: '#c084fc',
                          fontSize: 10,
                          position: 'top',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="pvPowerKw"
                        name="PV Power (kW)"
                        stroke={COLOR_PV}
                        strokeWidth={2}
                        fill="url(#pvGreenGrad)"
                        dot={false}
                        activeDot={{ r: 4.5, stroke: COLOR_PV, strokeWidth: 2, fill: '#fff' }}
                        connectNulls={false}
                        isAnimationActive={true}
                      />
                      <Area
                        type="monotone"
                        dataKey="consumptionKw"
                        name="Consumption (kW)"
                        stroke={COLOR_LOAD}
                        strokeWidth={2}
                        fill="url(#loadYellowGrad)"
                        dot={false}
                        activeDot={{ r: 4.5, stroke: COLOR_LOAD, strokeWidth: 2, fill: '#fff' }}
                        connectNulls={false}
                        isAnimationActive={true}
                      />
                      <Area
                        type="monotone"
                        dataKey="gridPowerKw"
                        name="Grid Power (kW, +export/-import)"
                        stroke={COLOR_GRID}
                        strokeWidth={1.8}
                        fill="url(#gridPurpleGrad)"
                        dot={false}
                        activeDot={{ r: 4.5, stroke: COLOR_GRID, strokeWidth: 2, fill: '#fff' }}
                        connectNulls={false}
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>288 points/day (every {timeResolution} mins) • Elapsed: 00:00 → {nowSlotStr}</span>
                  <span className="text-purple-400">Unelapsed: {nowSlotStr} → 23:55 (Pending)</span>
                </div>
              </div>
            )}

            {/* Individual PV Power (Green) */}
            {powerSubView === 'pv' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    PV Power (Green) — Continuous 5-Minute Solar Generation Profile
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-1.5 py-0">
                    Dynamic Scale: {pvYDomain[0]} kW → {pvYDomain[1]} kW (+18% Headroom)
                  </Badge>
                </div>
                <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="soloPvGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLOR_PV} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                          <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                      <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                      <YAxis domain={pvYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                      <Tooltip content={<CustomExactTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <ReferenceLine
                        x={nowSlotStr}
                        stroke={COLOR_PV}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: `● Now (${nowExactTimeStr})`, fill: COLOR_PV, fontSize: 10, position: 'top' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="pvPowerKw"
                        name="PV Power (kW)"
                        stroke={COLOR_PV}
                        strokeWidth={2.5}
                        fill="url(#soloPvGrad)"
                        dot={false}
                        activeDot={{ r: 5, stroke: COLOR_PV, strokeWidth: 2, fill: '#fff' }}
                        connectNulls={false}
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Individual Consumption (Yellow) */}
            {powerSubView === 'consumption' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Consumption (Yellow) — Continuous 5-Minute Industrial Load Demand Profile
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-yellow-500/30 text-yellow-400 bg-yellow-500/10 px-1.5 py-0">
                    Dynamic Scale: {consumptionYDomain[0]} kW → {consumptionYDomain[1]} kW (+18% Headroom)
                  </Badge>
                </div>
                <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="soloLoadGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                          <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                      <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                      <YAxis domain={consumptionYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                      <Tooltip content={<CustomExactTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <ReferenceLine
                        x={nowSlotStr}
                        stroke={COLOR_LOAD}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: `● Now (${nowExactTimeStr})`, fill: COLOR_LOAD, fontSize: 10, position: 'top' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="consumptionKw"
                        name="Consumption (kW)"
                        stroke={COLOR_LOAD}
                        strokeWidth={2.5}
                        fill="url(#soloLoadGrad)"
                        dot={false}
                        activeDot={{ r: 5, stroke: COLOR_LOAD, strokeWidth: 2, fill: '#fff' }}
                        connectNulls={false}
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Individual Grid Power (Purple) */}
            {powerSubView === 'grid' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Grid Power (Purple) — Continuous 5-Minute Net Exchange (+ Export / − Import)
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-400 bg-purple-500/10 px-1.5 py-0">
                    Dynamic Scale: {gridYDomain[0]} kW → {gridYDomain[1]} kW (+18% Head / +14% Foot)
                  </Badge>
                </div>
                <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={powerSeriesData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="soloGridGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLOR_GRID} stopOpacity={chartRenderMode === 'area' ? 0.45 : 0.12} />
                          <stop offset="95%" stopColor={COLOR_GRID} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                      <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                      <YAxis domain={gridYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                      <Tooltip content={<CustomExactTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <ReferenceLine y={0} stroke="currentColor" className="opacity-40" />
                      <ReferenceLine
                        x={nowSlotStr}
                        stroke={COLOR_GRID}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: `● Now (${nowExactTimeStr})`, fill: COLOR_GRID, fontSize: 10, position: 'top' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="gridPowerKw"
                        name="Grid Power (kW)"
                        stroke={COLOR_GRID}
                        strokeWidth={2.5}
                        fill="url(#soloGridGrad)"
                        dot={false}
                        activeDot={{ r: 5, stroke: COLOR_GRID, strokeWidth: 2, fill: '#fff' }}
                        connectNulls={false}
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono font-medium text-[9.5px]">
                    Positive (+): Solar Export
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono font-medium text-[9.5px]">
                    Negative (−): Grid Import
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: SELF-CONSUMPTION RATIO                                */}
        {/* ============================================================ */}
        {activeTab === 'selfconsumption' && (
          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            {/* KPI Cards with Green, Yellow, Purple alignment */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Utilization Rate</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-500">{selfConsumptionMetrics.utilizationPct}%</span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">Load covered by PV</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-yellow-500/30">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Self-Consumption</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-yellow-500">{selfConsumptionMetrics.productionPct}%</span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">PV consumed locally</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-emerald-500/30">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Self-Consumed kWh</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400">{selfConsumptionMetrics.selfConsumedKwh}</span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">of {selfConsumptionMetrics.totalPvKwh} kWh PV</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-purple-500/30">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">Grid Import</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-purple-400">{selfConsumptionMetrics.totalImportKwh}</span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">of {selfConsumptionMetrics.totalLoadKwh} kWh load</span>
              </div>
            </div>

            {/* Ratio definition cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Utilization */}
              <div className="p-2.5 sm:p-3 rounded-lg bg-card border border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <Zap className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-foreground block">Utilization — PV to Import</span>
                  </div>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, selfConsumptionMetrics.utilizationPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>PV Covered: <strong className="text-emerald-500">{selfConsumptionMetrics.utilizationPct}%</strong></span>
                  <span>Grid Import: <strong className="text-purple-400">{(100 - selfConsumptionMetrics.utilizationPct).toFixed(1)}%</strong></span>
                </div>
              </div>

              {/* Production self-consumption */}
              <div className="p-2.5 sm:p-3 rounded-lg bg-card border border-yellow-500/20 space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                    <TrendingUp className="h-3.5 w-3.5 text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-foreground block">Production — Consumption to Export</span>
                  </div>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, selfConsumptionMetrics.productionPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Self-Consumed: <strong className="text-yellow-500">{selfConsumptionMetrics.productionPct}%</strong></span>
                  <span>Exported: <strong className="text-purple-400">{(100 - selfConsumptionMetrics.productionPct).toFixed(1)}%</strong></span>
                </div>
              </div>
            </div>

            {/* Continuous ratios chart */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">5-Minute Continuous Ratios (%)</span>
              <div className={compact ? 'h-[180px] w-full' : 'h-[230px] w-full'}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selfConsumptionMetrics.hourlyRatios} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLOR_PV} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                    <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                    <YAxis domain={[0, 100]} stroke="currentColor" className="text-[10px] opacity-60" unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(23,31,51,0.95)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <ReferenceLine x={nowSlotStr} stroke="#64748b" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="utilizationPct"
                      name="Utilization % (PV→Load)"
                      stroke={COLOR_PV}
                      strokeWidth={2}
                      fill="url(#utilGrad)"
                      connectNulls={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="productionPct"
                      name="Self-Consumption % (Local PV)"
                      stroke={COLOR_LOAD}
                      strokeWidth={2}
                      fill="url(#prodGrad)"
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: DIURNAL SINUSOIDAL CURVE FIT (THEORETICAL MODEL)      */}
        {/* ============================================================ */}
        {activeTab === 'sinusoidal' && (
          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  Sinusoidal Goodness R²
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-cyan-500">
                  {fitResults.rSquared}
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  Elapsed Correlation
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  Peak Sun Hours (PSH)
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-amber-500">
                  {fitResults.peakSunHours} h
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  1 kW/m² Insolation Equiv
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  Solar Noon Phase Shift
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-foreground">
                  {fitResults.phaseShiftHours > 0 ? `+${fitResults.phaseShiftHours}` : fitResults.phaseShiftHours} h
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  Offset from 12:00 Zenith
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  Harvest Model Efficiency
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-emerald-500">
                  {fitResults.harvestEfficiencyPct}%
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  Of Clear-Sky Integral
                </span>
              </div>
            </div>

            <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fitResults.theoreticalPoints} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="solarActualGreenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLOR_PV} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLOR_PV} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                  <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                  <YAxis domain={sinusoidalYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(23, 31, 51, 0.95)',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <ReferenceLine x={nowSlotStr} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Now', fill: '#94a3b8', fontSize: 10, position: 'top' }} />
                  <Area
                    type="monotone"
                    dataKey="actualSolarKw"
                    name="Actual Measured PV (Green)"
                    stroke={COLOR_PV}
                    strokeWidth={2}
                    fill="url(#solarActualGreenGrad)"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sinusoidalClearSkyKw"
                    name="Theoretical Clear-Sky Model"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="residualKw"
                    name="Model Deviation Residual"
                    stroke={COLOR_GRID}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: FOURIER HARMONIC DECOMPOSITION                        */}
        {/* ============================================================ */}
        {activeTab === 'fourier' && (
          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
              <div>
                <span className="text-xs font-semibold text-foreground">
                  Discrete Fourier Decomposition of 24-Hour Diurnal Cycle
                </span>
              </div>
              <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] px-1.5 py-0 w-fit">
                Harmonics k = 1, 2, 3
              </Badge>
            </div>

            <div className={compact ? 'h-[220px] w-full' : 'h-[270px] w-full'}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fourierData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                  <XAxis dataKey="hour" ticks={majorXTicks} stroke="currentColor" className="text-[10px] opacity-60" />
                  <YAxis domain={fourierYDomain} stroke="currentColor" className="text-[10px] opacity-60" unit="kW" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(23, 31, 51, 0.95)',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <ReferenceLine x={nowSlotStr} stroke="#64748b" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="actualSolarKw"
                    name="Actual Harvest (Green)"
                    stroke={COLOR_PV}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="fundamentalHarmonicKw"
                    name="k=1 Fundamental Diurnal Wave (kW)"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="secondHarmonicKw"
                    name="k=2 12-Hour Asymmetry Wave (kW)"
                    stroke={COLOR_GRID}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="fourierReconstructedKw"
                    name="Fourier Reconstructed Series (kW)"
                    stroke={COLOR_LOAD}
                    strokeWidth={2}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: 24-HOUR POLAR / RADAR CYCLICAL GRAPH                  */}
        {/* ============================================================ */}
        {activeTab === 'polar' && (
          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
              <div>
                <span className="text-xs font-semibold text-foreground">
                  360-Degree Circular Phasor: Solar Lobe (Green) vs Load (Yellow)
                </span>
              </div>
              <Badge variant="outline" className="text-indigo-500 border-indigo-500/30 bg-indigo-500/10 font-mono text-[10px] px-1.5 py-0 w-fit">
                Polar Coordinates (r, θ)
              </Badge>
            </div>

            <div className={compact ? 'h-[240px] w-full' : 'h-[290px] w-full'}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={polarData.filter((_, idx) => idx % (timeResolution === 5 ? 12 : 1) === 0)}>
                  <PolarGrid stroke="currentColor" className="opacity-20" />
                  <PolarAngleAxis dataKey="hourLabel" stroke="currentColor" className="text-[10px] opacity-70" />
                  <PolarRadiusAxis angle={30} domain={[0, 140]} stroke="currentColor" className="text-[9px] opacity-50" />
                  <Radar
                    name="Solar Generation (Green)"
                    dataKey="solarHarvestRadius"
                    stroke={COLOR_PV}
                    fill={COLOR_PV}
                    fillOpacity={0.35}
                  />
                  <Radar
                    name="Industrial Load Demand (Yellow)"
                    dataKey="loadDemandRadius"
                    stroke={COLOR_LOAD}
                    fill={COLOR_LOAD}
                    fillOpacity={0.25}
                  />
                  <Radar
                    name="Battery Energy Flow (Cyan)"
                    dataKey="batteryRadius"
                    stroke="#06b6d4"
                    fill="#06b6d4"
                    fillOpacity={0.25}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(23, 31, 51, 0.95)',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '12px',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: 3-PHASE AC INSTANTANEOUS WAVEFORMS & PHASORS          */}
        {/* ============================================================ */}
        {activeTab === 'waveform' && (
          <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-card border border-border/60">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                  Grid RMS Voltage: {acVoltage} V
                </label>
                <input
                  type="range"
                  min="200"
                  max="260"
                  step="1"
                  value={acVoltage}
                  onChange={(e) => setAcVoltage(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer h-1.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                  RMS Load Current: {acCurrent} A
                </label>
                <input
                  type="range"
                  min="20"
                  max="150"
                  step="1"
                  value={acCurrent}
                  onChange={(e) => setAcCurrent(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer h-1.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                  Power Factor cos(φ): {powerFactor} ({acResults.metrics.phaseAngleDeg}°)
                </label>
                <input
                  type="range"
                  min="0.80"
                  max="1.00"
                  step="0.01"
                  value={powerFactor}
                  onChange={(e) => setPowerFactor(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer h-1.5"
                />
              </div>
            </div>

            <div className={compact ? 'h-[210px] w-full' : 'h-[250px] w-full'}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={acResults.waveform} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-15" />
                  <XAxis dataKey="timeMs" stroke="currentColor" className="text-[10px] opacity-60" unit="ms" />
                  <YAxis stroke="currentColor" className="text-[10px] opacity-60" unit="V" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(23, 31, 51, 0.95)',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '12px',
                    }}
                  />
                  <ReferenceLine y={0} stroke="currentColor" className="opacity-30" />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="voltagePhaseA"
                    name="Phase A: Vm·sin(ωt) [0°]"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="voltagePhaseB"
                    name="Phase B: Vm·sin(ωt - 120°)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="voltagePhaseC"
                    name="Phase C: Vm·sin(ωt + 120°)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentA"
                    name="Phase A Current: Im·sin(ωt - φ)"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
                  Active Power P
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-emerald-500">
                  {acResults.metrics.activePowerKw} kW
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  P = √3 · V · I · cos(φ)
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
                  Reactive Power Q
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-amber-500">
                  {acResults.metrics.reactivePowerKvar} kVAR
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  Q = √3 · V · I · sin(φ)
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
                  Apparent Power S
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-cyan-500">
                  {acResults.metrics.apparentPowerKva} kVA
                </span>
                <span className="text-[9.5px] text-muted-foreground block mt-0.5">
                  S = √(P² + Q²)
                </span>
              </div>

              <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border/60">
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground block">
                  Grid Synchronicity
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-foreground">
                  60.00 Hz
                </span>
                <span className="text-[9.5px] text-emerald-500 block mt-0.5">
                  Phase Locked (0.18% VUF)
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  HourlySolarPoint,
  calculateSinusoidalFit,
  calculateFourierDecomposition,
  calculatePolarCyclicalPoints,
  generateThreePhaseACWaveforms,
  SinusoidalFitResult,
  FourierComponentPoint,
  PolarCyclePoint,
} from '@/lib/trigonometric-math';

export type ThreePhaseACResult = ReturnType<typeof generateThreePhaseACWaveforms>;
import { getMockHourlyEnergyPoints } from '@/lib/mock-telemetry';
import { usePolling } from '@/lib/usePolling';

export interface UseTrigonometricGraphProps {
  data?: HourlySolarPoint[];
  installedCapacityKw?: number;
}

export type TimeResolution = 5 | 15 | 60;
export type ChartTab = 'power' | 'selfconsumption' | 'sinusoidal' | 'fourier' | 'polar' | 'waveform';
export type PowerSubView = 'combined' | 'pv' | 'consumption' | 'grid';
export type ChartRenderMode = 'line' | 'area';

export interface PowerSeriesPoint {
  hour: string;
  hourDecimal: number;
  pvPowerKw: number | null;
  consumptionKw: number | null;
  gridPowerKw: number | null;
  gridImportKw: number | null;
  gridExportKw: number | null;
  batteryFlowKw: number | null;
  isElapsed: boolean;
}

export interface HourlyRatioPoint {
  hour: string;
  utilizationPct: number | null;
  productionPct: number | null;
  pvKw: number | null;
  loadKw: number | null;
  selfConsumedKw: number | null;
  exportKw: number | null;
  importKw: number | null;
  isElapsed: boolean;
}

export interface SelfConsumptionMetrics {
  utilizationPct: number;
  productionPct: number;
  selfConsumedKwh: number;
  totalPvKwh: number;
  totalLoadKwh: number;
  totalExportKwh: number;
  totalImportKwh: number;
  hourlyRatios: HourlyRatioPoint[];
}

export const COLOR_PV = '#10b981';
export const COLOR_LOAD = '#eab308';
export const COLOR_GRID = '#a855f7';

export function useTrigonometricGraph({
  data,
  installedCapacityKw = 120,
}: UseTrigonometricGraphProps = {}) {
  const [timeResolution, setTimeResolution] = useState<TimeResolution>(5);

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
  const [chartRenderMode, setChartRenderMode] = useState<ChartRenderMode>('line');
  const [activeTab, setActiveTab] = useState<ChartTab>('power');
  const [powerSubView, setPowerSubView] = useState<PowerSubView>('combined');
  const [acVoltage, setAcVoltage] = useState(230);
  const [acCurrent, setAcCurrent] = useState(85);
  const [powerFactor, setPowerFactor] = useState(0.98);

  // Sync with incoming parent data
  useEffect(() => {
    if (data && data.length > 0) {
      if (timeResolution === 5) {
        setActiveData(data);
      } else {
        const step = timeResolution / 5;
        setActiveData(data.filter((_, idx) => idx % step === 0));
      }
    }
  }, [data, timeResolution]);

  // Handle resolution change
  const handleResolutionChange = useCallback((newRes: TimeResolution) => {
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
  }, [data]);

  // Periodic sync of current elapsed slot without fabricated Math.random jitter
  usePolling(
    () => {
      setActiveData((prev) => {
        const now = new Date();
        const currentTotalMins = now.getHours() * 60 + now.getMinutes();
        const currentSlotIndex = Math.floor(currentTotalMins / timeResolution);

        return prev.map((pt, idx) => {
          if (idx <= currentSlotIndex && !pt.isElapsed) {
            return {
              ...pt,
              isElapsed: true,
            };
          }
          return pt;
        });
      });
    },
    {
      intervalMs: 5000,
      enabled: isLiveStreaming,
      pauseOnHidden: true,
    }
  );

  // Manual tick trigger for current slot
  const handleManualTick = useCallback(() => {
    setActiveData((prev) => {
      const now = new Date();
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();
      const currentSlotIndex = Math.floor(currentTotalMins / timeResolution);

      return prev.map((pt, idx) => {
        if (idx <= currentSlotIndex) {
          return {
            ...pt,
            isElapsed: true,
          };
        }
        return pt;
      });
    });
  }, [timeResolution]);

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
  const fitResults: SinusoidalFitResult = useMemo(() => {
    return calculateSinusoidalFit(activeData, installedCapacityKw);
  }, [activeData, installedCapacityKw]);

  const fourierData: FourierComponentPoint[] = useMemo(() => {
    return calculateFourierDecomposition(activeData);
  }, [activeData]);

  const polarData: PolarCyclePoint[] = useMemo(() => {
    return calculatePolarCyclicalPoints(activeData);
  }, [activeData]);

  const acResults: ThreePhaseACResult = useMemo(() => {
    return generateThreePhaseACWaveforms(acVoltage, acCurrent, 60.0, powerFactor, 64);
  }, [acVoltage, acCurrent, powerFactor]);

  // Exact power series data (PV green, Consumption yellow, Grid purple)
  const powerSeriesData: PowerSeriesPoint[] = useMemo(() => {
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
  const selfConsumptionMetrics: SelfConsumptionMetrics = useMemo(() => {
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

    const hourlyRatios: HourlyRatioPoint[] = activeData.map((pt) => {
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

  // Peak metrics for elapsed points
  const elapsedData = powerSeriesData.filter((d) => d.pvPowerKw !== null);
  const peakPv = elapsedData.length > 0 ? Math.max(...elapsedData.map((d) => d.pvPowerKw || 0)) : 0;
  const peakLoad = elapsedData.length > 0 ? Math.max(...elapsedData.map((d) => d.consumptionKw || 0)) : 0;

  // Discrete 2-hour major ticks for uncluttered X-axis labels
  const majorXTicks = useMemo(() => {
    return [
      '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
      '12:00', '14:00', '16:00', '18:00', '20:00', '22:00',
    ];
  }, []);

  // Dynamic Y-axis domains
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
    const minVal = -Math.max(6, Math.round(maxVal * 0.05));
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

  return {
    timeResolution,
    activeData,
    isLiveStreaming,
    chartRenderMode,
    activeTab,
    powerSubView,
    acVoltage,
    acCurrent,
    powerFactor,
    currentLivePoint,
    nowSlotStr,
    nowExactTimeStr,
    fitResults,
    fourierData,
    polarData,
    acResults,
    powerSeriesData,
    selfConsumptionMetrics,
    peakPv,
    peakLoad,
    majorXTicks,
    combinedYDomain,
    pvYDomain,
    consumptionYDomain,
    gridYDomain,
    sinusoidalYDomain,
    fourierYDomain,
    // Actions
    setTimeResolution,
    handleResolutionChange,
    setIsLiveStreaming,
    setChartRenderMode,
    setActiveTab,
    setPowerSubView,
    setAcVoltage,
    setAcCurrent,
    setPowerFactor,
    handleManualTick,
  };
}

export type TrigonometricGraphHookReturn = ReturnType<typeof useTrigonometricGraph>;

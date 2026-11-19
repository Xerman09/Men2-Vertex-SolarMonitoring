'use client';

import React, { useState, useMemo, useId, useCallback, useEffect } from 'react';
import { HoverInfo } from '@/components/ui/tooltip';
import { Clock } from 'lucide-react';
import { getManilaNowParts } from '@/lib/manila-time';
import {
  computeSignedYAxisBounds,
  formatSignedKwLabel,
  valueToSvgY,
} from '@/lib/chart-domain';
import { useScopedHistory, type HistoryScope } from './useScopedHistory';

// Exact Color Palette from Analytics Dashboard (src/app/analytics/page.tsx)
const COLOR_SOLAR = '#f59e0b';   // Amber-500 / Solar Gold
const COLOR_LOAD = '#6366f1';    // Indigo-500 / Facility Demand
const COLOR_GRID = '#10b981';    // Emerald-500 / Grid Net Export (+)
const COLOR_IMPORT = '#f43f5e';  // Rose-500 / Grid Net Import (-)
const COLOR_BATTERY = '#06b6d4'; // Cyan-500 / Battery ESS Flow (+Chg/-Dchg)

interface PlantSolarCurveProps {
  capacityKw: number;
  livePowerKw: number;
  dailyYieldKwh?: number;
  demandKw?: number;
  gridPowerKw?: number;
  utilizationPct?: number;
  height?: number | string;
  className?: string;
  showLabels?: boolean;
  variant?: 'compact' | 'tv';
  /**
   * Telemetry scope. Omit both ids for the whole fleet; set accountId for one account;
   * set accountId + stationId for one plant. The curve fetches its own scoped history.
   */
  scope: HistoryScope;
}

interface HoverData {
  timeStr: string;
  solar: number;
  load: number;
  gridNet: number;
  battery: number;
  x: number;
  solarY: number;
  loadY: number;
  gridY: number;
  batteryY: number;
  svgXPercent: number;
  svgYPercent: number;
  isRightHalf: boolean;
}

export function PlantSolarCurve({
  capacityKw,
  livePowerKw,
  dailyYieldKwh = 0,
  demandKw,
  gridPowerKw,
  utilizationPct,
  height,
  className = '',
  showLabels = true,
  variant = 'compact',
  scope,
}: PlantSolarCurveProps) {
  const isTv = variant === 'tv';
  const [hoveredPoint, setHoveredPoint] = useState<HoverData | null>(null);
  const { status: historyStatus, points: historyPoints } = useScopedHistory(scope);

  const rawId = useId();
  const gradId = `analyticsDiurnalGrad-${rawId.replace(/:/g, '')}`;

  const safeCapacityKw = Number.isFinite(capacityKw) && capacityKw > 0 ? capacityKw : 10;
  const safeLivePowerKw = Number.isFinite(livePowerKw) ? livePowerKw : 0;
  const safeDailyYieldKwh = Number.isFinite(dailyYieldKwh) && dailyYieldKwh >= 0 ? dailyYieldKwh : 0;

  // "Now" follows Asia/Manila time (same zone as the history API) and ticks every minute.
  const [nowParts, setNowParts] = useState(() => getManilaNowParts());
  useEffect(() => {
    const timer = setInterval(() => setNowParts(getManilaNowParts()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const nowHour = nowParts.hourFloat;
  const currentTimeStr = `${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}`;

  // No invented values: demand/grid come from telemetry, or are zero when none is reported.
  const currentDemand = demandKw !== undefined && Number.isFinite(demandKw) ? demandKw : 0;
  const currentGridNet = gridPowerKw !== undefined && Number.isFinite(gridPowerKw) && gridPowerKw !== 0
    ? gridPowerKw
    : parseFloat((safeLivePowerKw - currentDemand).toFixed(1));
  const currentUtil = utilizationPct !== undefined && Number.isFinite(utilizationPct)
    ? utilizationPct
    : (safeCapacityKw > 0 ? Math.min(100, Math.max(0, (safeLivePowerKw / safeCapacityKw) * 100)) : 0);

  // Real 5-minute telemetry for exactly this scope (already in actual kW, never re-scaled).
  const points = useMemo(() => {
    return historyPoints.map((pt) => {
      const parts = String(pt.hour || '00:00').split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const hourFloat = h + m / 60;
      const isFuture = hourFloat > nowHour;
      const num = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(v) ? v : 0);
      const solar = num(pt.solarYieldKw);
      const load = num(pt.loadDemandKw);
      const battery = num(pt.batteryFlowKw);
      const grid =
        pt.gridFlowKw !== null && pt.gridFlowKw !== undefined && Number.isFinite(pt.gridFlowKw)
          ? pt.gridFlowKw
          : solar - load - battery;

      return {
        hour: hourFloat,
        label: pt.hour || `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        solar: parseFloat(solar.toFixed(2)),
        load: parseFloat(load.toFixed(2)),
        gridNet: parseFloat(grid.toFixed(2)),
        battery: parseFloat(battery.toFixed(2)),
        isNow: Math.abs(hourFloat - nowHour) <= 0.05,
        isFuture,
      };
    });
  }, [historyPoints, nowHour]);

  const hasBatteryFlow = useMemo(
    () => points.some((p) => !p.isFuture && Math.abs(p.battery) > 0.05),
    [points]
  );

  // SVG dimensions: bigger graph drawing area
  const width = 280;
  const paddingX = 6;
  const paddingY = 4;
  const plotWidth = width - paddingX * 2;
  const svgHeight = 60;
  const plotHeight = svgHeight - paddingY * 2;

  // Compute signed [min, max] bounds across all plotted curves (including negative Grid Import & ESS discharge)
  const yBounds = useMemo(() => {
    const setKwp = Math.max(safeCapacityKw || 10, 10);
    const values: number[] = [safeLivePowerKw, currentDemand, currentGridNet];
    for (const p of points) {
      if (p.isFuture) continue;
      values.push(p.solar, p.load, p.gridNet);
      if (hasBatteryFlow) values.push(p.battery);
    }
    return computeSignedYAxisBounds(values, setKwp, 0.1);
  }, [safeCapacityKw, safeLivePowerKw, currentDemand, currentGridNet, points, hasBatteryFlow]);

  const zeroY = useMemo(
    () => valueToSvgY(0, yBounds.min, yBounds.max, paddingY, plotHeight),
    [yBounds, paddingY, plotHeight]
  );

  const zeroOffsetRatio = useMemo(() => {
    const raw = (zeroY - paddingY) / plotHeight;
    return Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 1));
  }, [zeroY, paddingY, plotHeight]);

  const coords = useMemo(() => {
    return points.map((p) => {
      // Linear mapping of 0..24 hours across [paddingX, paddingX + plotWidth]
      const validHour = Number.isFinite(p.hour) ? Math.min(24, Math.max(0, p.hour)) : 0;
      const x = paddingX + (validHour / 24) * plotWidth;
      const validSolar = Number.isFinite(p.solar) ? p.solar : 0;
      const validLoad = Number.isFinite(p.load) ? p.load : 0;
      const validGrid = Number.isFinite(p.gridNet) ? p.gridNet : 0;
      const validBat = Number.isFinite(p.battery) ? p.battery : 0;
      const solarY = valueToSvgY(validSolar, yBounds.min, yBounds.max, paddingY, plotHeight);
      const loadY = valueToSvgY(validLoad, yBounds.min, yBounds.max, paddingY, plotHeight);
      const gridY = valueToSvgY(validGrid, yBounds.min, yBounds.max, paddingY, plotHeight);
      const batteryY = valueToSvgY(validBat, yBounds.min, yBounds.max, paddingY, plotHeight);
      return { ...p, x, solarY, loadY, gridY, batteryY };
    });
  }, [points, yBounds, plotWidth, plotHeight, paddingX, paddingY]);

  // Elapsed curve coordinates only up to current time (no future values!)
  const elapsedCoords = useMemo(() => {
    const elapsed = coords.filter((c) => c.hour <= nowHour);
    const nowX = paddingX + (Math.min(24, Math.max(0, nowHour)) / 24) * plotWidth;
    const lastElapsed = elapsed.length > 0 ? elapsed[elapsed.length - 1] : null;
    const effectiveNowSolar =
      safeLivePowerKw !== 0 || !historyPoints || historyPoints.length === 0
        ? safeLivePowerKw
        : (lastElapsed?.solar ?? safeLivePowerKw);
    const effectiveNowLoad =
      (demandKw !== undefined && Number.isFinite(demandKw) && demandKw !== 0) || !historyPoints || historyPoints.length === 0
        ? currentDemand
        : (lastElapsed?.load ?? currentDemand);
    const effectiveNowGrid =
      gridPowerKw !== undefined && Number.isFinite(gridPowerKw) && gridPowerKw !== 0
        ? gridPowerKw
        : historyPoints && historyPoints.length > 0 && lastElapsed
          ? lastElapsed.gridNet
          : parseFloat((effectiveNowSolar - effectiveNowLoad).toFixed(2));
    const effectiveNowBat = lastElapsed?.battery ?? 0;

    const nowSolarY = valueToSvgY(effectiveNowSolar, yBounds.min, yBounds.max, paddingY, plotHeight);
    const nowLoadY = valueToSvgY(effectiveNowLoad, yBounds.min, yBounds.max, paddingY, plotHeight);
    const nowGridY = valueToSvgY(effectiveNowGrid, yBounds.min, yBounds.max, paddingY, plotHeight);
    const nowBatY = valueToSvgY(effectiveNowBat, yBounds.min, yBounds.max, paddingY, plotHeight);

    const list = [...elapsed];
    // Ensure final coordinate anchors precisely at the current moment
    if (list.length === 0) {
      list.push({
        hour: 0,
        label: '00:00',
        solar: 0,
        load: 0,
        gridNet: 0,
        battery: 0,
        isNow: false,
        isFuture: false,
        x: paddingX,
        solarY: zeroY,
        loadY: zeroY,
        gridY: zeroY,
        batteryY: zeroY,
      });
    }
    if (Math.abs(list[list.length - 1].x - nowX) > 1) {
      list.push({
        hour: nowHour,
        label: `${String(Math.floor(nowHour)).padStart(2, '0')}:${String(Math.floor((nowHour % 1) * 60)).padStart(2, '0')}`,
        solar: effectiveNowSolar,
        load: effectiveNowLoad,
        gridNet: effectiveNowGrid,
        battery: effectiveNowBat,
        isNow: true,
        isFuture: false,
        x: nowX,
        solarY: nowSolarY,
        loadY: nowLoadY,
        gridY: nowGridY,
        batteryY: nowBatY,
      });
    } else {
      list[list.length - 1] = {
        ...list[list.length - 1],
        solar: effectiveNowSolar,
        load: effectiveNowLoad,
        gridNet: effectiveNowGrid,
        battery: effectiveNowBat,
        x: nowX,
        solarY: nowSolarY,
        loadY: nowLoadY,
        gridY: nowGridY,
        batteryY: nowBatY,
      };
    }
    return list;
  }, [coords, nowHour, paddingX, plotWidth, paddingY, plotHeight, yBounds, zeroY, safeLivePowerKw, demandKw, gridPowerKw, historyPoints, currentDemand]);

  const nowCoord = elapsedCoords.length > 0 ? elapsedCoords[elapsedCoords.length - 1] : null;

  const svgPaths = useMemo(() => {
    if (elapsedCoords.length === 0) {
      return { solarLine: '', solarArea: '', loadLine: '', loadArea: '', gridLine: '', gridArea: '', batteryLine: '' };
    }

    let solarLine = `M ${elapsedCoords[0].x} ${elapsedCoords[0].solarY}`;
    let loadLine = `M ${elapsedCoords[0].x} ${elapsedCoords[0].loadY}`;
    let gridLine = `M ${elapsedCoords[0].x} ${elapsedCoords[0].gridY}`;
    let batteryLine = `M ${elapsedCoords[0].x} ${elapsedCoords[0].batteryY}`;

    for (let i = 1; i < elapsedCoords.length; i++) {
      const prev = elapsedCoords[i - 1];
      const curr = elapsedCoords[i];
      const midX = (prev.x + curr.x) / 2;
      solarLine += ` C ${midX} ${prev.solarY}, ${midX} ${curr.solarY}, ${curr.x} ${curr.solarY}`;
      loadLine += ` C ${midX} ${prev.loadY}, ${midX} ${curr.loadY}, ${curr.x} ${curr.loadY}`;
      gridLine += ` C ${midX} ${prev.gridY}, ${midX} ${curr.gridY}, ${curr.x} ${curr.gridY}`;
      batteryLine += ` C ${midX} ${prev.batteryY}, ${midX} ${curr.batteryY}, ${curr.x} ${curr.batteryY}`;
    }

    const first = elapsedCoords[0];
    const last = elapsedCoords[elapsedCoords.length - 1];

    const solarArea = `${solarLine} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z`;
    const loadArea = `${loadLine} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z`;
    const gridArea = `${gridLine} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z`;

    return { solarLine, solarArea, loadLine, loadArea, gridLine, gridArea, batteryLine };
  }, [elapsedCoords, zeroY]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width || elapsedCoords.length === 0) return;
      const clientX = e.clientX - rect.left;
      const svgX = (clientX / rect.width) * width;
      const clampedSvgX = Math.max(paddingX, Math.min(width - paddingX, svgX));

      // Find the closest point in elapsedCoords to the cursor position
      let closest = elapsedCoords[0];
      let minDiff = Math.abs(elapsedCoords[0].x - clampedSvgX);

      for (let i = 1; i < elapsedCoords.length; i++) {
        const diff = Math.abs(elapsedCoords[i].x - clampedSvgX);
        if (diff < minDiff) {
          minDiff = diff;
          closest = elapsedCoords[i];
        }
      }

      setHoveredPoint({
        timeStr: closest.label,
        solar: closest.solar,
        load: closest.load,
        gridNet: closest.gridNet,
        battery: closest.battery,
        x: closest.x,
        solarY: closest.solarY,
        loadY: closest.loadY,
        gridY: closest.gridY,
        batteryY: closest.batteryY,
        svgXPercent: (closest.x / width) * 100,
        svgYPercent: (closest.solarY / svgHeight) * 100,
        isRightHalf: closest.x > width * 0.55,
      });
    },
    [elapsedCoords, paddingX, width, svgHeight]
  );

  const heightStyle = height !== undefined
    ? (typeof height === 'number' ? { height: `${height}px` } : { height })
    : undefined;

  return (
    <div className={`relative w-full select-none flex flex-col flex-1 h-full ${className}`}>
      {/* Telemetry Header Above Graph: Never covers the curve */}
      <div
        className={`flex items-center justify-between text-muted-foreground shrink-0 flex-wrap ${
          isTv
            ? 'text-xs sm:text-sm mb-2.5 px-0.5 gap-3 min-h-[28px]'
            : 'text-[8px] sm:text-[8.5px] mb-1.5 px-0.5 gap-1.5 min-h-[22px]'
        }`}
      >
        {hoveredPoint ? (
          <div className="flex items-center gap-2 sm:gap-3 font-mono flex-wrap">
            <span
              className={`flex items-center gap-1 font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded ${
                isTv ? 'text-xs sm:text-sm' : 'text-[8px] sm:text-[8.5px]'
              }`}
            >
              <Clock className={isTv ? 'size-3.5 text-primary' : 'size-2.5 sm:size-3 text-primary'} />
              {hoveredPoint.timeStr}
            </span>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLOR_SOLAR }} />
              <span className="text-muted-foreground/80">PV:</span>
              <span className="font-bold text-amber-500 whitespace-nowrap">
                {(hoveredPoint.solar ?? 0).toFixed(2)} kW
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLOR_LOAD }} />
              <span className="text-muted-foreground/80">Demand:</span>
              <span className="font-bold text-indigo-400 whitespace-nowrap">
                {(hoveredPoint.load ?? 0).toFixed(2)} kW
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="size-1.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: (hoveredPoint.gridNet ?? 0) >= 0 ? COLOR_GRID : COLOR_IMPORT }}
              />
              <span className="text-muted-foreground/80">Grid:</span>
              <span className={`font-bold whitespace-nowrap ${(hoveredPoint.gridNet ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                {(hoveredPoint.gridNet ?? 0) >= 0 ? `+${(hoveredPoint.gridNet ?? 0).toFixed(2)}` : (hoveredPoint.gridNet ?? 0).toFixed(2)} kW
              </span>
            </div>
            {hasBatteryFlow && (
              <div className="flex items-center gap-1">
                <span className="size-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLOR_BATTERY }} />
                <span className="text-muted-foreground/80">BESS:</span>
                <span className="font-bold text-cyan-400 whitespace-nowrap">
                  {(hoveredPoint.battery ?? 0) > 0 ? `+${(hoveredPoint.battery ?? 0).toFixed(2)}` : (hoveredPoint.battery ?? 0).toFixed(2)} kW
                </span>
              </div>
            )}
          </div>
        ) : showLabels ? (
          isTv ? (
            <div className="flex items-center gap-3 sm:gap-4 font-mono flex-wrap">
              <span className="flex items-center gap-1 font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs sm:text-sm">
                <Clock className="size-3.5 text-primary" />
                {currentTimeStr}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full bg-amber-500 inline-block shrink-0" />
                Solar
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full bg-indigo-500 inline-block shrink-0" />
                Demand
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                Grid Net
              </span>
              {hasBatteryFlow && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-cyan-400 inline-block shrink-0" />
                  BESS
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3 font-mono flex-wrap">
              <span className="flex items-center gap-1 font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[8px] sm:text-[8.5px]">
                <Clock className="size-2.5 sm:size-3 text-primary" />
                {currentTimeStr}
              </span>
              {/* Live Solar Harvest (Amber #f59e0b) - NOT GREEN */}
              <HoverInfo
                title="Solar Generation & Harvest"
                content="Real-time photovoltaic solar generation output across active inverters and daily cumulative energy yield."
              >
                <div className="flex items-center gap-1 cursor-help">
                  <span className="size-1.5 rounded-full bg-amber-500 inline-block animate-pulse shrink-0" />
                  <span className="text-muted-foreground/80">Solar:</span>
                  <span className="font-bold text-amber-500 whitespace-nowrap">
                    {(livePowerKw ?? 0).toFixed(1)} kW
                  </span>
                  {dailyYieldKwh !== undefined && dailyYieldKwh > 0 && (
                    <span className="text-amber-500/80 font-normal text-[7.5px] sm:text-[8px] whitespace-nowrap">
                      ({(dailyYieldKwh ?? 0).toFixed(1)} kWh)
                    </span>
                  )}
                </div>
              </HoverInfo>

              {/* Demand with numeric value (Indigo #6366f1) */}
              <HoverInfo
                title="Facility Demand (Load)"
                content="Current facility electrical power demand required by connected equipment and industrial circuits."
              >
                <div className="flex items-center gap-1 cursor-help">
                  <span className="size-1.5 rounded-full bg-indigo-500 inline-block shrink-0" />
                  <span className="text-muted-foreground/80">Demand:</span>
                  <span className="font-bold text-indigo-400 whitespace-nowrap">
                    {(currentDemand ?? 0).toFixed(1)} kW
                  </span>
                </div>
              </HoverInfo>

              {/* Grid Net Exchange (Emerald Green #10b981) - Same as Analytics Dashboard */}
              <HoverInfo
                title="Grid Net Exchange"
                content="Net exchange with utility grid (+ Export to grid / − Import from grid)."
              >
                <div className="flex items-center gap-1 cursor-help">
                  <span className="size-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                  <span className="text-muted-foreground/80">Grid Net:</span>
                  <span className={`font-bold whitespace-nowrap ${(currentGridNet ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                    {(currentGridNet ?? 0) >= 0 ? `+${(currentGridNet ?? 0).toFixed(1)}` : (currentGridNet ?? 0).toFixed(1)} kW
                  </span>
                </div>
              </HoverInfo>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 font-mono text-[7.5px] sm:text-[8px] text-muted-foreground/70">
            <span className="flex items-center gap-1 font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[8px] sm:text-[8.5px]">
              <Clock className="size-2.5 sm:size-3 text-primary" />
              {currentTimeStr}
            </span>
            <span className="size-1.5 rounded-full bg-amber-500/70 inline-block shrink-0" />
            <span>Solar: <strong className="text-amber-500">{(livePowerKw ?? 0).toFixed(1)} kW</strong></span>
            {dailyYieldKwh !== undefined && dailyYieldKwh > 0 && <span>({(dailyYieldKwh ?? 0).toFixed(1)} kWh)</span>}
          </div>
        )}
      </div>

      {/* Full-height graph container covering the whole card */}
      <div
        className={`relative w-full overflow-hidden flex-1 flex flex-col justify-between min-h-0 ${
          isTv
            ? 'bg-transparent p-0'
            : 'rounded-lg bg-card/70 border border-border/50 p-1.5'
        }`}
        style={heightStyle ? heightStyle : { minHeight: '100px' }}
      >
        {/* Main Plot Area: Y-Axis Column on Left + Chart Canvas in Center + Vertical Utilization on Right */}
        <div className={`flex flex-1 min-h-0 w-full items-stretch ${isTv ? 'gap-2' : 'gap-1'}`}>
          {/* Y-Axis Column */}
          <div
            className={`flex flex-col shrink-0 select-none pt-0.5 border-r border-border/40 font-mono text-muted-foreground/80 ${
              isTv
                ? 'pb-7 w-14 sm:w-16 pr-2.5 text-xs sm:text-sm'
                : 'pb-4 w-9 sm:w-10 pr-1 text-[7.5px] sm:text-[8px]'
            }`}
          >
            <div className="relative flex-1 flex flex-col justify-between items-end w-full">
              <div className="flex items-center gap-0.5 justify-end w-full leading-none">
                <span className="font-semibold text-foreground/90">{formatSignedKwLabel(yBounds.max)}</span>
                <span className={isTv ? 'text-[11px] text-muted-foreground' : 'text-[6.5px] text-muted-foreground'}>kW</span>
              </div>
              <div className="flex items-center justify-end w-full leading-none text-muted-foreground/75">
                <span>{formatSignedKwLabel((yBounds.max + yBounds.min) * 0.5)}</span>
              </div>
              <div className="flex items-center justify-end w-full leading-none text-muted-foreground/75">
                <span>{formatSignedKwLabel(yBounds.min)}</span>
              </div>
              {yBounds.min < 0 &&
                zeroOffsetRatio * 100 >= 18 &&
                zeroOffsetRatio * 100 <= 82 &&
                Math.abs(zeroOffsetRatio * 100 - 50) > 14 && (
                  <span
                    className={`pointer-events-none absolute right-0 -translate-y-1/2 text-foreground/85 font-semibold leading-none ${
                      isTv ? 'text-xs' : 'text-[7px]'
                    }`}
                    style={{ top: `${(zeroOffsetRatio * 100).toFixed(1)}%` }}
                  >
                    0
                  </span>
                )}
            </div>
          </div>

          {/* SVG & X-Axis Container */}
          <div className="relative flex-1 min-w-0 min-h-0 flex flex-col justify-between">
            <svg
              viewBox={`0 0 ${width} ${svgHeight}`}
              preserveAspectRatio="none"
              className="w-full flex-1 overflow-visible cursor-crosshair block min-h-0"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                {/* Exact colorSolar from Analytics Dashboard: #f59e0b (fades to 0 at 0 kW line) */}
                <linearGradient
                  id={`${gradId}-solar`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1={paddingY}
                  x2="0"
                  y2={paddingY + plotHeight}
                >
                  <stop offset="0%" stopColor={COLOR_SOLAR} stopOpacity={0.75} />
                  <stop offset={`${(zeroOffsetRatio * 100).toFixed(2)}%`} stopColor={COLOR_SOLAR} stopOpacity={0.0} />
                  {yBounds.min < 0 && <stop offset="100%" stopColor={COLOR_SOLAR} stopOpacity={0.45} />}
                </linearGradient>

                {/* Exact colorLoad from Analytics Dashboard: #6366f1 (fades to 0 at 0 kW line) */}
                <linearGradient
                  id={`${gradId}-load`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1={paddingY}
                  x2="0"
                  y2={paddingY + plotHeight}
                >
                  <stop offset="0%" stopColor={COLOR_LOAD} stopOpacity={0.35} />
                  <stop offset={`${(zeroOffsetRatio * 100).toFixed(2)}%`} stopColor={COLOR_LOAD} stopOpacity={0.0} />
                  {yBounds.min < 0 && <stop offset="100%" stopColor={COLOR_LOAD} stopOpacity={0.25} />}
                </linearGradient>

                {/* Signed Grid Net gradient: emerald above 0 (+export), rose below 0 (-import) */}
                <linearGradient
                  id={`${gradId}-grid-fill`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1={paddingY}
                  x2="0"
                  y2={paddingY + plotHeight}
                >
                  <stop offset="0%" stopColor={COLOR_GRID} stopOpacity={0.22} />
                  <stop offset={`${(zeroOffsetRatio * 100).toFixed(2)}%`} stopColor={COLOR_GRID} stopOpacity={0.0} />
                  {yBounds.min < 0 && (
                    <>
                      <stop offset={`${(zeroOffsetRatio * 100).toFixed(2)}%`} stopColor={COLOR_IMPORT} stopOpacity={0.04} />
                      <stop offset="100%" stopColor={COLOR_IMPORT} stopOpacity={0.28} />
                    </>
                  )}
                </linearGradient>

                {yBounds.min < 0 && (
                  <linearGradient
                    id={`${gradId}-grid-stroke`}
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1={paddingY}
                    x2="0"
                    y2={paddingY + plotHeight}
                  >
                    <stop offset={`${(zeroOffsetRatio * 100).toFixed(2)}%`} stopColor={COLOR_GRID} />
                    <stop offset={`${(zeroOffsetRatio * 100).toFixed(2)}%`} stopColor={COLOR_IMPORT} />
                  </linearGradient>
                )}

                {/* Plot boundary clip path to guarantee paths never leak outside */}
                <clipPath id={`${gradId}-plot-clip`}>
                  <rect x={paddingX} y={paddingY} width={plotWidth} height={plotHeight} rx={1} />
                </clipPath>
              </defs>

              {/* Background Grid Lines matching CartesianGrid in Analytics */}
              <line
                x1={paddingX}
                y1={paddingY}
                x2={width - paddingX}
                y2={paddingY}
                stroke="hsl(var(--border) / 0.2)"
                strokeDasharray="2 3"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={paddingX}
                y1={paddingY + plotHeight * 0.5}
                x2={width - paddingX}
                y2={paddingY + plotHeight * 0.5}
                stroke="hsl(var(--border) / 0.35)"
                strokeDasharray="3 3"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={paddingX}
                y1={paddingY + plotHeight}
                x2={width - paddingX}
                y2={paddingY + plotHeight}
                stroke="hsl(var(--border) / 0.45)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {yBounds.min < 0 && (
                <line
                  x1={paddingX}
                  y1={zeroY}
                  x2={width - paddingX}
                  y2={zeroY}
                  stroke="hsl(var(--border) / 0.75)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* Clipped Curve Layers */}
              <g clipPath={`url(#${gradId}-plot-clip)`}>
                {/* Net Grid Exchange Area & Line (+Export Emerald / -Import Rose) */}
                <path d={svgPaths.gridArea} fill={`url(#${gradId}-grid-fill)`} />
                <path
                  d={svgPaths.gridLine}
                  fill="none"
                  stroke={yBounds.min < 0 ? `url(#${gradId}-grid-stroke)` : COLOR_GRID}
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />

                {/* Facility Demand Area & Line (Analytics colorLoad #6366f1) */}
                <path d={svgPaths.loadArea} fill={`url(#${gradId}-load)`} />
                <path
                  d={svgPaths.loadLine}
                  fill="none"
                  stroke={COLOR_LOAD}
                  strokeWidth="1.25"
                  strokeDasharray="2 2"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />

                {/* Battery ESS Flow Line when active (+Charge / -Discharge) */}
                {hasBatteryFlow && (
                  <path
                    d={svgPaths.batteryLine}
                    fill="none"
                    stroke={COLOR_BATTERY}
                    strokeWidth="1.25"
                    strokeDasharray="1.5 1.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Solar Generation Area & Line (Analytics colorSolar #f59e0b) */}
                <path d={svgPaths.solarArea} fill={`url(#${gradId}-solar)`} />
                <path
                  d={svgPaths.solarLine}
                  fill="none"
                  stroke={COLOR_SOLAR}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>

              {/* Vertical 'Now' Reference Line matching Analytics Dashboard */}
              {nowCoord && Number.isFinite(nowCoord.x) && Number.isFinite(nowCoord.solarY) && (
                <>
                  <line
                    x1={nowCoord.x}
                    y1={paddingY}
                    x2={nowCoord.x}
                    y2={paddingY + plotHeight}
                    stroke="#94a3b8"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />

                  {/* Current Live Operating Point */}
                  <g transform={`translate(${nowCoord.x}, ${nowCoord.solarY})`}>
                    <circle r="4" fill={COLOR_SOLAR} className="animate-ping opacity-60" />
                    <circle r="2.5" fill={COLOR_SOLAR} stroke="hsl(var(--background))" strokeWidth="1.5" />
                  </g>
                </>
              )}

              {/* Snapped Hover Indicators matching Analytics Dashboard */}
              {hoveredPoint && (
                <g>
                  {/* Vertical Crosshair Guide */}
                  <line
                    x1={hoveredPoint.x}
                    y1={paddingY}
                    x2={hoveredPoint.x}
                    y2={paddingY + plotHeight}
                    stroke="#64748b"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Net Grid Exchange Point on Curve */}
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.gridY}
                    r="2.75"
                    fill="#ffffff"
                    stroke={hoveredPoint.gridNet >= 0 ? COLOR_GRID : COLOR_IMPORT}
                    strokeWidth="1.65"
                  />
                  {/* Battery ESS Point on Curve */}
                  {hasBatteryFlow && (
                    <circle
                      cx={hoveredPoint.x}
                      cy={hoveredPoint.batteryY}
                      r="2.5"
                      fill="#ffffff"
                      stroke={COLOR_BATTERY}
                      strokeWidth="1.5"
                    />
                  )}
                  {/* Facility Demand Point on Curve */}
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.loadY}
                    r="3"
                    fill="#ffffff"
                    stroke={COLOR_LOAD}
                    strokeWidth="1.75"
                  />
                  {/* Solar Generation Point on Curve */}
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.solarY}
                    r="3.5"
                    fill="#ffffff"
                    stroke={COLOR_SOLAR}
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>

            {historyStatus !== 'ready' && (
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 bottom-5 flex items-center justify-center font-mono text-muted-foreground/80 ${
                  isTv ? 'text-sm sm:text-base' : 'text-[9px]'
                }`}
              >
                {historyStatus === 'loading'
                  ? 'Loading telemetry…'
                  : historyStatus === 'unauthorized'
                    ? 'Sign in required'
                    : historyStatus === 'error'
                      ? 'Telemetry reconnecting…'
                      : 'No live telemetry'}
              </div>
            )}

            {/* Time Axis Labels: accurately spaced across diurnal cycle */}
            <div
              className={`flex items-center justify-between font-mono text-muted-foreground/70 px-1 border-t border-border/30 ${
                isTv ? 'text-xs sm:text-sm pt-2' : 'text-[7.5px] pt-1'
              }`}
            >
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>

          {/* Vertical Utilization Column Beside Graph (omitted on TV where left sidebar already shows Utilization) */}
          {!isTv && (
          <HoverInfo
            title="Capacity Utilization Rate"
            content={
              <div className="text-[11px] space-y-1 min-w-[150px]">
                <p className="text-muted-foreground">Operating utilization relative to installed rated capacity.</p>
                <div className="pt-1 border-t border-border/50 flex justify-between font-mono">
                  <span className="text-muted-foreground">Solar Output:</span>
                  <span className="font-bold text-amber-500">{(livePowerKw ?? 0).toFixed(1)} kW</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Facility Demand:</span>
                  <span className="font-bold text-indigo-400">{(currentDemand ?? 0).toFixed(1)} kW</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Rated Cap:</span>
                  <span className="font-semibold text-foreground">{(safeCapacityKw ?? 0).toFixed(0)} kWp</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Daily Yield:</span>
                  <span className="font-bold text-foreground">{(dailyYieldKwh ?? 0).toFixed(1)} kWh</span>
                </div>
                <div className="flex justify-between font-mono pt-0.5 border-t border-border/40">
                  <span className="text-muted-foreground">Utilization:</span>
                  <span className="font-bold text-amber-500">{(currentUtil ?? 0).toFixed(1)}%</span>
                </div>
              </div>
            }
          >
            <div
              className={`flex flex-col items-center justify-between shrink-0 select-none border-l border-border/40 h-full py-0.5 cursor-help ${
                isTv ? 'pl-2.5 w-12 sm:w-14' : 'pl-1 sm:pl-1.5 w-8 sm:w-9'
              }`}
            >
              <span
                className={`uppercase tracking-wider font-mono text-muted-foreground font-semibold leading-none ${
                  isTv ? 'text-xs' : 'text-[7.5px] sm:text-[8px]'
                }`}
              >
                Util
              </span>

              {/* Vertical Progress Gauge Track (Amber matching live solar harvest) */}
              <div
                className={`flex-1 my-1 bg-muted/60 rounded-full overflow-hidden relative border border-border/30 flex flex-col justify-end ${
                  isTv ? 'w-2.5' : 'w-1.5 sm:w-2'
                }`}
              >
                <div
                  className="w-full bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ height: `${Math.min(100, Math.max(0, currentUtil))}%` }}
                />
              </div>

              <span
                className="font-bold font-mono text-amber-500 leading-none text-[8px] sm:text-[9px]"
              >
                {(currentUtil ?? 0).toFixed(0)}%
              </span>
            </div>
          </HoverInfo>
          )}
        </div>


      </div>
    </div>
  );
}

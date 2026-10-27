'use client';

import React, { useState, useMemo, useId, useCallback } from 'react';
import { HoverInfo } from '@/components/ui/tooltip';
import { Clock } from 'lucide-react';

// Exact Color Palette from Analytics Dashboard (src/app/analytics/page.tsx)
const COLOR_SOLAR = '#f59e0b'; // Amber-500 / Solar Gold
const COLOR_LOAD = '#6366f1';  // Indigo-500 / Facility Demand
const COLOR_GRID = '#10b981';  // Emerald-500 / Grid Net Exchange

// Helper to determine clean rounded Y-axis max
function getNiceMax(val: number): number {
  if (val <= 5) return 5;
  if (val <= 10) return 10;
  if (val <= 20) return 20;
  if (val <= 30) return 30;
  if (val <= 50) return 50;
  if (val <= 75) return 75;
  if (val <= 100) return 100;
  if (val <= 150) return 150;
  if (val <= 200) return 200;
  if (val <= 300) return 300;
  if (val <= 500) return 500;
  if (val <= 750) return 750;
  if (val <= 1000) return 1000;
  if (val <= 1500) return 1500;
  if (val <= 2000) return 2000;
  const factor = Math.pow(10, Math.floor(Math.log10(val)));
  return Math.ceil(val / factor) * factor;
}

function formatYAxisLabel(val: number): string {
  if (val >= 1000) {
    const k = val / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}M`;
  }
  if (val >= 100) {
    return Math.round(val).toString();
  }
  if (val % 1 === 0) {
    return val.toString();
  }
  return val.toFixed(1);
}

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
  historyPoints?: Array<{
    hour?: string;
    solarYieldKw?: number | null;
    loadDemandKw?: number | null;
    gridFlowKw?: number | null;
    isElapsed?: boolean;
  }>;
}

interface HoverData {
  timeStr: string;
  solar: number;
  load: number;
  gridNet: number;
  x: number;
  solarY: number;
  loadY: number;
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
  historyPoints,
}: PlantSolarCurveProps) {
  const [hoveredPoint, setHoveredPoint] = useState<HoverData | null>(null);

  const rawId = useId();
  const gradId = `analyticsDiurnalGrad-${rawId.replace(/:/g, '')}`;

  const nowHour = useMemo(() => {
    return new Date().getHours() + new Date().getMinutes() / 60;
  }, []);

  const baselineLoad = capacityKw * 0.35;
  const dayFactor = nowHour >= 8 && nowHour <= 17 ? 1.25 : 0.85;
  const computedDemand = parseFloat((baselineLoad * dayFactor).toFixed(1));
  const currentDemand = demandKw !== undefined && demandKw > 0 ? demandKw : computedDemand;
  const currentGridNet = gridPowerKw !== undefined && gridPowerKw !== 0
    ? gridPowerKw
    : parseFloat((livePowerKw - currentDemand).toFixed(1));
  const currentUtil = utilizationPct !== undefined
    ? utilizationPct
    : (capacityKw > 0 ? Math.min(100, Math.max(0, (livePowerKw / capacityKw) * 100)) : 0);

  const peakEstimate = useMemo(() => {
    return Math.max(livePowerKw * 1.15, capacityKw * 0.78, 10);
  }, [livePowerKw, capacityKw]);

  // Generate diurnal points or map actual 5-minute continuous telemetry points from history
  const points = useMemo(() => {
    if (historyPoints && historyPoints.length > 0) {
      return historyPoints.map((pt) => {
        const parts = String(pt.hour || '00:00').split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        const hourFloat = h + m / 60;
        const isFuture = hourFloat > nowHour;
        const rawSolar = pt.solarYieldKw !== null && pt.solarYieldKw !== undefined ? pt.solarYieldKw : 0;
        const rawLoad = pt.loadDemandKw !== null && pt.loadDemandKw !== undefined ? pt.loadDemandKw : baselineLoad;
        const rawGrid = pt.gridFlowKw !== null && pt.gridFlowKw !== undefined ? pt.gridFlowKw : (rawSolar - rawLoad);

        return {
          hour: hourFloat,
          label: pt.hour || `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          solar: parseFloat(Math.max(0, rawSolar).toFixed(2)),
          load: parseFloat(Math.max(0, rawLoad).toFixed(2)),
          gridNet: parseFloat(rawGrid.toFixed(2)),
          isNow: Math.abs(hourFloat - nowHour) <= 0.05,
          isFuture,
        };
      });
    }

    const data: Array<{
      hour: number;
      label: string;
      solar: number;
      load: number;
      gridNet: number;
      isNow: boolean;
      isFuture: boolean;
    }> = [];

    for (let h = 0; h < 24; h++) {
      let solar = 0;
      let load = 0;
      const isFuture = h > nowHour;

      if (!isFuture) {
        if (h >= 5.5 && h <= 18.5) {
          const norm = (h - 5.5) / 13;
          const rad = norm * Math.PI;
          const curveFactor = Math.pow(Math.sin(rad), 1.25);
          solar = peakEstimate * curveFactor;

          if (Math.abs(h - nowHour) <= 1.5 && livePowerKw > 0) {
            const weight = 1 - Math.abs(h - nowHour) / 1.5;
            solar = solar * (1 - weight) + livePowerKw * weight;
          }
        }

        const df = h >= 8 && h <= 17 ? 1.25 : 0.85;
        load = baselineLoad * df;

        if (Math.abs(h - nowHour) <= 1.5 && currentDemand > 0) {
          const weight = 1 - Math.abs(h - nowHour) / 1.5;
          load = load * (1 - weight) + currentDemand * weight;
        }
      }

      const s = parseFloat(Math.max(0, solar).toFixed(2));
      const l = parseFloat(Math.max(0, load).toFixed(2));
      data.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        solar: s,
        load: l,
        gridNet: parseFloat((s - l).toFixed(2)),
        isNow: Math.floor(nowHour) === h,
        isFuture,
      });
    }

    return data;
  }, [historyPoints, nowHour, baselineLoad, peakEstimate, livePowerKw, currentDemand]);

  // SVG dimensions: bigger graph drawing area
  const width = 280;
  const paddingX = 6;
  const paddingY = 4;
  const plotWidth = width - paddingX * 2;
  const svgHeight = 60;
  const plotHeight = svgHeight - paddingY * 2;

  const maxPower = useMemo(() => {
    return Math.max(capacityKw || 10, livePowerKw || 0, currentDemand || 0);
  }, [capacityKw, livePowerKw, currentDemand]);

  const coords = useMemo(() => {
    return points.map((p, idx) => {
      const x = paddingX + (idx / (points.length - 1)) * plotWidth;
      const solarY = paddingY + plotHeight - (p.solar / maxPower) * plotHeight;
      const loadY = paddingY + plotHeight - (p.load / maxPower) * plotHeight;
      return { ...p, x, solarY, loadY };
    });
  }, [points, maxPower, plotWidth, plotHeight, paddingX, paddingY]);

  // Elapsed curve coordinates only up to current time (no future values!)
  const elapsedCoords = useMemo(() => {
    const elapsed = coords.filter((c) => c.hour <= Math.floor(nowHour));
    const nowX = paddingX + (Math.min(23, nowHour) / 23) * plotWidth;
    const nowSolarY = paddingY + plotHeight - (Math.min(maxPower, livePowerKw) / maxPower) * plotHeight;
    const nowLoadY = paddingY + plotHeight - (Math.min(maxPower, currentDemand) / maxPower) * plotHeight;

    const list = [...elapsed];
    // Ensure final coordinate anchors precisely at the current moment
    if (list.length === 0 || Math.abs(list[list.length - 1].x - nowX) > 2) {
      list.push({
        hour: nowHour,
        label: `${String(Math.floor(nowHour)).padStart(2, '0')}:${String(Math.floor((nowHour % 1) * 60)).padStart(2, '0')}`,
        solar: livePowerKw,
        load: currentDemand,
        gridNet: currentGridNet,
        isNow: true,
        isFuture: false,
        x: nowX,
        solarY: nowSolarY,
        loadY: nowLoadY,
      });
    } else {
      list[list.length - 1] = {
        ...list[list.length - 1],
        solar: livePowerKw,
        load: currentDemand,
        gridNet: currentGridNet,
        x: nowX,
        solarY: nowSolarY,
        loadY: nowLoadY,
      };
    }
    return list;
  }, [coords, nowHour, paddingX, plotWidth, paddingY, plotHeight, maxPower, livePowerKw, currentDemand, currentGridNet]);

  const nowCoord = elapsedCoords[elapsedCoords.length - 1];

  const svgPaths = useMemo(() => {
    if (elapsedCoords.length === 0) return { solarLine: '', solarArea: '', loadLine: '', loadArea: '' };

    let solarLine = `M ${elapsedCoords[0].x} ${elapsedCoords[0].solarY}`;
    let loadLine = `M ${elapsedCoords[0].x} ${elapsedCoords[0].loadY}`;

    for (let i = 1; i < elapsedCoords.length; i++) {
      const prev = elapsedCoords[i - 1];
      const curr = elapsedCoords[i];
      const midX = (prev.x + curr.x) / 2;
      solarLine += ` C ${midX} ${prev.solarY}, ${midX} ${curr.solarY}, ${curr.x} ${curr.solarY}`;
      loadLine += ` C ${midX} ${prev.loadY}, ${midX} ${curr.loadY}, ${curr.x} ${curr.loadY}`;
    }

    const first = elapsedCoords[0];
    const last = elapsedCoords[elapsedCoords.length - 1];
    const bottomY = paddingY + plotHeight;

    const solarArea = `${solarLine} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
    const loadArea = `${loadLine} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    return { solarLine, solarArea, loadLine, loadArea };
  }, [elapsedCoords, paddingY, plotHeight]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width) return;
      const clientX = e.clientX - rect.left;
      const clampedX = Math.max(paddingX, Math.min(width - paddingX, (clientX / rect.width) * width));
      const ratio = (clampedX - paddingX) / plotWidth;

      // Snapped hour up to current time (no future prediction)
      const rawHour = Math.max(0, Math.min(nowHour, ratio * 23));
      const totalMinutes = Math.round(rawHour * 12) * 5;
      const clampedMinutes = Math.min(Math.floor(nowHour * 60), totalMinutes);
      const snapHour = Math.floor(clampedMinutes / 60);
      const snapMinute = clampedMinutes % 60;
      const snapHourFloat = snapHour + snapMinute / 60;
      const timeStr = `${String(snapHour).padStart(2, '0')}:${String(snapMinute).padStart(2, '0')}`;

      let solar = 0;
      let load = 0;
      let gridNet = 0;

      if (historyPoints && historyPoints.length > 0 && points.length > 0) {
        // Nearest index in 5-min intervals
        const idx = Math.min(
          points.length - 1,
          Math.max(0, Math.round((snapHourFloat / 24) * (points.length - 1)))
        );
        const pt = points[idx];
        solar = pt.solar;
        load = pt.load;
        gridNet = pt.gridNet;
      } else {
        if (snapHourFloat >= 5.5 && snapHourFloat <= 18.5) {
          const norm = (snapHourFloat - 5.5) / 13;
          const rad = norm * Math.PI;
          const curveFactor = Math.pow(Math.sin(rad), 1.25);
          solar = peakEstimate * curveFactor;

          if (Math.abs(snapHourFloat - nowHour) <= 1.5 && livePowerKw > 0) {
            const weight = 1 - Math.abs(snapHourFloat - nowHour) / 1.5;
            solar = solar * (1 - weight) + livePowerKw * weight;
          }
        }

        const df = snapHourFloat >= 8 && snapHourFloat <= 17 ? 1.25 : 0.85;
        load = baselineLoad * df;
        if (Math.abs(snapHourFloat - nowHour) <= 1.5 && currentDemand > 0) {
          const weight = 1 - Math.abs(snapHourFloat - nowHour) / 1.5;
          load = load * (1 - weight) + currentDemand * weight;
        }
        gridNet = parseFloat((solar - load).toFixed(2));
      }

      const plotX = paddingX + (snapHourFloat / 23) * plotWidth;
      const solarY = paddingY + plotHeight - (Math.min(maxPower, solar) / maxPower) * plotHeight;
      const loadY = paddingY + plotHeight - (Math.min(maxPower, load) / maxPower) * plotHeight;

      setHoveredPoint({
        timeStr,
        solar: parseFloat(Math.max(0, solar).toFixed(2)),
        load: parseFloat(Math.max(0, load).toFixed(2)),
        gridNet,
        x: plotX,
        solarY,
        loadY,
        isRightHalf: plotX > width * 0.55,
      });
    },
    [paddingX, width, plotWidth, nowHour, historyPoints, points, peakEstimate, livePowerKw, baselineLoad, currentDemand, paddingY, plotHeight, maxPower]
  );

  const heightStyle = height !== undefined
    ? (typeof height === 'number' ? { height: `${height}px` } : { height })
    : undefined;

  return (
    <div className={`relative w-full select-none flex flex-col flex-1 h-full ${className}`}>
      {/* Telemetry Header Above Graph: Never covers the curve */}
      <div className="flex items-center justify-between text-[8px] sm:text-[8.5px] text-muted-foreground mb-1.5 px-0.5 shrink-0 gap-1.5 flex-wrap min-h-[22px]">
        {hoveredPoint ? (
          <div className="flex items-center gap-2 sm:gap-3 font-mono flex-wrap">
            <span className="flex items-center gap-1 font-bold text-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[8px] sm:text-[8.5px]">
              <Clock className="size-2.5 sm:size-3 text-primary" />
              {hoveredPoint.timeStr}
            </span>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLOR_SOLAR }} />
              <span className="text-muted-foreground/80">PV:</span>
              <span className="font-bold text-amber-500 whitespace-nowrap">
                {hoveredPoint.solar.toFixed(2)} kW
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLOR_LOAD }} />
              <span className="text-muted-foreground/80">Demand:</span>
              <span className="font-bold text-indigo-400 whitespace-nowrap">
                {hoveredPoint.load.toFixed(2)} kW
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLOR_GRID }} />
              <span className="text-muted-foreground/80">Grid:</span>
              <span className={`font-bold whitespace-nowrap ${hoveredPoint.gridNet >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                {hoveredPoint.gridNet >= 0 ? `+${hoveredPoint.gridNet.toFixed(2)}` : hoveredPoint.gridNet.toFixed(2)} kW
              </span>
            </div>
          </div>
        ) : showLabels ? (
          <div className="flex items-center gap-2 sm:gap-3 font-mono flex-wrap">
            {/* Live Solar Harvest (Amber #f59e0b) - NOT GREEN */}
            <HoverInfo
              title="Solar Generation & Harvest"
              content="Real-time photovoltaic solar generation output across active inverters and daily cumulative energy yield."
            >
              <div className="flex items-center gap-1 cursor-help">
                <span className="size-1.5 rounded-full bg-amber-500 inline-block animate-pulse shrink-0" />
                <span className="text-muted-foreground/80">Solar:</span>
                <span className="font-bold text-amber-500 whitespace-nowrap">
                  {livePowerKw.toFixed(1)} kW
                </span>
                {dailyYieldKwh > 0 && (
                  <span className="text-amber-500/80 font-normal text-[7.5px] sm:text-[8px] whitespace-nowrap">
                    ({dailyYieldKwh.toFixed(1)} kWh)
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
                  {currentDemand.toFixed(1)} kW
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
                <span className="font-bold text-emerald-500 whitespace-nowrap">
                  {currentGridNet >= 0 ? `+${currentGridNet.toFixed(1)}` : currentGridNet.toFixed(1)} kW
                </span>
              </div>
            </HoverInfo>
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-[7.5px] sm:text-[8px] text-muted-foreground/70">
            <span className="size-1.5 rounded-full bg-amber-500/70 inline-block shrink-0" />
            <span>Solar: <strong className="text-amber-500">{livePowerKw.toFixed(1)} kW</strong></span>
            {dailyYieldKwh > 0 && <span>({dailyYieldKwh.toFixed(1)} kWh)</span>}
          </div>
        )}

        {hoveredPoint ? (
          <span className="text-[7.5px] sm:text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold flex items-center gap-1 ml-auto">
            <span className="size-1.5 rounded-full bg-emerald-500 inline-block motion-safe:animate-pulse" />
            5-Min Telemetry
          </span>
        ) : (
          capacityKw > 0 && (
            <span className="text-[7.5px] sm:text-[8px] text-muted-foreground/70 font-mono ml-auto">
              Cap: <strong className="text-foreground/90">{capacityKw.toFixed(0)} kWp</strong>
            </span>
          )
        )}
      </div>

      {/* Full-height graph container covering the whole card (overflow-visible for tooltips) */}
      <div
        className="relative w-full overflow-visible rounded-lg bg-card/70 border border-border/50 p-1.5 flex-1 flex flex-col justify-between min-h-0"
        style={heightStyle ? heightStyle : { minHeight: '100px' }}
      >
        {/* Main Plot Area: Y-Axis Column on Left + Chart Canvas in Center + Vertical Utilization on Right */}
        <div className="flex flex-1 min-h-0 w-full gap-1 items-stretch">
          {/* Y-Axis Column */}
          <div className="flex flex-col justify-between items-end pr-1 text-[7.5px] sm:text-[8px] font-mono text-muted-foreground/80 shrink-0 select-none pb-4 pt-0.5 w-9 sm:w-10 border-r border-border/40">
            <div className="flex items-center gap-0.5 justify-end w-full leading-none">
              <span className="font-semibold text-foreground/90">{formatYAxisLabel(maxPower)}</span>
              <span className="text-[6.5px] text-muted-foreground">kW</span>
            </div>
            <div className="flex items-center justify-end w-full leading-none text-muted-foreground/75">
              <span>{formatYAxisLabel(maxPower * 0.5)}</span>
            </div>
            <div className="flex items-center justify-end w-full leading-none text-muted-foreground/75">
              <span>0</span>
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
                {/* Exact colorSolar from Analytics Dashboard: #f59e0b (0.8 opacity down to 0) */}
                <linearGradient id={`${gradId}-solar`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR_SOLAR} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={COLOR_SOLAR} stopOpacity={0.0} />
                </linearGradient>

                {/* Exact colorLoad from Analytics Dashboard: #6366f1 (0.35 opacity down to 0) */}
                <linearGradient id={`${gradId}-load`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR_LOAD} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLOR_LOAD} stopOpacity={0.0} />
                </linearGradient>
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

              {/* Vertical 'Now' Reference Line matching Analytics Dashboard */}
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

            {/* Time Axis Labels: accurately spaced across diurnal cycle */}
            <div className="flex items-center justify-between text-[7.5px] font-mono text-muted-foreground/60 px-1 pt-1 border-t border-border/30">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>23:00</span>
            </div>
          </div>

          {/* Vertical Utilization Column Beside Graph */}
          <HoverInfo
            title="Capacity Utilization Rate"
            content={
              <div className="text-[11px] space-y-1 min-w-[150px]">
                <p className="text-muted-foreground">Operating utilization relative to installed rated capacity.</p>
                <div className="pt-1 border-t border-border/50 flex justify-between font-mono">
                  <span className="text-muted-foreground">Solar Output:</span>
                  <span className="font-bold text-amber-500">{livePowerKw.toFixed(1)} kW</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Facility Demand:</span>
                  <span className="font-bold text-indigo-400">{currentDemand.toFixed(1)} kW</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Rated Cap:</span>
                  <span className="font-semibold text-foreground">{capacityKw.toFixed(0)} kWp</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Daily Yield:</span>
                  <span className="font-bold text-foreground">{dailyYieldKwh.toFixed(1)} kWh</span>
                </div>
                <div className="flex justify-between font-mono pt-0.5 border-t border-border/40">
                  <span className="text-muted-foreground">Utilization:</span>
                  <span className="font-bold text-amber-500">{currentUtil.toFixed(1)}%</span>
                </div>
              </div>
            }
          >
            <div className="flex flex-col items-center justify-between shrink-0 select-none border-l border-border/40 pl-1 sm:pl-1.5 w-8 sm:w-9 h-full py-0.5 cursor-help">
              <span className="text-[7.5px] sm:text-[8px] uppercase tracking-wider font-mono text-muted-foreground font-semibold leading-none">
                Util
              </span>

              {/* Vertical Progress Gauge Track (Amber matching live solar harvest) */}
              <div className="w-1.5 sm:w-2 flex-1 my-1 bg-muted/60 rounded-full overflow-hidden relative border border-border/30 flex flex-col justify-end">
                <div
                  className="w-full bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ height: `${Math.min(100, Math.max(0, currentUtil))}%` }}
                />
              </div>

              <span className="text-[8px] sm:text-[9px] font-bold font-mono text-amber-500 leading-none">
                {currentUtil.toFixed(0)}%
              </span>
            </div>
          </HoverInfo>
        </div>


      </div>
    </div>
  );
}

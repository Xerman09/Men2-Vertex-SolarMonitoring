'use client';

import React, { useState, useMemo, useId } from 'react';

// Exact Color Palette from Analytics Dashboard (src/app/analytics/page.tsx)
const COLOR_SOLAR = '#f59e0b'; // Amber-500 / Solar Gold
const COLOR_LOAD = '#6366f1';  // Indigo-500 / Facility Demand

interface PlantSolarCurveProps {
  capacityKw: number;
  livePowerKw: number;
  dailyYieldKwh?: number;
  height?: number | string;
  className?: string;
  showLabels?: boolean;
}

export function PlantSolarCurve({
  capacityKw,
  livePowerKw,
  dailyYieldKwh = 0,
  height,
  className = '',
  showLabels = false,
}: PlantSolarCurveProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    hour: number;
    solar: number;
    load: number;
    x: number;
    solarY: number;
  } | null>(null);

  const rawId = useId();
  const gradId = `analyticsDiurnalGrad-${rawId.replace(/:/g, '')}`;

  const nowHour = useMemo(() => {
    return new Date().getHours() + new Date().getMinutes() / 60;
  }, []);

  // Generate 24 diurnal points matching Analytics Dashboard profile strictly up to current time
  const points = useMemo(() => {
    const peakEstimate = Math.max(livePowerKw * 1.15, capacityKw * 0.78, 10);
    const baselineLoad = capacityKw * 0.35;

    const data: Array<{
      hour: number;
      label: string;
      solar: number;
      load: number;
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

        const dayFactor = h >= 8 && h <= 17 ? 1.25 : 0.85;
        load = baselineLoad * dayFactor;
      }

      data.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        solar: parseFloat(Math.max(0, solar).toFixed(1)),
        load: parseFloat(Math.max(0, load).toFixed(1)),
        isNow: Math.floor(nowHour) === h,
        isFuture,
      });
    }

    return data;
  }, [capacityKw, livePowerKw, nowHour]);

  // SVG dimensions: bigger graph drawing area
  const width = 280;
  const paddingX = 6;
  const paddingY = 4;
  const plotWidth = width - paddingX * 2;
  const svgHeight = 60;
  const plotHeight = svgHeight - paddingY * 2;

  const maxPower = Math.max(
    capacityKw,
    ...points.map((p) => Math.max(p.solar, p.load)),
    livePowerKw,
    10
  );

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
    const baselineLoad = capacityKw * 0.35;
    const dayFactor = nowHour >= 8 && nowHour <= 17 ? 1.25 : 0.85;
    const nowLoadY = paddingY + plotHeight - (Math.min(maxPower, baselineLoad * dayFactor) / maxPower) * plotHeight;

    const list = [...elapsed];
    // Ensure final coordinate anchors precisely at the current moment
    if (list.length === 0 || Math.abs(list[list.length - 1].x - nowX) > 2) {
      list.push({
        hour: nowHour,
        label: `${String(Math.floor(nowHour)).padStart(2, '0')}:${String(Math.floor((nowHour % 1) * 60)).padStart(2, '0')}`,
        solar: livePowerKw,
        load: parseFloat((baselineLoad * dayFactor).toFixed(1)),
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
        x: nowX,
        solarY: nowSolarY,
        loadY: nowLoadY,
      };
    }
    return list;
  }, [coords, nowHour, paddingX, plotWidth, paddingY, plotHeight, maxPower, livePowerKw, capacityKw]);

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

  const heightStyle = height !== undefined
    ? (typeof height === 'number' ? { height: `${height}px` } : { height })
    : undefined;

  return (
    <div className={`relative w-full select-none flex flex-col flex-1 h-full ${className}`}>
      {/* Micro-Header: smaller letters/numbers, clearly visible */}
      {showLabels && (
        <div className="flex items-center justify-between text-[8px] sm:text-[8.5px] text-muted-foreground mb-1 px-0.5 shrink-0">
          <div className="flex items-center gap-2 font-mono">
            <span className="flex items-center gap-1 font-semibold text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
              {livePowerKw.toFixed(1)} kW
            </span>
            <span className="flex items-center gap-1 text-indigo-400">
              <span className="size-1.5 rounded-full bg-indigo-500 inline-block" />
              Demand
            </span>
          </div>
          <span className="font-mono text-muted-foreground/80">
            Cap: {capacityKw.toFixed(0)} kWp
          </span>
        </div>
      )}

      {/* Full-height graph container covering the whole card */}
      <div
        className="relative w-full overflow-hidden rounded-lg bg-card/70 border border-border/50 p-1 flex-1 flex flex-col justify-between min-h-[110px]"
        style={heightStyle}
      >
        <svg
          viewBox={`0 0 ${width} ${svgHeight}`}
          preserveAspectRatio="none"
          className="w-full flex-1 overflow-visible cursor-crosshair block min-h-[75px]"
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
            y1={paddingY + plotHeight * 0.33}
            x2={width - paddingX}
            y2={paddingY + plotHeight * 0.33}
            stroke="hsl(var(--border) / 0.35)"
            strokeDasharray="3 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={paddingX}
            y1={paddingY + plotHeight * 0.67}
            x2={width - paddingX}
            y2={paddingY + plotHeight * 0.67}
            stroke="hsl(var(--border) / 0.35)"
            strokeDasharray="3 3"
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

          {/* Interactive Hover Hit Areas (only elapsed hours, no future values!) */}
          {coords.filter((c) => !c.isFuture).map((c) => (
            <rect
              key={c.hour}
              x={c.x - plotWidth / 48}
              y={0}
              width={plotWidth / 24}
              height={svgHeight}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() =>
                setHoveredPoint({
                  hour: c.hour,
                  solar: c.solar,
                  load: c.load,
                  x: c.x,
                  solarY: c.solarY,
                })
              }
            />
          ))}

          {/* Hover Crosshair Indicator */}
          {hoveredPoint && (
            <g transform={`translate(${hoveredPoint.x}, ${hoveredPoint.solarY})`}>
              <line
                x1={0}
                y1={paddingY - hoveredPoint.solarY}
                x2={0}
                y2={plotHeight + paddingY - hoveredPoint.solarY}
                stroke={COLOR_SOLAR}
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
              <circle r="3.5" fill="hsl(var(--background))" stroke={COLOR_SOLAR} strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay matching Analytics Dashboard */}
        {hoveredPoint && (
          <div
            className="absolute top-1 pointer-events-none z-10 px-2 py-0.5 rounded-md bg-popover/95 text-foreground border border-border/80 shadow-md backdrop-blur-xs text-[9px] font-mono -translate-x-1/2 flex items-center gap-2"
            style={{
              left: `${Math.max(16, Math.min(84, (hoveredPoint.hour / 23) * 100))}%`,
            }}
          >
            <span className="flex items-center gap-1 font-bold text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500 inline-block" />
              {hoveredPoint.solar.toFixed(1)} kW
            </span>
            <span className="flex items-center gap-1 text-indigo-400">
              <span className="size-1.5 rounded-full bg-indigo-500 inline-block" />
              {hoveredPoint.load.toFixed(1)} kW
            </span>
            <span className="text-muted-foreground text-[8.5px]">@{String(hoveredPoint.hour).padStart(2, '0')}:00</span>
          </div>
        )}

        {/* Time Axis Labels: smaller, clearly visible */}
        <div className="flex items-center justify-between text-[7.5px] font-mono text-muted-foreground/60 px-1 pt-0.5">
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo, useId } from 'react';

// Exact Color Palette from Analytics Dashboard (src/app/analytics/page.tsx)
const COLOR_SOLAR = '#f59e0b'; // Amber-500 / Solar Gold

interface InverterSolarCurveProps {
  ratedKw: number;
  liveSolarPowerKw: number;
  dailyYieldKwh?: number;
  height?: number;
  className?: string;
}

export function InverterSolarCurve({
  ratedKw,
  liveSolarPowerKw,
  dailyYieldKwh = 0,
  height = 42,
  className = '',
}: InverterSolarCurveProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ hour: number; power: number; x: number; y: number } | null>(null);
  const rawId = useId();
  const gradId = `invSolarGrad-${rawId.replace(/:/g, '')}`;

  const nowHour = useMemo(() => {
    return new Date().getHours() + new Date().getMinutes() / 60;
  }, []);

  // Generate 24 diurnal points (00:00 - 23:00) scaled to inverter rated capacity, strictly up to current time
  const points = useMemo(() => {
    const peakEstimate = Math.max(liveSolarPowerKw * 1.15, (ratedKw || 50) * 0.78, 5);

    const data: Array<{ hour: number; label: string; power: number; isNow: boolean; isFuture: boolean }> = [];

    for (let h = 0; h < 24; h++) {
      let power = 0;
      const isFuture = h > nowHour;

      if (!isFuture) {
        if (h >= 5.5 && h <= 18.5) {
          const norm = (h - 5.5) / 13;
          const rad = norm * Math.PI;
          const curveFactor = Math.pow(Math.sin(rad), 1.25);
          power = peakEstimate * curveFactor;

          if (Math.abs(h - nowHour) <= 1.5 && liveSolarPowerKw > 0) {
            const weight = 1 - Math.abs(h - nowHour) / 1.5;
            power = power * (1 - weight) + liveSolarPowerKw * weight;
          }
        }
      }

      data.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        power: parseFloat(Math.max(0, power).toFixed(1)),
        isNow: Math.floor(nowHour) === h,
        isFuture,
      });
    }

    return data;
  }, [ratedKw, liveSolarPowerKw, nowHour]);

  const width = 240;
  const paddingX = 5;
  const paddingY = 3;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;

  const maxPower = Math.max(ratedKw || 50, ...points.map((p) => p.power), liveSolarPowerKw, 10);

  const coords = useMemo(() => {
    return points.map((p, idx) => {
      const x = paddingX + (idx / (points.length - 1)) * plotWidth;
      const y = paddingY + plotHeight - (p.power / maxPower) * plotHeight;
      return { ...p, x, y };
    });
  }, [points, maxPower, plotWidth, plotHeight, paddingX, paddingY]);

  // Elapsed curve coordinates only up to current moment (no future values!)
  const elapsedCoords = useMemo(() => {
    const elapsed = coords.filter((c) => c.hour <= Math.floor(nowHour));
    const nowX = paddingX + (Math.min(23, nowHour) / 23) * plotWidth;
    const nowY = paddingY + plotHeight - (Math.min(maxPower, liveSolarPowerKw) / maxPower) * plotHeight;

    const list = [...elapsed];
    if (list.length === 0 || Math.abs(list[list.length - 1].x - nowX) > 2) {
      list.push({
        hour: nowHour,
        label: `${String(Math.floor(nowHour)).padStart(2, '0')}:${String(Math.floor((nowHour % 1) * 60)).padStart(2, '0')}`,
        power: liveSolarPowerKw,
        isNow: true,
        isFuture: false,
        x: nowX,
        y: nowY,
      });
    } else {
      list[list.length - 1] = {
        ...list[list.length - 1],
        power: liveSolarPowerKw,
        x: nowX,
        y: nowY,
      };
    }
    return list;
  }, [coords, nowHour, paddingX, plotWidth, paddingY, plotHeight, maxPower, liveSolarPowerKw]);

  const nowCoord = elapsedCoords[elapsedCoords.length - 1];

  const svgPaths = useMemo(() => {
    if (elapsedCoords.length === 0) return { linePath: '', areaPath: '' };

    let linePath = `M ${elapsedCoords[0].x} ${elapsedCoords[0].y}`;
    for (let i = 1; i < elapsedCoords.length; i++) {
      const prev = elapsedCoords[i - 1];
      const curr = elapsedCoords[i];
      const midX = (prev.x + curr.x) / 2;
      linePath += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const first = elapsedCoords[0];
    const last = elapsedCoords[elapsedCoords.length - 1];
    const bottomY = paddingY + plotHeight;
    const areaPath = `${linePath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    return { linePath, areaPath };
  }, [elapsedCoords, paddingY, plotHeight]);

  return (
    <div className={`relative w-full select-none ${className}`}>
      <div
        className="relative w-full overflow-hidden rounded-md bg-card/70 border border-border/40 p-0.5"
        style={{ height: `${height}px`, maxHeight: `${height}px` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible cursor-crosshair block"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            {/* Exact colorSolar from Analytics Dashboard: #f59e0b (0.8 opacity down to 0) */}
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLOR_SOLAR} stopOpacity={0.8} />
              <stop offset="95%" stopColor={COLOR_SOLAR} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {/* Dotted reference line matching Analytics */}
          <line
            x1={paddingX}
            y1={paddingY + plotHeight * 0.5}
            x2={width - paddingX}
            y2={paddingY + plotHeight * 0.5}
            stroke="hsl(var(--border) / 0.3)"
            strokeDasharray="2 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {/* Area Fill */}
          <path
            d={svgPaths.areaPath}
            fill={`url(#${gradId})`}
          />

          {/* Power Curve Line */}
          <path
            d={svgPaths.linePath}
            fill="none"
            stroke={COLOR_SOLAR}
            strokeWidth="1.75"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Vertical 'Now' Reference Line */}
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
          <g transform={`translate(${nowCoord.x}, ${nowCoord.y})`}>
            <circle r="3" fill={COLOR_SOLAR} className="animate-ping opacity-60" />
            <circle r="2" fill={COLOR_SOLAR} stroke="hsl(var(--background))" strokeWidth="1" />
          </g>

          {/* Interactive Hover Hit Areas (only elapsed hours, no future values!) */}
          {coords.filter((c) => !c.isFuture).map((c) => (
            <rect
              key={c.hour}
              x={c.x - plotWidth / 48}
              y={0}
              width={plotWidth / 24}
              height={height}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() =>
                setHoveredPoint({ hour: c.hour, power: c.power, x: c.x, y: c.y })
              }
            />
          ))}

          {/* Hover Indicator */}
          {hoveredPoint && (
            <g transform={`translate(${hoveredPoint.x}, ${hoveredPoint.y})`}>
              <line
                x1={0}
                y1={paddingY - hoveredPoint.y}
                x2={0}
                y2={height - paddingY - hoveredPoint.y}
                stroke={COLOR_SOLAR}
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
              <circle r="2.5" fill="hsl(var(--background))" stroke={COLOR_SOLAR} strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay: smaller letters/numbers, clearly visible */}
        {hoveredPoint && (
          <div
            className="absolute top-0.5 pointer-events-none z-10 px-1.5 py-0.5 rounded bg-popover/95 text-foreground border border-border/80 shadow-xs text-[8px] font-mono -translate-x-1/2 flex items-center gap-1"
            style={{
              left: `${Math.max(10, Math.min(90, (hoveredPoint.hour / 23) * 100))}%`,
            }}
          >
            <span className="size-1 rounded-full bg-amber-500 inline-block" />
            <span className="font-bold text-amber-500">{hoveredPoint.power.toFixed(1)} kW</span>
            <span className="text-muted-foreground text-[7.5px]">@{String(hoveredPoint.hour).padStart(2, '0')}:00</span>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo, useId } from 'react';
import { HoverInfo } from '@/components/ui/tooltip';
import { Clock } from 'lucide-react';

// Exact Color Palette from Analytics Dashboard (src/app/analytics/page.tsx)
const COLOR_SOLAR = '#f59e0b'; // Amber-500 / Solar Gold

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

interface InverterSolarCurveProps {
  ratedKw: number;
  liveSolarPowerKw: number;
  dailyYieldKwh?: number;
  height?: number;
  className?: string;
  isFault?: boolean;
  isStandby?: boolean;
  loadPct?: number;
}

export function InverterSolarCurve({
  ratedKw,
  liveSolarPowerKw,
  dailyYieldKwh = 0,
  height = 68,
  className = '',
  isFault = false,
  isStandby = false,
  loadPct,
}: InverterSolarCurveProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ hour: number; power: number; x: number; y: number } | null>(null);
  const rawId = useId();
  const gradId = `invSolarGrad-${rawId.replace(/:/g, '')}`;

  const currentLoadPct = loadPct !== undefined
    ? loadPct
    : (ratedKw > 0 ? Math.min(100, (liveSolarPowerKw / ratedKw) * 100) : 0);

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
  const svgHeight = 42;
  const paddingX = 4;
  const paddingY = 3;
  const plotWidth = width - paddingX * 2;
  const plotHeight = svgHeight - paddingY * 2;

  // Set kW (ratedKw) is the minimum baseline ceiling, but dynamically expands if actual telemetry exceeds it
  const maxPower = useMemo(() => {
    const setKw = Math.max(ratedKw || 10, 10);
    let peakValue = Math.max(liveSolarPowerKw || 0, 0);

    for (const p of points) {
      if (p.power > peakValue) peakValue = p.power;
    }

    const ceiling = Math.max(setKw, peakValue);
    // 10% headroom so curves comfortably fit inside without touching the top border
    return Math.max(10, Math.ceil(ceiling * 1.10));
  }, [ratedKw, liveSolarPowerKw, points]);

  const coords = useMemo(() => {
    return points.map((p, idx) => {
      const x = paddingX + (idx / Math.max(1, points.length - 1)) * plotWidth;
      const rawY = paddingY + plotHeight - (p.power / maxPower) * plotHeight;
      const y = Math.max(paddingY, Math.min(paddingY + plotHeight, rawY));
      return { ...p, x, y };
    });
  }, [points, maxPower, plotWidth, plotHeight, paddingX, paddingY]);

  // Elapsed curve coordinates only up to current moment (no future values!)
  const elapsedCoords = useMemo(() => {
    const elapsed = coords.filter((c) => c.hour <= Math.floor(nowHour));
    const nowX = paddingX + (Math.min(23, nowHour) / 23) * plotWidth;
    const rawNowY = paddingY + plotHeight - (liveSolarPowerKw / maxPower) * plotHeight;
    const nowY = Math.max(paddingY, Math.min(paddingY + plotHeight, rawNowY));

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
      {/* Telemetry Header Above Graph: Never covers the curve */}
      <div className="flex items-center justify-between text-[7.5px] sm:text-[8px] font-mono text-muted-foreground mb-1 px-0.5 shrink-0 min-h-[16px] leading-tight">
        {hoveredPoint ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 font-bold text-foreground bg-primary/10 text-primary px-1 py-0.2 rounded text-[7.5px]">
              <Clock className="size-2 text-primary" />
              {String(hoveredPoint.hour).padStart(2, '0')}:00
            </span>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0 bg-[#f59e0b]" />
              <span className="text-muted-foreground/80">PV:</span>
              <span className="font-bold text-amber-500">{hoveredPoint.power.toFixed(2)} kW</span>
            </div>
            {dailyYieldKwh > 0 && (
              <span className="text-muted-foreground/70">
                (Yield: <strong className="text-foreground/90 font-semibold">{dailyYieldKwh.toFixed(1)} kWh</strong>)
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full inline-block shrink-0 bg-amber-500 animate-pulse" />
              <span className="text-muted-foreground/80">Live:</span>
              <span className="font-bold text-amber-500">{liveSolarPowerKw.toFixed(1)} kW</span>
              {dailyYieldKwh > 0 && (
                <span className="text-amber-500/80 font-normal text-[7px]">
                  ({dailyYieldKwh.toFixed(1)} kWh)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-md bg-card/70 border border-border/40 p-1 flex items-stretch gap-1"
        style={{ height: `${height}px`, minHeight: `${height}px` }}
      >
        {/* Inverter Mini Y-Axis Column */}
        <div className="flex flex-col justify-between items-end pr-1 text-[7px] font-mono text-muted-foreground/80 shrink-0 select-none pb-3 pt-0.5 w-7 sm:w-8 border-r border-border/30">
          <div className="flex items-center justify-end w-full leading-none">
            <span className="font-semibold text-foreground/90">{formatYAxisLabel(maxPower)}</span>
          </div>
          <div className="flex items-center justify-end w-full leading-none text-muted-foreground/70">
            <span>{formatYAxisLabel(maxPower * 0.5)}</span>
          </div>
          <div className="flex items-center justify-end w-full leading-none text-muted-foreground/70">
            <span>0</span>
          </div>
        </div>

        {/* Chart Drawing Area + Mini Time Hints */}
        <div className="relative flex-1 min-w-0 min-h-0 flex flex-col justify-between">
          <svg
            viewBox={`0 0 ${width} ${svgHeight}`}
            preserveAspectRatio="none"
            className="w-full flex-1 overflow-visible cursor-crosshair block"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <defs>
              {/* Exact colorSolar from Analytics Dashboard: #f59e0b (0.8 opacity down to 0) */}
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_SOLAR} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLOR_SOLAR} stopOpacity={0.0} />
              </linearGradient>

              {/* Plot boundary clip path to guarantee paths never leak outside */}
              <clipPath id={`${gradId}-inv-clip`}>
                <rect x={paddingX} y={paddingY} width={plotWidth} height={plotHeight} rx={1} />
              </clipPath>
            </defs>

            {/* Top limit grid line */}
            <line
              x1={paddingX}
              y1={paddingY}
              x2={width - paddingX}
              y2={paddingY}
              stroke="hsl(var(--border) / 0.15)"
              strokeDasharray="2 3"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

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

            {/* Baseline reference */}
            <line
              x1={paddingX}
              y1={paddingY + plotHeight}
              x2={width - paddingX}
              y2={paddingY + plotHeight}
              stroke="hsl(var(--border) / 0.4)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Clipped Curve Layers */}
            <g clipPath={`url(#${gradId}-inv-clip)`}>
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
            </g>

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
                height={svgHeight}
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
                  y2={plotHeight + paddingY - hoveredPoint.y}
                  stroke={COLOR_SOLAR}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle r="2.5" fill="hsl(var(--background))" stroke={COLOR_SOLAR} strokeWidth="1.5" />
              </g>
            )}
          </svg>

          {/* Mini time hints */}
          <div className="flex items-center justify-between text-[6.5px] font-mono text-muted-foreground/50 px-0.5 pt-0.5 border-t border-border/20 leading-none">
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
          </div>
        </div>

        {/* Vertical Utilization Column Beside Graph with Hover Tooltip */}
        <HoverInfo
          title="Inverter Operating Status"
          content={
            <div className="text-[11px] space-y-1 min-w-[150px]">
              <p className="text-muted-foreground">Inverter load utilization relative to rated capacity.</p>
              <div className="pt-1 border-t border-border/50 flex justify-between font-mono">
                <span className="text-muted-foreground">Live Power:</span>
                <span className="font-bold text-amber-500">{liveSolarPowerKw.toFixed(2)} kW</span>
              </div>
              {dailyYieldKwh > 0 && (
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Daily Yield:</span>
                  <span className="font-bold text-foreground">{dailyYieldKwh.toFixed(1)} kWh</span>
                </div>
              )}
              {ratedKw > 0 && (
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Rated Cap:</span>
                  <span className="font-semibold text-foreground">{ratedKw} kW</span>
                </div>
              )}
              <div className="flex justify-between font-mono pt-0.5 border-t border-border/40">
                <span className="text-muted-foreground">Utilization:</span>
                <span
                  className={`font-bold ${
                    isFault ? 'text-destructive' : isStandby ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  {currentLoadPct.toFixed(1)}%
                </span>
              </div>
            </div>
          }
        >
          <div className="flex flex-col items-center justify-between shrink-0 select-none border-l border-border/30 pl-1 sm:pl-1.5 w-7 sm:w-8 h-full py-0.5 cursor-help">
            <span className="text-[7px] uppercase tracking-wider font-mono text-muted-foreground font-semibold leading-none">
              Util
            </span>

            {/* Vertical Progress Gauge Track */}
            <div className="w-1.5 sm:w-2 flex-1 my-1 bg-muted/60 rounded-full overflow-hidden relative border border-border/20 flex flex-col justify-end">
              <div
                className={`w-full rounded-full transition-all duration-300 ${
                  isFault
                    ? 'bg-destructive'
                    : isStandby
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ height: `${Math.max(4, Math.min(100, currentLoadPct))}%` }}
              />
            </div>

            <span
              className={`text-[7.5px] sm:text-[8px] font-mono font-bold leading-none ${
                isFault ? 'text-destructive' : isStandby ? 'text-amber-500' : 'text-emerald-500'
              }`}
            >
              {currentLoadPct.toFixed(0)}%
            </span>
          </div>
        </HoverInfo>


      </div>
    </div>
  );
}

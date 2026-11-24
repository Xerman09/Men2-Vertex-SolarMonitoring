'use client';

import React from 'react';
import { Clock } from 'lucide-react';

export interface CustomTooltipEntry {
  name?: string;
  value?: number | string | null;
  color?: string;
  stroke?: string;
  dataKey?: string;
}

export interface CustomExactTooltipProps {
  active?: boolean;
  payload?: CustomTooltipEntry[];
  label?: string | number;
}

/**
 * Custom tooltip for continuous 5-minute interval data with elapsed & unelapsed distinction
 */
export const CustomExactTooltip: React.FC<CustomExactTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const point = (payload[0] as unknown as { payload?: { isElapsed?: boolean; pvPowerKw?: number | null } })?.payload;
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block motion-safe:animate-pulse" />
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
          {payload.map((entry: CustomTooltipEntry, i: number) => {
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
                  {isNaN(valNum) ? entry.value : valNum.toFixed(2)}
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">
                    {entry.name?.toLowerCase().includes('factor')
                      ? ''
                      : entry.name?.toLowerCase().includes('soc')
                      ? '%'
                      : 'kW'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="font-mono text-muted-foreground/80 text-[11px] italic py-1">
          Awaiting interval telemetry from edge gateway
        </div>
      )}
    </div>
  );
};

export interface NowReferenceLabelProps {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}

/**
 * Custom non-clipping label renderer for ReferenceLine "Now" markers.
 * Sits safely within the top chart margin with dynamic boundary collision avoidance.
 */
export function renderNowReferenceLabel(text: string, color: string = '#94a3b8') {
  return function NowReferenceLabel({ viewBox }: NowReferenceLabelProps) {
    if (!viewBox || typeof viewBox.x !== 'number') return null;
    const x = viewBox.x;
    // viewBox.y represents margin.top. Position label 8px above the top grid line.
    const y = typeof viewBox.y === 'number' ? Math.max(12, viewBox.y - 7) : 14;
    const width = viewBox.width || 0;

    // Boundary-aware text anchoring so text never clips off left or right edges
    let textAnchor: 'start' | 'middle' | 'end' = 'middle';
    let dx = 0;
    if (x < 35) {
      textAnchor = 'start';
      dx = 4;
    } else if (width > 0 && x > width - 35) {
      textAnchor = 'end';
      dx = -4;
    }

    return (
      <g className="recharts-reference-line-label select-none pointer-events-none">
        <text
          x={x + dx}
          y={y}
          textAnchor={textAnchor}
          fill={color}
          fontSize={10}
          fontFamily="ui-monospace, monospace"
          fontWeight={600}
          stroke="currentColor"
          strokeWidth={3}
          paintOrder="stroke fill"
          strokeLinejoin="round"
          className="select-none text-card dark:text-slate-950"
        >
          {text}
        </text>
      </g>
    );
  };
}

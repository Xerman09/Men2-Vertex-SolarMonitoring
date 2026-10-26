'use client';

import React from 'react';
import { Radio, Pause, Play, RefreshCw } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { ChartTab, TimeResolution } from '../useTrigonometricGraph';

interface GraphHeaderControlsProps {
  compact?: boolean;
  timeResolution: TimeResolution;
  isLiveStreaming: boolean;
  activeTab?: ChartTab;
  onResolutionChange: (res: TimeResolution) => void;
  onToggleStreaming: () => void;
  onManualTick: () => void;
  onTabChange?: (tab: ChartTab) => void;
}

export function GraphHeaderControls({
  compact = false,
  timeResolution,
  isLiveStreaming,
  onResolutionChange,
  onToggleStreaming,
  onManualTick,
}: GraphHeaderControlsProps) {
  return (
    <CardHeader className={compact ? 'py-2 px-3 sm:px-3.5 border-b border-border/50' : 'py-3 px-4 border-b border-border/50'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Radio className="h-4 w-4 motion-safe:animate-pulse" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <HoverInfo
                title="5-Minute Telemetry & Power Curves"
                content={TELEMETRY_DESCRIPTIONS.trigonometricGraph.header}
                showIcon
              >
                <CardTitle className="text-sm sm:text-base font-bold cursor-help">
                  5-Minute Telemetry & Power Curves
                </CardTitle>
              </HoverInfo>
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
                onClick={() => onResolutionChange(mins)}
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
            onClick={onToggleStreaming}
            className="gap-1 h-7 px-2 text-[11px] font-semibold"
          >
            {isLiveStreaming ? <Pause className="h-3 w-3 text-amber-500" /> : <Play className="h-3 w-3 text-emerald-500" />}
            <span>{isLiveStreaming ? 'Pause' : 'Resume'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onManualTick}
            className="gap-1 h-7 px-2 text-[11px] font-semibold"
            title="Manually trigger instantaneous 5-minute fluctuation"
          >
            <RefreshCw className="h-3 w-3 text-cyan-500" />
            <span>Tick</span>
          </Button>
        </div>
      </div>
    </CardHeader>
  );
}

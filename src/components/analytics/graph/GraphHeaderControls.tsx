'use client';

import React from 'react';
import { Radio, Pause, Play, RefreshCw, Zap, TrendingUp, Sun, Waves, Compass, Activity } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { TELEMETRY_DESCRIPTIONS } from '@/lib/descriptions';
import { ChartTab, TimeResolution } from '../useTrigonometricGraph';

interface GraphHeaderControlsProps {
  compact?: boolean;
  timeResolution: TimeResolution;
  isLiveStreaming: boolean;
  activeTab: ChartTab;
  onResolutionChange: (res: TimeResolution) => void;
  onToggleStreaming: () => void;
  onManualTick: () => void;
  onTabChange: (tab: ChartTab) => void;
}

export function GraphHeaderControls({
  compact = false,
  timeResolution,
  isLiveStreaming,
  activeTab,
  onResolutionChange,
  onToggleStreaming,
  onManualTick,
  onTabChange,
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

      {/* Subsystem Tabs */}
      <div className="pt-2">
        <Tabs value={activeTab} onValueChange={(v: string) => onTabChange(v as ChartTab)} className="w-full">
          <TabsList className="bg-muted/50 p-0.5 rounded-lg h-auto border border-border/50 inline-flex w-fit max-w-full overflow-x-auto gap-0.5">
            <HoverInfo title="Power Curves" content="High-resolution 5-minute sampling curves of PV solar generation, facility industrial load, and net utility exchange.">
              <TabsTrigger value="power" className="text-xs gap-1 px-2.5 py-1 font-medium cursor-help">
                <Zap className="h-3.5 w-3.5 text-yellow-500" />
                <span>Power Curves</span>
              </TabsTrigger>
            </HoverInfo>
            <HoverInfo title="Self-Consumption Analysis" content="Breakdown of solar self-consumption, local load coverage utilization, and export vs import ratios.">
              <TabsTrigger value="selfconsumption" className="text-xs gap-1 px-2.5 py-1 font-medium cursor-help">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span>Self-Consumption</span>
              </TabsTrigger>
            </HoverInfo>
            <HoverInfo title="Diurnal Curve Fitting" content="Theoretical sinusoidal clear-sky insolation curve fit and model deviation residual calculations.">
              <TabsTrigger value="sinusoidal" className="text-xs gap-1 px-2.5 py-1 font-medium cursor-help">
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span>Diurnal Fit</span>
              </TabsTrigger>
            </HoverInfo>
            <HoverInfo title="Fourier Decomposition" content="Discrete Fourier decomposition of 24-hour diurnal cycle across fundamental and harmonic frequencies.">
              <TabsTrigger value="fourier" className="text-xs gap-1 px-2.5 py-1 font-medium cursor-help">
                <Waves className="h-3.5 w-3.5 text-cyan-500" />
                <span>Fourier</span>
              </TabsTrigger>
            </HoverInfo>
            <HoverInfo title="Polar Radar Phasor" content="360-degree circular phasor radar mapping 24-hour solar harvest lobes against industrial load demand.">
              <TabsTrigger value="polar" className="text-xs gap-1 px-2.5 py-1 font-medium cursor-help">
                <Compass className="h-3.5 w-3.5 text-indigo-500" />
                <span>Polar Radar</span>
              </TabsTrigger>
            </HoverInfo>
            <HoverInfo title="3-Phase AC Waveforms" content="Real-time 60Hz instantaneous 3-phase AC voltage & current sinusoidal waveforms with power factor metrics.">
              <TabsTrigger value="waveform" className="text-xs gap-1 px-2.5 py-1 font-medium cursor-help">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                <span>3-Phase AC</span>
              </TabsTrigger>
            </HoverInfo>
          </TabsList>
        </Tabs>
      </div>
    </CardHeader>
  );
}

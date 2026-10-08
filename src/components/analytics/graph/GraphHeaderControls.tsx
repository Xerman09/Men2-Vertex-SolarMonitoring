'use client';

import React from 'react';
import { Radio, Pause, Play, RefreshCw, Zap, TrendingUp, Sun, Waves, Compass, Activity } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRole } from '@/lib/role-context';
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
  const { isAdmin } = useRole();

  return (
    <CardHeader className={compact ? 'py-2 px-3 sm:px-3.5 border-b border-border/50' : 'py-3 px-4 border-b border-border/50'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Radio className="h-4 w-4 motion-safe:animate-pulse" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-base font-bold">
                5-Minute Telemetry & Power Curves
              </CardTitle>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-mono text-[10px] px-1.5 py-0 flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  {isLiveStreaming && (
                    <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isLiveStreaming ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                </span>
                {isLiveStreaming ? `LIVE (${timeResolution}m)` : 'PAUSED'}
              </Badge>
            </div>
          </div>
          {isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">
              {TELEMETRY_DESCRIPTIONS.trigonometricGraph.header}
            </p>
          )}
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
  );
}

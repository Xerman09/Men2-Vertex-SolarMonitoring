'use client';

import React from 'react';
import {
  Zap,
  TrendingUp,
  Sun,
  Waves,
  Compass,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { HoverInfo } from '@/components/ui/tooltip';
import { ChartTab } from '../useTrigonometricGraph';

export interface GraphNavItem {
  id: ChartTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  hoverTitle: string;
  description: string;
}

export const GRAPH_NAV_ITEMS: GraphNavItem[] = [
  {
    id: 'power',
    label: 'Power Curves',
    icon: Zap,
    iconColor: 'text-yellow-500',
    hoverTitle: 'Power Curves',
    description:
      'High-resolution 5-minute sampling curves of PV solar generation, facility industrial load, and net utility exchange.',
  },
  {
    id: 'selfconsumption',
    label: 'Self-Consumption',
    icon: TrendingUp,
    iconColor: 'text-emerald-500',
    hoverTitle: 'Self-Consumption Analysis',
    description:
      'Breakdown of solar self-consumption, local load coverage utilization, and export vs import ratios.',
  },
  {
    id: 'sinusoidal',
    label: 'Diurnal Fit',
    icon: Sun,
    iconColor: 'text-amber-500',
    hoverTitle: 'Diurnal Curve Fitting',
    description:
      'Theoretical sinusoidal clear-sky insolation curve fit and model deviation residual calculations.',
  },
  {
    id: 'fourier',
    label: 'Fourier',
    icon: Waves,
    iconColor: 'text-cyan-500',
    hoverTitle: 'Fourier Decomposition',
    description:
      'Discrete Fourier decomposition of 24-hour diurnal cycle across fundamental and harmonic frequencies.',
  },
  {
    id: 'polar',
    label: 'Polar Radar',
    icon: Compass,
    iconColor: 'text-indigo-500',
    hoverTitle: 'Polar Radar Phasor',
    description:
      '360-degree circular phasor radar mapping 24-hour solar harvest lobes against industrial load demand.',
  },
  {
    id: 'waveform',
    label: '3-Phase AC',
    icon: Activity,
    iconColor: 'text-emerald-500',
    hoverTitle: '3-Phase AC Waveforms',
    description:
      'Real-time 60Hz instantaneous 3-phase AC voltage & current sinusoidal waveforms with power factor metrics.',
  },
];

export interface GraphVerticalNavProps {
  activeTab: ChartTab;
  onTabChange: (tab: ChartTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  compact?: boolean;
}

export function GraphVerticalNav({
  activeTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  compact = false,
}: GraphVerticalNavProps) {
  return (
    <aside
      className={`transition-all duration-200 shrink-0 bg-card/90 border border-border/70 rounded-xl flex flex-col select-none overflow-hidden h-full shadow-xs ${
        isCollapsed ? 'w-11 sm:w-12' : 'w-44 sm:w-48'
      }`}
      aria-label="Telemetry & Analytics Navigation"
    >
      {/* Collapse/Expand Toggle Header */}
      <div className={`border-b border-border/50 bg-muted/40 shrink-0 ${isCollapsed ? 'p-1.5 flex justify-center' : 'px-2.5 py-1.5 flex items-center justify-between'}`}>
        {!isCollapsed && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
            Views
          </span>
        )}
        <HoverInfo
          title={isCollapsed ? 'Expand View Menu' : 'Collapse to Icons'}
          content={
            isCollapsed
              ? 'Expand navigation rail to view full option labels beside the graph.'
              : 'Collapse navigation rail to only show icons beside the graph.'
          }
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label={isCollapsed ? 'Expand navigation menu' : 'Collapse navigation to icons'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </HoverInfo>
      </div>

      {/* Navigation Options List */}
      <nav
        className={`flex flex-col justify-between gap-1 p-1 sm:p-1.5 flex-1 min-h-0 ${isCollapsed ? 'items-center' : ''}`}
        role="tablist"
        aria-orientation="vertical"
      >
        {GRAPH_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          if (isCollapsed) {
            return (
              <HoverInfo
                key={item.id}
                title={item.hoverTitle}
                content={item.description}
                className="w-full flex justify-center"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onTabChange(item.id)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-primary/20 text-primary border border-primary/40 shadow-xs ring-1 ring-primary/25'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
                  }`}
                  aria-label={item.label}
                >
                  <Icon className={`h-4 w-4 ${item.iconColor} transition-transform group-hover:scale-110`} />
                  <span className="sr-only">{item.label}</span>
                </button>
              </HoverInfo>
            );
          }

          return (
            <HoverInfo
              key={item.id}
              title={item.hoverTitle}
              content={item.description}
              className="w-full block"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-all text-left cursor-pointer group ${
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/30 shadow-xs font-semibold ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent font-medium'
                }`}
              >
                <div
                  className={`p-1 rounded-lg shrink-0 transition-colors ${
                    isActive ? 'bg-primary/25' : 'bg-muted/40 group-hover:bg-muted/80'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${item.iconColor}`} />
                </div>
                <span className="truncate flex-1">{item.label}</span>
              </button>
            </HoverInfo>
          );
        })}
      </nav>
    </aside>
  );
}

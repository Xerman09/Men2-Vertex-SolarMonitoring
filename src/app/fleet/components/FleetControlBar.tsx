'use client';

import React, { useEffect, useId, useRef } from 'react';
import {
  Search,
  X,
  LayoutGrid,
  Table2,
  RefreshCw,
  Clock,
  ArrowUpDown,
} from 'lucide-react';
import type { FleetSortKey, FleetViewMode, StatusFilter } from '../types';

interface FleetControlBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (val: StatusFilter) => void;
  statusCounts: {
    all: number;
    online: number;
    standby: number;
    fault: number;
    offline: number;
  };
  sortKey: FleetSortKey;
  onSortKeyChange: (val: FleetSortKey) => void;
  viewMode: FleetViewMode;
  onViewModeChange: (mode: FleetViewMode) => void;
  autoRefreshInterval: number;
  onAutoRefreshChange: (sec: number) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  controlledRegionId: string;
}

export function FleetControlBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  autoRefreshInterval,
  onAutoRefreshChange,
  onManualRefresh,
  isRefreshing,
  controlledRegionId,
}: FleetControlBarProps) {
  const searchInputId = useId();
  const sortSelectId = useId();
  const refreshSelectId = useId();
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Roving tabindex fallback only where native HTML focusgroup is unsupported
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return;

    const getItems = () =>
      Array.from(bar.querySelectorAll<HTMLButtonElement>('button:not([hidden])'));

    const init = () => {
      const items = getItems();
      const activeIdx = items.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
      items.forEach((btn, idx) => {
        btn.tabIndex = idx === (activeIdx >= 0 ? activeIdx : 0) ? 0 : -1;
      });
    };

    init();

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== 'BUTTON') return;
      for (const btn of getItems()) {
        btn.tabIndex = btn === target ? 0 : -1;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = getItems();
      const current = document.activeElement as HTMLButtonElement | null;
      if (!current || !items.includes(current)) return;

      const rtl = getComputedStyle(bar).direction === 'rtl';
      let delta = 0;
      if (e.key === 'ArrowRight') delta = rtl ? -1 : 1;
      else if (e.key === 'ArrowLeft') delta = rtl ? 1 : -1;
      else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
        return;
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
        return;
      } else {
        return;
      }

      e.preventDefault();
      const idx = items.indexOf(current);
      const next = items[(idx + delta + items.length) % items.length];
      next?.focus();
    };

    bar.addEventListener('focusin', handleFocusIn);
    bar.addEventListener('keydown', handleKeyDown);
    return () => {
      bar.removeEventListener('focusin', handleFocusIn);
      bar.removeEventListener('keydown', handleKeyDown);
    };
  }, [statusCounts.offline]);

  const statusButtons: Array<{
    value: StatusFilter;
    label: string;
    count?: number;
    urgent?: boolean;
  }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ONLINE', label: 'Online', count: statusCounts.online },
    { value: 'STANDBY', label: 'Standby', count: statusCounts.standby },
    {
      value: 'FAULT',
      label: 'Fault',
      count: statusCounts.fault,
      urgent: statusCounts.fault > 0,
    },
    ...(statusCounts.offline > 0
      ? [
          {
            value: 'OFFLINE' as const,
            label: 'Offline',
            count: statusCounts.offline,
            urgent: true,
          },
        ]
      : []),
  ];

  return (
    <div className="rounded-xl border border-border/70 bg-card/85 px-3 py-2 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5">
      {/* Left: Search Input + Sort Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 sm:w-64 max-w-sm min-w-[180px]">
          <label htmlFor={searchInputId} className="visually-hidden">
            Search fleet accounts, plants, or inverter serial numbers
          </label>
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            id={searchInputId}
            type="search"
            placeholder="Filter accounts, plants, SN..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 bg-background border border-border/80 rounded-lg pl-8 pr-7 text-xs focus-visible:outline-2 focus-visible:outline-ring text-foreground"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search query"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Sort Order Selector */}
        <div className="flex items-center h-8 bg-background border border-border/80 rounded-lg px-2 text-xs">
          <ArrowUpDown
            size={12}
            className="text-muted-foreground mr-1.5 shrink-0"
            aria-hidden="true"
          />
          <label htmlFor={sortSelectId} className="visually-hidden">
            Sort assets by
          </label>
          <select
            id={sortSelectId}
            value={sortKey}
            onChange={(e) => onSortKeyChange(e.target.value as FleetSortKey)}
            className="bg-transparent text-[11px] font-medium focus:outline-hidden cursor-pointer text-foreground"
          >
            <option value="severity">Sort: Severity / Alerts</option>
            <option value="power_desc">Sort: Live kW (High–Low)</option>
            <option value="utilization_desc">Sort: Utilization %</option>
            <option value="specific_yield_desc">Sort: Spec. Yield (kWh/kWp)</option>
            <option value="yield_desc">Sort: Daily Harvest (kWh)</option>
            <option value="name_asc">Sort: Name (A–Z)</option>
          </select>
        </div>

        {/* Auto-refresh Interval */}
        <div className="flex items-center h-8 bg-background border border-border/80 rounded-lg px-2 text-xs">
          <Clock
            size={12}
            className="text-muted-foreground mr-1.5 shrink-0"
            aria-hidden="true"
          />
          <label htmlFor={refreshSelectId} className="visually-hidden">
            Auto-refresh polling interval
          </label>
          <select
            id={refreshSelectId}
            value={autoRefreshInterval}
            onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
            className="bg-transparent text-[11px] font-semibold focus:outline-hidden cursor-pointer text-foreground"
          >
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
            <option value={0}>Paused</option>
          </select>
        </div>
      </div>

      {/* Right: Accessible Toolbar (Status Filter | View Switcher | Refresh) */}
      <div
        ref={toolbarRef}
        role="toolbar"
        data-fleet-toolbar="true"
        aria-label="Fleet filters and view controls"
        aria-controls={controlledRegionId}
        {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
        className="flex items-center gap-1.5 flex-wrap xl:justify-end"
      >
        <div
          role="group"
          aria-label="Filter by asset status"
          className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/60"
        >
          {statusButtons.map((btn) => {
            const pressed = statusFilter === btn.value;
            return (
              <button
                key={btn.value}
                type="button"
                aria-pressed={pressed}
                onClick={() => onStatusFilterChange(btn.value)}
                className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 border ${
                  pressed
                    ? 'bg-background text-foreground font-semibold border-primary/40 shadow-2xs'
                    : btn.urgent
                    ? 'border-transparent text-destructive hover:bg-destructive/10'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{btn.label}</span>
                {typeof btn.count === 'number' && btn.count > 0 && (
                  <span
                    className={`text-[10px] tabular-nums ${
                      btn.urgent ? 'text-destructive font-bold' : 'opacity-75'
                    }`}
                  >
                    ({btn.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <span
          role="separator"
          aria-orientation="vertical"
          className="h-5 w-px bg-border/80 mx-0.5 hidden sm:block"
        />

        <div
          role="group"
          aria-label="Workspace layout mode"
          className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/60"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'workspace'}
            onClick={() => onViewModeChange('workspace')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 border ${
              viewMode === 'workspace'
                ? 'bg-background text-foreground font-semibold border-primary/40 shadow-2xs'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid size={12} aria-hidden="true" />
            <span>Workspace</span>
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'matrix'}
            onClick={() => onViewModeChange('matrix')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 border ${
              viewMode === 'matrix'
                ? 'bg-background text-foreground font-semibold border-primary/40 shadow-2xs'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table2 size={12} aria-hidden="true" />
            <span>NOC Matrix</span>
          </button>
        </div>

        <span
          role="separator"
          aria-orientation="vertical"
          className="h-5 w-px bg-border/80 mx-0.5 hidden sm:block"
        />

        <button
          type="button"
          onClick={onManualRefresh}
          aria-disabled={isRefreshing}
          aria-label="Refresh fleet telemetry"
          title="Refresh fleet telemetry"
          className="px-2.5 py-1 rounded-lg border border-border/80 bg-background hover:bg-muted/60 text-foreground text-[11px] font-medium flex items-center gap-1.5 cursor-pointer aria-disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            aria-hidden="true"
            className={isRefreshing ? 'animate-spin text-primary' : ''}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
}

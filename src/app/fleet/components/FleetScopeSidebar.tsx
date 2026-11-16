'use client';

import React from 'react';
import {
  Globe,
  Building2,
  Layers,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  WifiOff,
} from 'lucide-react';
import type { FleetAccountNode, FleetScopeSelection } from '../types';

interface FleetScopeSidebarProps {
  accounts: FleetAccountNode[];
  selection: FleetScopeSelection;
  expandedAccountIds: Set<string>;
  onSelectFleet: () => void;
  onSelectAccount: (accountId: string) => void;
  onSelectPlant: (accountId: string, stationId: string) => void;
  onToggleExpandAccount: (accountId: string) => void;
  isConsumer: boolean;
  totalFleetSolarKw: number;
  totalFleetCapKw: number;
  totalPlantsCount: number;
  totalInvertersCount: number;
}

export function FleetScopeSidebar({
  accounts,
  selection,
  expandedAccountIds,
  onSelectFleet,
  onSelectAccount,
  onSelectPlant,
  onToggleExpandAccount,
  isConsumer,
  totalFleetSolarKw,
  totalFleetCapKw,
  totalPlantsCount,
  totalInvertersCount,
}: FleetScopeSidebarProps) {
  const fleetUtilPct =
    totalFleetCapKw > 0
      ? Math.min(100, (totalFleetSolarKw / totalFleetCapKw) * 100)
      : 0;

  return (
    <aside className="w-full lg:w-[290px] xl:w-[320px] shrink-0 lg:sticky lg:top-4 fleet-containment">
      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
        <div className="px-3.5 py-2.5 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-foreground">
            Scope Hierarchy
          </h2>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {totalPlantsCount}P · {totalInvertersCount}I
          </span>
        </div>

        <nav aria-label="Fleet hierarchy" className="p-2 space-y-1 max-h-[65vh] lg:max-h-[calc(100vh-220px)] overflow-y-auto">
          {/* Root Fleet Scope (Hidden for single-tenant consumers) */}
          {!isConsumer && (
            <button
              type="button"
              onClick={onSelectFleet}
              aria-current={selection.mode === 'fleet' ? 'page' : undefined}
              className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-between gap-2 border ${
                selection.mode === 'fleet'
                  ? 'bg-primary/10 border-primary/40 text-foreground'
                  : 'border-transparent hover:bg-muted/60 text-foreground/90'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Globe
                  size={14}
                  className={selection.mode === 'fleet' ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">All Fleet</div>
                  <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
                    {accounts.length} Acc · {totalFleetCapKw > 0 ? `${totalFleetCapKw.toFixed(0)} kWp` : '--'}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono font-bold text-amber-500 tabular-nums">
                  {totalFleetSolarKw.toFixed(1)} kW
                </div>
                <div className="text-[9.5px] font-mono text-muted-foreground tabular-nums">
                  {fleetUtilPct.toFixed(0)}%
                </div>
              </div>
            </button>
          )}

          {/* Account List */}
          <ul className="space-y-1 pt-0.5">
            {accounts.map((acc) => {
              const isExpanded = expandedAccountIds.has(acc.account.id);
              const isAccSelected =
                selection.mode === 'account' && selection.accountId === acc.account.id;
              const isOffline = acc.account.status === 'OFFLINE';
              const hasAlerts = acc.faultCount > 0 || acc.offlineCount > 0;

              return (
                <li key={acc.account.id} className="space-y-0.5">
                  <div
                    className={`flex items-stretch rounded-xl border transition-colors ${
                      isAccSelected
                        ? 'bg-primary/10 border-primary/40'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleExpandAccount(acc.account.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} plants for ${acc.account.name}`}
                      className="px-1.5 py-2 text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center shrink-0 rounded-l-xl"
                    >
                      {isExpanded ? (
                        <ChevronDown size={13} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={13} aria-hidden="true" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectAccount(acc.account.id)}
                      aria-current={isAccSelected ? 'page' : undefined}
                      className="flex-1 min-w-0 text-left pr-2.5 py-2 flex items-center justify-between gap-2 cursor-pointer rounded-r-xl"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2
                            size={12}
                            className={isAccSelected ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'}
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-foreground truncate">
                            {acc.account.name}
                          </span>
                          {acc.faultCount > 0 && (
                            <AlertTriangle
                              size={11}
                              className="text-destructive shrink-0"
                              aria-label={`${acc.faultCount} fault`}
                            />
                          )}
                          {isOffline && (
                            <WifiOff
                              size={11}
                              className="text-muted-foreground shrink-0"
                              aria-label="Disabled or offline"
                            />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                hasAlerts ? 'bg-destructive' : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(100, acc.utilizationPct)}%` }}
                            />
                          </div>
                          <span className="text-[9.5px] font-mono text-muted-foreground tabular-nums shrink-0">
                            {acc.capacityKw > 0 ? `${acc.capacityKw.toFixed(0)} kWp` : '--'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-bold text-amber-500 tabular-nums">
                          {acc.livePowerKw.toFixed(1)} kW
                        </div>
                        <div className="text-[9.5px] font-mono text-muted-foreground tabular-nums">
                          {acc.utilizationPct.toFixed(0)}%
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Nested Plants List */}
                  {isExpanded && acc.plants.length > 0 && (
                    <ul className="pl-5 space-y-0.5 border-l border-border/50 ml-3 my-0.5">
                      {acc.plants.map((plant) => {
                        const isPlantSelected =
                          selection.mode === 'plant' &&
                          selection.accountId === acc.account.id &&
                          String(selection.stationId) === String(plant.plant.stationId);

                        const statusDotClass =
                          plant.status === 'FAULT'
                            ? 'bg-destructive'
                            : plant.status === 'OFFLINE'
                            ? 'bg-muted-foreground'
                            : plant.status === 'STANDBY'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500';

                        return (
                          <li key={plant.plantKey}>
                            <button
                              type="button"
                              onClick={() =>
                                onSelectPlant(acc.account.id, String(plant.plant.stationId))
                              }
                              aria-current={isPlantSelected ? 'page' : undefined}
                              className={`w-full text-left px-2 py-1.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                isPlantSelected
                                  ? 'bg-primary/10 border-primary/40 text-foreground'
                                  : 'border-transparent hover:bg-muted/50 text-foreground/85'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`size-1.5 rounded-full shrink-0 ${statusDotClass}`}
                                    aria-hidden="true"
                                  />
                                  <Layers
                                    size={11}
                                    className={isPlantSelected ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'}
                                    aria-hidden="true"
                                  />
                                  <span className="text-[11px] font-medium truncate">
                                    {plant.plant.stationName}
                                  </span>
                                </div>
                                <div className="text-[9.5px] font-mono text-muted-foreground pl-4 tabular-nums">
                                  {plant.inverters.length} inv ·{' '}
                                  {plant.capacityKw > 0 ? `${plant.capacityKw.toFixed(0)} kWp` : '--'}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-[11px] font-mono font-bold text-amber-500 tabular-nums">
                                  {plant.livePowerKw.toFixed(1)} kW
                                </div>
                                <div className="text-[9px] font-mono text-muted-foreground tabular-nums">
                                  {plant.utilizationPct.toFixed(0)}%
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

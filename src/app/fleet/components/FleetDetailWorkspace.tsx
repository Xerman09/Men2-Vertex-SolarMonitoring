'use client';

import React from 'react';
import {
  Building2,
  Layers,
  Cpu,
  Power,
  Copy,
  Check,
  Zap,
  Sliders,
  BarChart3,
  ChevronRight,
  AlertTriangle,
  WifiOff,
  Radio,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlantSolarCurve } from './PlantSolarCurve';
import { InverterSolarCurve } from './InverterSolarCurve';
import {
  sortPlants,
  type FleetAccountNode,
  type FleetPlantNode,
  type FleetScopeSelection,
  type FleetSortKey,
} from '../types';

interface FleetDetailWorkspaceProps {
  accounts: FleetAccountNode[];
  selection: FleetScopeSelection;
  sortKey: FleetSortKey;
  isAdmin: boolean;
  copiedSn: string | null;
  onCopySn: (sn: string, e: React.MouseEvent) => void;
  onSelectFleet: () => void;
  onSelectAccount: (accountId: string) => void;
  onSelectPlant: (accountId: string, stationId: string) => void;
  onToggleAccountEnabled: (accountId: string, currentStatus: string) => void;
  onNavigateToPlantScope: (
    accountId: string,
    stationId: string,
    destination: '/analytics' | '/energy-flow' | '/hardware-telemetry'
  ) => void;
  onNavigateToDevice: (
    accountId: string,
    stationId: string,
    deviceSn: string,
    destination: '/hardware-telemetry' | '/energy-flow'
  ) => void;
}

export function FleetDetailWorkspace({
  accounts,
  selection,
  sortKey,
  isAdmin,
  copiedSn,
  onCopySn,
  onSelectFleet,
  onSelectAccount,
  onSelectPlant,
  onToggleAccountEnabled,
  onNavigateToPlantScope,
  onNavigateToDevice,
}: FleetDetailWorkspaceProps) {
  const selectedAcc =
    selection.accountId
      ? accounts.find((a) => a.account.id === selection.accountId) || accounts[0]
      : null;

  const selectedPlant =
    selection.mode === 'plant' && selectedAcc && selection.stationId
      ? selectedAcc.plants.find(
          (p) => String(p.plant.stationId) === String(selection.stationId)
        ) || null
      : null;

  const renderPlantCard = (plant: FleetPlantNode, showAccountSubtitle: boolean) => {
    const isFault = plant.status === 'FAULT';
    const isOffline = plant.status === 'OFFLINE';
    const isStandby = plant.status === 'STANDBY';

    return (
      <article
        key={plant.plantKey}
        className={`relative rounded-2xl border bg-card p-3.5 flex flex-col justify-between gap-2.5 transition-colors hover:border-primary/50 group ${
          isFault
            ? 'border-destructive/50'
            : isOffline
            ? 'border-border/70 opacity-85'
            : 'border-border/70'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Layers
                size={13}
                className="text-primary shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold text-foreground truncate">
                <button
                  type="button"
                  onClick={() =>
                    onSelectPlant(plant.accountId, String(plant.plant.stationId))
                  }
                  className="text-left hover:text-primary transition-colors cursor-pointer after:absolute after:inset-0 after:z-0 focus-visible:outline-2 focus-visible:outline-ring rounded"
                >
                  {plant.plant.stationName}
                </button>
              </h3>
              {plant.status !== 'ONLINE' && (
                <Badge
                  variant={
                    isFault
                      ? 'destructive'
                      : isStandby
                      ? 'warning'
                      : 'outline'
                  }
                  className="text-[9px] font-mono py-0 capitalize relative z-10"
                >
                  {plant.status.toLowerCase()}
                </Badge>
              )}
              {plant.hasOfflineLogger && (
                <Badge
                  variant="destructive"
                  className="text-[9px] font-mono py-0 gap-1 relative z-10"
                >
                  <WifiOff size={9} aria-hidden="true" />
                  Logger offline
                </Badge>
              )}
            </div>
            <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap tabular-nums">
              {showAccountSubtitle && (
                <>
                  <span className="truncate max-w-[140px]">{plant.accountName}</span>
                  <span>·</span>
                </>
              )}
              <span>{plant.inverters.length} Inv</span>
              <span>·</span>
              <span>
                {plant.capacityKw > 0 ? `${plant.capacityKw.toFixed(0)} kWp` : '--'}
              </span>
              {plant.specificYieldKwhKwp !== null && (
                <>
                  <span>·</span>
                  <span className="text-foreground font-semibold">
                    {plant.specificYieldKwhKwp.toFixed(2)} kWh/kWp
                  </span>
                </>
              )}
            </div>
          </div>

          <ChevronRight
            size={15}
            className="text-muted-foreground group-hover:text-primary shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>

        <div className="relative z-10 w-full pt-0.5">
          <PlantSolarCurve
            capacityKw={plant.capacityKw}
            livePowerKw={plant.livePowerKw}
            dailyYieldKwh={plant.dailyYieldKwh}
            demandKw={plant.demandKw}
            gridPowerKw={plant.gridPowerKw}
            utilizationPct={plant.utilizationPct}
            scope={{
              accountId: plant.accountId,
              stationId: String(plant.plant.stationId),
            }}
            height={115}
            className="w-full"
            showLabels={true}
          />
        </div>
      </article>
    );
  };

  /* ------------------------------------------------------------------
     STATE 3: PLANT DETAIL VIEW (Plant Curve + Inverter Isolation Cards)
     ------------------------------------------------------------------ */
  if (selection.mode === 'plant' && selectedAcc && selectedPlant) {
    const isFault = selectedPlant.status === 'FAULT';
    const isOffline = selectedPlant.status === 'OFFLINE';
    const isStandby = selectedPlant.status === 'STANDBY';
    const stationIdStr = String(selectedPlant.plant.stationId);

    return (
      <div className="space-y-4 fleet-containment">
        {/* Plant Hero Banner & Quick Scope Links */}
        <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground flex-wrap">
                <button
                  type="button"
                  onClick={onSelectFleet}
                  className="hover:text-foreground cursor-pointer"
                >
                  All Fleet
                </button>
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  onClick={() => onSelectAccount(selectedAcc.account.id)}
                  className="hover:text-foreground cursor-pointer truncate max-w-[160px]"
                >
                  {selectedAcc.account.name}
                </button>
                <span aria-hidden="true">/</span>
                <span className="text-foreground font-semibold truncate">
                  {selectedPlant.plant.stationName}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {selectedPlant.plant.stationName}
                </h2>
                {selectedPlant.status !== 'ONLINE' && (
                  <Badge
                    variant={
                      isFault
                        ? 'destructive'
                        : isStandby
                        ? 'warning'
                        : 'outline'
                    }
                    className="text-[10px] font-mono py-0 capitalize"
                  >
                    {selectedPlant.status.toLowerCase()}
                  </Badge>
                )}
              </div>

              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 flex-wrap tabular-nums">
                <span>
                  Capacity:{' '}
                  <strong className="text-foreground">
                    {selectedPlant.capacityKw > 0
                      ? `${selectedPlant.capacityKw.toFixed(0)} kWp`
                      : '--'}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Specific Yield:{' '}
                  <strong className="text-foreground">
                    {selectedPlant.specificYieldKwhKwp !== null
                      ? `${selectedPlant.specificYieldKwhKwp.toFixed(2)} kWh/kWp`
                      : '--'}
                  </strong>
                </span>
                <span>·</span>
                <span>{selectedPlant.inverters.length} Inverters</span>
                {typeof selectedPlant.batterySoc === 'number' &&
                  selectedPlant.batterySoc > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-cyan-400 font-semibold">
                        BESS {selectedPlant.batterySoc.toFixed(0)}%
                      </span>
                    </>
                  )}
              </div>
            </div>

            {/* Deep Links scoped directly to this Plant */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  onNavigateToPlantScope(
                    selectedAcc.account.id,
                    stationIdStr,
                    '/analytics'
                  )
                }
                className="font-mono gap-1"
              >
                <BarChart3 size={12} aria-hidden="true" />
                <span>Analytics</span>
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  onNavigateToPlantScope(
                    selectedAcc.account.id,
                    stationIdStr,
                    '/energy-flow'
                  )
                }
                className="font-mono gap-1"
              >
                <Zap size={12} className="text-amber-500" aria-hidden="true" />
                <span>Energy Flow</span>
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  onNavigateToPlantScope(
                    selectedAcc.account.id,
                    stationIdStr,
                    '/hardware-telemetry'
                  )
                }
                className="font-mono gap-1"
              >
                <Sliders size={12} className="text-primary" aria-hidden="true" />
                <span>Hardware</span>
              </Button>
            </div>
          </div>

          <div className="w-full pt-1">
            <PlantSolarCurve
              capacityKw={selectedPlant.capacityKw}
              livePowerKw={selectedPlant.livePowerKw}
              dailyYieldKwh={selectedPlant.dailyYieldKwh}
              demandKw={selectedPlant.demandKw}
              gridPowerKw={selectedPlant.gridPowerKw}
              utilizationPct={selectedPlant.utilizationPct}
              scope={{
                accountId: selectedAcc.account.id,
                stationId: stationIdStr,
              }}
              height={190}
              className="w-full"
              showLabels={true}
            />
          </div>
        </section>

        {/* Inverters Section */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
              <Cpu size={13} className="text-primary" aria-hidden="true" />
              <span>Inverters ({selectedPlant.inverters.length})</span>
            </h3>
            {isOffline && (
              <span className="text-[11px] font-mono text-destructive flex items-center gap-1">
                <AlertTriangle size={12} aria-hidden="true" />
                Station link offline
              </span>
            )}
          </div>

          {selectedPlant.inverters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center text-xs text-muted-foreground">
              No inverters configured under this station.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
              {selectedPlant.inverters.map((inv, invIdx) => {
                const isInvFault = inv.status === 'FAULT';
                const isInvOffline = inv.status === 'OFFLINE';
                const isInvStandby =
                  inv.status === 'STANDBY' || inv.liveSolarPowerKw === 0;
                const isCopied = copiedSn === inv.deviceSn;

                return (
                  <article
                    key={inv.deviceSn}
                    className={`rounded-2xl border bg-card p-3.5 flex flex-col justify-between gap-2.5 shadow-xs transition-colors ${
                      isInvFault
                        ? 'border-destructive/60'
                        : isInvOffline
                        ? 'border-border/70 opacity-85'
                        : 'border-border/70 hover:border-primary/40'
                    }`}
                  >
                    {/* Header: SN + Copy + Status Badge only if abnormal */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-mono font-bold text-xs text-foreground truncate">
                            {inv.deviceSn}
                          </h4>
                          <button
                            type="button"
                            onClick={(e) => onCopySn(inv.deviceSn, e)}
                            aria-label={`Copy inverter serial number ${inv.deviceSn}`}
                            title="Copy Serial Number"
                            className="p-0.5 text-muted-foreground hover:text-foreground rounded cursor-pointer shrink-0"
                          >
                            {isCopied ? (
                              <Check
                                size={11}
                                className="text-emerald-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <Copy size={11} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        <div className="text-[10.5px] text-muted-foreground truncate mt-0.5 font-mono">
                          #{invIdx + 1} · {inv.model}
                        </div>
                      </div>

                      {inv.status !== 'ONLINE' && (
                        <Badge
                          variant={
                            isInvFault
                              ? 'destructive'
                              : isInvStandby
                              ? 'warning'
                              : 'outline'
                          }
                          className="text-[9.5px] font-mono py-0 capitalize shrink-0"
                        >
                          {inv.status.toLowerCase()}
                        </Badge>
                      )}
                    </div>

                    {/* Numeric KPI Telemetry Bar */}
                    <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[10.5px] font-mono tabular-nums">
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">
                          Live
                        </div>
                        <div className="font-bold text-amber-500">
                          {inv.liveSolarPowerKw.toFixed(1)} kW
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">
                          Rated
                        </div>
                        <div className="font-semibold text-foreground">
                          {inv.ratedKw > 0 ? `${inv.ratedKw} kW` : '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">
                          Daily
                        </div>
                        <div className="font-semibold text-foreground">
                          {inv.dailyYieldKwh.toFixed(1)} kWh
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">
                          Spec. Yield
                        </div>
                        <div className="font-semibold text-foreground">
                          {inv.specificYieldKwhKwp !== null
                            ? `${inv.specificYieldKwhKwp.toFixed(2)}`
                            : '--'}
                        </div>
                      </div>
                    </div>

                    {/* Scoped Device Diurnal Curve */}
                    <div className="w-full">
                      <InverterSolarCurve
                        ratedKw={inv.ratedKw}
                        liveSolarPowerKw={inv.liveSolarPowerKw}
                        dailyYieldKwh={inv.dailyYieldKwh}
                        height={85}
                        isFault={isInvFault}
                        isStandby={isInvStandby}
                        loadPct={inv.utilizationPct}
                        className="w-full"
                        scope={{
                          accountId: selectedAcc.account.id,
                          stationId: stationIdStr,
                          deviceSn: inv.deviceSn,
                        }}
                      />
                    </div>

                    {/* Footer: Logger/BESS + Direct Hardware & Flow Drill-Downs */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50 text-[10.5px] font-mono">
                      <div className="flex items-center gap-2 min-w-0 text-muted-foreground truncate">
                        {inv.batterySoc > 0 && (
                          <span className="text-cyan-400 font-semibold shrink-0">
                            BESS {inv.batterySoc}%
                          </span>
                        )}
                        {inv.loggerSn && (
                          <span
                            className={`flex items-center gap-1 truncate ${
                              inv.loggerStatus === 'OFFLINE'
                                ? 'text-destructive font-semibold'
                                : ''
                            }`}
                            title={`Logger SN: ${inv.loggerSn}`}
                          >
                            <Radio size={10} aria-hidden="true" />
                            <span>{inv.loggerSn}</span>
                            {inv.loggerStatus === 'OFFLINE' && <span>(Off)</span>}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToDevice(
                              selectedAcc.account.id,
                              stationIdStr,
                              inv.deviceSn,
                              '/energy-flow'
                            )
                          }
                          aria-label={`Open Energy Flow for ${inv.deviceSn}`}
                          className="px-2 py-1 rounded-md border border-border/70 bg-background hover:bg-muted text-foreground text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Zap
                            size={10}
                            className="text-amber-500"
                            aria-hidden="true"
                          />
                          <span>Flow</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToDevice(
                              selectedAcc.account.id,
                              stationIdStr,
                              inv.deviceSn,
                              '/hardware-telemetry'
                            )
                          }
                          aria-label={`Open Hardware Telemetry for ${inv.deviceSn}`}
                          className="px-2 py-1 rounded-md border border-border/70 bg-background hover:bg-muted text-foreground text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Sliders
                            size={10}
                            className="text-primary"
                            aria-hidden="true"
                          />
                          <span>Telemetry</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  /* ------------------------------------------------------------------
     STATE 2: ACCOUNT OVERVIEW (Unified Account Curve + Plants Grid)
     ------------------------------------------------------------------ */
  if (selection.mode === 'account' && selectedAcc) {
    const isOffline = selectedAcc.account.status === 'OFFLINE';

    return (
      <div className="space-y-4 fleet-containment">
        <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                <button
                  type="button"
                  onClick={onSelectFleet}
                  className="hover:text-foreground cursor-pointer"
                >
                  All Fleet
                </button>
                <span aria-hidden="true">/</span>
                <span className="text-foreground font-semibold truncate">
                  {selectedAcc.account.name}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Building2 size={16} className="text-primary shrink-0" aria-hidden="true" />
                <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {selectedAcc.account.name}
                </h2>
                {selectedAcc.isDemo && (
                  <Badge variant="warning" className="text-[10px] font-mono py-0">
                    Demo
                  </Badge>
                )}
                {isOffline && (
                  <Badge variant="destructive" className="text-[10px] font-mono py-0">
                    Disabled
                  </Badge>
                )}
              </div>

              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 flex-wrap tabular-nums">
                <span>
                  {selectedAcc.plants.length} Plants · {selectedAcc.invertersCount} Inverters
                </span>
                <span>·</span>
                <span>
                  Installed:{' '}
                  <strong className="text-foreground">
                    {selectedAcc.capacityKw > 0
                      ? `${selectedAcc.capacityKw.toFixed(0)} kWp`
                      : '--'}
                  </strong>
                </span>
                {selectedAcc.specificYieldKwhKwp !== null && (
                  <>
                    <span>·</span>
                    <span>
                      Spec. Yield:{' '}
                      <strong className="text-foreground">
                        {selectedAcc.specificYieldKwhKwp.toFixed(2)} kWh/kWp
                      </strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    onToggleAccountEnabled(
                      selectedAcc.account.id,
                      selectedAcc.account.status
                    )
                  }
                  className={`font-mono gap-1 ${
                    isOffline
                      ? 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                      : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                  }`}
                >
                  <Power size={11} aria-hidden="true" />
                  <span>{isOffline ? 'Enable' : 'Disable'}</span>
                </Button>
              )}
            </div>
          </div>

          <div className="w-full pt-1">
            <PlantSolarCurve
              capacityKw={selectedAcc.capacityKw}
              livePowerKw={selectedAcc.livePowerKw}
              dailyYieldKwh={selectedAcc.dailyYieldKwh}
              demandKw={selectedAcc.demandKw}
              gridPowerKw={selectedAcc.gridPowerKw}
              utilizationPct={selectedAcc.utilizationPct}
              scope={{ accountId: selectedAcc.account.id }}
              height={180}
              className="w-full"
              showLabels={true}
            />
          </div>
        </section>

        {/* Plants under Account */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-muted-foreground px-0.5">
            Stations ({selectedAcc.plants.length})
          </h3>
          {selectedAcc.plants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center text-xs text-muted-foreground">
              No stations configured under this account.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
              {selectedAcc.plants.map((plant) => renderPlantCard(plant, false))}
            </div>
          )}
        </section>
      </div>
    );
  }

  /* ------------------------------------------------------------------
     STATE 1: ALL FLEET OVERVIEW (Accounts Grid + All Plants Sorted Grid)
     ------------------------------------------------------------------ */
  const allFilteredPlants = sortPlants(
    accounts.flatMap((acc) => acc.plants),
    sortKey
  );

  return (
    <div className="space-y-5 fleet-containment">
      {/* Account Summary Cards */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-muted-foreground">
            Accounts ({accounts.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
          {accounts.map((acc) => {
            const isOffline = acc.account.status === 'OFFLINE';

            return (
              <article
                key={acc.account.id}
                className="relative rounded-2xl border border-border/70 bg-card hover:border-primary/50 transition-colors p-4 flex flex-col justify-between gap-2.5 shadow-xs group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2
                        size={14}
                        className="text-primary shrink-0"
                        aria-hidden="true"
                      />
                      <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                        <button
                          type="button"
                          onClick={() => onSelectAccount(acc.account.id)}
                          className="text-left hover:text-primary transition-colors cursor-pointer after:absolute after:inset-0 after:z-0 focus-visible:outline-2 focus-visible:outline-ring rounded"
                        >
                          {acc.account.name}
                        </button>
                      </h3>
                      {acc.isDemo && (
                        <Badge
                          variant="warning"
                          className="text-[9px] font-mono py-0 relative z-10"
                        >
                          Demo
                        </Badge>
                      )}
                      {isOffline && (
                        <Badge
                          variant="destructive"
                          className="text-[9px] font-mono py-0 relative z-10"
                        >
                          Disabled
                        </Badge>
                      )}
                      {acc.faultCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="text-[9px] font-mono py-0 relative z-10"
                        >
                          {acc.faultCount} Fault
                        </Badge>
                      )}
                    </div>

                    <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap tabular-nums">
                      <span>{acc.plants.length} Plants</span>
                      <span>·</span>
                      <span>{acc.invertersCount} Inverters</span>
                      <span>·</span>
                      <span>
                        {acc.capacityKw > 0 ? `${acc.capacityKw.toFixed(0)} kWp` : '--'}
                      </span>
                      {acc.specificYieldKwhKwp !== null && (
                        <>
                          <span>·</span>
                          <span className="text-foreground font-semibold">
                            {acc.specificYieldKwhKwp.toFixed(2)} kWh/kWp
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleAccountEnabled(acc.account.id, acc.account.status);
                      }}
                      aria-label={`${isOffline ? 'Enable' : 'Disable'} ${acc.account.name}`}
                      className={`relative z-10 font-mono text-[10px] shrink-0 ${
                        isOffline
                          ? 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                          : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                      }`}
                    >
                      <Power size={10} aria-hidden="true" />
                      <span>{isOffline ? 'Enable' : 'Disable'}</span>
                    </Button>
                  )}
                </div>

                <div className="relative z-10 w-full pt-0.5">
                  <PlantSolarCurve
                    capacityKw={acc.capacityKw}
                    livePowerKw={acc.livePowerKw}
                    dailyYieldKwh={acc.dailyYieldKwh}
                    demandKw={acc.demandKw}
                    gridPowerKw={acc.gridPowerKw}
                    utilizationPct={acc.utilizationPct}
                    scope={{ accountId: acc.account.id }}
                    height={130}
                    className="w-full"
                    showLabels={true}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Fleet-Wide Plants Ranking / Triage Grid */}
      {allFilteredPlants.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-muted-foreground">
              All Stations ({allFilteredPlants.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
            {allFilteredPlants.map((plant) => renderPlantCard(plant, true))}
          </div>
        </section>
      )}
    </div>
  );
}

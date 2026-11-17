'use client';

import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import type { AggregatedFleetSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { telemetryCache } from '@/lib/telemetry-cache';
import { createLogger } from '@/lib/logger';
import {
  buildFleetAccountTree,
  buildNocTableRows,
  filterFleetTree,
  type FleetScopeSelection,
  type FleetSortKey,
  type FleetViewMode,
  type StatusFilter,
} from './types';
import { FleetControlBar } from './components/FleetControlBar';
import { FleetScopeSidebar } from './components/FleetScopeSidebar';
import { FleetDetailWorkspace } from './components/FleetDetailWorkspace';
import { FleetNocTable } from './components/FleetNocTable';
import { clearScopedHistoryCache } from './components/useScopedHistory';

const log = createLogger('FleetMonitoring');
const FLEET_CACHE_KEY = 'fleet:aggregate';

export default function FleetMonitoringPage() {
  const router = useRouter();
  const regionId = useId();
  const {
    accounts,
    seedAccountsFromFleet,
    selectInverter,
    refreshAccounts,
    isFetchingDeye,
    syncing,
    selectedAccountId,
    selectedStationId,
    isFleetView,
    selectAccountAndPlant,
  } = useAccount();
  const { isAdmin, isConsumer, isInitialized } = useRole();

  // Fleet aggregate data restored immediately from client cache when available
  const [fleetData, setFleetData] = useState<AggregatedFleetSummary | null>(() => {
    return typeof window !== 'undefined'
      ? telemetryCache.get<AggregatedFleetSummary>(FLEET_CACHE_KEY, 60000, true)
      : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !telemetryCache.get<AggregatedFleetSummary>(FLEET_CACHE_KEY, 60000, true);
    }
    return true;
  });
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);

  // Filter, sort & view state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortKey, setSortKey] = useState<FleetSortKey>('severity');
  const [viewMode, setViewMode] = useState<FleetViewMode>('workspace');

  // Expanded tree nodes in Left Scope Navigator
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  const [didInitExpanded, setDidInitExpanded] = useState<boolean>(false);

  // Clipboard state & screen-reader live confirmation
  const [copiedSn, setCopiedSn] = useState<string | null>(null);
  const [copyAnnouncement, setCopyAnnouncement] = useState<string>('');

  const fetchFleet = useCallback(
    async (isManual: boolean = false) => {
      if (!isManual && telemetryCache.isFresh(FLEET_CACHE_KEY, 30000)) {
        const cached = telemetryCache.get<AggregatedFleetSummary>(FLEET_CACHE_KEY);
        if (cached && cached.totalAccounts > 0) {
          setFleetData(cached);
          if (cached.accounts?.length > 0) {
            seedAccountsFromFleet(cached.accounts);
          }
          setLoading(false);
          return;
        }
      }

      if (isManual) setRefreshing(true);
      try {
        const res = await fetch('/api/deye/aggregate');
        if (res.ok) {
          const json: AggregatedFleetSummary = await res.json();
          telemetryCache.set(FLEET_CACHE_KEY, json);
          setFleetData(json);
          if (json.accounts?.length > 0) {
            seedAccountsFromFleet(json.accounts);
          }
        }
      } catch (err) {
        log.error('Failed to fetch fleet aggregate', { error: err });
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [seedAccountsFromFleet]
  );

  useEffect(() => {
    fetchFleet(false);
  }, [fetchFleet]);

  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchFleet(false);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchFleet]);

  const handleCopySn = useCallback(async (sn: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(sn);
      setCopiedSn(sn);
      setCopyAnnouncement(`Copied serial number ${sn}`);
      setTimeout(() => {
        setCopiedSn((current) => (current === sn ? null : current));
      }, 2000);
    } catch {
      setCopyAnnouncement(`Failed to copy serial number ${sn}`);
    }
  }, []);

  const handleToggleAccountEnabled = useCallback(
    async (accountId: string, currentStatus: string) => {
      if (!isAdmin) return;
      try {
        const newEnabled = currentStatus === 'OFFLINE';
        const res = await fetch('/api/deye/accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: accountId, enabled: newEnabled }),
        });
        if (res.ok) {
          telemetryCache.delete(FLEET_CACHE_KEY);
          await Promise.all([fetchFleet(true), refreshAccounts(true, true)]);
        }
      } catch (e) {
        log.error('Toggle account error', { error: e });
      }
    },
    [isAdmin, fetchFleet, refreshAccounts]
  );

  // Scope accounts by role (demo accounts strictly restricted to admin)
  const authorizedAccounts = useMemo(() => {
    const sourceAccounts =
      fleetData?.accounts && fleetData.accounts.length > 0
        ? fleetData.accounts
        : accounts;
    if (!sourceAccounts || sourceAccounts.length === 0) return [];
    if (isAdmin) return sourceAccounts;
    const nonDemo = sourceAccounts.filter((a) => !a.isDemo);
    return nonDemo.length > 0 ? nonDemo : sourceAccounts;
  }, [fleetData, accounts, isAdmin]);

  // Normalized Account -> Plant -> Inverter tree with authentic telemetry only
  const accountTree = useMemo(
    () => buildFleetAccountTree(authorizedAccounts, fleetData?.nodes || []),
    [authorizedAccounts, fleetData]
  );

  // Initialize left-sidebar account expansion so plants are 1 click away
  useEffect(() => {
    if (!didInitExpanded && accountTree.length > 0 && isInitialized) {
      setDidInitExpanded(true);
      setExpandedAccountIds(new Set(accountTree.map((a) => a.account.id)));
    }
  }, [accountTree, isInitialized, didInitExpanded]);

  // Auto-expand accounts during text/status filtering so matching plants stay visible in sidebar
  useEffect(() => {
    if (searchQuery.trim() || statusFilter !== 'ALL') {
      const next = new Set(expandedAccountIds);
      let changed = false;
      for (const acc of accountTree) {
        if (!next.has(acc.account.id)) {
          next.add(acc.account.id);
          changed = true;
        }
      }
      if (changed) setExpandedAccountIds(next);
    }
  }, [searchQuery, statusFilter, accountTree, expandedAccountIds]);

  const filteredTree = useMemo(
    () => filterFleetTree(accountTree, searchQuery, statusFilter, sortKey),
    [accountTree, searchQuery, statusFilter, sortKey]
  );

  // Derive active Master-Detail scope strictly from AccountContext
  const scopeSelection = useMemo<FleetScopeSelection>(() => {
    if (isConsumer) {
      const targetAccId =
        accountTree.find((a) => a.account.id === selectedAccountId)?.account.id ||
        accountTree[0]?.account.id;
      if (!targetAccId) return { mode: 'fleet' };
      if (selectedStationId && selectedStationId !== 'ALL') {
        return {
          mode: 'plant',
          accountId: targetAccId,
          stationId: selectedStationId,
        };
      }
      return { mode: 'account', accountId: targetAccId };
    }

    if (isFleetView) {
      return { mode: 'fleet' };
    }

    if (selectedStationId && selectedStationId !== 'ALL') {
      return {
        mode: 'plant',
        accountId: selectedAccountId,
        stationId: selectedStationId,
      };
    }

    return { mode: 'account', accountId: selectedAccountId };
  }, [isConsumer, isFleetView, selectedAccountId, selectedStationId, accountTree]);

  // Ensure selected account stays expanded in sidebar when switched from TopBar
  useEffect(() => {
    if (scopeSelection.accountId) {
      setExpandedAccountIds((prev) => {
        if (prev.has(scopeSelection.accountId!)) return prev;
        const next = new Set(prev);
        next.add(scopeSelection.accountId!);
        return next;
      });
    }
  }, [scopeSelection.accountId]);

  const handleSelectFleet = useCallback(() => {
    if (isConsumer) return;
    selectAccountAndPlant('ALL_FLEET', 'ALL');
  }, [isConsumer, selectAccountAndPlant]);

  const handleSelectAccount = useCallback(
    (accountId: string) => {
      setExpandedAccountIds((prev) => {
        const next = new Set(prev);
        next.add(accountId);
        return next;
      });
      selectAccountAndPlant(accountId, 'ALL');
    },
    [selectAccountAndPlant]
  );

  const handleSelectPlant = useCallback(
    (accountId: string, stationId: string) => {
      setExpandedAccountIds((prev) => {
        const next = new Set(prev);
        next.add(accountId);
        return next;
      });
      selectAccountAndPlant(accountId, stationId);
    },
    [selectAccountAndPlant]
  );

  const handleToggleExpandAccount = useCallback((accountId: string) => {
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  const navigateToPlantScope = useCallback(
    (
      accountId: string,
      stationId: string,
      destination: '/analytics' | '/energy-flow' | '/hardware-telemetry'
    ) => {
      selectAccountAndPlant(accountId, stationId);
      router.push(destination);
    },
    [selectAccountAndPlant, router]
  );

  const navigateToDevice = useCallback(
    (
      accountId: string,
      stationId: string,
      deviceSn: string,
      destination: '/hardware-telemetry' | '/energy-flow'
    ) => {
      selectInverter(accountId, stationId, deviceSn);
      router.push(destination);
    },
    [selectInverter, router]
  );

  // Compute global filter pill counts from unfiltered accountTree
  const statusCounts = useMemo(() => {
    const allInverters = accountTree.flatMap((a) =>
      a.plants.flatMap((p) => p.inverters)
    );
    const fault = allInverters.filter((i) => i.status === 'FAULT').length;
    const offline = allInverters.filter((i) => i.status === 'OFFLINE').length;
    const standby = allInverters.filter((i) => i.status === 'STANDBY').length;
    const online = allInverters.filter((i) => i.status === 'ONLINE').length;
    return {
      all: allInverters.length,
      online,
      standby,
      fault,
      offline,
    };
  }, [accountTree]);

  // Sidebar aggregates across filteredTree
  const sidebarTotals = useMemo(() => {
    const solar = filteredTree.reduce((s, a) => s + a.livePowerKw, 0);
    const cap = filteredTree.reduce((s, a) => s + a.capacityKw, 0);
    const plants = filteredTree.reduce((s, a) => s + a.plants.length, 0);
    const inverters = filteredTree.reduce((s, a) => s + a.invertersCount, 0);
    return { solar, cap, plants, inverters };
  }, [filteredTree]);

  // Scoped sizing & yield metadata shown in header hover tooltip
  const scopeSummary = useMemo(() => {
    const targetAccs =
      scopeSelection.mode === 'fleet'
        ? filteredTree
        : filteredTree.filter((a) => a.account.id === scopeSelection.accountId);

    const targetPlants =
      scopeSelection.mode === 'plant'
        ? targetAccs
            .flatMap((a) => a.plants)
            .filter(
              (p) => String(p.plant.stationId) === String(scopeSelection.stationId)
            )
        : targetAccs.flatMap((a) => a.plants);

    const plantsCount = targetPlants.length;
    const invertersCount = targetPlants.reduce((s, p) => s + p.inverters.length, 0);
    const capacityKw = targetPlants.reduce((s, p) => s + p.capacityKw, 0);
    const dailyYieldKwh = targetPlants.reduce((s, p) => s + p.dailyYieldKwh, 0);
    const specificYieldKwhKwp = capacityKw > 0 ? dailyYieldKwh / capacityKw : null;

    return {
      accountsCount: targetAccs.length,
      plantsCount,
      invertersCount,
      capacityKw,
      specificYieldKwhKwp,
    };
  }, [scopeSelection, filteredTree]);

  const nocTableRows = useMemo(
    () => buildNocTableRows(filteredTree, scopeSelection),
    [filteredTree, scopeSelection]
  );

  const scopeLabel = useMemo(() => {
    if (scopeSelection.mode === 'plant') {
      const acc = accountTree.find((a) => a.account.id === scopeSelection.accountId);
      const plant = acc?.plants.find(
        (p) => String(p.plant.stationId) === String(scopeSelection.stationId)
      );
      return plant?.plant.stationName || 'Selected Station';
    }
    if (scopeSelection.mode === 'account') {
      const acc = accountTree.find((a) => a.account.id === scopeSelection.accountId);
      return acc?.account.name || 'Selected Account';
    }
    return 'All Fleet';
  }, [scopeSelection, accountTree]);

  const handleManualRefresh = useCallback(async () => {
    telemetryCache.delete(FLEET_CACHE_KEY);
    clearScopedHistoryCache();
    await Promise.all([fetchFleet(true), refreshAccounts(true, true)]);
  }, [fetchFleet, refreshAccounts]);

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1720px] mx-auto pb-20">
      {/* Screen-reader clipboard live announcement */}
      <p role="status" className="visually-hidden">
        {copyAnnouncement}
      </p>

      {/* Compact Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Building2 size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">
              <HoverInfo
                title={scopeLabel}
                side="bottom"
                align="start"
                className="max-w-full"
                content={
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
                    {scopeSelection.mode === 'fleet' && (
                      <>
                        <dt className="text-muted-foreground">Accounts</dt>
                        <dd className="text-right font-semibold text-foreground">
                          {scopeSummary.accountsCount}
                        </dd>
                      </>
                    )}
                    {scopeSelection.mode !== 'plant' && (
                      <>
                        <dt className="text-muted-foreground">Plants</dt>
                        <dd className="text-right font-semibold text-foreground">
                          {scopeSummary.plantsCount}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Inverters</dt>
                    <dd className="text-right font-semibold text-foreground">
                      {scopeSummary.invertersCount}
                    </dd>
                    <dt className="text-muted-foreground">Installed</dt>
                    <dd className="text-right font-semibold text-foreground">
                      {scopeSummary.capacityKw > 0
                        ? `${scopeSummary.capacityKw.toFixed(0)} kWp`
                        : '--'}
                    </dd>
                    <dt className="text-muted-foreground">Spec. Yield</dt>
                    <dd className="text-right font-semibold text-foreground">
                      {scopeSummary.specificYieldKwhKwp !== null
                        ? `${scopeSummary.specificYieldKwhKwp.toFixed(2)} kWh/kWp`
                        : '--'}
                    </dd>
                  </dl>
                }
              >
                <span className="truncate">Fleet Monitoring Hub</span>
              </HoverInfo>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground shrink-0">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <span>Scope:</span>
          <strong className="text-foreground truncate max-w-[200px]">{scopeLabel}</strong>
        </div>
      </div>

      {/* Search, Sort & Accessible View Control Bar */}
      <FleetControlBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshChange={setAutoRefreshInterval}
        onManualRefresh={handleManualRefresh}
        isRefreshing={refreshing || isFetchingDeye || syncing}
        controlledRegionId={regionId}
      />

      {/* Initial Loading Overlay (only when no cached aggregate exists) */}
      {loading && !fleetData && !isFetchingDeye && !syncing && (
        <div
          aria-busy="true"
          aria-label="Aggregating fleet telemetry"
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-md"
        >
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-primary/30 shadow-2xl max-w-md w-full mx-4 text-center">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-primary">
                <Globe className="w-5 h-5 text-primary animate-pulse" aria-hidden="true" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-foreground font-headline">
                Aggregating Fleet Telemetry
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                Synchronizing stations & live inverter readings...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Pane Master-Detail Layout */}
      {loading ? (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="w-full lg:w-[290px] xl:w-[320px] h-80 rounded-2xl border border-border/50 bg-card/60 animate-pulse shrink-0" />
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-56 rounded-2xl border border-border/50 bg-card/60 animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border/70 rounded-2xl bg-card/40">
          <AlertTriangle
            className="size-8 mx-auto text-muted-foreground mb-3"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-foreground">
            No matching accounts or stations
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Adjust or clear your active search query or status filter.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
            }}
            className="mt-4"
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* Left Pane: Persistent Scope Navigator */}
          <FleetScopeSidebar
            accounts={filteredTree}
            selection={scopeSelection}
            expandedAccountIds={expandedAccountIds}
            onSelectFleet={handleSelectFleet}
            onSelectAccount={handleSelectAccount}
            onSelectPlant={handleSelectPlant}
            onToggleExpandAccount={handleToggleExpandAccount}
            isConsumer={isConsumer}
            totalFleetSolarKw={sidebarTotals.solar}
            totalFleetCapKw={sidebarTotals.cap}
            totalPlantsCount={sidebarTotals.plants}
            totalInvertersCount={sidebarTotals.inverters}
          />

          {/* Right Pane: Detail Workspace (Visual Curves or High-Density NOC Matrix) */}
          <div id={regionId} className="flex-1 min-w-0 w-full">
            {viewMode === 'matrix' ? (
              <FleetNocTable
                rows={nocTableRows}
                scopeLabel={scopeLabel}
                copiedSn={copiedSn}
                onCopySn={handleCopySn}
                onNavigateToDevice={navigateToDevice}
              />
            ) : (
              <FleetDetailWorkspace
                accounts={filteredTree}
                selection={scopeSelection}
                sortKey={sortKey}
                isAdmin={isAdmin}
                copiedSn={copiedSn}
                onCopySn={handleCopySn}
                onSelectFleet={handleSelectFleet}
                onSelectAccount={handleSelectAccount}
                onSelectPlant={handleSelectPlant}
                onToggleAccountEnabled={handleToggleAccountEnabled}
                onNavigateToPlantScope={navigateToPlantScope}
                onNavigateToDevice={navigateToDevice}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

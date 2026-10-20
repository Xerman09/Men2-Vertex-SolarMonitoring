'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderTree,
  Building2,
  Cpu,
  Radio,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Sliders,
  Copy,
  Check,
  Zap,
  BarChart3,
  Sun,
  BatteryCharging,
  Clock,
  ShieldCheck,
  X,
  Gauge,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  Power,
  Globe,
} from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import {
  AccountSummary,
  PlantInfo,
  DeviceInfo,
  AggregatedFleetSummary,
} from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InverterSolarCurve } from './components/InverterSolarCurve';
import { PlantSolarCurve } from './components/PlantSolarCurve';

type StatusFilter = 'ALL' | 'ONLINE' | 'STANDBY' | 'FAULT';

export default function FleetMonitoringPage() {
  const router = useRouter();
  const { selectAccountAndPlant, selectInverter, refreshAccounts, isFetchingDeye, syncing } = useAccount();
  const { isAdmin, isConsumer, user } = useRole();

  // Fleet aggregate data
  const [fleetData, setFleetData] = useState<AggregatedFleetSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // 0 = paused

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Hierarchical Collapsible State:
  // DEFAULT: All accounts are collapsed into the separate totals grid!
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  // DEFAULT: All plants are collapsed into plant cards!
  const [expandedPlantKeys, setExpandedPlantKeys] = useState<Set<string>>(new Set());

  // Copy feedback state
  const [copiedSn, setCopiedSn] = useState<string | null>(null);

  const fetchFleet = useCallback(async (isManual: boolean = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/deye/aggregate');
      if (res.ok) {
        const json: AggregatedFleetSummary = await res.json();
        setFleetData(json);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch fleet aggregate:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet(false);
  }, [fetchFleet]);

  // Polling
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchFleet(false);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchFleet]);

  const handleCopySn = useCallback((sn: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sn);
    setCopiedSn(sn);
    setTimeout(() => {
      setCopiedSn((current) => (current === sn ? null : current));
    }, 2000);
  }, []);

  const handleToggleAccount = useCallback(
    async (account: AccountSummary) => {
      if (!isAdmin) return;
      try {
        const newEnabled = account.status === 'OFFLINE';
        const res = await fetch('/api/deye/accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: account.id, enabled: newEnabled }),
        });
        if (res.ok) {
          await Promise.all([fetchFleet(true), refreshAccounts(true, true)]);
        }
      } catch (e) {
        console.error('Toggle account error', e);
      }
    },
    [isAdmin, fetchFleet, refreshAccounts]
  );

  // Filter accounts by role (demo accounts strictly restricted to admin)
  const authorizedAccounts = useMemo(() => {
    if (!fleetData?.accounts) return [];
    if (isAdmin) return fleetData.accounts;
    return fleetData.accounts.filter(
      (a) => !a.isDemo && a.id !== 'men2-facility-2' && a.id !== 'men2-facility-3'
    );
  }, [fleetData, isAdmin]);

  // Structure accounts with nested plants and individual inverters
  const accountTree = useMemo(() => {
    if (!fleetData) return [];

    return authorizedAccounts.map((acc) => {
      const isAccDemo = Boolean(acc.isDemo || acc.id === 'men2-facility-2' || acc.id === 'men2-facility-3');

      const plants = (acc.plants || []).map((plant) => {
        const plantKey = `${acc.id}:${plant.stationId}`;

        // Find matrix nodes belonging to this station
        const plantNodes = (fleetData.nodes || []).filter(
          (n) => String(n.stationId) === String(plant.stationId) && n.accountId === acc.id
        );

        const inverters = (plant.devices || [])
          .filter((d) => d.deviceType === 'INVERTER')
          .map((device) => {
            const matchedNode = plantNodes.find((n) => n.deviceSn === device.deviceSn);
            const liveKw = matchedNode
              ? matchedNode.liveSolarPowerKw
              : (plant.liveSolarPowerKw || 0) / (plant.devices.length || 1);
            const dailyYield = matchedNode
              ? matchedNode.dailyYieldKwh
              : (plant.dailyYieldKwh || 0) / (plant.devices.length || 1);
            const rated = device.ratedKw || matchedNode?.ratedKw || 50;
            const status = matchedNode?.status || device.status || 'ONLINE';
            const loggerSn = device.loggerSn || matchedNode?.loggerSn;

            return {
              ...device,
              ratedKw: rated,
              liveSolarPowerKw: parseFloat((liveKw || 0).toFixed(2)),
              dailyYieldKwh: parseFloat((dailyYield || 0).toFixed(2)),
              status,
              loggerSn,
              batterySoc: matchedNode?.batterySoc || 0,
              model: device.model || matchedNode?.model || 'SUN Hybrid Inverter',
            };
          });

        const loggers = (plant.devices || []).filter((d) => d.deviceType === 'LOGGER');

        const plantLivePowerKw = inverters.reduce((sum, inv) => sum + inv.liveSolarPowerKw, 0);
        const plantDailyYieldKwh = inverters.reduce((sum, inv) => sum + inv.dailyYieldKwh, 0);
        const capacityKw = plant.installedCapacityKw || inverters.reduce((sum, inv) => sum + inv.ratedKw, 0);

        let plantStatus: 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE' = 'ONLINE';
        if (inverters.some((i) => i.status === 'FAULT')) plantStatus = 'FAULT';
        else if (plantLivePowerKw === 0) plantStatus = 'STANDBY';

        return {
          plantKey,
          plant,
          inverters,
          loggers,
          livePowerKw: parseFloat(plantLivePowerKw.toFixed(2)),
          dailyYieldKwh: parseFloat(plantDailyYieldKwh.toFixed(2)),
          capacityKw,
          status: plantStatus,
        };
      });

      const accLivePowerKw = plants.reduce((sum, p) => sum + p.livePowerKw, 0);
      const accDailyYieldKwh = plants.reduce((sum, p) => sum + p.dailyYieldKwh, 0);
      const accCapacityKw = plants.reduce((sum, p) => sum + p.capacityKw, 0);
      const totalInvertersCount = plants.reduce((sum, p) => sum + p.inverters.length, 0);
      const totalLoggersCount = plants.reduce((sum, p) => sum + p.loggers.length, 0);

      return {
        account: acc,
        isDemo: isAccDemo,
        plants,
        livePowerKw: parseFloat(accLivePowerKw.toFixed(2)),
        dailyYieldKwh: parseFloat(accDailyYieldKwh.toFixed(2)),
        capacityKw: parseFloat(accCapacityKw.toFixed(1)),
        invertersCount: totalInvertersCount,
        loggersCount: totalLoggersCount,
      };
    });
  }, [authorizedAccounts, fleetData]);

  // Search & Status filter matching
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim() && statusFilter === 'ALL') return accountTree;
    const q = searchQuery.toLowerCase().trim();

    return accountTree
      .map((accGroup) => {
        const matchesAccName = accGroup.account.name.toLowerCase().includes(q);

        const matchingPlants = accGroup.plants
          .map((pGroup) => {
            const matchesPlantStatus = statusFilter === 'ALL' || pGroup.status === statusFilter;
            const matchesPlantText =
              pGroup.plant.stationName.toLowerCase().includes(q) ||
              String(pGroup.plant.stationId).toLowerCase().includes(q) ||
              matchesAccName;

            const matchingInverters = pGroup.inverters.filter((inv) => {
              const matchesInvStatus = statusFilter === 'ALL' || inv.status === statusFilter;
              const matchesInvText =
                !q ||
                inv.deviceSn.toLowerCase().includes(q) ||
                (inv.model && inv.model.toLowerCase().includes(q)) ||
                (inv.loggerSn && inv.loggerSn.toLowerCase().includes(q)) ||
                matchesPlantText;
              return matchesInvStatus && matchesInvText;
            });

            if (matchingInverters.length > 0 || (matchesPlantStatus && matchesPlantText)) {
              return {
                ...pGroup,
                inverters: matchingInverters.length > 0 ? matchingInverters : pGroup.inverters,
              };
            }
            return null;
          })
          .filter(Boolean) as typeof accGroup.plants;

        if (matchingPlants.length > 0 || matchesAccName) {
          return {
            ...accGroup,
            plants: matchingPlants,
          };
        }
        return null;
      })
      .filter(Boolean) as typeof accountTree;
  }, [accountTree, searchQuery, statusFilter]);

  // Auto-expand specific matching branch during active search
  useEffect(() => {
    if (searchQuery.trim()) {
      const accIdsToExpand = new Set<string>();
      const plantKeysToExpand = new Set<string>();

      filteredTree.forEach((acc) => {
        accIdsToExpand.add(acc.account.id);
        acc.plants.forEach((p) => plantKeysToExpand.add(p.plantKey));
      });

      setExpandedAccountIds(accIdsToExpand);
      setExpandedPlantKeys(plantKeysToExpand);
    }
  }, [searchQuery, filteredTree]);

  // Toggle Account Expansion
  const toggleAccountExpand = useCallback((accId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  }, []);

  // Toggle Plant Expansion (reveals inverter graphs)
  const togglePlantExpand = useCallback((plantKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedPlantKeys((prev) => {
      const next = new Set(prev);
      if (next.has(plantKey)) next.delete(plantKey);
      else next.add(plantKey);
      return next;
    });
  }, []);

  // Global Expand / Collapse Controls
  const expandAllAccounts = useCallback(() => {
    const allAccIds = new Set<string>(accountTree.map((a) => a.account.id));
    setExpandedAccountIds(allAccIds);
  }, [accountTree]);

  const expandAllEverywhere = useCallback(() => {
    const allAccIds = new Set<string>(accountTree.map((a) => a.account.id));
    const allPlantKeys = new Set<string>();
    accountTree.forEach((a) => a.plants.forEach((p) => allPlantKeys.add(p.plantKey)));
    setExpandedAccountIds(allAccIds);
    setExpandedPlantKeys(allPlantKeys);
  }, [accountTree]);

  const collapseToAccountGrid = useCallback(() => {
    setExpandedAccountIds(new Set());
    setExpandedPlantKeys(new Set());
  }, []);

  // Deep Navigation Drill-downs
  const navigateToPlant = useCallback(
    (accountId: string, stationId: string, destination: '/energy-flow' | '/analytics' | '/hardware-telemetry') => {
      selectAccountAndPlant(accountId, stationId);
      router.push(destination);
    },
    [selectAccountAndPlant, router]
  );

  const navigateToDevice = useCallback(
    (accountId: string, stationId: string, deviceSn: string, destination: '/hardware-telemetry' | '/energy-flow') => {
      selectInverter(accountId, stationId, deviceSn);
      router.push(destination);
    },
    [selectInverter, router]
  );

  const totalAccountsCount = filteredTree.length;
  const totalPlantsCount = filteredTree.reduce((sum, a) => sum + a.plants.length, 0);
  const totalInvertersCount = filteredTree.reduce(
    (sum, a) => sum + a.plants.reduce((pSum, p) => pSum + p.inverters.length, 0),
    0
  );

  return (
    <div className="flex flex-col gap-5 w-full max-w-[1720px] mx-auto pb-24">
      {/* Top Banner & Control Strip */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-3 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                  Fleet Monitoring Hub
                </h1>
                <Badge variant="outline" className="text-[10px] font-mono gap-1.5 py-0.5">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </Badge>
                {isAdmin ? (
                  <Badge variant="warning" className="text-[10px] font-mono gap-1">
                    <ShieldCheck size={12} />
                    Admin View ({authorizedAccounts.length} Accounts)
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    Production Fleet
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Defaulting to separate account totals in a grid: expand an account to inspect plant curves, then expand plants to inspect individual inverter graphs.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls: Hierarchy Expand/Collapse, Auto-refresh, and Manual Refresh */}
        <div className="flex items-center gap-2 flex-wrap self-stretch lg:self-auto justify-end">
          {/* View Level Controls */}
          <div className="flex items-center p-0.5 bg-muted/60 rounded-xl border border-border/50 text-xs font-semibold">
            <button
              type="button"
              onClick={collapseToAccountGrid}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                expandedAccountIds.size === 0
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Show each account's separate totals as a clean grid (Default)"
            >
              Account Grid (Default)
            </button>
            <span className="text-border">|</span>
            <button
              type="button"
              onClick={expandAllAccounts}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                expandedAccountIds.size > 0 && expandedPlantKeys.size === 0
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Expand accounts to show plant graphs"
            >
              Expand Plants
            </button>
            <span className="text-border">|</span>
            <button
              type="button"
              onClick={expandAllEverywhere}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                expandedPlantKeys.size > 0
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Expand all inverters across all plants"
            >
              Expand All Inverters
            </button>
          </div>

          {/* Auto Refresh Dropdown */}
          <div className="flex items-center bg-card border border-border/70 rounded-xl px-2.5 py-1 text-xs">
            <Clock size={12} className="text-muted-foreground mr-1.5" />
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-[11px] font-semibold focus:outline-hidden cursor-pointer"
              aria-label="Auto-refresh interval"
            >
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={0}>Paused</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await Promise.all([
                fetchFleet(true),
                refreshAccounts(true, true),
              ]);
            }}
            disabled={refreshing || isFetchingDeye || syncing}
            className="gap-1.5 h-8 text-xs cursor-pointer"
            title="Refresh fleet telemetry & fetch DeyeCloud accounts"
          >
            <RefreshCw size={13} className={refreshing || isFetchingDeye || syncing ? 'animate-spin text-primary' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-card/80 border-border/70 shadow-xs">
        <CardContent className="p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Active Asset Counter */}
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <Building2 size={13} className="text-primary" /> {totalAccountsCount} Accounts
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Layers size={13} /> {totalPlantsCount} Plants
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-amber-500 font-semibold">
              <Cpu size={13} /> {totalInvertersCount} Inverters
            </span>
          </div>

          {/* Search & Status Filter */}
          <div className="flex items-center gap-2 flex-wrap flex-1 md:justify-end">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search accounts, plants, inverter SN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-border/80 rounded-xl pl-8 pr-7 py-1 text-xs focus:outline-hidden focus:border-primary transition-all text-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center bg-background border border-border/80 rounded-xl px-2.5 py-1 text-xs">
              <Filter size={12} className="text-muted-foreground mr-1.5 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-transparent text-[11px] font-medium focus:outline-hidden cursor-pointer"
                aria-label="Filter by Status"
              >
                <option value="ALL">All Status</option>
                <option value="ONLINE">Online Only</option>
                <option value="STANDBY">Standby</option>
                <option value="FAULT">Fault</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fleet Initial Telemetry Loading Overlay */}
      {loading && !fleetData && !isFetchingDeye && !syncing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-md transition-all duration-300">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card/95 border border-primary/30 shadow-2xl max-w-md w-full mx-4 text-center animate-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-primary">
                <Globe className="w-5 h-5 text-primary animate-pulse" />
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-foreground font-headline tracking-wide">
                Aggregating Fleet Telemetry
              </h3>
              <p className="text-xs text-muted-foreground font-mono">
                Compiling multi-account station matrices, capacity factors & live solar output...
              </p>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 h-full w-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Main Content: THE ACCOUNT GRID (Default) with progressive expansion to Plants and Inverters */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-card/60 border-border/50 h-72 rounded-2xl" />
          ))}
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border/70 rounded-2xl bg-card/40">
          <AlertTriangle className="size-8 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold text-foreground">No accounts or assets found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            No accounts match your current search query or filter parameters.
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
        /* THE HIERARCHICAL GRID: Defaults to each account's separate totals in a grid (Never 1 col) */
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 items-stretch">
          {filteredTree.map((accGroup) => {
            const isAccExpanded = expandedAccountIds.has(accGroup.account.id);
            const accUtilization = accGroup.capacityKw > 0
              ? Math.min(100, (accGroup.livePowerKw / accGroup.capacityKw) * 100)
              : 0;

            return (
              /* ACCOUNT CARD IN THE GRID (Spans full width when expanded to host its nested plant graphs) */
              <div
                key={accGroup.account.id}
                className={`rounded-2xl border transition-all duration-300 shadow-xs overflow-hidden h-full flex flex-col ${
                  isAccExpanded
                    ? 'col-span-full border-primary/50 bg-card/95 shadow-md ring-1 ring-primary/20'
                    : 'col-span-1 border-border/70 bg-card hover:border-border hover:shadow-sm'
                }`}
              >
                {/* ACCOUNT SEPARATE TOTALS HEADER */}
                <div
                  onClick={(e) => toggleAccountExpand(accGroup.account.id, e)}
                  className={`p-4 cursor-pointer select-none transition-colors h-full flex-1 flex flex-col justify-between gap-3.5 ${
                    isAccExpanded ? 'bg-muted/40 border-b border-border/50' : 'hover:bg-muted/20'
                  }`}
                >
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {/* Row 1: Account Name + Actions (Disable/Enable & Expand) in a single row */}
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-foreground truncate min-w-0 flex-1">
                        {accGroup.account.name}
                      </h2>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && (
                          <Button
                            variant={accGroup.account.status === 'OFFLINE' ? 'outline' : 'secondary'}
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAccount(accGroup.account);
                            }}
                            title={accGroup.account.status === 'OFFLINE' ? 'Enable Account' : 'Disable Account'}
                            className="h-7 px-2 text-xs gap-1 font-semibold cursor-pointer"
                          >
                            <Power
                              size={12}
                              className={accGroup.account.status === 'OFFLINE' ? 'text-muted-foreground' : 'text-emerald-500'}
                            />
                            <span className="hidden sm:inline">
                              {accGroup.account.status === 'OFFLINE' ? 'Enable' : 'Disable'}
                            </span>
                          </Button>
                        )}

                        {/* Expand/Collapse Indicator Button */}
                        <Button
                          variant={isAccExpanded ? 'secondary' : 'outline'}
                          size="xs"
                          onClick={(e) => toggleAccountExpand(accGroup.account.id, e)}
                          className="shrink-0 text-xs gap-1 font-semibold cursor-pointer"
                        >
                          {isAccExpanded ? (
                            <>
                              <ChevronUp size={14} />
                              <span>Collapse Plants</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              <span>Expand Plants ({accGroup.plants.length})</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Row 2: Status badge and plant/inverter count (ID hidden) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {accGroup.isDemo && (
                        <Badge variant="warning" className="text-[9px] font-mono py-0">
                          DEMO ACCOUNT
                        </Badge>
                      )}
                      {accGroup.account.status === 'OFFLINE' ? (
                        <Badge variant="destructive" className="text-[9px] font-mono py-0">
                          DISABLED
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[9px] font-mono py-0">
                          ACTIVE
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {accGroup.plants.length} Plants • {accGroup.invertersCount} Inverters
                      </span>
                    </div>
                  </div>

                  {/* ACCOUNT HARVEST & UTILIZATION STRIP */}
                  <div className="flex items-center justify-between text-[10px] font-mono p-1.5 rounded-lg bg-muted/20 border border-border/40 gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-muted-foreground truncate">Harvest:</span>
                      <span className="font-bold text-emerald-500 whitespace-nowrap">
                        {accGroup.dailyYieldKwh.toFixed(1)} <span className="text-[8px] font-normal text-muted-foreground">kWh</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 justify-end">
                      <span className="text-muted-foreground whitespace-nowrap">
                        Util: <span className="font-semibold text-foreground">{accUtilization.toFixed(1)}%</span>
                      </span>
                      <div className="h-1.5 w-14 sm:w-20 bg-muted/60 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${accUtilization}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Diurnal Solar Curve stretched to cover whole card */}
                  <div className="flex flex-col flex-1 min-h-[140px] w-full">
                    <PlantSolarCurve
                      capacityKw={accGroup.capacityKw}
                      livePowerKw={accGroup.livePowerKw}
                      dailyYieldKwh={accGroup.dailyYieldKwh}
                      className="h-full flex-1 w-full"
                      showLabels={true}
                    />
                  </div>
                </div>

                {/* EXPANDED SECTION: PLANTS GRID UNDER THIS ACCOUNT */}
                {isAccExpanded && (
                  <div className="p-4 sm:p-5 bg-background/60 border-t border-border/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/30 pb-2">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-primary" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                          {accGroup.account.name} — Individual Plants & Curves ({accGroup.plants.length})
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        Expand any plant to inspect its individual inverters
                      </span>
                    </div>

                    {/* PLANTS GRID (Never 1 col) */}
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-stretch">
                      {accGroup.plants.map((pGroup) => {
                        const isPlantExpanded = expandedPlantKeys.has(pGroup.plantKey);
                        const plantUtil = pGroup.capacityKw > 0
                          ? Math.min(100, (pGroup.livePowerKw / pGroup.capacityKw) * 100)
                          : 0;

                        return (
                          /* INDIVIDUAL PLANT CARD */
                          <div
                            key={pGroup.plantKey}
                            className={`rounded-xl border bg-card shadow-2xs overflow-hidden transition-all h-full flex flex-col justify-between ${
                              isPlantExpanded
                                ? 'col-span-full border-primary/40 ring-1 ring-primary/10'
                                : 'col-span-1 border-border/60 hover:border-border'
                            }`}
                          >
                            {/* PLANT HEADER */}
                            <div className="p-3.5 pb-2.5 bg-muted/20 border-b border-border/30 shrink-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      Station ID: {pGroup.plant.stationId}
                                    </span>
                                    <Badge
                                      variant={pGroup.status === 'FAULT' ? 'destructive' : pGroup.status === 'STANDBY' ? 'warning' : 'success'}
                                      className="text-[9px] font-mono py-0 gap-1 capitalize"
                                    >
                                      <span
                                        className={`size-1.5 rounded-full ${
                                          pGroup.status === 'FAULT'
                                            ? 'bg-destructive'
                                            : pGroup.status === 'STANDBY'
                                            ? 'bg-amber-500'
                                            : 'bg-emerald-500 animate-pulse'
                                        }`}
                                      />
                                      {pGroup.status.toLowerCase()}
                                    </Badge>
                                  </div>
                                  <h4 className="text-sm sm:text-base font-bold text-foreground truncate mt-0.5">
                                    {pGroup.plant.stationName}
                                  </h4>
                                </div>

                                {/* Plant Quick Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() => navigateToPlant(accGroup.account.id, pGroup.plant.stationId, '/energy-flow')}
                                    title="View Energy Flow"
                                    className="text-[10px] h-6 px-2 gap-1"
                                  >
                                    <Zap size={11} />
                                    <span>Flow</span>
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={() => navigateToPlant(accGroup.account.id, pGroup.plant.stationId, '/analytics')}
                                    title="View Analytics"
                                    className="text-[10px] h-6 px-2 gap-1"
                                  >
                                    <BarChart3 size={11} />
                                    <span>Analytics</span>
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* PLANT SEPARATE TOTALS & INDIVIDUAL GRAPH */}
                            <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                              {/* Plant Harvest & Capacity Factor Strip */}
                              <div className="flex items-center justify-between text-[10px] font-mono p-1.5 rounded-lg bg-muted/20 border border-border/40 gap-2 shrink-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span className="text-muted-foreground truncate">Harvest:</span>
                                  <span className="font-bold text-emerald-500 whitespace-nowrap">
                                    {pGroup.dailyYieldKwh.toFixed(1)} <span className="text-[8px] font-normal text-muted-foreground">kWh</span>
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 justify-end">
                                  <span className="text-muted-foreground whitespace-nowrap">
                                    Util: <span className="font-semibold text-foreground">{plantUtil.toFixed(1)}%</span>
                                  </span>
                                  <div className="h-1.5 w-12 sm:w-16 bg-muted/60 rounded-full overflow-hidden shrink-0">
                                    <div
                                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full"
                                      style={{ width: `${plantUtil}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Plant's Diurnal Solar Arc Curve - FULL WIDTH */}
                              <div className="flex flex-col flex-1 min-h-[140px] w-full">
                                <PlantSolarCurve
                                  capacityKw={pGroup.capacityKw}
                                  livePowerKw={pGroup.livePowerKw}
                                  dailyYieldKwh={pGroup.dailyYieldKwh}
                                  className="h-full flex-1 w-full"
                                  showLabels={true}
                                />
                              </div>

                              {/* EXPAND INVERTERS BUTTON */}
                              <Button
                                variant={isPlantExpanded ? 'secondary' : 'outline'}
                                size="xs"
                                onClick={(e) => togglePlantExpand(pGroup.plantKey, e)}
                                className="w-full text-xs font-semibold gap-1.5 mt-1 shrink-0"
                              >
                                {isPlantExpanded ? (
                                  <>
                                    <ChevronUp size={13} />
                                    <span>Collapse Inverters ({pGroup.inverters.length})</span>
                                  </>
                                ) : (
                                  <>
                                    <Cpu size={13} />
                                    <span>Expand Inverters ({pGroup.inverters.length} Units)</span>
                                    <ChevronDown size={13} className="ml-auto" />
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* EXPANDED SECTION: RESPECTIVE INVERTER GRAPHS & DETAILS */}
                            {isPlantExpanded && (
                              <div className="p-3.5 bg-muted/15 border-t border-border/40 space-y-3">
                                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-1">
                                  <span className="font-bold text-foreground">
                                    Respective Inverters & Output Graphs
                                  </span>
                                  <span>{pGroup.inverters.length} Inverter Nodes Active</span>
                                </div>

                                {/* INVERTERS GRID (Never 1 col) */}
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 items-stretch">
                                  {pGroup.inverters.map((inv) => {
                                    const isCopied = copiedSn === inv.deviceSn;
                                    const isFault = inv.status === 'FAULT';
                                    const isStandby = inv.status === 'STANDBY' || inv.liveSolarPowerKw === 0;
                                    const loadPct = Math.min(100, (inv.liveSolarPowerKw / (inv.ratedKw || 50)) * 100);

                                    return (
                                      /* INDIVIDUAL INVERTER CARD */
                                      <div
                                        key={inv.deviceSn}
                                        className="p-3 rounded-xl bg-card border border-border/60 hover:border-primary/50 transition-all shadow-2xs h-full flex flex-col justify-between gap-2"
                                      >
                                        {/* Inverter Header */}
                                        <div className="flex items-start justify-between gap-1.5">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-mono font-bold text-xs text-foreground truncate">
                                                {inv.deviceSn}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => handleCopySn(inv.deviceSn, e)}
                                                className="p-0.5 text-muted-foreground hover:text-foreground rounded cursor-pointer"
                                                title="Copy Serial Number"
                                              >
                                                {isCopied ? (
                                                  <Check size={11} className="text-emerald-500" />
                                                ) : (
                                                  <Copy size={11} />
                                                )}
                                              </button>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground truncate">
                                              {inv.model} ({inv.ratedKw} kW)
                                            </div>
                                          </div>

                                          <Badge
                                            variant={isFault ? 'destructive' : isStandby ? 'warning' : 'success'}
                                            className="text-[9px] font-mono py-0 gap-1 capitalize shrink-0"
                                          >
                                            <span
                                              className={`size-1.5 rounded-full ${
                                                isFault
                                                  ? 'bg-destructive animate-ping'
                                                  : isStandby
                                                  ? 'bg-amber-500'
                                                  : 'bg-emerald-500 animate-pulse'
                                              }`}
                                            />
                                            {inv.status.toLowerCase()}
                                          </Badge>
                                        </div>

                                        {/* Inverter Individual Diurnal Output Curve Graph */}
                                        <div className="w-full">
                                          <InverterSolarCurve
                                            ratedKw={inv.ratedKw}
                                            liveSolarPowerKw={inv.liveSolarPowerKw}
                                            dailyYieldKwh={inv.dailyYieldKwh}
                                            height={58}
                                            className="w-full"
                                          />
                                        </div>

                                        {/* Output Gauge Bar */}
                                        <div className="space-y-0.5">
                                          <div className="flex items-center justify-between text-[9px] font-mono">
                                            <span className="text-muted-foreground">Output:</span>
                                            <span className="font-bold text-amber-500">
                                              {inv.liveSolarPowerKw.toFixed(1)} kW ({loadPct.toFixed(0)}%)
                                            </span>
                                          </div>
                                          <div className="h-1 w-full bg-muted/60 rounded-full overflow-hidden">
                                            <div
                                              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-300"
                                              style={{ width: `${loadPct}%` }}
                                            />
                                          </div>
                                        </div>

                                        {/* Inverter Secondary Details & Paired Logger */}
                                        <div className="flex items-center justify-between text-[9.5px] font-mono text-muted-foreground pt-1 border-t border-border/30">
                                          <span>Yield: <strong className="text-emerald-500">{inv.dailyYieldKwh.toFixed(1)} kWh</strong></span>
                                          {inv.loggerSn && (
                                            <span className="flex items-center gap-1 truncate max-w-[110px]" title={`Paired Logger: ${inv.loggerSn}`}>
                                              <Radio size={10} className="shrink-0" />
                                              {inv.loggerSn}
                                            </span>
                                          )}
                                        </div>

                                        {/* Deep Link Action */}
                                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                                          <Button
                                            variant="default"
                                            size="xs"
                                            onClick={() => navigateToDevice(accGroup.account.id, pGroup.plant.stationId, inv.deviceSn, '/hardware-telemetry')}
                                            className="text-[10px] h-6 px-1.5 gap-1"
                                          >
                                            <Sliders size={10} />
                                            <span>Telemetry</span>
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="xs"
                                            onClick={() => navigateToDevice(accGroup.account.id, pGroup.plant.stationId, inv.deviceSn, '/energy-flow')}
                                            className="text-[10px] h-6 px-1.5 gap-1"
                                          >
                                            <Zap size={10} />
                                            <span>Flow</span>
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Status Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50 gap-2">
        <div className="flex items-center gap-2">
          <span>Fleet telemetry updated from {totalAccountsCount} accounts</span>
          {lastRefreshedAt && (
            <>
              <span>•</span>
              <span>Last polled {lastRefreshedAt.toLocaleTimeString()}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" /> Standby
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" /> Fault
          </span>
        </div>
      </div>
    </div>
  );
}

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
  Copy,
  Check,
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
import { HoverInfo } from '@/components/ui/tooltip';
import { InverterSolarCurve } from './components/InverterSolarCurve';
import { PlantSolarCurve } from './components/PlantSolarCurve';
import { telemetryCache } from '@/lib/telemetry-cache';
import { createLogger } from '@/lib/logger';

const log = createLogger('FleetMonitoring');
const FLEET_CACHE_KEY = 'fleet:aggregate';

type StatusFilter = 'ALL' | 'ONLINE' | 'STANDBY' | 'FAULT';

export default function FleetMonitoringPage() {
  const router = useRouter();
  const {
    selectInverter,
    refreshAccounts,
    isFetchingDeye,
    syncing,
    selectedAccountId,
    selectedStationId,
    isFleetView,
    selectAccountAndPlant,
    setSelectedAccountId,
    setSelectedStationId,
  } = useAccount();
  const { isAdmin, isConsumer, user, isInitialized } = useRole();

  // Fleet aggregate data - restored from client cache immediately (0ms instant render)
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
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // 0 = paused

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Hierarchical Collapsible State:
  // Admin: defaults to separate account totals grid (collapsed).
  // Non-Admin: defaults to plants (all accounts expanded).
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  // DEFAULT: All plants are collapsed into plant cards!
  const [expandedPlantKeys, setExpandedPlantKeys] = useState<Set<string>>(new Set());
  const [lastDefaultRole, setLastDefaultRole] = useState<string | null>(null);

  // Copy feedback state
  const [copiedSn, setCopiedSn] = useState<string | null>(null);

  // Real 5-minute interval historical telemetry (from /api/deye/history) matching Analytics Dashboard
  const [telemetryHistory, setTelemetryHistory] = useState<Array<{
    hour?: string;
    solarYieldKw?: number | null;
    loadDemandKw?: number | null;
    gridFlowKw?: number | null;
    isElapsed?: boolean;
  }> | null>(() => {
    return typeof window !== 'undefined'
      ? telemetryCache.get('analytics:TODAY:ALL', 60000, true)
      : null;
  });

  useEffect(() => {
    let active = true;
    async function loadTelemetryHistory() {
      try {
        const res = await fetch('/api/deye/history?range=TODAY&step=5');
        if (res.ok && active) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data) && json.data.length > 0) {
            telemetryCache.set('analytics:TODAY:ALL', json.data);
            setTelemetryHistory(json.data);
          }
        }
      } catch {
        // Fallback to diurnal model
      }
    }
    loadTelemetryHistory();
    return () => {
      active = false;
    };
  }, []);

  const fetchFleet = useCallback(async (isManual: boolean = false) => {
    // If not manual refresh and cache is fresh (< 30s), reuse cached data without hitting API
    if (!isManual && telemetryCache.isFresh(FLEET_CACHE_KEY, 30000)) {
      const cached = telemetryCache.get<AggregatedFleetSummary>(FLEET_CACHE_KEY);
      if (cached) {
        setFleetData(cached);
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
      }
    } catch (err) {
      log.error('Failed to fetch fleet aggregate', { error: err });
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
          telemetryCache.delete(FLEET_CACHE_KEY);
          await Promise.all([fetchFleet(true), refreshAccounts(true, true)]);
        }
      } catch (e) {
        log.error('Toggle account error', { error: e });
      }
    },
    [isAdmin, fetchFleet, refreshAccounts]
  );

  // Filter accounts by role (demo accounts strictly restricted to admin)
  const authorizedAccounts = useMemo(() => {
    if (!fleetData?.accounts) return [];
    if (isAdmin) return fleetData.accounts;
    return fleetData.accounts.filter((a) => !a.isDemo);
  }, [fleetData, isAdmin]);

  // Structure accounts with nested plants and individual inverters
  const accountTree = useMemo(() => {
    if (!fleetData) return [];

    return authorizedAccounts.map((acc) => {
      const isAccDemo = Boolean(acc.isDemo);

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

        const plantDemandKw =
          typeof plant.consumptionPowerKw === 'number'
            ? plant.consumptionPowerKw
            : plantNodes.some((n) => typeof n.consumptionPowerKw === 'number')
            ? plantNodes.reduce((sum, n) => sum + (n.consumptionPowerKw || 0), 0)
            : undefined;

        const plantGridPowerKw =
          typeof plant.gridPowerKw === 'number'
            ? plant.gridPowerKw
            : plantNodes.some((n) => typeof n.gridPowerKw === 'number')
            ? plantNodes.reduce((sum, n) => sum + (n.gridPowerKw || 0), 0)
            : undefined;

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
          demandKw: plantDemandKw !== undefined ? parseFloat(plantDemandKw.toFixed(2)) : undefined,
          gridPowerKw: plantGridPowerKw !== undefined ? parseFloat(plantGridPowerKw.toFixed(2)) : undefined,
          status: plantStatus,
        };
      });

      const accLivePowerKw = plants.reduce((sum, p) => sum + p.livePowerKw, 0);
      const accDailyYieldKwh = plants.reduce((sum, p) => sum + p.dailyYieldKwh, 0);
      const accCapacityKw = plants.reduce((sum, p) => sum + p.capacityKw, 0);
      const accDemandKw =
        typeof acc.consumptionPowerKw === 'number'
          ? acc.consumptionPowerKw
          : plants.some((p) => typeof p.demandKw === 'number')
          ? plants.reduce((sum, p) => sum + (p.demandKw || 0), 0)
          : undefined;
      const accGridPowerKw =
        typeof acc.gridPowerKw === 'number'
          ? acc.gridPowerKw
          : plants.some((p) => typeof p.gridPowerKw === 'number')
          ? plants.reduce((sum, p) => sum + (p.gridPowerKw || 0), 0)
          : undefined;
      const totalInvertersCount = plants.reduce((sum, p) => sum + p.inverters.length, 0);
      const totalLoggersCount = plants.reduce((sum, p) => sum + p.loggers.length, 0);

      return {
        account: acc,
        isDemo: isAccDemo,
        plants,
        livePowerKw: parseFloat(accLivePowerKw.toFixed(2)),
        dailyYieldKwh: parseFloat(accDailyYieldKwh.toFixed(2)),
        capacityKw: parseFloat(accCapacityKw.toFixed(1)),
        demandKw: accDemandKw !== undefined ? parseFloat(accDemandKw.toFixed(2)) : undefined,
        gridPowerKw: accGridPowerKw !== undefined ? parseFloat(accGridPowerKw.toFixed(2)) : undefined,
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

  // Set default view on load:
  // Admin -> defaults to Account Grid (collapsed accounts)
  // Non-Admin -> defaults to Plants (expanded accounts revealing plants)
  useEffect(() => {
    if (accountTree.length > 0 && isInitialized) {
      const currentRoleKey = isAdmin ? 'admin' : 'non-admin';
      if (lastDefaultRole !== currentRoleKey) {
        setLastDefaultRole(currentRoleKey);
        if (!isAdmin) {
          // Non-admin defaults to plants
          setExpandedAccountIds(new Set(accountTree.map((a) => a.account.id)));
        } else {
          // Admin defaults to accounts
          setExpandedAccountIds(new Set());
        }
      }
    }
  }, [accountTree, isInitialized, isAdmin, lastDefaultRole]);

  // Synchronize expanded state with top panel fleet dropdown selection
  useEffect(() => {
    if (isFleetView || !selectedAccountId) return;
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      next.add(selectedAccountId);
      return next;
    });

    if (selectedStationId && selectedStationId !== 'ALL') {
      const pKey = `${selectedAccountId}:${selectedStationId}`;
      setExpandedPlantKeys(new Set([pKey]));
    } else {
      setExpandedPlantKeys((prev) => {
        const next = new Set(prev);
        for (const k of next) {
          if (k.startsWith(`${selectedAccountId}:`)) {
            next.delete(k);
          }
        }
        return next;
      });
    }
  }, [selectedAccountId, selectedStationId, isFleetView]);

  // Toggle Account Expansion
  const toggleAccountExpand = useCallback((accId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) {
        next.delete(accId);
        if (selectedAccountId === accId && !isFleetView) {
          selectAccountAndPlant('ALL_FLEET', 'ALL');
        }
      } else {
        next.add(accId);
        if (selectedAccountId !== accId) {
          selectAccountAndPlant(accId, 'ALL');
        }
      }
      return next;
    });
  }, [selectedAccountId, isFleetView, selectAccountAndPlant]);

  // Toggle Plant Expansion (reveals inverter graphs)
  const togglePlantExpand = useCallback((plantKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const [accId, stationId] = plantKey.split(':');
    setExpandedPlantKeys((prev) => {
      const next = new Set(prev);
      if (next.has(plantKey)) {
        next.delete(plantKey);
        if (selectedStationId === stationId) {
          setSelectedStationId('ALL');
        }
      } else {
        next.clear();
        next.add(plantKey);
        if (accId && stationId) {
          selectAccountAndPlant(accId, stationId);
        }
      }
      return next;
    });
  }, [selectedStationId, selectAccountAndPlant, setSelectedStationId]);

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
              <HoverInfo
                title="Fleet Overview"
                side="bottom"
                align="start"
                content={
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] font-mono gap-1.5 py-0.5">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Sync
                      </Badge>
                      {isAdmin ? (
                        <Badge variant="warning" className="text-[10px] font-mono gap-1">
                          <ShieldCheck size={11} />
                          Admin View ({authorizedAccounts.length} Accounts)
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          Production Fleet
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {isAdmin
                        ? 'Defaulting to separate account totals in a grid: expand an account to inspect plant curves, then expand plants to inspect individual inverter graphs.'
                        : 'Defaulting to individual plant curves & operational metrics: expand plants to inspect individual inverter graphs.'}
                    </p>
                  </div>
                }
              >
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground cursor-help">
                  Fleet Monitoring Hub
                </h1>
              </HoverInfo>
            </div>
          </div>
        </div>

        {/* Global Controls: Hierarchy Expand/Collapse, Auto-refresh, and Manual Refresh */}
        <div className="flex items-center gap-2 flex-wrap self-stretch lg:self-auto justify-end">
          {/* View Level Controls (Account Grid | 3-Col Plants | Expand All Inverters) */}
          <div className="flex items-center p-0.5 bg-muted/60 rounded-xl border border-border/50 text-xs font-semibold">
            <button
              type="button"
              onClick={collapseToAccountGrid}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                expandedAccountIds.size === 0
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Show all accounts as a clean 3-column grid"
            >
              Account Grid{isAdmin ? ' (Default)' : ''}
            </button>
            <span className="text-border">|</span>
            <button
              type="button"
              onClick={() => {
                expandAllAccounts();
                setExpandedPlantKeys(new Set());
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                expandedAccountIds.size > 0 && expandedPlantKeys.size === 0
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Expand accounts into 3 columns: Account, Plants, Inverters (Plants collapsed)"
            >
              3-Col Plants{isAdmin ? '' : ' (Default)'}
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
              title="Expand all plant inverters across all accounts without overlap"
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
              telemetryCache.delete(FLEET_CACHE_KEY);
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
        /* THE 3-COLUMN FLEET GRID:
           - Unexpanded accounts display in 3 columns across desktop.
           - Expanded accounts become: Account (1st col), Plants (2nd col), and Inverters (3rd col).
        */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-stretch">
          {filteredTree.map((accGroup) => {
            const isAccExpanded = expandedAccountIds.has(accGroup.account.id);
            const accUtilization = accGroup.capacityKw > 0
              ? Math.min(100, (accGroup.livePowerKw / accGroup.capacityKw) * 100)
              : 0;

            /* UNEXPANDED VIEW: Shows account as a single grid card in the 3-column grid */
            if (!isAccExpanded) {
              return (
                <div
                  key={accGroup.account.id}
                  onClick={(e) => toggleAccountExpand(accGroup.account.id, e)}
                  className="rounded-2xl border border-border/70 bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 overflow-hidden col-span-1 flex flex-col cursor-pointer select-none group"
                  title="Click card to expand account"
                >
                  <div className="p-4 flex flex-col h-full gap-2.5">
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {/* Row 1: Account Name + Expand Indicator */}
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-foreground truncate min-w-0 flex-1 group-hover:text-primary transition-colors">
                          {accGroup.account.name}
                        </h2>
                        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                          <span className="text-[11px] font-mono font-medium hidden sm:inline">
                            {accGroup.plants.length} Plants
                          </span>
                          <ChevronDown size={16} className="transition-transform duration-200 group-hover:translate-y-0.5" />
                        </div>
                      </div>

                      {/* Row 2: Status badge and plant/inverter count */}
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
                          {accGroup.invertersCount} Inverters Total
                        </span>
                      </div>
                    </div>

                    {/* Diurnal Solar Curve with Live Telemetry & Vertical Utilization */}
                    <div className="flex flex-col flex-1 w-full min-h-[160px] pt-1">
                      <PlantSolarCurve
                        capacityKw={accGroup.capacityKw}
                        livePowerKw={accGroup.livePowerKw}
                        dailyYieldKwh={accGroup.dailyYieldKwh}
                        demandKw={accGroup.demandKw}
                        gridPowerKw={accGroup.gridPowerKw}
                        utilizationPct={accUtilization}
                        historyPoints={telemetryHistory ?? undefined}
                        className="h-full flex-1 w-full"
                        showLabels={true}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            /* EXPANDED VIEW:
               If NO plant is expanded:
                 - Column 1: Account Totals Card (with solar arc & stats)
                 - Columns 2 & 3: All Plants in this account (2-column uniform grid)
               If A PLANT IS EXPANDED:
                 - Column 1: Active Plant Card (with its solar curve & stats) + Account mini context + Switcher for other plants
                 - Columns 2 & 3: That plant's Inverters in a clean, spacious 2-column grid
            */
            const expandedPlants = accGroup.plants.filter((p) => expandedPlantKeys.has(p.plantKey));
            const activePlant = expandedPlants[0] || null;
            const otherPlants = accGroup.plants.filter((p) => p.plantKey !== activePlant?.plantKey);

            const renderAccountTotalsCard = (style?: React.CSSProperties, extraClasses: string = '') => (
              <div
                onClick={(e) => toggleAccountExpand(accGroup.account.id, e)}
                style={style}
                className={`p-4 flex flex-col justify-between gap-4 bg-card/60 hover:bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 rounded-2xl border border-border/70 lg:self-start lg:sticky lg:top-4 shadow-xs cursor-pointer select-none group ${extraClasses}`}
                title="Click card to collapse account back to grid"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={14} className="text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground group-hover:text-primary transition-colors">
                        Account Totals
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground group-hover:text-primary transition-colors">
                      <span>Collapse</span>
                      <ChevronUp size={13} className="transition-transform group-hover:-translate-y-0.5" />
                    </div>
                  </div>

                  {/* Diurnal Solar Curve with Live Telemetry at Top of Graph */}
                  <div className="flex flex-col h-[180px] w-full pt-1 shrink-0">
                    <PlantSolarCurve
                      capacityKw={accGroup.capacityKw}
                      livePowerKw={accGroup.livePowerKw}
                      dailyYieldKwh={accGroup.dailyYieldKwh}
                      demandKw={accGroup.demandKw}
                      gridPowerKw={accGroup.gridPowerKw}
                      utilizationPct={accUtilization}
                      historyPoints={telemetryHistory ?? undefined}
                      className="h-full flex-1 w-full"
                      showLabels={true}
                    />
                  </div>
                </div>

                <div className="text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-2 flex items-center justify-between">
                  <span>{accGroup.account.name}</span>
                  <span>{accGroup.plants.length} Plant Stations</span>
                </div>
              </div>
            );

            return (
              <div
                key={accGroup.account.id}
                className="col-span-1 md:col-span-2 lg:col-span-3 rounded-2xl border border-primary/40 bg-card shadow-md ring-1 ring-primary/20 overflow-hidden transition-all duration-300 flex flex-col"
              >
                {/* Account Top Banner with Title, Metadata, and Collapse Action */}
                <div
                  onClick={(e) => toggleAccountExpand(accGroup.account.id, e)}
                  className="px-4 py-3 bg-muted/40 hover:bg-muted/60 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap cursor-pointer select-none transition-colors group"
                  title="Click to collapse account back to grid"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                      <Building2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
                          {accGroup.account.name}
                        </h2>
                        {accGroup.isDemo && (
                          <Badge variant="warning" className="text-[9px] font-mono py-0">
                            DEMO
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
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {accGroup.plants.length} Plants • {accGroup.invertersCount} Inverters • {accGroup.capacityKw.toFixed(0)} kW Installed
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleAccount(accGroup.account);
                        }}
                        className={`text-[10px] font-mono h-7 px-2 gap-1 cursor-pointer ${
                          accGroup.account.status === 'OFFLINE'
                            ? 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                            : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                        }`}
                        title={accGroup.account.status === 'OFFLINE' ? 'Enable this Account' : 'Disable this Account'}
                      >
                        <Power size={11} />
                        <span>{accGroup.account.status === 'OFFLINE' ? 'Enable' : 'Disable'}</span>
                      </Button>
                    )}
                    <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-primary transition-colors">
                      <span className="text-xs font-mono font-medium hidden sm:inline">Collapse</span>
                      <ChevronUp size={16} />
                    </div>
                  </div>
                </div>

                {/* 3-COLUMN DESKTOP HEADER STRIP */}
                <div className="hidden lg:grid grid-cols-3 gap-4 px-4 py-2.5 bg-muted/25 border-b border-border/50 text-xs font-semibold">
                  {!activePlant ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-foreground font-mono uppercase tracking-wider text-[11px]">
                          <Building2 size={13} className="text-primary" />
                          <span>1. Account Overview</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">Click card to collapse</span>
                      </div>

                      <div className="col-span-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-foreground font-mono uppercase tracking-wider text-[11px]">
                          <Layers size={13} className="text-primary" />
                          <span>2 & 3. Plants ({accGroup.plants.length})</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Click any plant to expand inverters
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-foreground font-mono uppercase tracking-wider text-[11px]">
                          <Layers size={13} className="text-primary" />
                          <span>1. Active Plant</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">Click plant to collapse back</span>
                      </div>

                      <div className="col-span-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-foreground font-mono uppercase tracking-wider text-[11px]">
                          <Cpu size={13} className="text-primary" />
                          <span>2 & 3. Inverters ({activePlant.inverters.length})</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {activePlant.plant.stationName}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* EXPANDED CONTENT: WHEN NO PLANTS ARE EXPANDED, PLANTS CONSUME COLUMNS 2 & 3 */}
                {!activePlant ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 items-start">
                    {/* COLUMN 1: ACCOUNT TOTALS & DIURNAL CURVE */}
                    {renderAccountTotalsCard(undefined, "col-span-1")}

                    {/* COLUMNS 2 & 3: PLANTS CONSUMING BOTH COLUMNS IN A UNIFORM 2-COLUMN GRID */}
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                      {accGroup.plants.length === 0 ? (
                        <div className="col-span-2 p-8 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-xl">
                          No plants found under this account.
                        </div>
                      ) : (
                        accGroup.plants.map((pGroup) => {
                          const plantUtil =
                            pGroup.capacityKw > 0
                              ? Math.min(100, (pGroup.livePowerKw / pGroup.capacityKw) * 100)
                              : 0;
                          const numInverters = pGroup.inverters.length;

                          return (
                            <div
                              key={pGroup.plantKey}
                              onClick={() => togglePlantExpand(pGroup.plantKey)}
                              className="rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:bg-muted/20 hover:shadow-xs transition-all duration-200 p-3.5 flex flex-col justify-between gap-3 cursor-pointer select-none group min-h-[200px]"
                              title={`Click to expand ${numInverters} inverters for ${pGroup.plant.stationName}`}
                            >
                              {/* Plant Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  {pGroup.status !== 'ONLINE' && (
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                      <Badge
                                        variant={pGroup.status === 'FAULT' ? 'destructive' : 'warning'}
                                        className="text-[9px] font-mono py-0 gap-1 capitalize"
                                      >
                                        <span
                                          className={`size-1.5 rounded-full ${
                                            pGroup.status === 'FAULT' ? 'bg-destructive' : 'bg-amber-500'
                                          }`}
                                        />
                                        {pGroup.status.toLowerCase()}
                                      </Badge>
                                    </div>
                                  )}
                                  <h4 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors" title={pGroup.plant.stationName}>
                                    {pGroup.plant.stationName}
                                  </h4>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground group-hover:text-primary transition-colors">
                                    <ChevronDown size={14} className="transition-transform duration-200 group-hover:translate-y-0.5" />
                                  </div>
                                </div>
                              </div>

                              {/* Plant Diurnal Solar Arc Curve */}
                              <div className="w-full pt-1">
                                <PlantSolarCurve
                                  capacityKw={pGroup.capacityKw}
                                  livePowerKw={pGroup.livePowerKw}
                                  dailyYieldKwh={pGroup.dailyYieldKwh}
                                  demandKw={pGroup.demandKw}
                                  gridPowerKw={pGroup.gridPowerKw}
                                  utilizationPct={plantUtil}
                                  historyPoints={telemetryHistory ?? undefined}
                                  height={85}
                                  className="w-full"
                                  showLabels={false}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  /* ACTIVE PLANT MOVED TO COLUMN 1; INVERTERS FILL COLUMNS 2 & 3 */
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 items-start">
                    {/* COLUMN 1: ACTIVE PLANT CARD + ACCOUNT CONTEXT + OTHER PLANTS SWITCHER */}
                    <div className="col-span-1 flex flex-col gap-3 lg:sticky lg:top-4">
                      {/* Active Plant Card (Hero in Col 1) */}
                      <div
                        onClick={() => togglePlantExpand(activePlant.plantKey)}
                        className="p-4 rounded-2xl bg-card border-2 border-primary/50 shadow-md ring-1 ring-primary/20 flex flex-col gap-3 cursor-pointer select-none group transition-all"
                        title={`Click to collapse ${activePlant.plant.stationName} back to all plants`}
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-2.5">
                          <div className="min-w-0 flex-1">
                            {activePlant.status !== 'ONLINE' && (
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <Badge
                                  variant={activePlant.status === 'FAULT' ? 'destructive' : 'warning'}
                                  className="text-[9px] font-mono py-0 gap-1 capitalize"
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${
                                      activePlant.status === 'FAULT' ? 'bg-destructive' : 'bg-amber-500'
                                    }`}
                                  />
                                  {activePlant.status.toLowerCase()}
                                </Badge>
                              </div>
                            )}
                            <h3 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors" title={activePlant.plant.stationName}>
                              {activePlant.plant.stationName}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-mono text-primary font-semibold shrink-0">
                            <span>Collapse</span>
                            <ChevronUp size={14} className="transition-transform group-hover:-translate-y-0.5" />
                          </div>
                        </div>

                        {/* Diurnal Solar Curve for Active Plant */}
                        <div className="w-full pt-1 shrink-0">
                          <PlantSolarCurve
                            capacityKw={activePlant.capacityKw}
                            livePowerKw={activePlant.livePowerKw}
                            dailyYieldKwh={activePlant.dailyYieldKwh}
                            demandKw={activePlant.demandKw}
                            gridPowerKw={activePlant.gridPowerKw}
                            utilizationPct={activePlant.capacityKw > 0 ? Math.min(100, (activePlant.livePowerKw / activePlant.capacityKw) * 100) : 0}
                            historyPoints={telemetryHistory ?? undefined}
                            height={135}
                            className="w-full"
                            showLabels={true}
                          />
                        </div>
                      </div>

                      {/* Account Summary Mini Pill */}
                      <div
                        onClick={(e) => toggleAccountExpand(accGroup.account.id, e)}
                        className="p-3 rounded-xl bg-muted/30 hover:bg-muted/50 border border-border/50 flex items-center justify-between gap-2 cursor-pointer transition-all select-none group"
                        title="Click to collapse whole account back to accounts grid"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
                            <Building2 size={11} className="text-primary" />
                            <span>Account: {accGroup.account.name}</span>
                          </div>
                          <div className="text-xs font-mono font-semibold text-foreground truncate mt-0.5">
                            {accGroup.livePowerKw.toFixed(1)} kW total • {accGroup.plants.length} Plants
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                          <span>Exit Account</span>
                          <ChevronUp size={12} />
                        </div>
                      </div>

                      {/* Other Plants Switcher (if account has more than 1 plant) */}
                      {otherPlants.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground flex items-center justify-between">
                            <span>Other Plants ({otherPlants.length})</span>
                            <span className="text-[9px]">Click to switch</span>
                          </div>
                          <div className="flex flex-col gap-2">
                            {otherPlants.map((op) => {
                              const opUtil =
                                op.capacityKw > 0
                                  ? Math.min(100, (op.livePowerKw / op.capacityKw) * 100)
                                  : 0;
                              return (
                                <div
                                  key={op.plantKey}
                                  onClick={() => {
                                    setExpandedPlantKeys((prev) => {
                                      const next = new Set(prev);
                                      accGroup.plants.forEach((p) => next.delete(p.plantKey));
                                      next.add(op.plantKey);
                                      return next;
                                    });
                                  }}
                                  className="p-3 rounded-2xl border border-border/60 bg-card hover:border-primary/50 hover:bg-muted/20 hover:shadow-xs transition-all flex flex-col gap-2 cursor-pointer select-none group"
                                  title={`Switch view to ${op.plant.stationName}`}
                                >
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="min-w-0 flex-1">
                                      {op.status !== 'ONLINE' && (
                                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                          <Badge
                                            variant={op.status === 'FAULT' ? 'destructive' : 'warning'}
                                            className="text-[9px] font-mono py-0 shrink-0 capitalize"
                                          >
                                            {op.status.toLowerCase()}
                                          </Badge>
                                        </div>
                                      )}
                                      <h4 className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                        {op.plant.stationName}
                                      </h4>
                                    </div>
                                  </div>

                                  {/* Plant Diurnal Solar Arc Graph */}
                                  <div className="w-full pt-1">
                                    <PlantSolarCurve
                                      capacityKw={op.capacityKw}
                                      livePowerKw={op.livePowerKw}
                                      dailyYieldKwh={op.dailyYieldKwh}
                                      demandKw={op.demandKw}
                                      gridPowerKw={op.gridPowerKw}
                                      utilizationPct={opUtil}
                                      historyPoints={telemetryHistory ?? undefined}
                                      height={75}
                                      className="w-full"
                                      showLabels={false}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* COLUMNS 2 & 3: INVERTERS FOR THE ACTIVE PLANT (SPACIOUS 2-COLUMN GRID) */}
                    <div className="lg:col-span-2 flex flex-col gap-3">
                      {activePlant.inverters.length === 0 ? (
                        <div className="p-12 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-2xl flex flex-col items-center justify-center gap-2">
                          <Cpu size={24} className="text-muted-foreground/50" />
                          <span className="font-semibold text-foreground">No inverters configured for this plant</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                          {activePlant.inverters.map((inv, invIndex) => {
                            const isCopied = copiedSn === inv.deviceSn;
                            const isFault = inv.status === 'FAULT';
                            const isStandby = inv.status === 'STANDBY' || inv.liveSolarPowerKw === 0;
                            const loadPct = Math.min(100, (inv.liveSolarPowerKw / (inv.ratedKw || 50)) * 100);

                            return (
                              <div
                                key={inv.deviceSn}
                                className="p-3.5 rounded-2xl bg-card border border-border/70 hover:border-primary/50 transition-all shadow-xs flex flex-col justify-between gap-2 min-h-0"
                              >
                                {/* Inverter Header */}
                                <div className="flex items-start justify-between gap-2">
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
                                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                      {inv.model} • <span className="font-mono text-foreground/80">#{invIndex + 1} of {activePlant.plant.stationName}</span>
                                    </div>
                                  </div>

                                  {inv.status !== 'ONLINE' && (
                                    <Badge
                                      variant={isFault ? 'destructive' : 'warning'}
                                      className="text-[9px] font-mono py-0 gap-1 capitalize shrink-0"
                                    >
                                      <span
                                        className={`size-1.5 rounded-full ${
                                          isFault
                                            ? 'bg-destructive animate-ping'
                                            : 'bg-amber-500'
                                        }`}
                                      />
                                      {inv.status.toLowerCase()}
                                    </Badge>
                                  )}
                                </div>

                                {/* Inverter Solar Curve Graph with Vertical Utilization Gauge Beside It */}
                                <div className="w-full py-0.5">
                                  <InverterSolarCurve
                                    ratedKw={inv.ratedKw}
                                    liveSolarPowerKw={inv.liveSolarPowerKw}
                                    dailyYieldKwh={inv.dailyYieldKwh}
                                    height={70}
                                    isFault={isFault}
                                    isStandby={isStandby}
                                    loadPct={loadPct}
                                    className="w-full"
                                  />
                                </div>

                                {/* Battery SoC or Logger info */}
                                {(inv.batterySoc > 0 || inv.loggerSn) && (
                                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1 border-t border-border/40">
                                    <span>
                                      {inv.batterySoc > 0 && (
                                        <span className="text-emerald-500 font-semibold">⚡ Battery {inv.batterySoc}%</span>
                                      )}
                                    </span>
                                    {inv.loggerSn && (
                                      <span className="truncate max-w-[140px]" title={`Logger SN: ${inv.loggerSn}`}>
                                        Log: {inv.loggerSn}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

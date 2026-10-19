'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePolling } from '@/lib/usePolling';
import {
  Sun,
  ChevronDown,
  Bell,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  User,
  Globe,
  Radio,
  Check,
  Zap,
  Settings,
  Building2,
  Cpu,
  RefreshCw,
  Menu,
  Shield,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  X,
  Mail,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useAccount } from '@/lib/account-context';
import { useSidebar } from './sidebar-context';
import { useRole } from '@/lib/role-context';
import { ModeToggle } from '@/components/theme/ModeToggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectDeyeModal } from '@/components/account/ConnectDeyeModal';

import { InverterConfig } from '@/lib/types';

interface HeaderProps {
  currentStationName?: string;
  isLiveApi?: boolean;
  pingMs?: number;
}

export function Header({
  currentStationName,
  isLiveApi = false,
  pingMs,
}: HeaderProps) {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    selectedStationId,
    setSelectedStationId,
    selectedPlant,
    selectAccountAndPlant,
    selectedInverterSn,
    isFleetView,
    totalAccounts,
    liveAccountsCount,
    syncLivePlants,
    syncing,
    isFetchingDeye,
    fetchingStage,
    lastSyncedAt,
    directusStatus,
    isPlantSwitching,
    switchingPlantName,
  } = useAccount();
  const {
    role,
    isAdmin,
    isConsumer,
    isViewer,
    user,
    showAuthModal,
    setShowAuthModal,
    authModalTab,
    setAuthModalTab,
    setShowConnectModal,
    login,
    register,
    logout,
  } = useRole();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [expandedPlants, setExpandedPlants] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isPlantDevicesExpanded = (stationId: string) => {
    return Boolean(expandedPlants[stationId]);
  };

  const togglePlantExpand = (stationId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedPlants((prev) => ({
      ...prev,
      [stationId]: !prev[stationId],
    }));
  };

  const isAccountExpanded = (accId: string) => {
    if (expandedAccounts[accId] !== undefined) {
      return expandedAccounts[accId];
    }
    return selectedAccountId === accId || accounts.length === 1;
  };

  const toggleAccountExpand = (accId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedAccounts((prev) => ({
      ...prev,
      [accId]: !isAccountExpanded(accId),
    }));
  };

  const toggleExpandAll = () => {
    const allExpanded = accounts.every((a) => isAccountExpanded(a.id));
    const nextState: Record<string, boolean> = {};
    accounts.forEach((a) => {
      nextState[a.id] = !allExpanded;
    });
    setExpandedAccounts(nextState);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isJustSynced, setIsJustSynced] = useState(false);

  useEffect(() => {
    if (!lastSyncedAt) return;
    setIsJustSynced(true);
    const timer = setTimeout(() => {
      setIsJustSynced(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [lastSyncedAt]);

  const displayTitle = isFleetView
    ? `Global Fleet Aggregate (${totalAccounts} Accounts)`
    : selectedPlant
    ? `${selectedPlant.stationName}`
    : selectedAccount?.plants && selectedAccount.plants.length > 1
    ? `${selectedAccount.name} (All ${selectedAccount.plants.length} Plants)`
    : selectedAccount?.name || currentStationName || 'Facility Array';

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-background/85 backdrop-blur-md border-b border-border/60 transition-all relative">
      {/* Top-Edge Glowing Cybernetic Data Stream Progress Bar */}
      {(isFetchingDeye || syncing || isPlantSwitching) && (
        <div className="absolute top-0 left-0 right-0 h-[2.5px] overflow-hidden z-50 pointer-events-none">
          <div className="h-full w-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-400 motion-safe:animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.9)]" />
        </div>
      )}

      <div className="h-16 w-full px-3 sm:px-5 lg:px-7 flex items-center justify-between gap-2 min-w-0">
        {/* Left: Dynamic Brand / Workspace Selector */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
          {/* Account Selector Dropdown */}
          <div className="relative min-w-0 shrink" ref={dropdownRef}>
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              aria-haspopup="listbox"
              aria-expanded={showAccountDropdown}
              aria-label="Select solar account or plant"
              className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border cursor-pointer transition-all text-left shadow-2xs min-w-0 max-w-[210px] xs:max-w-[250px] sm:max-w-[300px] md:max-w-[360px] ${
                selectedInverterSn && selectedInverterSn !== 'ALL'
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/40 ring-1 ring-cyan-500/20'
                  : 'bg-card/80 hover:bg-accent/60 border-border/60'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedInverterSn && selectedInverterSn !== 'ALL'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {isFleetView ? (
                  <Globe size={14} />
                ) : selectedInverterSn && selectedInverterSn !== 'ALL' ? (
                  <Cpu size={14} className="text-cyan-400" />
                ) : selectedPlant ? (
                  <Building2 size={14} />
                ) : (
                  <Sun size={14} />
                )}
              </div>
              <div className="flex flex-col min-w-0 shrink">
                <span className="font-semibold text-xs text-foreground truncate block">
                  {selectedInverterSn && selectedInverterSn !== 'ALL'
                    ? `Inverter ${selectedInverterSn}`
                    : displayTitle}
                </span>
                {selectedInverterSn && selectedInverterSn !== 'ALL' ? (
                  <span className="text-[10px] text-cyan-400 font-medium leading-none truncate flex items-center gap-1 mt-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    {selectedPlant?.stationName || `Station ${selectedStationId}`} · Isolated
                  </span>
                ) : !isFleetView && selectedPlant && selectedAccount ? (
                  <span className="text-[10px] text-muted-foreground leading-none truncate block">
                    {`${selectedAccount.name} · ${selectedPlant.installedCapacityKw} kWp`}
                  </span>
                ) : !isFleetView && !selectedPlant && selectedAccount ? (
                  <span className="text-[10px] text-muted-foreground leading-none truncate block">
                    {selectedAccount.plants?.length
                      ? `${selectedAccount.plants.length} Plants · ${selectedAccount.capacityKw} kWp Total`
                      : `${selectedAccount.capacityKw} kWp Total`}
                  </span>
                ) : null}
              </div>
              <ChevronDown
                className={`text-muted-foreground transition-transform duration-200 ml-1 shrink-0 ${
                  showAccountDropdown ? 'rotate-180' : ''
                }`}
                size={14}
              />
            </button>

            {/* Dropdown Menu - Fully responsive to compressed width and height */}
            {showAccountDropdown && (
              <div className="fixed sm:absolute top-16 sm:top-full left-3 right-3 sm:left-0 sm:right-auto mt-1.5 sm:w-88 max-h-[calc(100dvh-5rem)] flex flex-col overflow-hidden bg-popover/95 border border-border/70 rounded-2xl shadow-2xl p-2.5 z-50 backdrop-blur-md animate-in fade-in-80">
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border/60 mb-2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span>{isConsumer ? 'Your Solar Plants' : 'Monitor Accounts & Plants'}</span>
                    {(isFetchingDeye || syncing || isPlantSwitching) && (
                      <span className="flex items-center gap-1 text-[9px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/30 font-bold lowercase tracking-normal motion-safe:animate-pulse">
                        <RefreshCw size={9} className="animate-spin text-cyan-400" />
                        syncing...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {accounts.some((a) => (a.plants?.length || 0) > 0) && (
                      <button
                        onClick={toggleExpandAll}
                        className="text-primary hover:underline cursor-pointer lowercase text-[10px]"
                      >
                        {accounts.every((a) => isAccountExpanded(a.id)) ? 'collapse all' : 'expand all'}
                      </button>
                    )}
                    <span className="font-bold text-foreground">
                      {isConsumer
                        ? `${accounts[0]?.plants?.length || 0} Plant${(accounts[0]?.plants?.length || 0) !== 1 ? 's' : ''}`
                        : `${accounts.length} Site${accounts.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>

                {/* Active Inverter Isolation Banner inside Dropdown */}
                {selectedInverterSn && selectedInverterSn !== 'ALL' && (
                  <div className="shrink-0 mb-2 p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Cpu size={14} className="text-cyan-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-[11px] text-cyan-300 truncate">
                          Inverter Isolated: {selectedInverterSn}
                        </div>
                        <div className="text-[10px] text-cyan-400/80 truncate">
                          Station: {selectedPlant?.stationName || selectedStationId}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAccountAndPlant(selectedAccountId, selectedStationId);
                        setShowAccountDropdown(false);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 cursor-pointer shrink-0 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Global Fleet View Option - Only for Admins / Multi-account Viewers */}
                {!isConsumer && (
                  <div className="shrink-0 mb-1">
                    <button
                      onClick={() => {
                        setSelectedAccountId('ALL');
                        setShowAccountDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer ${
                        isFleetView
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'hover:bg-accent text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe size={16} className={isFleetView ? 'text-primary-foreground' : 'text-primary'} />
                        <div className="text-left">
                          <div className="text-xs font-semibold">
                            Global Fleet Aggregate View
                          </div>
                          <div
                            className={`text-[10px] ${
                              isFleetView ? 'text-primary-foreground/80' : 'text-muted-foreground'
                            }`}
                          >
                            All {totalAccounts} accounts combined ({liveAccountsCount} live)
                          </div>
                        </div>
                      </div>
                      {isFleetView && <Check size={14} />}
                    </button>
                    <div className="h-px bg-border/60 my-1.5" />
                  </div>
                )}

                {/* Account & Plants List - Flex 1 Scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 overscroll-contain">
                  {accounts.map((acc) => {
                    const isSelected = selectedAccountId === acc.id;
                    const plants = acc.plants || [];
                    const hasPlants = plants.length > 0;
                    const isExpanded = isAccountExpanded(acc.id);

                    return (
                      <div
                        key={acc.id}
                        className={`rounded-xl border transition-all ${
                          isSelected
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent hover:border-border/60 hover:bg-muted/30'
                        }`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex items-center justify-between p-2 cursor-pointer focus:outline-none focus:bg-accent/50 rounded-lg"
                          onClick={() => {
                            selectAccountAndPlant(acc.id, 'ALL');
                            setShowAccountDropdown(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              selectAccountAndPlant(acc.id, 'ALL');
                              setShowAccountDropdown(false);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                acc.isLive ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            />
                            <div className="text-left min-w-0">
                              <div className="text-xs font-semibold text-foreground truncate">
                                {acc.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                {acc.id} · {acc.capacityKw} kWp
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {hasPlants && (
                              <button
                                aria-label={`Toggle plants for ${acc.name}`}
                                onClick={(e) => toggleAccountExpand(acc.id, e)}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              >
                                <ChevronDown
                                  size={12}
                                  className={`transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            )}
                            {isSelected && selectedStationId === 'ALL' && (
                              isPlantSwitching ? (
                                <RefreshCw size={13} className="animate-spin text-primary" />
                              ) : (
                                <Check size={13} className="text-primary" />
                              )
                            )}
                          </div>
                        </div>

                        {/* Expanded Plants Sub-list */}
                        {hasPlants && isExpanded && (
                          <div className="pl-6 pr-2 pb-2 pt-0.5 space-y-1">
                            {plants.map((plant) => {
                              const isPlantActive =
                                isSelected && String(selectedStationId) === String(plant.stationId);
                              const plantInverters = (plant.devices || []).filter(
                                (d) => String(d.deviceType || '').toUpperCase() === 'INVERTER'
                              );
                              const effectiveInverters: Array<{
                                deviceSn: string;
                                name?: string;
                                model?: string;
                                ratedKw?: number;
                                status?: string;
                              }> = plantInverters.length > 0
                                ? plantInverters
                                : (acc.inverters || []).map((inv: InverterConfig) => ({
                                    deviceSn: inv.sn,
                                    name: inv.name,
                                    model: inv.model,
                                    ratedKw: inv.ratedKw,
                                    status: 'ONLINE',
                                  }));
                              const hasInverters = effectiveInverters.length > 0;
                              const isInvertersExpanded = isPlantDevicesExpanded(plant.stationId);

                              return (
                                <div key={plant.stationId} className="space-y-1">
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectAccountAndPlant(acc.id, plant.stationId);
                                      setShowAccountDropdown(false);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        selectAccountAndPlant(acc.id, plant.stationId);
                                        setShowAccountDropdown(false);
                                      }
                                    }}
                                    className={`flex items-center justify-between p-1.5 rounded-lg text-left cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-primary ${
                                      isPlantActive
                                        ? 'bg-primary/15 text-primary font-semibold'
                                        : 'hover:bg-accent text-foreground/85'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <Building2 size={12} className={isPlantActive ? 'text-primary' : 'text-muted-foreground'} />
                                      <span className="text-[11px] truncate">{plant.stationName}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        {plant.installedCapacityKw} kWp
                                      </span>
                                      {hasInverters && (
                                        <button
                                          type="button"
                                          aria-label={`Toggle inverters for ${plant.stationName}`}
                                          onClick={(e) => togglePlantExpand(plant.stationId, e)}
                                          className="p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                          title={isInvertersExpanded ? 'Hide inverters' : `Show ${effectiveInverters.length} inverters`}
                                        >
                                          <ChevronDown
                                            size={11}
                                            className={`transition-transform duration-200 ${
                                              isInvertersExpanded ? 'rotate-180' : ''
                                            }`}
                                          />
                                        </button>
                                      )}
                                      {isPlantActive && (
                                        isPlantSwitching ? (
                                          <RefreshCw size={11} className="animate-spin text-primary" />
                                        ) : (
                                          <Check size={11} className="text-primary" />
                                        )
                                      )}
                                    </div>
                                  </div>

                                  {/* Sub-node: Individual Inverters (Informational hardware list, non-clickable) */}
                                  {hasInverters && isInvertersExpanded && (
                                    <div className="pl-4 pr-1 py-1 space-y-1 bg-muted/20 rounded-lg border border-border/40 ml-2 animate-in fade-in-50">
                                      <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                          <Cpu size={10} className="text-cyan-400" />
                                          Inverters ({effectiveInverters.length})
                                        </span>
                                      </div>
                                      {effectiveInverters.map((inv) => (
                                        <div
                                          key={inv.deviceSn}
                                          className="flex items-center justify-between px-2 py-1 rounded-md text-[10.5px] font-mono select-none bg-muted/15 border border-border/30 text-muted-foreground"
                                        >
                                          <div className="flex items-center gap-1.5 truncate">
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                inv.status === 'ONLINE'
                                                  ? 'bg-emerald-500'
                                                  : inv.status === 'FAULT'
                                                  ? 'bg-rose-500'
                                                  : 'bg-amber-500'
                                              }`}
                                            />
                                            <span className="truncate text-foreground/80 font-sans">
                                              {inv.model || inv.name || 'Deye Inverter'}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-[9.5px] text-muted-foreground/80 font-mono">
                                              {inv.ratedKw ? `${inv.ratedKw} kW` : inv.deviceSn}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="shrink-0 pt-2 border-t border-border/60 mt-1.5 space-y-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      syncLivePlants();
                    }}
                    disabled={syncing || isFetchingDeye}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2.5 text-xs text-primary hover:text-primary/90 font-medium rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={syncing || isFetchingDeye ? 'animate-spin text-primary' : 'text-primary'} />
                    <span className="truncate">
                      {syncing || isFetchingDeye
                        ? (fetchingStage || 'Syncing Accounts & Plants...')
                        : 'Sync Live Plant Names & Devices'}
                    </span>
                  </button>
                  <Link
                    href="/accounts"
                    onClick={() => setShowAccountDropdown(false)}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 text-xs text-muted-foreground hover:text-foreground font-medium rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <Settings size={13} />
                    <span>Configure Accounts & Inverter Nodes</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Telemetry Health, Directus Status, Role Toggle, Clock, Theme Mode Toggle, Notifications */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Prominent Live Data Fetching Indicator */}
          {isFetchingDeye || syncing ? (
            <div
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-xs font-mono text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)] motion-safe:animate-pulse shrink-0"
              title="Active live data exchange with DeyeCloud OpenAPI"
            >
              <RefreshCw size={12} className="animate-spin text-cyan-400 shrink-0" />
              <span className="font-semibold truncate max-w-[90px] sm:max-w-[130px] md:max-w-[170px]">
                {fetchingStage || 'Syncing Deye...'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 motion-safe:animate-ping shrink-0 hidden md:inline-block" />
            </div>
          ) : null}

          {/* Quick Telemetry & Hardware Sync Button */}
          <button
            onClick={() => syncLivePlants()}
            disabled={syncing || isFetchingDeye}
            title={
              isJustSynced
                ? `DeyeCloud: Synced successfully! (${pingMs}ms)${directusStatus ? ` • Database: ${directusStatus.connected ? 'Live Sync' : 'Cached'}` : ''}`
                : `DeyeCloud: ${isLiveApi || liveAccountsCount > 0 ? 'Live Bus' : 'Simulation'} (${pingMs}ms)${directusStatus ? ` • Database: ${directusStatus.connected ? 'Live Sync' : 'Cached'}` : ''} • Click to sync`
            }
            aria-label="Sync telemetry and cloud hardware"
            className={`relative flex items-center justify-center w-8 h-8 rounded-xl border transition-all cursor-pointer disabled:opacity-50 shrink-0 ${
              isJustSynced
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-500 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                : syncing || isFetchingDeye
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'bg-card hover:bg-muted/70 border-border/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {isJustSynced ? (
              <CheckCircle2 size={13} className="text-emerald-500 dark:text-emerald-400 animate-in zoom-in-75 duration-300" />
            ) : (
              <RefreshCw
                size={13}
                className={syncing || isFetchingDeye ? 'animate-spin text-primary' : 'transition-transform hover:rotate-45'}
              />
            )}
            <span
              className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                isFetchingDeye || syncing
                  ? 'bg-cyan-400 motion-safe:animate-ping'
                  : isJustSynced
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                  : isLiveApi || liveAccountsCount > 0
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
            />
          </button>

          {/* Role Mode Toggle Button (Admin vs Consumer vs Sign In) */}
          {user ? (
            <div className="flex items-center gap-1.5 shrink-0">
              {isConsumer && (
                <button
                  onClick={() => setShowConnectModal(true)}
                  title="Link or add your DeyeCloud solar station"
                  className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer shrink-0"
                >
                  <Radio size={12} className="shrink-0 animate-pulse" />
                  <span className="hidden sm:inline">Connect Deye</span>
                </button>
              )}
              <div
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-semibold shrink-0 ${
                  isAdmin
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                }`}
                title={`Logged in as ${user.email} (${isAdmin ? 'Admin' : 'Consumer'})`}
              >
                {isAdmin ? <Shield size={13} className="shrink-0" /> : <User size={13} className="shrink-0" />}
                <span className="hidden sm:inline font-mono text-[11px] truncate max-w-[80px] md:max-w-[120px]">
                  {user.name || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Consumer')}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              </div>
              <button
                onClick={() => logout()}
                title="Sign out"
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer shrink-0"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setLoginEmail('');
                setLoginPassword('');
                setLoginError('');
                setRegName('');
                setRegEmail('');
                setRegPassword('');
                setRegConfirmPassword('');
                setRegError('');
                setAuthModalTab('signin');
                setShowAuthModal(true);
              }}
              title="Sign in or register for solar monitoring"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              <User size={13} className="text-primary shrink-0" />
              <span className="hidden sm:inline">Sign In / Register</span>
              <Lock size={11} className="text-muted-foreground shrink-0" />
            </button>
          )}

          {/* UTC Clock */}
          <UtcClock />

          {/* Theme Mode Toggle (Light/Dark/System) */}
          <div className="shrink-0">
            <ModeToggle />
          </div>

          {/* Notifications / Alarms Button */}
          <div className="relative shrink-0">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setShowNotifications(!showNotifications)}
              className="rounded-xl border-border/60 hover:bg-accent/60 relative shrink-0"
              title="System Alerts & Diagnostics"
            >
              <Bell size={15} className="text-foreground" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
            </Button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-76 bg-popover/95 border border-border/70 rounded-2xl shadow-xl p-3 z-50 backdrop-blur-md animate-in fade-in-80">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
                  <span className="text-xs font-bold text-foreground">
                    System Telemetry Status
                  </span>
                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                    All Nodes OK
                  </Badge>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded-xl bg-muted/40 border border-border/40 flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-foreground">Inverter Bus Synced</div>
                      <div className="text-[10px] text-muted-foreground">Grid frequency nominal @ 60.01 Hz</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/40 border border-border/40 flex items-start gap-2">
                    <Activity size={14} className="text-cyan-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-foreground">Trigonometric Engine Active</div>
                      <div className="text-[10px] text-muted-foreground">Fourier harmonic analysis enabled</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal (Sign In / Register) */}
      {showAuthModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50"
        >
          <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setShowAuthModal(false)}
              aria-label="Close authentication modal"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <User size={20} />
              </div>
              <div>
                <h3 id="auth-modal-title" className="text-base font-bold text-foreground">
                  {authModalTab === 'signin' ? 'Sign In' : 'Create Account'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {authModalTab === 'signin'
                    ? 'Access your registered solar plant dashboard'
                    : 'Customer self-service portal registration'}
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex rounded-xl bg-muted/60 p-1 mb-4 border border-border/50">
              <button
                type="button"
                onClick={() => {
                  setAuthModalTab('signin');
                  setLoginError('');
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  authModalTab === 'signin'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalTab('register');
                  setRegError('');
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  authModalTab === 'register'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Create Account
              </button>
            </div>

            {authModalTab === 'signin' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLoginLoading(true);
                  setLoginError('');
                  const res = await login(loginEmail, loginPassword);
                  setLoginLoading(false);
                  if (!res.success) {
                    setLoginError(res.error || 'Invalid credentials');
                  }
                }}
                className="space-y-3.5"
              >
                <div>
                  <label htmlFor="header-login-email" className="block text-xs font-semibold text-muted-foreground mb-1">
                    Username or Email
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="header-login-email"
                      type="text"
                      autoFocus
                      required
                      placeholder="Username or email address"
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border/70 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="header-login-password" className="block text-xs font-semibold text-muted-foreground mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="header-login-password"
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border/70 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                  </div>
                  {loginError && (
                    <p className="text-xs text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{loginError}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAuthModal(false)}
                    className="flex-1 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loginLoading || !loginEmail.trim() || !loginPassword}
                    className="flex-1 text-xs font-semibold bg-primary text-primary-foreground"
                  >
                    {loginLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (regPassword !== regConfirmPassword) {
                    setRegError('Passwords do not match.');
                    return;
                  }
                  if (regPassword.length < 6) {
                    setRegError('Password must be at least 6 characters.');
                    return;
                  }
                  setRegLoading(true);
                  setRegError('');
                  const res = await register({
                    email: regEmail.trim(),
                    password: regPassword,
                    fullName: regName.trim() || undefined,
                  });
                  setRegLoading(false);
                  if (!res.success) {
                    setRegError(res.error || 'Failed to create account.');
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label htmlFor="header-reg-name" className="block text-xs font-semibold text-muted-foreground mb-1">
                    Full Name / Company
                  </label>
                  <input
                    id="header-reg-name"
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="header-reg-email" className="block text-xs font-semibold text-muted-foreground mb-1">
                    Email Address
                  </label>
                  <input
                    id="header-reg-email"
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={regEmail}
                    onChange={(e) => {
                      setRegEmail(e.target.value);
                      if (regError) setRegError('');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="header-reg-pass" className="block text-xs font-semibold text-muted-foreground mb-1">
                      Password
                    </label>
                    <input
                      id="header-reg-pass"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => {
                        setRegPassword(e.target.value);
                        if (regError) setRegError('');
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="header-reg-cpass" className="block text-xs font-semibold text-muted-foreground mb-1">
                      Confirm
                    </label>
                    <input
                      id="header-reg-cpass"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={regConfirmPassword}
                      onChange={(e) => {
                        setRegConfirmPassword(e.target.value);
                        if (regError) setRegError('');
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                  </div>
                </div>

                {regError && (
                  <p className="text-xs text-rose-500 font-medium flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{regError}</span>
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAuthModal(false)}
                    className="flex-1 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={regLoading || !regEmail.trim() || !regPassword || !regName.trim()}
                    className="flex-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  >
                    {regLoading ? 'Creating...' : 'Create Account'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Connect DeyeCloud Account Modal */}
      <ConnectDeyeModal />
    </header>
  );
}

function UtcClock() {
  const [utcTime, setUtcTime] = useState('');

  const updateTime = useCallback(() => {
    const now = new Date();
    setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
  }, []);

  useEffect(() => {
    updateTime();
  }, [updateTime]);

  usePolling(updateTime, {
    intervalMs: 1000,
    pauseOnHidden: true,
  });

  return (
    <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/40 border border-border/50 text-[11px] font-mono text-muted-foreground shrink-0">
      <Clock size={12} />
      <span>{utcTime || '12:00:00 UTC'}</span>
    </div>
  );
}

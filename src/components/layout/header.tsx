'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw,
  Menu,
  Shield,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  Database,
  X,
  Mail,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { useAccount } from '@/lib/account-context';
import { useSidebar } from './sidebar-context';
import { useRole } from '@/lib/role-context';
import { ModeToggle } from '@/components/theme/ModeToggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  currentStationName?: string;
  isLiveApi?: boolean;
  pingMs?: number;
}

export function Header({
  currentStationName,
  isLiveApi = false,
  pingMs = 14,
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
    isFleetView,
    totalAccounts,
    liveAccountsCount,
    syncLivePlants,
    syncing,
    directusStatus,
  } = useAccount();
  const { toggleMobileOpen } = useSidebar();
  const { role, isAdmin, isConsumer, isViewer, user, showAuthModal, setShowAuthModal, login, logout } = useRole();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [utcTime, setUtcTime] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const displayTitle = isFleetView
    ? `Global Fleet Aggregate (${totalAccounts} Accounts)`
    : selectedPlant
    ? `${selectedPlant.stationName}`
    : selectedAccount?.plants && selectedAccount.plants.length > 1
    ? `${selectedAccount.name} (All ${selectedAccount.plants.length} Plants)`
    : selectedAccount?.name || currentStationName || 'Facility Array';

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-background/85 backdrop-blur-md border-b border-border/60 transition-all">
      <div className="h-16 w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Mobile Menu & Dynamic Brand / Workspace Selector */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Drawer Trigger */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleMobileOpen}
            className="md:hidden rounded-xl h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Open navigation drawer"
          >
            <Menu size={18} />
          </Button>

          {/* Account Selector Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-card/80 hover:bg-accent/60 rounded-xl border border-border/60 cursor-pointer transition-colors text-left shadow-2xs"
            >
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                {isFleetView ? (
                  <Globe size={14} />
                ) : selectedPlant ? (
                  <Building2 size={14} />
                ) : (
                  <Sun size={14} />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-xs text-foreground truncate max-w-[200px] sm:max-w-[280px]">
                  {displayTitle}
                </span>
                {!isFleetView && selectedPlant && selectedAccount && (
                  <span className="text-[10px] text-muted-foreground leading-none truncate max-w-[200px] sm:max-w-[280px]">
                    {selectedAccount.name} · {selectedPlant.installedCapacityKw} kWp
                  </span>
                )}
                {!isFleetView && !selectedPlant && selectedAccount && (
                  <span className="text-[10px] text-muted-foreground leading-none truncate max-w-[200px] sm:max-w-[280px]">
                    {selectedAccount.plants?.length
                      ? `${selectedAccount.plants.length} Plants Combined · ${selectedAccount.capacityKw} kWp Total`
                      : `${selectedAccount.capacityKw} kWp Total`}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`text-muted-foreground transition-transform duration-200 ml-1 ${
                  showAccountDropdown ? 'rotate-180' : ''
                }`}
                size={14}
              />
            </button>

            {/* Dropdown Menu */}
            {showAccountDropdown && (
              <div className="absolute left-0 mt-2 w-88 bg-popover/95 border border-border/70 rounded-2xl shadow-xl p-2.5 z-50 backdrop-blur-md animate-in fade-in-80">
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border/60 mb-2 flex items-center justify-between">
                  <span>{isConsumer ? 'Your Solar Plants' : 'Monitor Accounts & Plants'}</span>
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

                {/* Global Fleet View Option - Only for Admins / Multi-account Viewers */}
                {!isConsumer && (
                  <>
                    <button
                      onClick={() => {
                        setSelectedAccountId('ALL');
                        setShowAccountDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all mb-1 cursor-pointer ${
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
                    <div className="h-px bg-border/60 my-1" />
                  </>
                )}

                {/* Account & Plants List */}
                <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
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
                          className="flex items-center justify-between p-2 cursor-pointer"
                          onClick={() => {
                            selectAccountAndPlant(acc.id, 'ALL');
                            setShowAccountDropdown(false);
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
                              <Check size={13} className="text-primary" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Plants Sub-list */}
                        {hasPlants && isExpanded && (
                          <div className="pl-6 pr-2 pb-2 pt-0.5 space-y-1">
                            {plants.map((plant) => {
                              const isPlantActive =
                                isSelected && selectedStationId === plant.stationId;
                              return (
                                <div
                                  key={plant.stationId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectAccountAndPlant(acc.id, plant.stationId);
                                    setShowAccountDropdown(false);
                                  }}
                                  className={`flex items-center justify-between p-1.5 rounded-lg text-left cursor-pointer transition-all ${
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
                                    {isPlantActive && <Check size={11} className="text-primary" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="h-px bg-border/60 my-2" />
                <div className="space-y-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      syncLivePlants();
                    }}
                    disabled={syncing}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2.5 text-xs text-primary hover:text-primary/90 font-medium rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={syncing ? 'animate-spin text-primary' : 'text-primary'} />
                    <span>{syncing ? 'Syncing DeyeCloud...' : 'Sync Live Plant Names & Devices'}</span>
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
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Database Connection Indicator */}
          {directusStatus && (
            <div
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-mono"
              title={`Cloud Database: ${directusStatus.connected ? 'Connected (Two-way live sync)' : 'Offline (Using cached fallback)'}`}
            >
              <Database size={12} className={directusStatus.connected ? 'text-cyan-500' : 'text-amber-500'} />
              <span className="text-foreground font-medium">Database</span>
              <span
                className={`text-[10px] font-semibold ${
                  directusStatus.connected ? 'text-cyan-500' : 'text-amber-500'
                }`}
              >
                {directusStatus.connected ? 'Live' : 'Cached'}
              </span>
            </div>
          )}

          {/* Cloud Bus State Indicator & Quick Sync */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveApi || liveAccountsCount > 0
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            <span className="text-foreground font-medium">
              {isLiveApi || liveAccountsCount > 0 ? 'DeyeCloud Bus' : 'Simulation'}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {pingMs}ms
            </span>
            <button
              onClick={() => syncLivePlants()}
              disabled={syncing}
              title="Sync latest plant names and hardware from DeyeCloud"
              className="ml-0.5 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={11} className={syncing ? 'animate-spin text-primary' : ''} />
            </button>
          </div>

          {/* Role Mode Toggle Button (Admin vs Consumer vs Sign In) */}
          {user ? (
            <div className="flex items-center gap-1.5">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold ${
                  isAdmin
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                }`}
                title={`Logged in as ${user.email} (${isAdmin ? 'Admin' : 'Consumer'})`}
              >
                {isAdmin ? <Shield size={13} /> : <User size={13} />}
                <span className="hidden sm:inline font-mono text-[11px] truncate max-w-[130px]">
                  {user.name || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Consumer')}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              <button
                onClick={() => logout()}
                title="Sign out"
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
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
                setShowAuthModal(true);
              }}
              title="Sign in to your solar monitoring account"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 text-xs font-medium transition-colors cursor-pointer"
            >
              <User size={13} className="text-primary" />
              <span className="hidden sm:inline">Sign In</span>
              <Lock size={11} className="text-muted-foreground" />
            </button>
          )}

          {/* UTC Clock */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/40 border border-border/50 text-[11px] font-mono text-muted-foreground">
            <Clock size={12} />
            <span>{utcTime || '12:00:00 UTC'}</span>
          </div>

          {/* Theme Mode Toggle (Light/Dark/System) */}
          <ModeToggle />

          {/* Notifications / Alarms Button */}
          <div className="relative">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setShowNotifications(!showNotifications)}
              className="rounded-xl border-border/60 hover:bg-accent/60 relative"
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

      {/* Administrator Login Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <User size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Sign In</h3>
                <p className="text-xs text-muted-foreground">Monitor and manage your solar plants</p>
              </div>
            </div>

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
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Username or Email
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="e.g. hanvinsolar@gmail.com or admin"
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
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
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
          </div>
        </div>
      )}
    </header>
  );
}

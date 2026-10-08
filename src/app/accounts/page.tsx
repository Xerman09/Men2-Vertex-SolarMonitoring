'use client';

import React from 'react';
import {
  Building2,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Radio,
  Cpu,
  Shield,
  Layers,
  Globe,
  Sliders,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Power,
  X,
  Server,
  Database,
  Lock,
  User,
} from 'lucide-react';
import { AccountSummary, PlantInfo } from '@/lib/types';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStationAccounts } from './useStationAccounts';

export default function AccountsManagementPage() {
  const { isAdmin, isConsumer, isViewer, user, setShowAuthModal } = useRole();
  const {
    displayAccounts,
    directusInfo,
    loading,
    syncingId,
    isFetchingDeye,
    fetchingStage,
    collapsedPlants,
    togglePlantCollapse,
    toggleAllPlantsForAccount,
    fetchAccounts,
    handleSyncAccount,
    handleToggleAccount,
    handleDeleteAccount,
    showAddAccountModal,
    setShowAddAccountModal,
    addForm,
    setAddForm,
    adding,
    addMessage,
    handleAddAccountSubmit,
    showAddPlantModal,
    setShowAddPlantModal,
    selectedAccountIdForPlant,
    setSelectedAccountIdForPlant,
    plantForm,
    setPlantForm,
    savingPlant,
    handleAddPlantSubmit,
    metrics,
  } = useStationAccounts();

  const {
    totalAccountsCount,
    activeAccountsCount,
    totalPlants,
    totalInverters,
    totalLoggers,
    totalCapacity,
  } = metrics;

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-16">
      {/* Top Banner with VOS Design Standards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline">
                  {isAdmin
                    ? 'Fleet & Plant Operations Manager'
                    : isConsumer
                    ? 'Your Solar Plants & Telemetry Directory'
                    : 'Solar Fleet & Plants Directory'}
                </h1>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] ${
                    isAdmin
                      ? 'border-amber-500/30 text-amber-500 bg-amber-500/10'
                      : isConsumer
                      ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10'
                      : 'border-primary/30 text-primary bg-primary/10'
                  }`}
                >
                  {isAdmin
                    ? 'Admin (Database 2-Way Sync)'
                    : isConsumer
                    ? `Consumer Account (${user?.name || user?.email || 'Active'})`
                    : 'Viewer (Read-Only Mode)'}
                </Badge>
                {directusInfo && (
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] flex items-center gap-1 ${
                      directusInfo.connected
                        ? 'border-cyan-500/30 text-cyan-500 bg-cyan-500/10'
                        : 'border-amber-500/30 text-amber-500 bg-amber-500/10'
                    }`}
                  >
                    <Database size={10} />
                    <span>Database: {directusInfo.connected ? 'Live Sync' : 'Cached Fallback'}</span>
                  </Badge>
                )}
              </div>
              {isAdmin && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Two-way database account synchronization, credentials management, automatic plant discovery, and inverter hierarchy.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAccounts(true)}
            disabled={loading || isFetchingDeye}
            className="gap-2 h-9 text-xs font-semibold border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            title="Sync all accounts, registered plants, and inverters from DeyeCloud"
          >
            <RefreshCw size={14} className={loading || isFetchingDeye ? 'animate-spin text-cyan-400' : 'text-cyan-400'} />
            <span>{loading || isFetchingDeye ? 'Syncing Deye...' : 'Sync from DeyeCloud'}</span>
          </Button>

          {isAdmin ? (
            <Button
              onClick={() => setShowAddAccountModal(true)}
              className="gap-2 h-9 text-xs font-semibold bg-primary text-primary-foreground shadow-sm"
            >
              <Plus size={16} />
              <span>Add Deye Account</span>
            </Button>
          ) : !user ? (
            <Button
              variant="outline"
              onClick={() => setShowAuthModal(true)}
              className="gap-2 h-9 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10"
            >
              <User size={14} />
              <span>Sign In</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Fleet Overview KPI Ribbon in VOS Format */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <Card className="border-border/60 bg-card/80 p-4 shadow-xs min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1 truncate">
            Registered Accounts
          </span>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold font-mono text-primary">
              {activeAccountsCount}
            </span>
            <span className="text-xs text-muted-foreground truncate">/ {totalAccountsCount} Active</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1 truncate">
            Discovered Plants
          </span>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold font-mono text-cyan-500">
              {totalPlants}
            </span>
            <span className="text-xs text-muted-foreground truncate">Solar Arrays</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1 truncate">
            Hybrid Inverters
          </span>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold font-mono text-emerald-500">
              {totalInverters}
            </span>
            <span className="text-xs text-muted-foreground truncate">Active Units</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1 truncate">
            Data Loggers
          </span>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold font-mono text-foreground">
              {totalLoggers}
            </span>
            <span className="text-xs text-muted-foreground truncate">Gateways</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs min-w-0 col-span-2 sm:col-span-1 lg:col-span-1">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1 truncate">
            Total Fleet Capacity
          </span>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold font-mono text-primary">
              {totalCapacity.toFixed(0)}
            </span>
            <span className="text-xs text-muted-foreground truncate">kWp</span>
          </div>
        </Card>
      </div>

      {/* Accounts List & Plants Tree */}
      <div className="flex flex-col gap-6">
        {displayAccounts.map((account) => {
          const isSyncing = syncingId === account.id;

          return (
            <Card
              key={account.id}
              className="border-border/60 bg-card/80 p-6 shadow-xs relative overflow-hidden"
            >
              {/* Account Card Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border/50">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-foreground">
                        {account.name}
                      </h2>
                      <Badge
                        variant={
                          account.status === 'ONLINE'
                            ? 'success'
                            : account.status === 'SIMULATED'
                            ? 'info'
                            : 'outline'
                        }
                        className="text-xs font-mono"
                      >
                        {account.status === 'ONLINE'
                          ? '● Live DeyeCloud'
                          : account.status === 'SIMULATED'
                          ? '● Realistic Sim'
                          : '○ Disabled'}
                      </Badge>
                      {account.autoDiscovered && (
                        <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px] font-mono">
                          Auto-Discovered
                        </Badge>
                      )}
                      {account.source === 'directus' || account.directusId ? (
                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-500 bg-cyan-500/10 text-[10px] font-mono flex items-center gap-1">
                          <Database size={9} />
                          <span>DB {account.directusId ? `#${account.directusId}` : 'Synced'}</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border/60 text-muted-foreground text-[10px] font-mono">
                          Cache
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap font-mono">
                      <span>ID: {account.id}</span>
                      {account.email && <span>· {account.email}</span>}
                      <span>·</span>
                      <span>Plants: {account.plants.length}</span>
                      <span>·</span>
                      <span>Inverters: {account.inverterCount}</span>
                      <span>·</span>
                      <span>Loggers: {account.loggerCount}</span>
                      <span>·</span>
                      <span>Capacity: {account.capacityKw} kWp</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons (Role-guarded: Admin has full CRUD, Viewer is Read-Only) */}
                {isAdmin ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncAccount(account.id)}
                      disabled={isSyncing}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <RefreshCw size={13} className={isSyncing ? 'animate-spin text-primary' : ''} />
                      <span>{isSyncing ? 'Syncing...' : 'Auto-Discover Plants'}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAccountIdForPlant(account.id);
                        setShowAddPlantModal(true);
                      }}
                      className="gap-1.5 text-xs font-semibold text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/10"
                    >
                      <Plus size={13} />
                      <span>Add Plant</span>
                    </Button>

                    <Button
                      variant={account.status === 'OFFLINE' ? 'outline' : 'secondary'}
                      size="icon-sm"
                      onClick={() => handleToggleAccount(account)}
                      title={account.status === 'OFFLINE' ? 'Enable Account' : 'Disable Account'}
                    >
                      <Power size={14} className={account.status === 'OFFLINE' ? 'text-muted-foreground' : 'text-emerald-500'} />
                    </Button>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handleDeleteAccount(account.id, account.name)}
                      title="Delete Account"
                      className="text-destructive hover:bg-destructive/10 border-destructive/30"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground bg-muted/30">
                      Operator Synoptics (Read-Only)
                    </Badge>
                  </div>
                )}
              </div>

              {/* Plants & Hardware Under this Account */}
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono font-bold">
                    Registered Plants & Attached Hardware ({account.plants.length})
                  </span>
                  {account.plants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleAllPlantsForAccount(account.plants)}
                      className="text-xs font-mono text-primary hover:underline cursor-pointer"
                    >
                      {account.plants.every((p) => Boolean(collapsedPlants[p.stationId]))
                        ? 'Expand All Plants'
                        : 'Collapse All Plants'}
                    </button>
                  )}
                </div>

                {account.plants.length === 0 ? (
                  <div className="p-6 bg-muted/20 rounded-xl border border-dashed border-border/60 text-center">
                    <p className="text-xs text-muted-foreground mb-2">
                      No plants discovered yet for this account.
                    </p>
                    {isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncAccount(account.id)}
                        className="gap-1.5 text-xs font-semibold text-primary border-primary/30"
                      >
                        <RefreshCw size={13} />
                        <span>Run Auto-Discovery Now</span>
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Awaiting administrator synchronization.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {account.plants.map((plant) => {
                      const isCollapsed = Boolean(collapsedPlants[plant.stationId]);
                      const invertersCount = plant.devices.filter((d) => d.deviceType === 'INVERTER').length;
                      const loggersCount = plant.devices.filter((d) => d.deviceType === 'LOGGER').length;

                      return (
                        <div
                          key={plant.stationId}
                          className="bg-card/70 rounded-xl border border-border/60 transition-all overflow-hidden shadow-2xs hover:border-border/90"
                        >
                          {/* Collapsible Plant Header */}
                          <div
                            onClick={() => togglePlantCollapse(plant.stationId)}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                togglePlantCollapse(plant.stationId);
                              }
                            }}
                            aria-expanded={!isCollapsed}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shrink-0">
                                <Zap size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-foreground truncate">
                                    {plant.stationName}
                                  </span>
                                  <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                                    ID: {plant.stationId}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                                  {plant.installedCapacityKw} kWp · {plant.devices.length} Devices ({invertersCount} Inverter{invertersCount !== 1 ? 's' : ''}, {loggersCount} Gateway{loggersCount !== 1 ? 's' : ''})
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <Badge variant="outline" className="text-xs font-mono">
                                {plant.installedCapacityKw} kWp
                              </Badge>
                              <Badge variant="secondary" className="text-xs font-mono">
                                {plant.devices.length} Units
                              </Badge>
                              <div className="p-1 rounded-md text-muted-foreground hover:text-foreground">
                                <ChevronDown
                                  size={16}
                                  className={`transition-transform duration-200 ${
                                    isCollapsed ? '' : 'rotate-180'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Devices List Table (Shown when expanded) */}
                          {!isCollapsed && (
                            <div className="px-4 pb-4 pt-1 border-t border-border/40 animate-in fade-in-50">
                              <div className="overflow-x-auto mt-2">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-border/50 text-muted-foreground uppercase text-[10px] font-mono">
                                      <th className="py-2 px-2">Type</th>
                                      <th className="py-2 px-2">Device Name</th>
                                      <th className="py-2 px-2">Serial Number</th>
                                      <th className="py-2 px-2">Model</th>
                                      <th className="py-2 px-2">Rating</th>
                                      <th className="py-2 px-2 text-right">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/40 font-mono">
                                    {plant.devices.map((device) => {
                                      const isInverter = device.deviceType === 'INVERTER';
                                      return (
                                        <tr key={device.deviceSn} className="hover:bg-muted/30 transition-colors">
                                          <td className="py-2.5 px-2">
                                            <span
                                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                isInverter
                                                  ? 'bg-cyan-500/10 text-cyan-500'
                                                  : 'bg-primary/10 text-primary'
                                              }`}
                                            >
                                              {isInverter ? <Cpu size={11} /> : <Radio size={11} />}
                                              {device.deviceType}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-2 font-semibold text-foreground font-sans">
                                            {device.name}
                                          </td>
                                          <td className="py-2.5 px-2 text-muted-foreground">
                                            {device.deviceSn}
                                          </td>
                                          <td className="py-2.5 px-2 text-muted-foreground font-sans">
                                            {device.model || 'Deye Standard'}
                                          </td>
                                          <td className="py-2.5 px-2 text-foreground font-mono">
                                            {isInverter ? `${device.ratedKw || 120} kW` : 'Gateway'}
                                          </td>
                                          <td className="py-2.5 px-2 text-right">
                                            <span className="inline-flex items-center gap-1 text-emerald-500 font-bold text-[11px]">
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                              {device.status}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* MODAL: Add DeyeCloud Account in VOS Modal Format */}
      {showAddAccountModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-account-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-50"
        >
          <Card className="max-w-xl w-full p-6 shadow-2xl relative border-border/80 bg-popover/95">
            <button
              onClick={() => setShowAddAccountModal(false)}
              aria-label="Close dialog"
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <Building2 className="text-primary" size={22} />
              <h3 id="add-account-dialog-title" className="text-lg font-bold text-foreground font-headline">
                Add DeyeCloud Account
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your DeyeCloud Developer Application credentials. The system will automatically discover all plants, inverters, and loggers registered under this account.
            </p>

            <form onSubmit={handleAddAccountSubmit} className="flex flex-col gap-3.5">
              <div>
                <label htmlFor="add-account-name" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                  Account Display Name
                </label>
                <input
                  id="add-account-name"
                  type="text"
                  required
                  placeholder="e.g. Acme Industrial Solar Fleet"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="add-account-base-url" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                  API Regional Base URL
                </label>
                <input
                  id="add-account-base-url"
                  type="text"
                  required
                  value={addForm.baseUrl}
                  onChange={(e) => setAddForm({ ...addForm, baseUrl: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-account-app-id" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    App ID
                  </label>
                  <input
                    id="add-account-app-id"
                    type="text"
                    required
                    placeholder="e.g. 20240901..."
                    value={addForm.appId}
                    onChange={(e) => setAddForm({ ...addForm, appId: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="add-account-app-secret" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    App Secret
                  </label>
                  <input
                    id="add-account-app-secret"
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={addForm.appSecret}
                    onChange={(e) => setAddForm({ ...addForm, appSecret: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-account-email" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    DeyeCloud Login Email
                  </label>
                  <input
                    id="add-account-email"
                    type="email"
                    required
                    placeholder="user@domain.com"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="add-account-password" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Password (SHA-256 Hashed)
                  </label>
                  <input
                    id="add-account-password"
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {addMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    addMessage.isError
                      ? 'bg-destructive/15 text-destructive border border-destructive/20'
                      : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                  }`}
                >
                  {addMessage.isError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                  <span>{addMessage.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddAccountModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={adding}
                  size="sm"
                  className="gap-2 bg-primary text-primary-foreground"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${adding ? 'animate-spin' : ''}`} />
                  <span>{adding ? 'Authenticating...' : 'Register & Auto-Discover'}</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Add Solar Plant in VOS Modal Format */}
      {showAddPlantModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-plant-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-50"
        >
          <Card className="max-w-xl w-full p-6 shadow-2xl relative border-border/80 bg-popover/95 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAddPlantModal(false)}
              aria-label="Close dialog"
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <Zap className="text-primary" size={22} />
              <h3 id="add-plant-dialog-title" className="text-lg font-bold text-foreground font-headline">
                Add Solar Plant Station
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Manually register a solar station, inverter units, and telemetry data logger.
            </p>

            <form onSubmit={handleAddPlantSubmit} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-plant-station-name" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Station Name
                  </label>
                  <input
                    id="add-plant-station-name"
                    type="text"
                    required
                    placeholder="e.g. North Warehouse Array"
                    value={plantForm.stationName}
                    onChange={(e) => setPlantForm({ ...plantForm, stationName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="add-plant-station-id" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Station ID (Cloud/Local)
                  </label>
                  <input
                    id="add-plant-station-id"
                    type="text"
                    required
                    placeholder="e.g. PLANT-003"
                    value={plantForm.stationId}
                    onChange={(e) => setPlantForm({ ...plantForm, stationId: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-plant-capacity" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Installed Capacity (kWp)
                  </label>
                  <input
                    id="add-plant-capacity"
                    type="number"
                    required
                    value={plantForm.installedCapacityKw}
                    onChange={(e) => setPlantForm({ ...plantForm, installedCapacityKw: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="add-plant-address" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Facility Location / Address
                  </label>
                  <input
                    id="add-plant-address"
                    type="text"
                    placeholder="e.g. Building B, Main Industrial Park"
                    value={plantForm.address}
                    onChange={(e) => setPlantForm({ ...plantForm, address: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Inverter #1 */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50">
                <span className="text-xs font-bold text-foreground block mb-2 font-mono">
                  Inverter Unit #1
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id="add-plant-inv-sn"
                    aria-label="Inverter Serial Number"
                    type="text"
                    required
                    placeholder="Serial Number (e.g. 2408124366)"
                    value={plantForm.inverterSn1}
                    onChange={(e) => setPlantForm({ ...plantForm, inverterSn1: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-card border border-border/60 text-foreground text-xs font-mono"
                  />
                  <input
                    id="add-plant-inv-model"
                    aria-label="Inverter Model"
                    type="text"
                    placeholder="Model (e.g. SUN-120K-SG01HP3-EU-AM2)"
                    value={plantForm.inverterModel1}
                    onChange={(e) => setPlantForm({ ...plantForm, inverterModel1: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-card border border-border/60 text-foreground text-xs font-mono"
                  />
                </div>
              </div>

              {/* Data Logger */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50">
                <span className="text-xs font-bold text-foreground block mb-2 font-mono">
                  Data Logger (Optional)
                </span>
                <input
                  id="add-plant-logger-sn"
                  aria-label="Data Logger Serial Number"
                  type="text"
                  placeholder="Logger SN (e.g. 2309811002)"
                  value={plantForm.loggerSn}
                  onChange={(e) => setPlantForm({ ...plantForm, loggerSn: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-card border border-border/60 text-foreground text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddPlantModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingPlant}
                  size="sm"
                  className="bg-primary text-primary-foreground"
                >
                  {savingPlant ? 'Saving Plant...' : 'Register Plant'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

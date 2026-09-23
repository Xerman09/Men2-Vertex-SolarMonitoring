'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink,
  Power,
  X,
  Server,
  Database,
  Lock,
  User,
} from 'lucide-react';
import { AccountSummary, PlantInfo, DeviceInfo } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AccountsManagementPage() {
  const { refreshAccounts: refreshContextAccounts } = useAccount();
  const { isAdmin, isConsumer, isViewer, user, setShowAuthModal } = useRole();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [directusInfo, setDirectusInfo] = useState<{ connected: boolean; lastChecked: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Add Account Modal State
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    baseUrl: 'https://eu1-developer.deyecloud.com',
    appId: '',
    appSecret: '',
    email: '',
    password: '',
  });
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Add Plant Modal State
  const [showAddPlantModal, setShowAddPlantModal] = useState(false);
  const [selectedAccountIdForPlant, setSelectedAccountIdForPlant] = useState('');
  const [plantForm, setPlantForm] = useState({
    stationId: '',
    stationName: '',
    installedCapacityKw: 120,
    address: '',
    inverterSn1: '',
    inverterModel1: 'SUN-120K-SG01HP3-EU-AM2',
    inverterKw1: 120,
    inverterSn2: '',
    inverterModel2: 'SUN-120K-SG01HP3-EU-AM2',
    inverterKw2: 120,
    loggerSn: '',
  });
  const [savingPlant, setSavingPlant] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/deye/accounts');
      if (res.ok) {
        const json = await res.json();
        setAccounts(json.accounts || []);
        if (json.directus) {
          setDirectusInfo(json.directus);
        }
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleSyncAccount = async (accountId: string) => {
    setSyncingId(accountId);
    try {
      const res = await fetch('/api/deye/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (res.ok) {
        await fetchAccounts();
        await refreshContextAccounts();
      }
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncingId(null);
    }
  };

  const handleToggleAccount = async (account: AccountSummary) => {
    try {
      const newEnabled = account.status === 'OFFLINE';
      const res = await fetch('/api/deye/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, enabled: newEnabled }),
      });
      if (res.ok) {
        await fetchAccounts();
        await refreshContextAccounts();
      }
    } catch (e) {
      console.error('Toggle error:', e);
    }
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the account "${name}" and all its registered plants?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/deye/accounts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchAccounts();
        await refreshContextAccounts();
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleAddAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddMessage(null);

    try {
      const res = await fetch('/api/deye/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });

      const json = await res.json();
      if (!res.ok) {
        setAddMessage({ text: json.error || 'Failed to add account', isError: true });
        setAdding(false);
        return;
      }

      setAddMessage({
        text: `Successfully added account! Auto-discovered ${json.plantsDiscovered} plant(s) and ${json.devicesDiscovered} device(s).`,
        isError: false,
      });

      await fetchAccounts();
      await refreshContextAccounts();
      setTimeout(() => {
        setShowAddAccountModal(false);
        setAddForm({
          name: '',
          baseUrl: 'https://eu1-developer.deyecloud.com',
          appId: '',
          appSecret: '',
          email: '',
          password: '',
        });
        setAddMessage(null);
      }, 1500);
    } catch (err) {
      setAddMessage({ text: String(err), isError: true });
    } finally {
      setAdding(false);
    }
  };

  const handleAddPlantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlant(true);

    const devices: DeviceInfo[] = [];
    if (plantForm.inverterSn1) {
      devices.push({
        deviceSn: plantForm.inverterSn1.trim(),
        deviceType: 'INVERTER',
        name: `${plantForm.stationName} Inverter #1`,
        model: plantForm.inverterModel1,
        ratedKw: Number(plantForm.inverterKw1) || 120,
        loggerSn: plantForm.loggerSn || undefined,
        status: 'ONLINE',
      });
    }
    if (plantForm.inverterSn2) {
      devices.push({
        deviceSn: plantForm.inverterSn2.trim(),
        deviceType: 'INVERTER',
        name: `${plantForm.stationName} Inverter #2`,
        model: plantForm.inverterModel2,
        ratedKw: Number(plantForm.inverterKw2) || 120,
        loggerSn: plantForm.loggerSn || undefined,
        status: 'ONLINE',
      });
    }
    if (plantForm.loggerSn) {
      devices.push({
        deviceSn: plantForm.loggerSn.trim(),
        deviceType: 'LOGGER',
        name: `${plantForm.stationName} Data Logger`,
        model: 'Deye Smart Data Logger',
        status: 'ONLINE',
      });
    }

    const newPlant: PlantInfo = {
      stationId: plantForm.stationId.trim(),
      stationName: plantForm.stationName.trim(),
      installedCapacityKw: Number(plantForm.installedCapacityKw) || 120,
      address: plantForm.address || 'Facility Site',
      devices,
    };

    try {
      const res = await fetch('/api/deye/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountIdForPlant,
          plant: newPlant,
        }),
      });

      if (res.ok) {
        setShowAddPlantModal(false);
        await fetchAccounts();
        await refreshContextAccounts();
        setPlantForm({
          stationId: '',
          stationName: '',
          installedCapacityKw: 120,
          address: '',
          inverterSn1: '',
          inverterModel1: 'SUN-120K-SG01HP3-EU-AM2',
          inverterKw1: 120,
          inverterSn2: '',
          inverterModel2: 'SUN-120K-SG01HP3-EU-AM2',
          inverterKw2: 120,
          loggerSn: '',
        });
      }
    } catch (err) {
      console.error('Error adding plant:', err);
    } finally {
      setSavingPlant(false);
    }
  };

  const displayAccounts = useMemo(() => {
    if (isConsumer && user) {
      const userAccId = String(user.accountId || user.id || '').trim();
      const userEmail = (user.email || '').trim().toLowerCase();

      return accounts.filter((acc) => {
        const accId = String(acc.id || '');
        const accDirectusId = acc.directusId ? String(acc.directusId) : '';
        const accEmail = (acc.email || '').trim().toLowerCase();

        return (
          (userAccId && (accDirectusId === userAccId || accId === userAccId || accId === `directus-${userAccId}`)) ||
          (userEmail && accEmail === userEmail)
        );
      });
    }
    return accounts;
  }, [accounts, isConsumer, user]);

  const totalAccountsCount = displayAccounts.length;
  const activeAccountsCount = displayAccounts.filter((a) => a.status !== 'OFFLINE').length;
  let totalPlants = 0;
  let totalInverters = 0;
  let totalLoggers = 0;
  let totalCapacity = 0;

  for (const acc of displayAccounts) {
    totalPlants += acc.plants.length;
    totalInverters += acc.inverterCount;
    totalLoggers += acc.loggerCount;
    totalCapacity += acc.capacityKw;
  }

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
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAdmin
                  ? 'Two-way database account synchronization, credentials management, automatic plant discovery, and inverter hierarchy.'
                  : isConsumer
                  ? 'Your registered solar stations, plant telemetry, and inverter hardware configurations.'
                  : 'Live synoptic overview of registered solar sites, inverters, rated capacities, and operational status.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
        <Card className="border-border/60 bg-card/80 p-4 shadow-xs">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Registered Accounts
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-primary">
              {activeAccountsCount}
            </span>
            <span className="text-xs text-muted-foreground">/ {totalAccountsCount} Active</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Discovered Plants
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-cyan-500">
              {totalPlants}
            </span>
            <span className="text-xs text-muted-foreground">Solar Arrays</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Hybrid Inverters
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-emerald-500">
              {totalInverters}
            </span>
            <span className="text-xs text-muted-foreground">Active Units</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Data Loggers
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-foreground">
              {totalLoggers}
            </span>
            <span className="text-xs text-muted-foreground">Gateways</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/80 p-4 shadow-xs">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Total Fleet Capacity
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-primary">
              {totalCapacity.toFixed(0)}
            </span>
            <span className="text-xs text-muted-foreground">kWp</span>
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
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono font-bold">
                  Registered Plants & Attached Hardware
                </span>

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
                  <div className="grid grid-cols-1 gap-4">
                    {account.plants.map((plant) => (
                      <div
                        key={plant.stationId}
                        className="bg-card/70 p-4 rounded-xl border border-border/60 flex flex-col gap-3"
                      >
                        {/* Plant Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <Zap className="text-amber-500 shrink-0" size={18} />
                            <div>
                              <span className="font-bold text-sm text-foreground">
                                {plant.stationName}
                              </span>
                              <span className="font-mono text-xs text-primary ml-2">
                                ID: {plant.stationId}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              {plant.installedCapacityKw} kWp Installed
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {plant.devices.length} Devices
                            </span>
                          </div>
                        </div>

                        {/* Devices List Table in VOS format */}
                        <div className="overflow-x-auto mt-1">
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
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* MODAL: Add DeyeCloud Account in VOS Modal Format */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-50">
          <Card className="max-w-xl w-full p-6 shadow-2xl relative border-border/80 bg-popover/95">
            <button
              onClick={() => setShowAddAccountModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <Building2 className="text-primary" size={22} />
              <h3 className="text-lg font-bold text-foreground font-headline">
                Add DeyeCloud Account
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your DeyeCloud Developer Application credentials. The system will automatically discover all plants, inverters, and loggers registered under this account.
            </p>

            <form onSubmit={handleAddAccountSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                  Account Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Industrial Solar Fleet"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                  API Regional Base URL
                </label>
                <input
                  type="text"
                  required
                  value={addForm.baseUrl}
                  onChange={(e) => setAddForm({ ...addForm, baseUrl: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    App ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 20240901..."
                    value={addForm.appId}
                    onChange={(e) => setAddForm({ ...addForm, appId: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    App Secret
                  </label>
                  <input
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
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    DeyeCloud Login Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@domain.com"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Password (SHA-256 Hashed)
                  </label>
                  <input
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-50">
          <Card className="max-w-xl w-full p-6 shadow-2xl relative border-border/80 bg-popover/95 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAddPlantModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <Zap className="text-primary" size={22} />
              <h3 className="text-lg font-bold text-foreground font-headline">
                Add Solar Plant Station
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Manually register a solar station, inverter units, and telemetry data logger.
            </p>

            <form onSubmit={handleAddPlantSubmit} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Station Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. North Warehouse Array"
                    value={plantForm.stationName}
                    onChange={(e) => setPlantForm({ ...plantForm, stationName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Station ID (Cloud/Local)
                  </label>
                  <input
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
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Installed Capacity (kWp)
                  </label>
                  <input
                    type="number"
                    required
                    value={plantForm.installedCapacityKw}
                    onChange={(e) => setPlantForm({ ...plantForm, installedCapacityKw: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Facility Location / Address
                  </label>
                  <input
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
                    type="text"
                    required
                    placeholder="Serial Number (e.g. 2408124366)"
                    value={plantForm.inverterSn1}
                    onChange={(e) => setPlantForm({ ...plantForm, inverterSn1: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-card border border-border/60 text-foreground text-xs font-mono"
                  />
                  <input
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

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AccountSummary, PlantInfo, DeviceInfo } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { createLogger } from '@/lib/logger';

const log = createLogger('useStationAccounts');

export interface AddAccountFormData {
  name: string;
  baseUrl: string;
  appId: string;
  appSecret: string;
  email: string;
  password: string;
}

export interface AddPlantFormData {
  stationId: string;
  stationName: string;
  installedCapacityKw: number;
  address: string;
  inverterSn1: string;
  inverterModel1: string;
  inverterKw1: number;
  inverterSn2: string;
  inverterModel2: string;
  inverterKw2: number;
  loggerSn: string;
}

export interface StationAccountsMetrics {
  totalAccountsCount: number;
  activeAccountsCount: number;
  totalPlants: number;
  totalInverters: number;
  totalLoggers: number;
  totalCapacity: number;
}

export function useStationAccounts() {
  const {
    accounts: contextAccounts,
    directusStatus,
    refreshAccounts: refreshContextAccounts,
    isFetchingDeye,
    fetchingStage,
    setFetchingDeye,
  } = useAccount();
  const { isConsumer, user } = useRole();
  const [accounts, setAccounts] = useState<AccountSummary[]>(contextAccounts || []);
  const [directusInfo, setDirectusInfo] = useState<{ connected: boolean; lastChecked: string; error?: string } | null>(
    directusStatus || null
  );
  const [loading, setLoading] = useState(contextAccounts.length === 0);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Collapsed state for registered plants (plant stationId -> boolean)
  const [collapsedPlants, setCollapsedPlants] = useState<Record<string, boolean>>({});

  const togglePlantCollapse = useCallback((stationId: string) => {
    setCollapsedPlants((prev) => ({
      ...prev,
      [stationId]: !prev[stationId],
    }));
  }, []);

  const toggleAllPlantsForAccount = useCallback((accountPlants: PlantInfo[]) => {
    setCollapsedPlants((prev) => {
      const allCollapsed = accountPlants.every((p) => Boolean(prev[p.stationId]));
      const next = { ...prev };
      accountPlants.forEach((p) => {
        next[p.stationId] = !allCollapsed;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (contextAccounts.length > 0) {
      setAccounts(contextAccounts);
      setLoading(false);
    }
    if (directusStatus) {
      setDirectusInfo(directusStatus);
    }
  }, [contextAccounts, directusStatus]);

  // Add Account Modal State
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addForm, setAddForm] = useState<AddAccountFormData>({
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
  const [plantForm, setPlantForm] = useState<AddPlantFormData>({
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

  const fetchAccounts = useCallback(async (isManualSync = false) => {
    if (isManualSync) {
      setFetchingDeye(true, 'Syncing DeyeCloud Accounts & Plants...');
    }
    try {
      const res = await fetch(isManualSync ? '/api/deye/accounts?sync=true' : '/api/deye/accounts');
      if (res.ok) {
        const json = await res.json();
        setAccounts(json.accounts || []);
        if (json.directus) {
          setDirectusInfo(json.directus);
        }
      }
    } catch (e) {
      log.error('Failed to load accounts', e);
    } finally {
      setLoading(false);
      if (isManualSync) {
        safeTimeout(() => {
          setFetchingDeye(false, null);
        }, 600);
      }
    }
  }, [safeTimeout, setFetchingDeye]);

  useEffect(() => {
    if (contextAccounts.length === 0) {
      fetchAccounts(false);
    }
  }, [contextAccounts.length, fetchAccounts]);

  const handleSyncAccount = useCallback(async (accountId: string) => {
    setSyncingId(accountId);
    setFetchingDeye(true, 'Syncing Account & Auto-Discovering Deye Plants...');
    try {
      const res = await fetch('/api/deye/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (res.ok) {
        await fetchAccounts(true);
        await refreshContextAccounts(true);
      }
    } catch (e) {
      log.error('Sync error', e);
    } finally {
      setSyncingId(null);
      safeTimeout(() => {
        setFetchingDeye(false, null);
      }, 600);
    }
  }, [fetchAccounts, refreshContextAccounts, safeTimeout, setFetchingDeye]);

  const handleToggleAccount = useCallback(async (account: AccountSummary) => {
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
      log.error('Toggle error', e);
    }
  }, [fetchAccounts, refreshContextAccounts]);

  const handleDeleteAccount = useCallback(async (id: string, name: string) => {
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
      log.error('Delete error', e);
    }
  }, [fetchAccounts, refreshContextAccounts]);

  const handleAddAccountSubmit = useCallback(async (e: React.FormEvent) => {
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
      safeTimeout(() => {
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
  }, [addForm, fetchAccounts, refreshContextAccounts, safeTimeout]);

  const handleAddPlantSubmit = useCallback(async (e: React.FormEvent) => {
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
      log.error('Error adding plant', err);
    } finally {
      setSavingPlant(false);
    }
  }, [fetchAccounts, plantForm, refreshContextAccounts, selectedAccountIdForPlant]);

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

  const metrics: StationAccountsMetrics = useMemo(() => {
    const totalAccountsCount = displayAccounts.length;
    const activeAccountsCount = displayAccounts.filter((a) => a.status !== 'OFFLINE').length;
    let totalPlants = 0;
    let totalInverters = 0;
    let totalLoggers = 0;
    let totalCapacity = 0;

    for (const acc of displayAccounts) {
      totalPlants += acc.plants.length;
      totalCapacity += acc.capacityKw || 0;
      for (const plant of acc.plants) {
        for (const device of plant.devices) {
          if (device.deviceType === 'INVERTER') totalInverters++;
          if (device.deviceType === 'LOGGER') totalLoggers++;
        }
      }
    }

    return {
      totalAccountsCount,
      activeAccountsCount,
      totalPlants,
      totalInverters,
      totalLoggers,
      totalCapacity: parseFloat(totalCapacity.toFixed(1)),
    };
  }, [displayAccounts]);

  return {
    accounts,
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
    // Add Account Modal
    showAddAccountModal,
    setShowAddAccountModal,
    addForm,
    setAddForm,
    adding,
    addMessage,
    handleAddAccountSubmit,
    // Add Plant Modal
    showAddPlantModal,
    setShowAddPlantModal,
    selectedAccountIdForPlant,
    setSelectedAccountIdForPlant,
    plantForm,
    setPlantForm,
    savingPlant,
    handleAddPlantSubmit,
    metrics,
  };
}

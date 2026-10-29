'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AccountSummary, AggregatedFleetSummary, PlantInfo } from './types';
import { useRole } from './role-context';
import { createLogger } from './logger';
import { useSafeTimeout } from './usePolling';
import { telemetryCache, inverterCacheKey } from './telemetry-cache';

const log = createLogger('AccountContext');
const ACCOUNTS_CACHE_KEY = 'accounts:summary';
const FLEET_CACHE_KEY = 'fleet:aggregate';

interface AccountContextType {
  accounts: AccountSummary[];
  selectedAccountId: string; // 'ALL' or specific accountId
  setSelectedAccountId: (id: string) => void;
  selectedAccount: AccountSummary | null;
  selectedStationId: string; // 'ALL' or specific stationId
  setSelectedStationId: (id: string) => void;
  selectedPlant: PlantInfo | null;
  selectAccountAndPlant: (accountId: string, stationId?: string) => void;
  selectedInverterSn: string; // 'ALL' or specific deviceSn
  setSelectedInverterSn: (sn: string) => void;
  selectInverter: (accountId: string, stationId: string, inverterSn: string) => void;
  isFleetView: boolean;
  loading: boolean;
  syncing: boolean;
  isFetchingDeye: boolean;
  fetchingStage: string | null;
  lastSyncedAt: Date | null;
  setFetchingDeye: (fetching: boolean, stage?: string | null) => void;
  refreshAccounts: (forceSync?: boolean, showIndicator?: boolean) => Promise<void>;
  syncLivePlants: () => Promise<void>;
  seedAccountsFromFleet: (fleetAccounts: AccountSummary[]) => void;
  totalAccounts: number;
  liveAccountsCount: number;
  directusStatus?: { connected: boolean; lastChecked: string; error?: string };
  isPlantSwitching: boolean;
  switchingPlantName: string | null;
  setIsPlantSwitching: (switching: boolean, plantName?: string | null) => void;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

function getInitialCachedAccounts(): AccountSummary[] {
  if (typeof window === 'undefined') return [];
  const cachedAccounts = telemetryCache.get<AccountSummary[]>(ACCOUNTS_CACHE_KEY, 300000, true);
  if (Array.isArray(cachedAccounts) && cachedAccounts.length > 0) {
    return cachedAccounts;
  }
  const cachedFleet = telemetryCache.get<AggregatedFleetSummary>(FLEET_CACHE_KEY, 300000, true);
  if (cachedFleet && Array.isArray(cachedFleet.accounts) && cachedFleet.accounts.length > 0) {
    return cachedFleet.accounts;
  }
  return [];
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { role, isAdmin, isConsumer, user, isInitialized } = useRole();
  const [rawAccounts, setRawAccounts] = useState<AccountSummary[]>(getInitialCachedAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [selectedStationId, setSelectedStationId] = useState<string>('ALL');
  const [selectedInverterSn, setSelectedInverterSn] = useState<string>('ALL');
  const [isPlantSwitching, setIsPlantSwitchingState] = useState<boolean>(false);
  const [switchingPlantName, setSwitchingPlantName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(() => getInitialCachedAccounts().length === 0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [isFetchingDeye, setIsFetchingDeye] = useState<boolean>(false);
  const [fetchingStage, setFetchingStage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [directusStatus, setDirectusStatus] = useState<{ connected: boolean; lastChecked: string; error?: string } | undefined>(undefined);
  const { setSafeTimeout } = useSafeTimeout();

  const setIsPlantSwitching = useCallback((switching: boolean, plantName?: string | null) => {
    setIsPlantSwitchingState(switching);
    if (plantName !== undefined) {
      setSwitchingPlantName(plantName);
    }
    if (!switching) {
      setSwitchingPlantName(null);
    }
  }, []);

  useEffect(() => {
    if (isPlantSwitching) {
      const timer = setTimeout(() => {
        setIsPlantSwitchingState(false);
        setSwitchingPlantName(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isPlantSwitching]);

  useEffect(() => {
    if (isFetchingDeye) {
      const timer = setTimeout(() => {
        setIsFetchingDeye(false);
        setFetchingStage(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [isFetchingDeye]);

  const setFetchingDeye = useCallback((fetching: boolean, stage: string | null = null) => {
    setIsFetchingDeye(fetching);
    setFetchingStage(stage);
    if (!fetching) {
      setLastSyncedAt(new Date());
    }
  }, []);

  const seedAccountsFromFleet = useCallback((fleetAccounts: AccountSummary[]) => {
    if (!Array.isArray(fleetAccounts) || fleetAccounts.length === 0) return;
    telemetryCache.set(ACCOUNTS_CACHE_KEY, fleetAccounts);
    setRawAccounts((prev) => (prev.length > 0 ? prev : fleetAccounts));
    setLoading(false);
  }, []);

  const refreshAccounts = useCallback(async (forceSync: boolean = false, showIndicator: boolean = false) => {
    if (showIndicator || forceSync) {
      setIsFetchingDeye(true);
      setFetchingStage(forceSync ? 'Syncing DeyeCloud Accounts & Plants...' : 'Fetching DeyeCloud Accounts...');
    }
    try {
      const url = forceSync ? '/api/deye/accounts?sync=true' : '/api/deye/accounts';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.accounts) && json.accounts.length > 0) {
          telemetryCache.set(ACCOUNTS_CACHE_KEY, json.accounts);
          setRawAccounts(json.accounts);
        } else {
          // Fallback: check fleet aggregate endpoint/cache so accounts are never 0 when database has an account
          const cachedFleet = telemetryCache.get<AggregatedFleetSummary>(FLEET_CACHE_KEY, 300000, true);
          if (cachedFleet?.accounts && cachedFleet.accounts.length > 0) {
            setRawAccounts((prev) => (prev.length > 0 ? prev : cachedFleet.accounts));
          } else {
            const aggRes = await fetch('/api/deye/aggregate');
            if (aggRes.ok) {
              const aggJson: AggregatedFleetSummary = await aggRes.json();
              if (Array.isArray(aggJson.accounts) && aggJson.accounts.length > 0) {
                telemetryCache.set(FLEET_CACHE_KEY, aggJson);
                telemetryCache.set(ACCOUNTS_CACHE_KEY, aggJson.accounts);
                setRawAccounts(aggJson.accounts);
              }
            }
          }
        }
        if (json.directus) {
          setDirectusStatus(json.directus);
        }
        setLastSyncedAt(new Date());
      } else {
        // Fallback if /api/deye/accounts failed: try /api/deye/aggregate
        const aggRes = await fetch('/api/deye/aggregate');
        if (aggRes.ok) {
          const aggJson: AggregatedFleetSummary = await aggRes.json();
          if (Array.isArray(aggJson.accounts) && aggJson.accounts.length > 0) {
            telemetryCache.set(FLEET_CACHE_KEY, aggJson);
            telemetryCache.set(ACCOUNTS_CACHE_KEY, aggJson.accounts);
            setRawAccounts(aggJson.accounts);
          }
        }
      }
    } catch (e) {
      log.error('Failed to load accounts', e);
    } finally {
      setLoading(false);
      if (showIndicator || forceSync) {
        setIsFetchingDeye(false);
        setFetchingStage(null);
      }
    }
  }, []);

  const syncLivePlants = useCallback(async () => {
    setSyncing(true);
    setIsFetchingDeye(true);
    setFetchingStage('Syncing Live Plants & Hardware from DeyeCloud...');
    try {
      await refreshAccounts(true, true);
    } finally {
      setSyncing(false);
    }
  }, [refreshAccounts]);

  const hasLoadedRef = useRef(false);
  const prevAuthKeyRef = useRef<string>('');

  useEffect(() => {
    const authKey = `${role}:${user?.id || ''}:${user?.accountId || ''}:${isInitialized}`;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      prevAuthKeyRef.current = authKey;
      refreshAccounts(false, true);
      return;
    }
    if (prevAuthKeyRef.current !== authKey) {
      prevAuthKeyRef.current = authKey;
      refreshAccounts(false, false);
    }
  }, [role, user?.id, user?.accountId, isInitialized, refreshAccounts]);

  // Demo accounts are strictly scoped to the admin account
  const accounts = useMemo(() => {
    let list = rawAccounts;
    if (!isAdmin) {
      const nonDemo = list.filter((acc) => !acc.isDemo);
      if (nonDemo.length > 0) {
        list = nonDemo;
      }
    }

    if (isConsumer && user) {
      const userAccId = String(user.accountId || user.id || '').trim();
      const userEmail = (user.email || '').trim().toLowerCase();

      const matched = list.filter((acc) => {
        const accId = String(acc.id || '');
        const accDirectusId = acc.directusId ? String(acc.directusId) : '';
        const accEmail = (acc.email || '').trim().toLowerCase();

        return (
          (acc.userId && String(acc.userId) === String(user.id)) ||
          (userAccId &&
            (accDirectusId === userAccId ||
              accId === userAccId ||
              accId === `directus-${userAccId}` ||
              accId === `deye-cfg-${userAccId}` ||
              acc.plants?.some(
                (p) =>
                  String(p.stationId) === userAccId ||
                  `station-${p.stationId}` === userAccId
              ))) ||
          (userEmail && accEmail === userEmail)
        );
      });

      return matched.length > 0 ? matched : list;
    }
    return list;
  }, [rawAccounts, isAdmin, isConsumer, user]);

  // When consumer logs in, pin selected account to their account ID
  useEffect(() => {
    if (isConsumer && accounts.length > 0) {
      if (selectedAccountId === 'ALL' || !accounts.some((a) => a.id === selectedAccountId)) {
        setSelectedAccountId(accounts[0].id);
      }
    }
  }, [isConsumer, accounts, selectedAccountId]);

  const selectedAccount = useMemo(() => {
    if (isConsumer) {
      return accounts.find((acc) => acc.id === selectedAccountId) || accounts[0] || null;
    }
    if (selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET') {
      return null;
    }
    return accounts.find((acc) => acc.id === selectedAccountId) || null;
  }, [isConsumer, accounts, selectedAccountId]);

  // Find plant if specific station is chosen
  const selectedPlant = useMemo(() => {
    if (!selectedAccount || selectedStationId === 'ALL') return null;
    return (
      selectedAccount.plants?.find(
        (p) => String(p.stationId) === String(selectedStationId)
      ) || null
    );
  }, [selectedAccount, selectedStationId]);

  const handleSetSelectedStationId = useCallback((id: string) => {
    if (id === selectedStationId) return;

    const targetPlant = selectedAccount?.plants?.find(
      (p) => String(p.stationId) === String(id)
    );
    const plantName = id === 'ALL'
      ? (selectedAccount?.name ? `${selectedAccount.name} (All Plants)` : 'All Plants')
      : (targetPlant?.stationName || `Station ${id}`);

    const cacheKey = `${selectedAccountId}:${id}`;
    const hasCachedData = telemetryCache.get(cacheKey) !== null;

    if (!hasCachedData) {
      setIsPlantSwitchingState(true);
      setSwitchingPlantName(plantName);
    }

    setSelectedStationId(String(id));
    setSelectedInverterSn('ALL');
  }, [selectedStationId, selectedAccount, selectedAccountId]);

  const handleSetSelectedAccountId = useCallback((id: string) => {
    if (isConsumer) {
      if (accounts.length > 0) {
        setSelectedAccountId(accounts[0].id);
      }
      setSelectedStationId('ALL');
      setSelectedInverterSn('ALL');
      return;
    }
    const normalized = id === 'ALL_FLEET' ? 'ALL' : id;
    if (normalized !== selectedAccountId) {
      const targetAcc = accounts.find((a) => a.id === normalized);
      const accName = normalized === 'ALL' ? 'Fleet Multi-Site' : (targetAcc?.name || normalized);
      const cacheKey = `${normalized}:ALL`;
      const hasCachedData = telemetryCache.get(cacheKey) !== null;

      if (!hasCachedData) {
        setIsPlantSwitchingState(true);
        setSwitchingPlantName(accName);
      }
    }
    setSelectedAccountId(normalized);
    setSelectedStationId('ALL');
    setSelectedInverterSn('ALL');
  }, [isConsumer, accounts, selectedAccountId]);

  const selectAccountAndPlant = useCallback((accountId: string, stationId: string = 'ALL') => {
    const cleanStationId = String(stationId);
    const targetAcc = accounts.find((a) => a.id === accountId);
    const targetPlant = targetAcc?.plants?.find(
      (p) => String(p.stationId) === cleanStationId
    );
    const plantName = cleanStationId === 'ALL'
      ? (targetAcc?.name ? `${targetAcc.name} (All Plants)` : 'All Plants')
      : (targetPlant?.stationName || `Station ${cleanStationId}`);

    const cacheKey = `${accountId}:${cleanStationId}`;
    const hasCachedData = telemetryCache.get(cacheKey) !== null;

    if (!hasCachedData) {
      setIsPlantSwitchingState(true);
      setSwitchingPlantName(plantName);
    }

    if (isConsumer && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
      setSelectedStationId(cleanStationId);
      setSelectedInverterSn('ALL');
      return;
    }
    const normalized = accountId === 'ALL_FLEET' ? 'ALL' : accountId;
    setSelectedAccountId(normalized);
    setSelectedStationId(cleanStationId);
    setSelectedInverterSn('ALL');
  }, [isConsumer, accounts]);

  const selectInverter = useCallback((accountId: string, stationId: string, inverterSn: string) => {
    const cleanStationId = String(stationId);
    const cleanInverterSn = String(inverterSn).trim();

    // Find account by ID or by matching plant station
    const targetAcc =
      accounts.find((a) => a.id === accountId) ||
      accounts.find((a) =>
        a.plants?.some((p) => String(p.stationId) === cleanStationId)
      );
    const targetPlant = targetAcc?.plants?.find(
      (p) => String(p.stationId) === cleanStationId
    );
    const plantName = targetPlant?.stationName || `Station ${cleanStationId}`;

    const effectiveAccId = targetAcc?.id || (accountId === 'ALL_FLEET' ? 'ALL' : accountId);
    const cacheKey = inverterCacheKey(effectiveAccId, cleanStationId, cleanInverterSn);
    const hasCachedData = telemetryCache.get(cacheKey) !== null;

    if (!hasCachedData) {
      setIsPlantSwitchingState(true);
      setSwitchingPlantName(plantName);
    }

    if (isConsumer && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
      setSelectedStationId(cleanStationId);
      setSelectedInverterSn(cleanInverterSn);
      return;
    }

    setSelectedAccountId(effectiveAccId);
    setSelectedStationId(cleanStationId);
    setSelectedInverterSn(cleanInverterSn);
  }, [isConsumer, accounts]);

  // Fleet view is NEVER active for consumer accounts
  const isFleetView = !isConsumer && (selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET');
  // Guarantee totalAccounts is never 0 when an account exists in the database
  const totalAccounts = Math.max(1, accounts.length, rawAccounts.length);
  const liveAccountsCount = useMemo(() => {
    const live = accounts.filter((a) => a.isLive).length;
    return live > 0 ? live : (accounts.length > 0 ? accounts.filter((a) => a.status !== 'OFFLINE').length : 1);
  }, [accounts]);

  const contextValue = useMemo(() => ({
    accounts,
    selectedAccountId,
    setSelectedAccountId: handleSetSelectedAccountId,
    selectedAccount,
    selectedStationId,
    setSelectedStationId: handleSetSelectedStationId,
    selectedPlant,
    selectAccountAndPlant,
    selectedInverterSn,
    setSelectedInverterSn,
    selectInverter,
    isFleetView,
    loading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    lastSyncedAt,
    setFetchingDeye,
    refreshAccounts,
    syncLivePlants,
    seedAccountsFromFleet,
    totalAccounts,
    liveAccountsCount,
    directusStatus,
    isPlantSwitching,
    switchingPlantName,
    setIsPlantSwitching,
  }), [
    accounts,
    selectedAccountId,
    handleSetSelectedAccountId,
    selectedAccount,
    selectedStationId,
    handleSetSelectedStationId,
    selectedPlant,
    selectAccountAndPlant,
    selectedInverterSn,
    selectInverter,
    isFleetView,
    loading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    lastSyncedAt,
    setFetchingDeye,
    refreshAccounts,
    syncLivePlants,
    seedAccountsFromFleet,
    totalAccounts,
    liveAccountsCount,
    directusStatus,
    isPlantSwitching,
    switchingPlantName,
    setIsPlantSwitching,
  ]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return ctx;
}

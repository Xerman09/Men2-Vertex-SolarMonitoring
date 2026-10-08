'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AccountSummary, PlantInfo } from './types';
import { useRole } from './role-context';
import { createLogger } from './logger';

const log = createLogger('AccountContext');

interface AccountContextType {
  accounts: AccountSummary[];
  selectedAccountId: string; // 'ALL' or specific accountId
  setSelectedAccountId: (id: string) => void;
  selectedAccount: AccountSummary | null;
  selectedStationId: string; // 'ALL' or specific stationId
  setSelectedStationId: (id: string) => void;
  selectedPlant: PlantInfo | null;
  selectAccountAndPlant: (accountId: string, stationId?: string) => void;
  isFleetView: boolean;
  loading: boolean;
  syncing: boolean;
  isFetchingDeye: boolean;
  fetchingStage: string | null;
  lastSyncedAt: Date | null;
  setFetchingDeye: (fetching: boolean, stage?: string | null) => void;
  refreshAccounts: (forceSync?: boolean, showIndicator?: boolean) => Promise<void>;
  syncLivePlants: () => Promise<void>;
  totalAccounts: number;
  liveAccountsCount: number;
  directusStatus?: { connected: boolean; lastChecked: string; error?: string };
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { role, isConsumer, user } = useRole();
  const [rawAccounts, setRawAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [selectedStationId, setSelectedStationId] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [isFetchingDeye, setIsFetchingDeye] = useState<boolean>(false);
  const [fetchingStage, setFetchingStage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [directusStatus, setDirectusStatus] = useState<{ connected: boolean; lastChecked: string; error?: string } | undefined>(undefined);
  const fetchingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (fetchingTimeoutRef.current) clearTimeout(fetchingTimeoutRef.current);
    };
  }, []);

  const setFetchingDeye = useCallback((fetching: boolean, stage: string | null = null) => {
    setIsFetchingDeye(fetching);
    setFetchingStage(stage);
    if (!fetching) {
      setLastSyncedAt(new Date());
    }
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
        setRawAccounts(json.accounts || []);
        if (json.directus) {
          setDirectusStatus(json.directus);
        }
        setLastSyncedAt(new Date());
      }
    } catch (e) {
      log.error('Failed to load accounts', e);
    } finally {
      setLoading(false);
      if (showIndicator || forceSync) {
        if (fetchingTimeoutRef.current) clearTimeout(fetchingTimeoutRef.current);
        fetchingTimeoutRef.current = setTimeout(() => {
          setIsFetchingDeye(false);
          setFetchingStage(null);
        }, 800);
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

  useEffect(() => {
    // Initial load and sync of accounts and plants on page load/reload (with top panel indicator)
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    refreshAccounts(false, true);
  }, [refreshAccounts]);

  // If consumer role, strictly filter to their registered account only
  const accounts = useMemo(() => {
    if (isConsumer && user) {
      const userAccId = String(user.accountId || user.id || '').trim();
      const userEmail = (user.email || '').trim().toLowerCase();

      const matched = rawAccounts.filter((acc) => {
        const accId = String(acc.id || '');
        const accDirectusId = acc.directusId ? String(acc.directusId) : '';
        const accEmail = (acc.email || '').trim().toLowerCase();

        return (
          (userAccId && (accDirectusId === userAccId || accId === userAccId || accId === `directus-${userAccId}`)) ||
          (userEmail && accEmail === userEmail)
        );
      });

      return matched;
    }
    return rawAccounts;
  }, [rawAccounts, isConsumer, user]);

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
    return selectedAccount.plants?.find((p) => p.stationId === selectedStationId) || null;
  }, [selectedAccount, selectedStationId]);

  const handleSetSelectedAccountId = useCallback((id: string) => {
    if (isConsumer) {
      if (accounts.length > 0) {
        setSelectedAccountId(accounts[0].id);
      }
      setSelectedStationId('ALL');
      return;
    }
    const normalized = id === 'ALL_FLEET' ? 'ALL' : id;
    setSelectedAccountId(normalized);
    setSelectedStationId('ALL');
  }, [isConsumer, accounts]);

  const selectAccountAndPlant = useCallback((accountId: string, stationId: string = 'ALL') => {
    if (isConsumer && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
      setSelectedStationId(stationId);
      return;
    }
    const normalized = accountId === 'ALL_FLEET' ? 'ALL' : accountId;
    setSelectedAccountId(normalized);
    setSelectedStationId(stationId);
  }, [isConsumer, accounts]);

  // Fleet view is NEVER active for consumer accounts
  const isFleetView = !isConsumer && (selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET');
  const totalAccounts = accounts.length;
  const liveAccountsCount = useMemo(() => accounts.filter((a) => a.isLive).length, [accounts]);

  const contextValue = useMemo(() => ({
    accounts,
    selectedAccountId,
    setSelectedAccountId: handleSetSelectedAccountId,
    selectedAccount,
    selectedStationId,
    setSelectedStationId,
    selectedPlant,
    selectAccountAndPlant,
    isFleetView,
    loading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    lastSyncedAt,
    setFetchingDeye,
    refreshAccounts,
    syncLivePlants,
    totalAccounts,
    liveAccountsCount,
    directusStatus,
  }), [
    accounts,
    selectedAccountId,
    handleSetSelectedAccountId,
    selectedAccount,
    selectedStationId,
    selectedPlant,
    selectAccountAndPlant,
    isFleetView,
    loading,
    syncing,
    isFetchingDeye,
    fetchingStage,
    lastSyncedAt,
    setFetchingDeye,
    refreshAccounts,
    syncLivePlants,
    totalAccounts,
    liveAccountsCount,
    directusStatus,
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

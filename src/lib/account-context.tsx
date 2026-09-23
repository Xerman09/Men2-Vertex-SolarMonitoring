'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AccountSummary, PlantInfo } from './types';
import { useRole } from './role-context';

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
  refreshAccounts: (forceSync?: boolean) => Promise<void>;
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
  const [directusStatus, setDirectusStatus] = useState<{ connected: boolean; lastChecked: string; error?: string } | undefined>(undefined);

  const refreshAccounts = useCallback(async (forceSync: boolean = false) => {
    try {
      const url = forceSync ? '/api/deye/accounts?sync=true' : '/api/deye/accounts';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setRawAccounts(json.accounts || []);
        if (json.directus) {
          setDirectusStatus(json.directus);
        }
      }
    } catch (e) {
      console.error('[AccountContext] Failed to load accounts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncLivePlants = useCallback(async () => {
    setSyncing(true);
    try {
      await refreshAccounts(true);
    } finally {
      setSyncing(false);
    }
  }, [refreshAccounts]);

  useEffect(() => {
    refreshAccounts();
    const interval = setInterval(refreshAccounts, 10000);
    return () => clearInterval(interval);
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

  const selectedAccount =
    isConsumer
      ? (accounts.find((acc) => acc.id === selectedAccountId) || accounts[0] || null)
      : (selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET'
          ? null
          : accounts.find((acc) => acc.id === selectedAccountId) || null);

  // Find plant if specific station is chosen
  const selectedPlant =
    selectedAccount && selectedStationId !== 'ALL'
      ? selectedAccount.plants?.find((p) => p.stationId === selectedStationId) || null
      : null;

  const handleSetSelectedAccountId = (id: string) => {
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
  };

  const selectAccountAndPlant = (accountId: string, stationId: string = 'ALL') => {
    if (isConsumer && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
      setSelectedStationId(stationId);
      return;
    }
    const normalized = accountId === 'ALL_FLEET' ? 'ALL' : accountId;
    setSelectedAccountId(normalized);
    setSelectedStationId(stationId);
  };

  // Fleet view is NEVER active for consumer accounts
  const isFleetView = !isConsumer && (selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET');
  const totalAccounts = accounts.length;
  const liveAccountsCount = accounts.filter((a) => a.isLive).length;

  return (
    <AccountContext.Provider
      value={{
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
        refreshAccounts,
        syncLivePlants,
        totalAccounts,
        liveAccountsCount,
        directusStatus,
      }}
    >
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

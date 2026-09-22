'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AccountSummary, PlantInfo } from './types';

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
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [selectedStationId, setSelectedStationId] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);

  const refreshAccounts = useCallback(async (forceSync: boolean = false) => {
    try {
      const url = forceSync ? '/api/deye/accounts?sync=true' : '/api/deye/accounts';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setAccounts(json.accounts || []);
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

  const selectedAccount =
    selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET'
      ? null
      : accounts.find((acc) => acc.id === selectedAccountId) || null;

  // Find plant if specific station is chosen
  const selectedPlant =
    selectedAccount && selectedStationId !== 'ALL'
      ? selectedAccount.plants?.find((p) => p.stationId === selectedStationId) || null
      : null;

  const handleSetSelectedAccountId = (id: string) => {
    const normalized = id === 'ALL_FLEET' ? 'ALL' : id;
    setSelectedAccountId(normalized);
    setSelectedStationId('ALL');
  };

  const selectAccountAndPlant = (accountId: string, stationId: string = 'ALL') => {
    const normalized = accountId === 'ALL_FLEET' ? 'ALL' : accountId;
    setSelectedAccountId(normalized);
    setSelectedStationId(stationId);
  };

  const isFleetView = selectedAccountId === 'ALL' || selectedAccountId === 'ALL_FLEET';
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

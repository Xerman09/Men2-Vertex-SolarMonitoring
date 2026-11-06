'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  PlantTariffConfig,
  UtilityTariffSchedule,
  PHILIPPINE_UTILITY_PRESETS,
  DEFAULT_TARIFF_SCHEDULE,
  resolveActiveTariff,
} from './tariff-rates';
import { useAccount } from './account-context';

interface ActiveTariffInfo {
  schedule: UtilityTariffSchedule;
  isAutoDetected: boolean;
  isCustom: boolean;
  peakRate: number;
  offPeakRate: number;
  exportCredit: number;
  peakStartHour: number;
  peakEndHour: number;
}

interface TariffContextType {
  activeTariff: ActiveTariffInfo;
  tariffConfig: PlantTariffConfig;
  setPreset: (presetId: string) => void;
  setCustomRates: (custom: PlantTariffConfig['custom']) => void;
  resetToAuto: () => void;
  presets: UtilityTariffSchedule[];
  isConfigModalOpen: boolean;
  setIsConfigModalOpen: (open: boolean) => void;
}

const STORAGE_KEY_PREFIX = 'vosolar_tariff_config_';

const TariffContext = createContext<TariffContextType | undefined>(undefined);

export function TariffProvider({ children }: { children: React.ReactNode }) {
  const { selectedAccount, selectedPlant, isFleetView } = useAccount();

  // Storage key is scoped per plant or global fleet
  const storageKey = useMemo(() => {
    if (isFleetView || !selectedAccount) {
      return `${STORAGE_KEY_PREFIX}global`;
    }
    const stationId = selectedPlant?.stationId || 'default';
    return `${STORAGE_KEY_PREFIX}${selectedAccount.id}_${stationId}`;
  }, [isFleetView, selectedAccount, selectedPlant]);

  const [tariffConfig, setTariffConfig] = useState<PlantTariffConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) return JSON.parse(stored);
      } catch {
        // Fallback to auto
      }
    }
    return { presetId: 'auto' };
  });

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Sync config when storage key changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setTariffConfig(JSON.parse(stored));
      } else {
        setTariffConfig({ presetId: 'auto' });
      }
    } catch {
      setTariffConfig({ presetId: 'auto' });
    }
  }, [storageKey]);

  const saveConfig = useCallback((newConfig: PlantTariffConfig) => {
    setTariffConfig(newConfig);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newConfig));
      } catch (err) {
        console.warn('Failed to persist tariff configuration to localStorage', err);
      }
    }
  }, [storageKey]);

  const setPreset = useCallback((presetId: string) => {
    saveConfig({ ...tariffConfig, presetId });
  }, [tariffConfig, saveConfig]);

  const setCustomRates = useCallback((custom: PlantTariffConfig['custom']) => {
    saveConfig({ presetId: 'custom', custom });
  }, [saveConfig]);

  const resetToAuto = useCallback(() => {
    saveConfig({ presetId: 'auto' });
  }, [saveConfig]);

  const plantAddress = selectedPlant?.address || selectedAccount?.plants?.[0]?.address;
  const plantName = selectedPlant?.stationName || selectedAccount?.name;

  const activeTariff = useMemo(() => {
    return resolveActiveTariff({
      plantAddress,
      plantName,
      savedConfig: tariffConfig,
    });
  }, [plantAddress, plantName, tariffConfig]);

  const contextValue = useMemo(() => ({
    activeTariff,
    tariffConfig,
    setPreset,
    setCustomRates,
    resetToAuto,
    presets: PHILIPPINE_UTILITY_PRESETS,
    isConfigModalOpen,
    setIsConfigModalOpen,
  }), [
    activeTariff,
    tariffConfig,
    setPreset,
    setCustomRates,
    resetToAuto,
    isConfigModalOpen,
  ]);

  return (
    <TariffContext.Provider value={contextValue}>
      {children}
    </TariffContext.Provider>
  );
}

export function useTariff() {
  const context = useContext(TariffContext);
  if (!context) {
    throw new Error('useTariff must be used within a TariffProvider');
  }
  return context;
}


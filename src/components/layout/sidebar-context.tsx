'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleMobileOpen: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const pathname = usePathname();

  // Automatically close mobile drawer when navigating between routes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const toggleMobileOpen = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const contextValue = useMemo<SidebarContextType>(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      toggleMobileOpen,
      closeMobile,
    }),
    [collapsed, toggleCollapsed, mobileOpen, toggleMobileOpen, closeMobile]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return ctx;
}

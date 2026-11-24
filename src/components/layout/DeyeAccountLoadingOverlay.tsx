'use client';

import React from 'react';
import { useAccount } from '@/lib/account-context';
import { Zap, Globe } from 'lucide-react';

export function DeyeAccountLoadingOverlay() {
  const {
    isFetchingDeye,
    fetchingStage,
    syncing,
    accounts,
    totalAccounts,
    selectedAccount,
    isFleetView,
  } = useAccount();

  if (!isFetchingDeye && !syncing) {
    return null;
  }

  const accountCount = totalAccounts || accounts.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fetching DeyeCloud Accounts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md transition-all duration-300 animate-in fade-in"
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card/95 border border-primary/30 shadow-2xl max-w-md w-full mx-4 text-center animate-in zoom-in-95 duration-200">
        {/* Dual Ring Spinner with Glowing Icon */}
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div
            className="absolute w-9 h-9 rounded-full border-2 border-amber-500/20 border-b-amber-500 animate-spin"
            style={{ animationDirection: 'reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-primary">
            {isFleetView ? (
              <Globe className="w-5 h-5 text-primary animate-pulse" />
            ) : (
              <Zap className="w-5 h-5 text-amber-500 animate-pulse" />
            )}
          </div>
        </div>

        {/* Stage and Progress Label */}
        <div className="space-y-1.5">
          <h3 className="text-base sm:text-lg font-bold text-foreground font-headline tracking-wide">
            {fetchingStage || 'Fetching DeyeCloud Accounts'}
          </h3>
          <p className="text-xs text-muted-foreground font-mono">
            Connecting to DeyeCloud API gateway & Directus to discover registered stations & inverters...
          </p>
        </div>

        {/* Shimmering Gradient Progress Bar */}
        <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 h-full w-full animate-pulse" />
        </div>

        {/* Bottom Metadata Footnote */}
        <div className="flex items-center justify-between w-full text-[11px] font-mono text-muted-foreground border-t border-border/40 pt-3">
          <span>
            {isFleetView
              ? `${accountCount} Accounts Monitored`
              : selectedAccount?.name || `${accountCount} Accounts Available`}
          </span>
          <span className="font-semibold text-primary">Connecting to Gateway...</span>
        </div>
      </div>
    </div>
  );
}

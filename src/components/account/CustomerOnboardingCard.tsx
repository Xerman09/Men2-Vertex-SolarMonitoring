'use client';

import React from 'react';
import {
  Sun,
  Zap,
  Radio,
  Building2,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRole } from '@/lib/role-context';

interface CustomerOnboardingCardProps {
  className?: string;
}

export function CustomerOnboardingCard({ className = '' }: CustomerOnboardingCardProps) {
  const { user, setShowConnectModal } = useRole();

  return (
    <div
      className={`w-full rounded-2xl border border-amber-500/30 bg-gradient-to-br from-card via-amber-500/5 to-card p-6 sm:p-8 relative overflow-hidden shadow-xl ${className}`}
    >
      {/* Background Solar Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30">
            <Radio size={13} className="animate-pulse" />
            <span>Customer Setup Required</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-headline">
            Welcome, {user?.name || 'Solar Operator'}! Link Your DeyeCloud Account
          </h2>

          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Your customer portal account is ready, but no solar stations are connected yet.
            Connect your personal DeyeCloud Developer API credentials to auto-discover your solar plants,
            inverters, and batteries.
          </p>

          {/* Quick Feature Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Sun size={12} />
              </div>
              <span>Live Inverter Telemetry</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <ShieldCheck size={12} />
              </div>
              <span>Isolated Data Boundary</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
                <Zap size={12} />
              </div>
              <span>Zero-Config Discovery</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 w-full md:w-auto">
          <Button
            onClick={() => setShowConnectModal(true)}
            className="w-full md:w-auto px-6 py-5 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <Radio size={16} />
            <span>Connect DeyeCloud</span>
            <ArrowRight size={14} />
          </Button>
          <span className="block text-[10px] text-muted-foreground font-mono text-center mt-2">
            Requires Deye OpenAPI App ID &amp; Secret
          </span>
        </div>
      </div>
    </div>
  );
}

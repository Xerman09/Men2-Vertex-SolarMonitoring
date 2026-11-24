'use client';

import React from 'react';
import {
  Radio,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoverInfo } from '@/components/ui/tooltip';
import { useRole } from '@/lib/role-context';

interface CustomerOnboardingCardProps {
  className?: string;
}

export function CustomerOnboardingCard({ className = '' }: CustomerOnboardingCardProps) {
  const { user, setShowConnectModal } = useRole();

  return (
    <div
      className={`w-full rounded-2xl border border-amber-500/30 bg-gradient-to-br from-card via-amber-500/5 to-card p-6 sm:p-7 relative overflow-hidden shadow-xl ${className}`}
    >
      {/* Background Solar Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-headline">
          <HoverInfo
            title="DeyeCloud Onboarding"
            side="bottom"
            align="start"
            content="No solar stations are connected yet. Connect your personal DeyeCloud OpenAPI App ID & Secret to auto-discover live plants, inverters, and isolated batteries."
          >
            <span>Welcome, {user?.name || 'Solar Operator'}! Link Your DeyeCloud Account</span>
          </HoverInfo>
        </h2>

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
        </div>
      </div>
    </div>
  );
}

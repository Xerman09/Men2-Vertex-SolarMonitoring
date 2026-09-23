'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  Sliders,
  TrendingUp,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sun,
  BatteryCharging,
  Radio,
  Building2,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Badge } from '@/components/ui/badge';
import { useSidebar } from './sidebar-context';

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, closeMobile } = useSidebar();
  const { totalAccounts, liveAccountsCount, isFleetView } = useAccount();
  const { isAdmin, isViewer } = useRole();

  const navItems = [
    {
      label: 'Energy Flow & Fleet',
      href: '/',
      icon: Zap,
      badge: 'Live Hub',
      badgeVariant: 'solar' as const,
    },
    {
      label: isAdmin ? 'Accounts & Plants' : 'Fleet Directory',
      href: '/accounts',
      icon: Building2,
      badge: `${totalAccounts}`,
      badgeVariant: 'outline' as const,
    },
    {
      label: 'Hardware Telemetry',
      href: '/hardware-telemetry',
      icon: Sliders,
      badge: 'MPPT / AC',
      badgeVariant: 'outline' as const,
    },
    {
      label: 'Yield & Arbitrage',
      href: '/yield-arbitrage',
      icon: TrendingUp,
      badge: 'Tariff',
      badgeVariant: 'outline' as const,
    },
    {
      label: 'Trigonometric Analytics',
      href: '/trigonometric-analytics',
      icon: Activity,
      badge: 'Fourier/Phase',
      badgeVariant: 'battery' as const,
    },
    {
      label: 'API & Diagnostics',
      href: '/api-diagnostics',
      icon: ShieldCheck,
      badge: isAdmin ? 'Live' : 'View Only',
      badgeVariant: 'outline' as const,
    },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden animate-in fade-in-50"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full bg-sidebar text-sidebar-foreground z-50 flex flex-col justify-between border-r border-sidebar-border shadow-sm transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-72'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-sidebar-border/70 bg-sidebar/50">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Sun size={18} className="animate-spin-slow" />
              </div>
              {!collapsed && (
                <div className="flex flex-col leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="font-headline font-bold text-sm tracking-wider uppercase">
                      Deye<span className="text-primary">Solar</span>
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                      VOS
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Multi-Account Fleet
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  closeMobile();
                } else {
                  setCollapsed(!collapsed);
                }
              }}
              aria-label="Toggle navigation"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          {/* Section Title */}
          {!collapsed && (
            <div className="px-5 pt-4 pb-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono">
                Command Consoles
              </span>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1 px-3 pt-1">
            {navItems.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }`}
                >
                  <Icon
                    size={17}
                    className={`shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    }`}
                  />
                  {!collapsed && (
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Fleet Matrix Card (Visible when expanded) */}
        {!collapsed ? (
          <div className="p-3.5 m-3 rounded-2xl bg-card/60 border border-sidebar-border shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Radio size={12} className="text-emerald-500 animate-pulse" /> Edge Bus Sync
              </span>
              <span className="text-[10px] font-mono text-emerald-500 font-bold">
                {liveAccountsCount > 0 ? `${liveAccountsCount}/${totalAccounts} Live` : 'Local Sim'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/40 p-2 rounded-xl border border-border/40">
                <span className="text-[10px] text-muted-foreground block mb-0.5">
                  Topology
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {totalAccounts}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Accounts</span>
                </div>
              </div>
              <div className="bg-muted/40 p-2 rounded-xl border border-border/40">
                <span className="text-[10px] text-muted-foreground block mb-0.5">
                  Analytics
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-sm font-bold text-cyan-500">
                    Trig Fit
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 flex flex-col items-center gap-2 pb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
        )}
      </aside>

      {/* Spacer to offset fixed sidebar */}
      <div
        className={`hidden md:block shrink-0 transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-72'
        }`}
      />
    </>
  );
}

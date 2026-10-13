'use client';

import React, { useState, useEffect } from 'react';
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
  LayoutGrid,
  BarChart3,
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

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, closeMobile]);

  const navItems: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: string;
  }> = [
    {
      label: 'Analytics Dashboard',
      href: '/analytics',
      icon: BarChart3,
    },
    {
      label: 'Energy Flow & Fleet',
      href: '/',
      icon: Zap,
    },
    {
      label: isAdmin ? 'Accounts & Plants' : 'Fleet Directory',
      href: '/accounts',
      icon: Building2,
    },
    {
      label: 'Hardware Telemetry',
      href: '/hardware-telemetry',
      icon: Sliders,
    },
    {
      label: 'Yield & Arbitrage',
      href: '/yield-arbitrage',
      icon: TrendingUp,
    },
    {
      label: 'Trigonometric Analytics',
      href: '/trigonometric-analytics',
      icon: Activity,
    },
    {
      label: 'API & Diagnostics',
      href: '/api-diagnostics',
      icon: ShieldCheck,
    },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop (only when expanded on small screens) */}
      {mobileOpen && (
        <button
          type="button"
          onClick={closeMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden animate-in fade-in-50 cursor-default"
          aria-label="Close navigation sidebar overlay"
        />
      )}

      <aside
        role="navigation"
        aria-label="Navigation sidebar"
        className={`fixed left-0 top-0 h-full bg-sidebar text-sidebar-foreground z-50 flex flex-col justify-between border-r border-sidebar-border shadow-sm transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-72'
        } ${mobileOpen ? 'translate-x-0 !w-72' : 'translate-x-0'}`}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div
            className={`h-16 flex items-center border-b border-sidebar-border/70 bg-sidebar/50 transition-all ${
              collapsed && !mobileOpen ? 'justify-center px-2' : 'justify-between px-4'
            }`}
          >
            {collapsed && !mobileOpen ? (
              /* When closed/collapsed, clicking the top Sun icon opens the sidebar */
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 hover:bg-amber-500/20 hover:scale-105 active:scale-95 transition-all shadow-2xs cursor-pointer group"
                title="Click to open sidebar"
                aria-label="Open sidebar"
              >
                <Sun size={20} className="animate-spin-slow group-hover:rotate-45 transition-transform" />
              </button>
            ) : (
              <div className="flex items-center justify-between w-full">
                <Link
                  href="/analytics"
                  className="flex items-center gap-2.5 overflow-hidden group select-none"
                  title="VOSolar Telemetry"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                    <Sun size={20} className="animate-spin-slow" />
                  </div>
                  <div className="flex flex-col leading-tight animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5">
                      <span className="font-headline font-bold text-sm tracking-wider uppercase">
                        VO<span className="text-primary">Solar</span>
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-mono font-bold"
                      >
                        VOS
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Multi-Account Fleet
                    </span>
                  </div>
                </Link>

                <button
                  onClick={() => {
                    if (mobileOpen) {
                      closeMobile();
                    } else {
                      setCollapsed(true);
                    }
                  }}
                  aria-label="Collapse sidebar to icon rail"
                  title="Collapse sidebar"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            )}
          </div>



          {/* Navigation Items (Always visible with icons) */}
          <nav
            className={`flex flex-col gap-1.5 pt-2 ${
              collapsed && !mobileOpen ? 'px-2 items-center' : 'px-3'
            }`}
          >
            {navItems.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              const isIconOnly = collapsed && !mobileOpen;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (mobileOpen) closeMobile();
                  }}
                  className={`relative flex items-center rounded-xl text-xs font-semibold transition-all group select-none ${
                    isIconOnly
                      ? 'w-11 h-11 justify-center'
                      : 'gap-3 px-3 py-2.5 w-full'
                  } ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }`}
                  aria-label={item.label}
                >
                  <Icon
                    size={18}
                    className={`shrink-0 transition-transform group-hover:scale-110 ${
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    }`}
                  />

                  {!isIconOnly ? (
                    <div className="flex items-center justify-between w-full min-w-0">
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono shrink-0 ml-1.5 ${
                            isActive
                              ? 'bg-white/20 text-white font-bold'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  ) : (
                    /* Floating Tooltip in compact icon rail mode */
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-popover text-popover-foreground text-xs font-semibold rounded-xl shadow-xl border border-border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 flex items-center gap-2">
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary font-mono font-bold">
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

        {/* Footer Section */}
        {!collapsed || mobileOpen ? (
          <div className="p-3.5 m-3 rounded-2xl bg-card/70 border border-sidebar-border shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Radio size={12} className="text-emerald-500 motion-safe:animate-pulse" /> Edge Bus Sync
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
          /* Subtle Status Indicator in Compact Icon Rail (Expand button removed) */
          <div className="p-3 flex flex-col items-center justify-center pb-4">
            <div
              className="w-2.5 h-2.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"
              title="Edge Bus Online"
            />
          </div>
        )}
      </aside>

      {/* Spacer to offset fixed sidebar so content is never covered */}
      <div
        className={`shrink-0 transition-all duration-300 ${
          collapsed && !mobileOpen ? 'w-[72px]' : 'w-72'
        }`}
      />
    </>
  );
}

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
  Sun,
  Building2,
  Activity,
  LayoutGrid,
  BarChart3,
  X,
} from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Badge } from '@/components/ui/badge';
import { useSidebar } from './sidebar-context';

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, closeMobile } = useSidebar();
  const { totalAccounts } = useAccount();
  const { isAdmin } = useRole();

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
      label: 'Fleet Monitoring',
      href: '/fleet',
      icon: LayoutGrid,
      badge: totalAccounts > 1 ? `${totalAccounts} Acc` : undefined,
    },
    {
      label: 'Analytics Dashboard',
      href: '/analytics',
      icon: BarChart3,
    },
    {
      label: 'Energy Flow & Fleet',
      href: '/energy-flow',
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
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden animate-in fade-in-50 cursor-default"
          aria-label="Close navigation sidebar overlay"
        />
      )}

      <aside
        role="navigation"
        aria-label="Navigation sidebar"
        className={`fixed left-0 top-0 h-full bg-sidebar text-sidebar-foreground z-50 flex flex-col justify-between border-r border-sidebar-border shadow-sm transition-[width,transform] duration-300 ease-in-out will-change-[width,transform] ${
          collapsed ? 'lg:w-[72px]' : 'lg:w-72'
        } ${
          mobileOpen
            ? 'translate-x-0 w-72 shadow-2xl'
            : '-translate-x-full lg:translate-x-0 w-72'
        }`}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="h-16 flex items-center justify-between px-3.5 border-b border-sidebar-border/70 bg-sidebar/50 overflow-hidden shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (collapsed && !mobileOpen) {
                    setCollapsed(false);
                  }
                }}
                className={`w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 transition-all duration-200 shadow-2xs group ${
                  collapsed && !mobileOpen
                    ? 'hover:bg-amber-500/20 hover:scale-105 active:scale-95 cursor-pointer'
                    : 'cursor-default'
                }`}
                title={collapsed && !mobileOpen ? 'Click to open sidebar' : 'VOSolar Telemetry'}
                aria-label={collapsed && !mobileOpen ? 'Open sidebar' : 'VOSolar Telemetry'}
              >
                <Sun size={20} className="animate-spin-slow group-hover:rotate-45 transition-transform" />
              </button>

              <Link
                href="/fleet"
                onClick={() => {
                  if (mobileOpen) closeMobile();
                }}
                className={`flex flex-col leading-tight whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out select-none ${
                  collapsed && !mobileOpen
                    ? 'max-w-0 opacity-0 -translate-x-3 pointer-events-none'
                    : 'max-w-[150px] opacity-100 translate-x-0'
                }`}
                title="VOSolar Telemetry"
              >
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
              </Link>
            </div>

            <button
              type="button"
              onClick={() => {
                if (mobileOpen) {
                  closeMobile();
                } else {
                  setCollapsed(true);
                }
              }}
              aria-label={mobileOpen ? 'Close navigation drawer' : 'Collapse sidebar to icon rail'}
              title={mobileOpen ? 'Close navigation drawer' : 'Collapse sidebar'}
              className={`p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-300 ease-in-out shrink-0 cursor-pointer ${
                collapsed && !mobileOpen
                  ? 'max-w-0 opacity-0 -translate-x-2 pointer-events-none p-0 overflow-hidden'
                  : 'max-w-8 opacity-100 translate-x-0'
              }`}
            >
              {mobileOpen ? <X size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          {/* Navigation Items (Always visible with icons) */}
          <nav className="flex flex-col gap-1.5 pt-2 px-3">
            {navItems.map((item) => {
              const isActive =
                item.href === '/fleet'
                  ? pathname === '/' || pathname.startsWith('/fleet')
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              const isCollapsedMode = collapsed && !mobileOpen;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (mobileOpen) closeMobile();
                  }}
                  className={`relative flex items-center rounded-xl text-xs font-semibold select-none h-11 px-2.5 transition-colors duration-200 group overflow-visible ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }`}
                  aria-label={item.label}
                >
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                    <Icon
                      size={18}
                      className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        isActive
                          ? 'text-primary-foreground'
                          : 'text-muted-foreground group-hover:text-foreground'
                      }`}
                    />
                  </div>

                  <div
                    className={`flex items-center justify-between min-w-0 ml-3 whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                      isCollapsedMode
                        ? 'max-w-0 opacity-0 -translate-x-3 pointer-events-none'
                        : 'max-w-[190px] opacity-100 translate-x-0 flex-1'
                    }`}
                  >
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

                  {/* Floating Tooltip in compact icon rail mode */}
                  {isCollapsedMode && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-popover text-popover-foreground text-xs font-semibold rounded-xl shadow-xl border border-border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50 flex items-center gap-2">
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

        {/* Bottom Expand/Collapse Toggle in Icon Rail & Expanded Mode */}
        <div className="p-3 border-t border-sidebar-border/40 flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex items-center rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors duration-200 cursor-pointer select-none ${
              collapsed && !mobileOpen
                ? 'w-10 h-10 justify-center'
                : 'w-full gap-3 px-2.5 py-2'
            }`}
          >
            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
              <ChevronLeft
                size={16}
                className={`transition-transform duration-300 ease-in-out ${
                  collapsed && !mobileOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
            <div
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                collapsed && !mobileOpen
                  ? 'max-w-0 opacity-0 -translate-x-3 pointer-events-none'
                  : 'max-w-[150px] opacity-100 translate-x-0'
              }`}
            >
              <span>Collapse Sidebar</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Spacer to offset fixed sidebar on desktop so content is never covered */}
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-in-out will-change-[width] ${
          collapsed ? 'w-[72px]' : 'w-72'
        }`}
      />
    </>
  );
}

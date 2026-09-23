'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useRole } from '@/lib/role-context';
import { Zap } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isInitialized } = useRole();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!isInitialized) return;

    if (!user && !isLoginPage) {
      router.replace('/login');
    } else if (user && isLoginPage) {
      router.replace('/');
    }
  }, [user, isLoginPage, isInitialized, router]);

  // If on login page, render full screen without app chrome
  if (isLoginPage) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  // If not yet initialized or redirecting unauthenticated user, show a smooth branded loader
  if (!isInitialized || !user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm animate-pulse">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/5">
            <Zap size={28} className="animate-bounce" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Solar Telemetry Portal</h2>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Verifying credentials & session...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <Header />
        <main className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1680px] mx-auto flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

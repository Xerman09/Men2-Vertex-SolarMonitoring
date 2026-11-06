import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { AccountProvider } from '@/lib/account-context';
import { TariffProvider } from '@/lib/tariff-context';
import { TariffSettingsModal } from '@/components/tariff/TariffSettingsModal';
import ThemeProvider from '@/components/theme/ThemeProvider';

import { SidebarProvider } from '@/components/layout/sidebar-context';
import { RoleProvider } from '@/lib/role-context';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: 'VOSolar Operations | Multi-Account Mission Control',
  description: 'Enterprise VOSolar Inverter Telemetry, Multi-Account Fleet Synoptics, Arbitrage Management, and Harmonic Analytics',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VOSolar',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-foreground font-sans antialiased min-h-screen selection:bg-primary/20 selection:text-primary">
        <ThemeProvider>
          <RoleProvider>
            <AccountProvider>
              <TariffProvider>
                <SidebarProvider>
                  <AppShell>{children}</AppShell>
                  <TariffSettingsModal />
                </SidebarProvider>
              </TariffProvider>
            </AccountProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

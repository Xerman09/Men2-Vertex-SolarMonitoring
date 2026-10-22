import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../sidebar';
import * as roleContextModule from '@/lib/role-context';
import * as accountContextModule from '@/lib/account-context';
import * as sidebarContextModule from '../sidebar-context';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('Sidebar Navigation & Role Visibility', () => {
  beforeEach(() => {
    vi.spyOn(sidebarContextModule, 'useSidebar').mockReturnValue({
      collapsed: false,
      setCollapsed: vi.fn(),
      toggleCollapsed: vi.fn(),
      mobileOpen: false,
      setMobileOpen: vi.fn(),
      closeMobile: vi.fn(),
      toggleMobileOpen: vi.fn(),
    });

    vi.spyOn(accountContextModule, 'useAccount').mockReturnValue({
      totalAccounts: 2,
      liveAccountsCount: 2,
      isFleetView: true,
    } as any);
  });

  it('renders Fleet Monitoring at the top of the sidebar for admin', () => {
    vi.spyOn(roleContextModule, 'useRole').mockReturnValue({
      role: 'admin',
      isAdmin: true,
      isConsumer: false,
      isViewer: false,
      isInitialized: true,
      user: { email: 'admin@vosolar.com', role: 'admin' },
      adminUser: { email: 'admin@vosolar.com', role: 'admin' },
    } as any);

    const html = renderToStaticMarkup(<Sidebar />);

    // Fleet Monitoring must be present
    expect(html).toContain('Fleet Monitoring');
    expect(html).toContain('href="/fleet"');

    // Fleet Monitoring must appear BEFORE Analytics Dashboard in the DOM
    const fleetIdx = html.indexOf('Fleet Monitoring');
    const analyticsIdx = html.indexOf('Analytics Dashboard');
    expect(fleetIdx).toBeGreaterThan(-1);
    expect(analyticsIdx).toBeGreaterThan(-1);
    expect(fleetIdx).toBeLessThan(analyticsIdx);

    // Brand logo should link to /fleet as default for admin
    expect(html).toContain('href="/fleet"');
  });

  it('renders Fleet Monitoring at the top of the sidebar for non-admin users as well', () => {
    vi.spyOn(roleContextModule, 'useRole').mockReturnValue({
      role: 'consumer',
      isAdmin: false,
      isConsumer: true,
      isViewer: false,
      isInitialized: true,
      user: { email: 'client@example.com', role: 'consumer' },
      adminUser: null,
    } as any);

    const html = renderToStaticMarkup(<Sidebar />);

    // Fleet Monitoring must be visible
    expect(html).toContain('Fleet Monitoring');
    expect(html).toContain('href="/fleet"');

    // Fleet Monitoring must appear BEFORE Analytics Dashboard in the DOM
    const fleetIdx = html.indexOf('Fleet Monitoring');
    const analyticsIdx = html.indexOf('Analytics Dashboard');
    expect(fleetIdx).toBeGreaterThan(-1);
    expect(analyticsIdx).toBeGreaterThan(-1);
    expect(fleetIdx).toBeLessThan(analyticsIdx);

    // Brand logo should link to /fleet
    expect(html).toContain('href="/fleet"');
  });
});

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTvSlides, filterTvAuthorizedAccounts } from '../types';
import { TvSlideDeck } from '../components/TvSlideDeck';
import { TvHudBar } from '../components/TvHudBar';
import type { AccountSummary, FleetMatrixNode } from '@/lib/types';

function makeMultiTenantFixture(): {
  accounts: AccountSummary[];
  nodes: FleetMatrixNode[];
} {
  const accounts: AccountSummary[] = [
    {
      id: 'acc-hanvin',
      directusId: '1',
      name: 'Hanvin Solar',
      email: 'hanvin@solar.local',
      isLive: true,
      stationCount: 1,
      deviceCount: 2,
      inverterCount: 1,
      loggerCount: 1,
      liveSolarPowerKw: 48.5,
      dailyYieldKwh: 210,
      gridPowerKw: -14.2,
      consumptionPowerKw: 62.7,
      capacityKw: 100,
      status: 'ONLINE',
      lastPingMs: 12,
      plants: [
        {
          stationId: 'st-101',
          stationName: 'Dagupan Main',
          installedCapacityKw: 100,
          liveSolarPowerKw: 48.5,
          dailyYieldKwh: 210,
          gridPowerKw: -14.2,
          consumptionPowerKw: 62.7,
          devices: [
            {
              deviceSn: 'INV-101',
              deviceType: 'INVERTER',
              name: 'Inv 101',
              model: 'SUN-100K',
              ratedKw: 100,
              status: 'ONLINE',
            },
          ],
        },
      ],
    },
    {
      id: 'acc-tenant-b',
      directusId: '2',
      name: 'Tenant Beta',
      email: 'beta@solar.local',
      isLive: true,
      stationCount: 1,
      deviceCount: 1,
      inverterCount: 1,
      loggerCount: 0,
      liveSolarPowerKw: 25,
      dailyYieldKwh: 95,
      capacityKw: 50,
      status: 'ONLINE',
      lastPingMs: 20,
      plants: [
        {
          stationId: 'st-202',
          stationName: 'Beta Plant',
          installedCapacityKw: 50,
          liveSolarPowerKw: 25,
          dailyYieldKwh: 95,
          devices: [
            {
              deviceSn: 'INV-202',
              deviceType: 'INVERTER',
              name: 'Inv 202',
              model: 'SUN-50K',
              ratedKw: 50,
              status: 'FAULT',
            },
          ],
        },
      ],
    },
    {
      id: 'acc-demo',
      name: 'Demo Fleet',
      isDemo: true,
      isLive: true,
      stationCount: 1,
      deviceCount: 0,
      inverterCount: 0,
      loggerCount: 0,
      liveSolarPowerKw: 10,
      dailyYieldKwh: 30,
      capacityKw: 20,
      status: 'ONLINE',
      lastPingMs: 5,
      plants: [],
    },
  ];

  const nodes: FleetMatrixNode[] = [
    {
      accountId: 'acc-hanvin',
      accountName: 'Hanvin Solar',
      stationId: 'st-101',
      stationName: 'Dagupan Main',
      deviceSn: 'INV-101',
      deviceType: 'INVERTER',
      model: 'SUN-100K',
      ratedKw: 100,
      liveSolarPowerKw: 48.5,
      dailyYieldKwh: 210,
      gridPowerKw: -14.2,
      consumptionPowerKw: 62.7,
      batterySoc: 0,
      mode: 'GRID',
      status: 'ONLINE',
      loggerStatus: 'ONLINE',
      isLive: true,
    },
    {
      accountId: 'acc-tenant-b',
      accountName: 'Tenant Beta',
      stationId: 'st-202',
      stationName: 'Beta Plant',
      deviceSn: 'INV-202',
      deviceType: 'INVERTER',
      model: 'SUN-50K',
      ratedKw: 50,
      liveSolarPowerKw: 25,
      dailyYieldKwh: 95,
      gridPowerKw: 0,
      consumptionPowerKw: 0,
      batterySoc: 0,
      mode: 'FAULT',
      status: 'FAULT',
      loggerStatus: 'OFFLINE',
      isLive: true,
    },
  ];

  return { accounts, nodes };
}

describe('TV Slideshow Mode View Model, Isolation & UI', () => {
  it('builds triage slide only when faults or offline assets exist and orders priority station first', () => {
    const { accounts, nodes } = makeMultiTenantFixture();

    // Consumer scoped strictly to healthy acc-hanvin: zero faults => no triage slide
    const healthySlides = buildTvSlides([accounts[0]], nodes, { isConsumer: true });
    expect(healthySlides.map((s) => s.kind)).toEqual(['overview', 'financial']);

    // Admin with both accounts sees overview, 2 accounts, dynamic triage (with INV-202 fault), and financial
    const adminSlides = buildTvSlides(accounts.slice(0, 2), nodes, {
      priorityStationId: 'st-202',
    });
    expect(adminSlides.map((s) => s.kind)).toEqual([
      'overview',
      'account',
      'account',
      'triage',
      'financial',
    ]);
    const triage = adminSlides.find((s) => s.kind === 'triage');
    expect(triage?.kind).toBe('triage');
    if (triage && triage.kind === 'triage') {
      expect(triage.totalFaults).toBe(1);
      expect(triage.entries[0].stationId).toBe('st-202');
    }
  });

  it('strictly isolates consumer TV slides to authorized account and hides demo accounts', () => {
    const { accounts } = makeMultiTenantFixture();

    const consumerScoped = filterTvAuthorizedAccounts(accounts, {
      isAdmin: false,
      isConsumer: true,
      user: {
        id: 'u-1',
        email: 'hanvin@solar.local',
        role: 'consumer',
        accountId: 'acc-hanvin',
      },
    });
    expect(consumerScoped.map((a) => a.id)).toEqual(['acc-hanvin']);

    // Unassigned consumer never leaks another tenant's fleet
    const mismatched = filterTvAuthorizedAccounts(accounts, {
      isAdmin: false,
      isConsumer: true,
      user: {
        id: 'u-other',
        email: 'other@solar.local',
        role: 'consumer',
        accountId: 'acc-unknown',
      },
    });
    expect(mismatched).toEqual([]);
  });

  it('renders signed grid import, PHP currency, and accessible HUD without aria-pressed conflict', () => {
    const { accounts, nodes } = makeMultiTenantFixture();
    const slides = buildTvSlides([accounts[0]], nodes, { isConsumer: true });

    const slideHtml = renderToStaticMarkup(
      React.createElement(TvSlideDeck, {
        slide: slides[0],
        slideIndex: 0,
        totalSlides: slides.length,
        direction: 'backward',
        tariffRatePhp: 13.9,
        tariffLabel: 'DECORP',
        weeklySeries: null,
      })
    );
    expect(slideHtml).toContain('-14.2');
    expect(slideHtml).toContain('₱');
    expect(slideHtml).toContain('aria-roledescription="slide"');
    expect(slideHtml).toContain('data-direction="backward"');

    const hudHtml = renderToStaticMarkup(
      React.createElement(TvHudBar, {
        slides,
        activeIndex: 0,
        paused: false,
        intervalSec: 30,
        progressRatio: 0.5,
        hudVisible: true,
        isFullscreen: false,
        isStale: false,
        manilaClock: '14:25 PHT',
        headline: 'Hanvin Solar 48.5 kW live',
        severity: 'normal',
        onPrev: () => {},
        onNext: () => {},
        onSelectSlide: () => {},
        onTogglePause: () => {},
        onChangeInterval: () => {},
        onToggleFullscreen: () => {},
      })
    );
    expect(hudHtml).toContain('Pause slideshow');
    expect(hudHtml).not.toContain('aria-pressed');
    expect(hudHtml).toContain('aria-current="true"');
  });
});

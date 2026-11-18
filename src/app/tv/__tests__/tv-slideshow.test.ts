import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildTvSlides,
  computeTvWeeklyProfitSummary,
  filterTvAuthorizedAccounts,
  getSlideTickerCommentary,
  getTvScopeKey,
} from '../types';
import { TvSlideDeck } from '../components/TvSlideDeck';
import { DEFAULT_TV_INTERVAL_SEC, TvHudBar } from '../components/TvHudBar';
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
      stationCount: 2,
      deviceCount: 3,
      inverterCount: 2,
      loggerCount: 1,
      liveSolarPowerKw: 68.5,
      dailyYieldKwh: 302,
      gridPowerKw: -14.2,
      consumptionPowerKw: 82.7,
      capacityKw: 150,
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
        {
          stationId: 'st-102',
          stationName: 'Hanvin Branch',
          installedCapacityKw: 50,
          liveSolarPowerKw: 20,
          dailyYieldKwh: 92,
          gridPowerKw: 0,
          consumptionPowerKw: 20,
          devices: [
            {
              deviceSn: 'INV-102',
              deviceType: 'INVERTER',
              name: 'Inv 102',
              model: 'SUN-50K',
              ratedKw: 50,
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
      accountId: 'acc-hanvin',
      accountName: 'Hanvin Solar',
      stationId: 'st-102',
      stationName: 'Hanvin Branch',
      deviceSn: 'INV-102',
      deviceType: 'INVERTER',
      model: 'SUN-50K',
      ratedKw: 50,
      liveSolarPowerKw: 20,
      dailyYieldKwh: 92,
      gridPowerKw: 0,
      consumptionPowerKw: 20,
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
  it('builds separated per-account and per-station analytics dynamically across all accounts', () => {
    const { accounts, nodes } = makeMultiTenantFixture();

    // Consumer scoped to healthy multi-station acc-hanvin:
    // separated Account curve + Account Stations grid + Account 7D + per-station curves & 7D, zero triage
    const consumerSlides = buildTvSlides([accounts[0]], nodes, { isConsumer: true });
    expect(consumerSlides.map((s) => s.kind)).toEqual([
      'account',
      'account-stations',
      'financial',
      'station',
      'financial',
      'station',
      'financial',
    ]);
    expect(consumerSlides.map((s) => getTvScopeKey(s.scope))).toEqual([
      'ACC:acc-hanvin',
      'ACC:acc-hanvin',
      'ACC:acc-hanvin',
      'STA:acc-hanvin:st-101',
      'STA:acc-hanvin:st-101',
      'STA:acc-hanvin:st-102',
      'STA:acc-hanvin:st-102',
    ]);

    // Admin sees Per Accounts -> Per Stations -> Consolidated Fleet Summary -> Triage
    const adminSlides = buildTvSlides(accounts.slice(0, 2), nodes, {
      priorityStationId: 'st-202',
    });
    expect(adminSlides.map((s) => s.kind)).toEqual([
      'account',
      'account-stations',
      'financial',
      'account',
      'financial',
      'station',
      'financial',
      'station',
      'financial',
      'station',
      'financial',
      'overview',
      'curve',
      'financial',
      'triage',
    ]);

    const triage = adminSlides.find((s) => s.kind === 'triage');
    expect(triage?.kind).toBe('triage');
    if (triage && triage.kind === 'triage') {
      expect(triage.totalFaults).toBe(1);
      expect(triage.entries[0].stationId).toBe('st-202');
    }

    // Pinning to a single station isolates only that station's separated live + 7D + triage slides
    const singleStationSlides = buildTvSlides(accounts.slice(0, 2), nodes, {
      filterAccountId: 'acc-hanvin',
      filterStationId: 'st-101',
    });
    expect(singleStationSlides.map((s) => s.kind)).toEqual(['station', 'financial']);
    expect(singleStationSlides[1].scope).toEqual({
      accountId: 'acc-hanvin',
      stationId: 'st-101',
    });
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

  it('renders separated station slide, scope controls, PHP currency, and adaptive HUD', () => {
    const { accounts, nodes } = makeMultiTenantFixture();
    const slides = buildTvSlides(accounts.slice(0, 2), nodes);
    const stationSlide = slides.find(
      (s) => s.kind === 'station' && s.scope.stationId === 'st-101'
    );
    expect(stationSlide).toBeDefined();

    const slideHtml = renderToStaticMarkup(
      React.createElement(TvSlideDeck, {
        slide: stationSlide!,
        slideIndex: 6,
        totalSlides: slides.length,
        direction: 'backward',
        tariffRatePhp: 13.9,
        tariffLabel: 'DECORP',
        weeklySeries: null,
      })
    );
    expect(slideHtml).toContain('Dagupan Main');
    expect(slideHtml).toContain('Hanvin Solar');
    expect(slideHtml).toContain('INV-101');
    expect(slideHtml).toContain('-14.2');
    expect(slideHtml).toContain('₱');
    expect(slideHtml).toContain('aria-roledescription="slide"');
    expect(slideHtml).toContain('data-direction="backward"');
    expect(slideHtml).toContain('VOSOLAR');
    expect(slideHtml).toContain('from-amber-500 via-primary to-emerald-400');

    // Bottom ticker commentary updates dynamically per active slide instead of staying static
    const accSlide = slides.find((s) => s.kind === 'account')!;
    const accTicker = getSlideTickerCommentary(accSlide, 13.9, null, null);
    const staTicker = getSlideTickerCommentary(stationSlide!, 13.9, null, null);
    const triageSlide = slides.find((s) => s.kind === 'triage')!;
    const triageTicker = getSlideTickerCommentary(triageSlide, 13.9, null, null);
    expect(accTicker.headline).toContain('Hanvin Solar');
    expect(accTicker.headline).toContain('68.5 kW');
    expect(staTicker.headline).toContain('Dagupan Main');
    expect(staTicker.headline).toContain('48.5 kW');
    expect(triageTicker.severity).toBe('critical');
    expect(triageTicker.headline).toContain('Beta Plant');

    // Triage card should NOT badge the station itself as "Offline" when loggers/assets already report offline
    const loggerOnlyAccount = {
      ...accounts[0],
      plants: [
        {
          ...accounts[0].plants[0],
          devices: [
            ...accounts[0].plants[0].devices,
            {
              deviceSn: 'LOG-101',
              deviceType: 'LOGGER' as const,
              name: 'Logger 101',
              model: 'LSW-3',
              ratedKw: 0,
              status: 'OFFLINE' as const,
            },
          ],
        },
      ],
    };
    const loggerOnlyTriageSlides = buildTvSlides([loggerOnlyAccount], [nodes[0]], {
      isConsumer: true,
    });
    const loggerTriage = loggerOnlyTriageSlides.find((s) => s.kind === 'triage')!;
    expect(loggerTriage).toBeDefined();
    const triageHtml = renderToStaticMarkup(
      React.createElement(TvSlideDeck, {
        slide: loggerTriage,
        slideIndex: 0,
        totalSlides: 1,
        tariffRatePhp: 13.9,
        tariffLabel: 'DECORP',
        weeklySeries: null,
      })
    );
    expect(triageHtml).toContain('LOG-101');
    expect(triageHtml).toContain('LOGGER OFFLINE');
    expect(triageHtml).not.toContain('>Offline<');

    expect(DEFAULT_TV_INTERVAL_SEC).toBe(15);

    const hudHtml = renderToStaticMarkup(
      React.createElement(TvHudBar, {
        slides,
        activeIndex: 0,
        paused: false,
        intervalSec: DEFAULT_TV_INTERVAL_SEC,
        progressRatio: 0.5,
        hudVisible: true,
        isFullscreen: false,
        isStale: false,
        manilaClock: '14:25 PHT',
        headline: 'Hanvin Solar 68.5 kW live',
        severity: 'normal',
        scopeAccountOptions: [
          { id: 'acc-hanvin', name: 'Hanvin Solar' },
          { id: 'acc-tenant-b', name: 'Tenant Beta' },
        ],
        scopeStationOptions: [
          { stationId: 'st-101', stationName: 'Dagupan Main', accountId: 'acc-hanvin' },
          { stationId: 'st-102', stationName: 'Hanvin Branch', accountId: 'acc-hanvin' },
          { stationId: 'st-202', stationName: 'Beta Plant', accountId: 'acc-tenant-b' },
        ],
        selectedAccountId: 'ALL',
        selectedStationId: 'ALL',
        onSelectAccount: () => {},
        onSelectStation: () => {},
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
    expect(hudHtml).toContain('Filter TV by account');
    expect(hudHtml).toContain('Filter TV by station');
    // 15 slides > 12 => adaptive select jump control in footer instead of overflowing dot list
    expect(hudHtml).toContain('1. Hanvin Solar · Live Telemetry');
    expect(hudHtml).toContain('Fleet Summary');

    // Paired Solar vs Demand profit comparison on financial slide & ticker
    const finSlide = slides.find((s) => s.kind === 'financial')!;
    const weeklySeriesFixture = [
      {
        date: '2026-11-17',
        dayLabel: 'Tue',
        solarYieldKwh: 200,
        loadDemandKwh: 250,
        selfConsumptionKwh: 160,
        batteryStoredKwh: 0,
        batteryDischargedKwh: 0,
        gridExportKwh: 40,
        gridImportKwh: 90,
        peakSolarKw: 48,
        performanceRatioPct: 82,
        specificYieldKwhKwp: 2.0,
        savingsUsd: 40,
        co2AvoidedKg: 142,
      },
    ];
    const profit = computeTvWeeklyProfitSummary(weeklySeriesFixture, 10, 5);
    expect(profit?.realizedProfitPhp).toBe(160 * 10 + 40 * 5);
    expect(profit?.demandOffsetPct).toBe(64);
    const finHtml = renderToStaticMarkup(
      React.createElement(TvSlideDeck, {
        slide: finSlide,
        slideIndex: 2,
        totalSlides: slides.length,
        tariffRatePhp: 10,
        exportCreditPhp: 5,
        tariffLabel: 'DECORP',
        weeklySeries: weeklySeriesFixture,
      })
    );
    expect(finHtml).toContain('Daily Solar vs. Facility Demand');
    expect(finHtml).toContain('64% offset');
    expect(finHtml).toContain('₱2,500 → ₱900');
    const finTicker = getSlideTickerCommentary(finSlide, 10, weeklySeriesFixture, null, 5);
    expect(finTicker.headline).toContain('64% of 250 kWh demand offset');
  });
});

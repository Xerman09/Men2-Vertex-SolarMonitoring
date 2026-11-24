import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildFleetAccountTree,
  buildNocTableRows,
  computeSpecificYield,
  filterFleetTree,
  sortNocTableRows,
} from '../types';
import { PlantSolarCurve } from '../components/PlantSolarCurve';
import { InverterSolarCurve } from '../components/InverterSolarCurve';
import type { AccountSummary, FleetMatrixNode } from '@/lib/types';

function makeMockAccounts(): AccountSummary[] {
  return [
    {
      id: 'acc-1',
      name: 'Hanvin Solar Corp',
      isLive: true,
      stationCount: 2,
      deviceCount: 3,
      inverterCount: 3,
      loggerCount: 2,
      liveSolarPowerKw: 80,
      dailyYieldKwh: 320,
      capacityKw: 160,
      status: 'ONLINE',
      lastPingMs: 20,
      plants: [
        {
          stationId: 'st-multi',
          stationName: 'Men 2 Office',
          installedCapacityKw: 100,
          liveSolarPowerKw: 60,
          dailyYieldKwh: 240,
          devices: [
            {
              deviceSn: 'INV-M1',
              deviceType: 'INVERTER',
              name: 'Inverter 1',
              model: 'SUN-50K',
              ratedKw: 50,
              status: 'ONLINE',
            },
            {
              deviceSn: 'INV-M2',
              deviceType: 'INVERTER',
              name: 'Inverter 2',
              model: 'SUN-50K',
              // Unconfigured ratedKw intentionally omitted to assert zero fake 50 kW fallback
              status: 'FAULT',
            },
          ],
        },
        {
          stationId: 'st-single',
          stationName: 'Branch Office',
          installedCapacityKw: 60,
          liveSolarPowerKw: 20,
          dailyYieldKwh: 80,
          devices: [
            {
              deviceSn: 'INV-S1',
              deviceType: 'INVERTER',
              name: 'Single Inverter',
              model: 'SUN-60K',
              ratedKw: 60,
              status: 'ONLINE',
            },
          ],
        },
      ],
    },
    {
      id: 'acc-unconfigured',
      name: 'Unconfigured Site',
      isLive: false,
      stationCount: 1,
      deviceCount: 0,
      inverterCount: 0,
      loggerCount: 0,
      liveSolarPowerKw: 0,
      dailyYieldKwh: 0,
      capacityKw: 0,
      status: 'OFFLINE',
      lastPingMs: 999,
      plants: [],
    },
  ];
}

describe('Fleet View Model & Telemetry Integrity', () => {
  it('avoids equal-split division on multi-inverter plants when batch node is absent and avoids 50/120 kW fallbacks', () => {
    const accounts = makeMockAccounts();
    const nodes: FleetMatrixNode[] = [
      {
        accountId: 'acc-1',
        accountName: 'Hanvin Solar Corp',
        stationName: 'Men 2 Office',
        stationId: 'st-multi',
        deviceSn: 'INV-M1',
        deviceType: 'INVERTER',
        model: 'SUN-50K',
        ratedKw: 50,
        liveSolarPowerKw: 48,
        dailyYieldKwh: 192,
        batterySoc: 0,
        mode: 'GRID',
        status: 'ONLINE',
        isLive: true,
      },
      // INV-M2 has NO node returned (faulted/offline or absent)
    ];

    const tree = buildFleetAccountTree(accounts, nodes);
    expect(tree).toHaveLength(2);

    const hanvin = tree[0];
    const men2 = hanvin.plants.find((p) => p.plant.stationId === 'st-multi')!;
    const invM1 = men2.inverters.find((i) => i.deviceSn === 'INV-M1')!;
    const invM2 = men2.inverters.find((i) => i.deviceSn === 'INV-M2')!;

    expect(invM1.liveSolarPowerKw).toBe(48);
    expect(invM1.dailyYieldKwh).toBe(192);
    expect(invM1.specificYieldKwhKwp).toBe(3.84);

    // Multi-inverter missing node must be honest 0, NEVER 60/2 = 30
    expect(invM2.liveSolarPowerKw).toBe(0);
    expect(invM2.dailyYieldKwh).toBe(0);
    // Must NEVER fabricate 50 kW default rating
    expect(invM2.ratedKw).toBe(0);
    expect(invM2.specificYieldKwhKwp).toBeNull();

    // Single-inverter plant maps 1-to-1 even without node
    const branch = hanvin.plants.find((p) => p.plant.stationId === 'st-single')!;
    expect(branch.inverters[0].liveSolarPowerKw).toBe(20);
    expect(branch.inverters[0].dailyYieldKwh).toBe(80);
    expect(branch.specificYieldKwhKwp).toBeCloseTo(1.33, 2);

    // Account with 0 capacity must stay 0, NEVER fallback to 120 kW
    expect(tree[1].capacityKw).toBe(0);
    expect(tree[1].specificYieldKwhKwp).toBeNull();
  });

  it('computes null Specific Yield when capacity is zero or negative', () => {
    expect(computeSpecificYield(150, 0)).toBeNull();
    expect(computeSpecificYield(150, -10)).toBeNull();
    expect(computeSpecificYield(150, 50)).toBe(3);
  });

  it('sorts faulted plants first under severity sort and filters by status/search', () => {
    const tree = buildFleetAccountTree(makeMockAccounts(), []);
    const sorted = filterFleetTree(tree, '', 'ALL', 'severity');

    expect(sorted[0].account.id).toBe('acc-1');
    expect(sorted[0].plants[0].plant.stationId).toBe('st-multi'); // FAULT comes first
    expect(sorted[0].plants[0].status).toBe('FAULT');

    const faultOnly = filterFleetTree(tree, '', 'FAULT', 'severity');
    expect(faultOnly).toHaveLength(1);
    expect(faultOnly[0].plants).toHaveLength(1);
    expect(faultOnly[0].plants[0].inverters).toHaveLength(1);
    expect(faultOnly[0].plants[0].inverters[0].deviceSn).toBe('INV-M2');
  });

  it('builds and sorts scoped NOC matrix rows by numeric and string columns cleanly', () => {
    const tree = buildFleetAccountTree(makeMockAccounts(), []);
    const plantRows = buildNocTableRows(tree, {
      mode: 'plant',
      accountId: 'acc-1',
      stationId: 'st-multi',
    });
    expect(plantRows).toHaveLength(2);

    const allRows = buildNocTableRows(tree, { mode: 'fleet' });
    expect(allRows).toHaveLength(3);

    const sortedDesc = sortNocTableRows(allRows, 'dailyYieldKwh', 'descending');
    expect(sortedDesc[0].deviceSn).toBe('INV-S1');

    const sortedSnAsc = sortNocTableRows(allRows, 'deviceSn', 'ascending');
    expect(sortedSnAsc.map((r) => r.deviceSn)).toEqual(['INV-M1', 'INV-M2', 'INV-S1']);
  });

  it('preserves negative power and renders signed Fleet & Inverter SVG axes below zero', () => {
    const accounts = makeMockAccounts();
    const negNodes: FleetMatrixNode[] = [
      {
        accountId: 'acc-1',
        accountName: 'Hanvin Solar Corp',
        stationName: 'Branch Office',
        stationId: 'st-single',
        deviceSn: 'INV-S1',
        deviceType: 'INVERTER',
        model: 'SUN-60K',
        ratedKw: 60,
        liveSolarPowerKw: -2.4,
        dailyYieldKwh: 0,
        gridPowerKw: -24.5,
        consumptionPowerKw: 22.1,
        batterySoc: 40,
        mode: 'GRID',
        status: 'ONLINE',
        isLive: true,
      },
    ];
    const tree = buildFleetAccountTree(accounts, negNodes);
    const branch = tree[0].plants.find((p) => p.plant.stationId === 'st-single')!;
    expect(branch.livePowerKw).toBe(-2.4);
    expect(branch.gridPowerKw).toBe(-24.5);

    const plantHtml = renderToStaticMarkup(
      React.createElement(PlantSolarCurve, {
        capacityKw: 60,
        livePowerKw: 5,
        demandKw: 29.5,
        gridPowerKw: -24.5,
        scope: { accountId: 'acc-1', stationId: 'st-single' },
      })
    );
    expect(plantHtml).toContain('-24.5 kW');
    expect(plantHtml).toContain('-27');
    expect(plantHtml).toContain('grid-stroke');

    const invHtml = renderToStaticMarkup(
      React.createElement(InverterSolarCurve, {
        ratedKw: 60,
        liveSolarPowerKw: -12.4,
        scope: { accountId: 'acc-1', stationId: 'st-single', deviceSn: 'INV-S1' },
      })
    );
    expect(invHtml).toContain('-12.4 kW');
    expect(invHtml).toContain('-14');
  });
});

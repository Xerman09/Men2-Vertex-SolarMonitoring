import {
  buildFleetAccountTree,
  type FleetAccountNode,
  type FleetInverterNode,
  type FleetPlantNode,
} from '@/app/fleet/types';
import type { HistoryScope } from '@/app/fleet/components/useScopedHistory';
import type { DailyAnalyticsPoint } from '@/lib/analytics-data';
import type { TvBriefResult, TvBriefSeverity } from '@/lib/gemini-tv-brief';
import type { AuthUser } from '@/lib/role-context';
import { PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH } from '@/lib/tariff-rates';
import type { AccountSummary, DeviceInfo, FleetMatrixNode } from '@/lib/types';

export interface TvOverviewSlide {
  id: string;
  kind: 'overview';
  title: string;
  scope: HistoryScope;
  accounts: FleetAccountNode[];
  plants: FleetPlantNode[];
  liveSolarKw: number;
  capacityKw: number;
  dailyYieldKwh: number;
  demandKw: number;
  gridNetKw: number;
  avgBatterySoc: number | null;
  onlineInverters: number;
  totalInverters: number;
  faultCount: number;
  offlineCount: number;
}

export interface TvCurveSlide {
  id: string;
  kind: 'curve';
  title: string;
  scope: HistoryScope;
  liveSolarKw: number;
  capacityKw: number;
  dailyYieldKwh: number;
  demandKw: number;
  gridNetKw: number;
  avgBatterySoc: number | null;
  onlineInverters: number;
  totalInverters: number;
  faultCount: number;
  offlineCount: number;
}

export interface TvAccountSlide {
  id: string;
  kind: 'account';
  title: string;
  scope: HistoryScope;
  account: FleetAccountNode;
}

export interface TvAccountStationsSlide {
  id: string;
  kind: 'account-stations';
  title: string;
  scope: HistoryScope;
  account: FleetAccountNode;
}

export interface TvStationSlide {
  id: string;
  kind: 'station';
  title: string;
  accountName: string;
  accountId: string;
  scope: HistoryScope;
  plant: FleetPlantNode;
}

export interface TvTriageEntry {
  accountId: string;
  accountName: string;
  stationId: string;
  stationName: string;
  status: 'FAULT' | 'OFFLINE';
  faultInverters: FleetInverterNode[];
  offlineInverters: FleetInverterNode[];
  offlineLoggers: DeviceInfo[];
  hasOfflineLogger: boolean;
}

export interface TvTriageSlide {
  id: string;
  kind: 'triage';
  title: string;
  scope: HistoryScope;
  entries: TvTriageEntry[];
  totalFaults: number;
  totalOffline: number;
}

export interface TvFinancialSlide {
  id: string;
  kind: 'financial';
  title: string;
  scope: HistoryScope;
  scopeLabel: string;
  liveSolarKw: number;
  dailyYieldKwh: number;
  capacityKw: number;
  accounts: FleetAccountNode[];
  account?: FleetAccountNode;
}

export type TvSlide =
  | TvOverviewSlide
  | TvCurveSlide
  | TvAccountSlide
  | TvAccountStationsSlide
  | TvStationSlide
  | TvTriageSlide
  | TvFinancialSlide;

export interface TvAuthFilterOptions {
  isAdmin: boolean;
  isConsumer: boolean;
  user: AuthUser | null;
}

/**
 * Canonical cache/lookup key for a HistoryScope across diurnal & weekly TV fetches.
 */
export function getTvScopeKey(scope: HistoryScope | undefined | null): string {
  if (!scope) return 'FLEET';
  if (scope.stationId && scope.accountId) {
    return `STA:${scope.accountId}:${scope.stationId}`;
  }
  if (scope.stationId) {
    return `STA:ANY:${scope.stationId}`;
  }
  if (scope.accountId) {
    return `ACC:${scope.accountId}`;
  }
  return 'FLEET';
}

export function isInternalAdminOnlyAccount(acc: AccountSummary): boolean {
  const hasPlants = acc.stationCount > 0 || (Array.isArray(acc.plants) && acc.plants.length > 0);
  if (hasPlants || acc.isLive) return false;
  const emailLower = (acc.email || '').trim().toLowerCase();
  const nameLower = (acc.name || '').trim().toLowerCase();
  return Boolean(acc.admin && (emailLower === 'admin' || nameLower === 'admin'));
}

/**
 * Enforces strict tenant isolation for TV slides so consumer accounts only see
 * their authorized accounts/stations and never leak another tenant's data.
 */
export function filterTvAuthorizedAccounts(
  accounts: AccountSummary[],
  auth: TvAuthFilterOptions
): AccountSummary[] {
  if (!Array.isArray(accounts) || accounts.length === 0) return [];

  let list = accounts.filter((acc) => !isInternalAdminOnlyAccount(acc));
  if (!auth.isAdmin) {
    list = list.filter((acc) => !acc.isDemo);
  }

  if (auth.isConsumer) {
    if (!auth.user) return [];
    const userAccId = String(auth.user.accountId || '').trim();
    const cleanStation = userAccId.startsWith('station-')
      ? userAccId.replace('station-', '')
      : userAccId;
    const userEmail = (auth.user.email || '').trim().toLowerCase();
    const userIdStr =
      auth.user.id !== undefined && auth.user.id !== null ? String(auth.user.id) : '';

    return list.filter((acc) => {
      const accId = String(acc.id || '');
      const accDirectusId = acc.directusId ? String(acc.directusId) : '';
      const accEmail = (acc.email || '').trim().toLowerCase();

      return (
        (userIdStr && acc.userId && String(acc.userId) === userIdStr) ||
        (userAccId &&
          (accId === userAccId ||
            accDirectusId === userAccId ||
            accId === `directus-${userAccId}` ||
            accId === `deye-cfg-${userAccId}` ||
            acc.plants?.some(
              (p) =>
                String(p.stationId) === cleanStation || `station-${p.stationId}` === userAccId
            ))) ||
        (userEmail && accEmail === userEmail)
      );
    });
  }

  return list;
}

export interface BuildTvSlidesOptions {
  isConsumer?: boolean;
  priorityStationId?: string | null;
  filterAccountId?: string | null;
  filterStationId?: string | null;
}

function summarizeTree(nodesList: FleetAccountNode[]) {
  const allPlants = nodesList.flatMap((a) => a.plants);
  const allInverters = allPlants.flatMap((p) => p.inverters);

  const liveSolarKw = Number(nodesList.reduce((s, a) => s + a.livePowerKw, 0).toFixed(1));
  const capacityKw = Number(nodesList.reduce((s, a) => s + a.capacityKw, 0).toFixed(1));
  const dailyYieldKwh = Number(nodesList.reduce((s, a) => s + a.dailyYieldKwh, 0).toFixed(1));
  const demandKw = Number(nodesList.reduce((s, a) => s + (a.demandKw ?? 0), 0).toFixed(1));
  const gridNetKw = Number(nodesList.reduce((s, a) => s + (a.gridPowerKw ?? 0), 0).toFixed(1));

  const socVals = allPlants
    .map((p) => p.batterySoc)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const avgBatterySoc =
    socVals.length > 0
      ? Math.round(socVals.reduce((s, v) => s + v, 0) / socVals.length)
      : null;

  const onlineInverters = allInverters.filter((i) => i.status === 'ONLINE').length;
  const faultCount = allInverters.filter((i) => i.status === 'FAULT').length;
  const offlineCount = allInverters.filter((i) => i.status === 'OFFLINE').length;

  return {
    allPlants,
    liveSolarKw,
    capacityKw,
    dailyYieldKwh,
    demandKw,
    gridNetKw,
    avgBatterySoc,
    onlineInverters,
    totalInverters: allInverters.length,
    faultCount,
    offlineCount,
  };
}

/**
 * Dynamically builds separated, scope-isolated TV slides for ALL authorized
 * accounts and stations:
 * - Fleet level (when viewing 2+ accounts): Portfolio Overview, Dedicated Diurnal Curve, Fleet 7D Analytics
 * - Per Account (for accounts with 2+ plants or zero plants): Account Diurnal Curve, Stations Grid, Account 7D Analytics
 * - Per Station (for every station across all accounts): Station Diurnal Curve + Inverters, Station 7D Analytics
 * - Asset Health Triage (only when genuine faults/offline assets exist within the active scope)
 */
export function buildTvSlides(
  authorizedAccounts: AccountSummary[],
  nodes: FleetMatrixNode[] = [],
  options: BuildTvSlidesOptions = {}
): TvSlide[] {
  const fullTree = buildFleetAccountTree(authorizedAccounts, nodes);
  if (fullTree.length === 0) return [];

  const reqAcc =
    options.filterAccountId && options.filterAccountId !== 'ALL'
      ? options.filterAccountId
      : null;
  const reqSta =
    options.filterStationId && options.filterStationId !== 'ALL'
      ? options.filterStationId
      : null;

  // Apply explicit account filter dynamically (fallback cleanly if account disappeared)
  let scopedTree = reqAcc
    ? fullTree.filter(
        (a) =>
          a.account.id === reqAcc ||
          a.account.directusId === reqAcc ||
          `deye-cfg-${a.account.directusId || ''}` === reqAcc
      )
    : fullTree;
  if (scopedTree.length === 0) {
    scopedTree = fullTree;
  }

  // Apply explicit station filter dynamically when pinned to a single station
  if (reqSta) {
    const withStation = scopedTree
      .map((acc) => {
        const matchedPlants = acc.plants.filter(
          (p) => String(p.plant.stationId) === String(reqSta)
        );
        if (matchedPlants.length === 0) return null;
        return { ...acc, plants: matchedPlants };
      })
      .filter((a): a is FleetAccountNode => a !== null);
    if (withStation.length > 0) {
      scopedTree = withStation;
    }
  }

  const slides: TvSlide[] = [];
  const summary = summarizeTree(scopedTree);
  const activeScope: HistoryScope =
    reqSta && scopedTree[0]?.plants[0]
      ? { accountId: scopedTree[0].account.id, stationId: String(scopedTree[0].plants[0].plant.stationId) }
      : scopedTree.length === 1 && (reqAcc || options.isConsumer)
        ? { accountId: scopedTree[0].account.id }
        : {};

  // 1. STATIONS / PLANTS: Per-Station Live Curve & Inverters + Station 7D Analytics
  for (const acc of scopedTree) {
    if (!reqSta && acc.plants.length > 1) {
      slides.push({
        id: `account-stations-${acc.account.id}`,
        kind: 'account-stations',
        title: `${acc.account.name} · Stations`,
        scope: { accountId: acc.account.id },
        account: acc,
      });
    }

    for (const plant of acc.plants) {
      const stationId = String(plant.plant.stationId);
      const stationScope: HistoryScope = {
        accountId: acc.account.id,
        stationId,
      };

      slides.push({
        id: `station-${acc.account.id}-${stationId}`,
        kind: 'station',
        title: plant.plant.stationName,
        accountName: acc.account.name,
        accountId: acc.account.id,
        scope: stationScope,
        plant,
      });

      slides.push({
        id: `financial-sta-${acc.account.id}-${stationId}`,
        kind: 'financial',
        title: `${plant.plant.stationName} · 7D Analytics`,
        scope: stationScope,
        scopeLabel: acc.account.name,
        liveSolarKw: plant.livePowerKw,
        dailyYieldKwh: plant.dailyYieldKwh,
        capacityKw: plant.capacityKw,
        accounts: [acc],
      });
    }
  }

  // 2. ACCOUNTS: Account Rollups (Live Telemetry & Account 7D Analytics) after Stations/Plants
  if (!reqSta) {
    for (const acc of scopedTree) {
      if (scopedTree.length === 1 && acc.plants.length === 1) {
        continue;
      }
      const accScope: HistoryScope = { accountId: acc.account.id };
      const stationCountLabel = `All ${acc.plants.length} ${acc.plants.length === 1 ? 'Station' : 'Stations'}`;

      slides.push({
        id: `account-${acc.account.id}`,
        kind: 'account',
        title: `${acc.account.name} · Account Total (${stationCountLabel})`,
        scope: accScope,
        account: acc,
      });

      slides.push({
        id: `financial-acc-${acc.account.id}`,
        kind: 'financial',
        title: `${acc.account.name} · Stations 7D Analytics`,
        scope: accScope,
        scopeLabel: stationCountLabel,
        liveSolarKw: acc.livePowerKw,
        dailyYieldKwh: acc.dailyYieldKwh,
        capacityKw: acc.capacityKw,
        accounts: [acc],
        account: acc,
      });
    }
  }

  // 3. EXECUTIVE SUMMARY: Multi-account Consolidated Overview, Fleet Curve, & 7D Fleet Summary
  if (!reqSta && scopedTree.length > 1) {
    slides.push({
      id: 'overview',
      kind: 'overview',
      title: 'Fleet Summary',
      scope: {},
      accounts: scopedTree,
      plants: summary.allPlants,
      liveSolarKw: summary.liveSolarKw,
      capacityKw: summary.capacityKw,
      dailyYieldKwh: summary.dailyYieldKwh,
      demandKw: summary.demandKw,
      gridNetKw: summary.gridNetKw,
      avgBatterySoc: summary.avgBatterySoc,
      onlineInverters: summary.onlineInverters,
      totalInverters: summary.totalInverters,
      faultCount: summary.faultCount,
      offlineCount: summary.offlineCount,
    });

    slides.push({
      id: 'fleet-curve',
      kind: 'curve',
      title: 'Fleet Diurnal Telemetry',
      scope: {},
      liveSolarKw: summary.liveSolarKw,
      capacityKw: summary.capacityKw,
      dailyYieldKwh: summary.dailyYieldKwh,
      demandKw: summary.demandKw,
      gridNetKw: summary.gridNetKw,
      avgBatterySoc: summary.avgBatterySoc,
      onlineInverters: summary.onlineInverters,
      totalInverters: summary.totalInverters,
      faultCount: summary.faultCount,
      offlineCount: summary.offlineCount,
    });

    slides.push({
      id: 'financial-fleet',
      kind: 'financial',
      title: 'Fleet · 7D Summary',
      scope: {},
      scopeLabel: `${scopedTree.length} Accounts · ${summary.allPlants.length} Stations`,
      liveSolarKw: summary.liveSolarKw,
      dailyYieldKwh: summary.dailyYieldKwh,
      capacityKw: summary.capacityKw,
      accounts: scopedTree,
    });
  }

  // 3. Dynamic triage slide strictly when genuine faults or offline assets exist in active scope
  const triageEntries: TvTriageEntry[] = [];
  for (const acc of scopedTree) {
    for (const plant of acc.plants) {
      const faultInvs = plant.inverters.filter((i) => i.status === 'FAULT');
      const offlineInvs = plant.inverters.filter((i) => i.status === 'OFFLINE');
      const offlineLoggers = plant.loggers.filter((l) => l.status === 'OFFLINE' && Boolean(l.deviceSn));
      if (
        faultInvs.length > 0 ||
        offlineInvs.length > 0 ||
        offlineLoggers.length > 0
      ) {
        triageEntries.push({
          accountId: acc.account.id,
          accountName: acc.account.name,
          stationId: String(plant.plant.stationId),
          stationName: plant.plant.stationName,
          status: faultInvs.length > 0 ? 'FAULT' : 'OFFLINE',
          faultInverters: faultInvs,
          offlineInverters: offlineInvs,
          offlineLoggers,
          hasOfflineLogger: offlineLoggers.length > 0,
        });
      }
    }
  }

  if (triageEntries.length > 0) {
    const prioritySid = options.priorityStationId;
    triageEntries.sort((a, b) => {
      if (prioritySid) {
        if (a.stationId === prioritySid && b.stationId !== prioritySid) return -1;
        if (b.stationId === prioritySid && a.stationId !== prioritySid) return 1;
      }
      if (a.status !== b.status) return a.status === 'FAULT' ? -1 : 1;
      return (
        b.faultInverters.length +
        b.offlineInverters.length -
        (a.faultInverters.length + a.offlineInverters.length)
      );
    });

    slides.push({
      id: 'triage',
      kind: 'triage',
      title: 'Asset Health Triage',
      scope: activeScope,
      entries: triageEntries,
      totalFaults: summary.faultCount,
      totalOffline: summary.offlineCount,
    });
  }

  return slides;
}

export interface TvWeeklyProfitSummary {
  weekSolarKwh: number;
  weekDemandKwh: number;
  weekSelfConsumedKwh: number;
  weekImportKwh: number;
  weekExportKwh: number;
  hasDemandData: boolean;
  baselineBillPhp: number;
  gridBillPhp: number;
  realizedProfitPhp: number;
  demandOffsetPct: number | null;
}

/**
 * Computes 7-day solar vs. facility demand profit metrics strictly from verified
 * DailyAnalyticsPoint telemetry and Philippine TOU/export tariff rates.
 */
export function computeTvWeeklyProfitSummary(
  weeklySeries: DailyAnalyticsPoint[] | null,
  tariffRatePhp: number,
  exportCreditPhp = 0
): TvWeeklyProfitSummary | null {
  if (!weeklySeries || weeklySeries.length === 0) return null;

  let weekSolarKwh = 0;
  let weekDemandKwh = 0;
  let weekSelfConsumedKwh = 0;
  let weekImportKwh = 0;
  let weekExportKwh = 0;

  for (const d of weeklySeries.slice(-7)) {
    const solar = Math.max(0, d.solarYieldKwh || 0);
    const demand = Math.max(0, d.loadDemandKwh || 0);
    const exp = Math.max(0, d.gridExportKwh || 0);
    const self =
      d.selfConsumptionKwh > 0
        ? Math.min(solar, d.selfConsumptionKwh)
        : Math.max(0, solar - exp);
    const imp = Math.max(0, d.gridImportKwh || Math.max(0, demand - self));

    weekSolarKwh += solar;
    weekDemandKwh += demand;
    weekSelfConsumedKwh += self;
    weekImportKwh += imp;
    weekExportKwh += exp;
  }

  const hasDemandData = weekDemandKwh > 0;
  const baselineBillPhp = weekDemandKwh * tariffRatePhp;
  const gridBillPhp = weekImportKwh * tariffRatePhp;
  const realizedProfitPhp = hasDemandData
    ? weekSelfConsumedKwh * tariffRatePhp + weekExportKwh * exportCreditPhp
    : weekSolarKwh * tariffRatePhp;
  const demandOffsetPct = hasDemandData
    ? Math.min(100, Math.round((weekSelfConsumedKwh / weekDemandKwh) * 100))
    : null;

  return {
    weekSolarKwh,
    weekDemandKwh,
    weekSelfConsumedKwh,
    weekImportKwh,
    weekExportKwh,
    hasDemandData,
    baselineBillPhp,
    gridBillPhp,
    realizedProfitPhp,
    demandOffsetPct,
  };
}

export interface TvTickerCommentary {
  headline: string;
  severity: TvBriefSeverity;
}

/**
 * Computes slide-specific bottom commentary grounded strictly in verified telemetry
 * so the theater ticker dynamically narrates whichever slide is on screen.
 */
export function getSlideTickerCommentary(
  slide: TvSlide | null,
  tariffRatePhp: number,
  weeklySeries: DailyAnalyticsPoint[] | null,
  fleetBrief: TvBriefResult | null,
  exportCreditPhp = 0
): TvTickerCommentary {
  if (!slide) {
    return {
      headline: fleetBrief?.headline || 'Awaiting live DeyeCloud station telemetry',
      severity: fleetBrief?.severity || 'normal',
    };
  }

  const formatSavings = (kwh: number) =>
    `₱${Math.round(kwh * tariffRatePhp).toLocaleString('en-US')}`;

  switch (slide.kind) {
    case 'overview':
    case 'curve': {
      if (fleetBrief?.headline) {
        return { headline: fleetBrief.headline, severity: fleetBrief.severity };
      }
      if (slide.faultCount > 0) {
        return {
          headline: `ALERT: ${slide.faultCount} inverter fault · Solar ${slide.liveSolarKw.toFixed(1)} kW live · ${slide.dailyYieldKwh.toFixed(0)} kWh today`,
          severity: 'critical',
        };
      }
      if (slide.offlineCount > 0) {
        return {
          headline: `Solar ${slide.liveSolarKw.toFixed(1)} kW live · ${slide.offlineCount} inverter offline · ${slide.dailyYieldKwh.toFixed(0)} kWh today`,
          severity: 'warning',
        };
      }
      const gridStr =
        slide.gridNetKw >= 0
          ? `+${slide.gridNetKw.toFixed(1)} kW grid export`
          : `${slide.gridNetKw.toFixed(1)} kW grid import`;
      return {
        headline: `Solar ${slide.liveSolarKw.toFixed(1)} kW live · ${slide.dailyYieldKwh.toFixed(0)} kWh today · ${formatSavings(slide.dailyYieldKwh)} saved · ${gridStr}`,
        severity: 'normal',
      };
    }

    case 'account': {
      const acc = slide.account;
      if (acc.faultCount > 0) {
        return {
          headline: `Action needed on ${acc.account.name}: ${acc.faultCount} inverter fault reducing output · Check Asset Health Triage`,
          severity: 'critical',
        };
      }
      const demand = acc.demandKw ?? 0;
      const offsetPct =
        demand > 0 ? Math.min(100, Math.round((acc.livePowerKw / demand) * 100)) : null;
      const ranked = [...acc.plants]
        .filter((p) => p.capacityKw > 0)
        .sort((a, b) => b.utilizationPct - a.utilizationPct);
      const best = ranked[0];
      const lag = ranked.length > 1 ? ranked[ranked.length - 1] : null;
      const spreadNote =
        best && lag && best.utilizationPct - lag.utilizationPct >= 15
          ? ` · ${best.plant.stationName} leads (${Math.round(best.utilizationPct)}% cap) while ${lag.plant.stationName} trails (${Math.round(lag.utilizationPct)}%)`
          : best
            ? ` · ${best.plant.stationName} leading at ${Math.round(best.utilizationPct)}% capacity`
            : '';
      return {
        headline:
          offsetPct !== null
            ? `${acc.account.name}: Solar offsetting ${offsetPct}% of ${demand.toFixed(1)} kW demand (${formatSavings(acc.dailyYieldKwh)} saved)${spreadNote}`
            : `${acc.account.name}: ${formatSavings(acc.dailyYieldKwh)} saved across ${acc.plants.length} stations${spreadNote}`,
        severity: acc.offlineCount > 0 ? 'warning' : 'normal',
      };
    }

    case 'account-stations': {
      const acc = slide.account;
      const ranked = [...acc.plants].sort((a, b) => b.utilizationPct - a.utilizationPct);
      const leader = ranked[0];
      const laggard = ranked.length > 1 ? ranked[ranked.length - 1] : null;
      const sev: TvBriefSeverity =
        acc.faultCount > 0 ? 'critical' : acc.offlineCount > 0 ? 'warning' : 'normal';
      const spreadInsight =
        leader && laggard && leader.utilizationPct - laggard.utilizationPct >= 15
          ? `${leader.plant.stationName} leads at ${Math.round(leader.utilizationPct)}% utilization vs ${laggard.plant.stationName} at ${Math.round(laggard.utilizationPct)}%`
          : leader
            ? `${leader.plant.stationName} leads at ${leader.livePowerKw.toFixed(1)} kW (${Math.round(leader.utilizationPct)}% cap)`
            : `${acc.plants.length} stations`;
      const demand = acc.demandKw ?? 0;
      const offsetNote =
        demand > 0
          ? ` · ${Math.min(100, Math.round((acc.livePowerKw / demand) * 100))}% of account demand covered`
          : '';
      return {
        headline: `${acc.account.name} Benchmark: ${spreadInsight}${offsetNote}`,
        severity: sev,
      };
    }

    case 'station': {
      const p = slide.plant;
      const faultInv = p.inverters.find((i) => i.status === 'FAULT');
      const offlineInv = p.inverters.find((i) => i.status === 'OFFLINE');
      if (faultInv || p.status === 'FAULT') {
        return {
          headline: `Action needed at ${p.plant.stationName}: Inverter ${faultInv?.deviceSn || ''} in FAULT — inspect hardware to restore lost harvest`,
          severity: 'critical',
        };
      }
      if (offlineInv || p.status === 'OFFLINE') {
        return {
          headline: `${p.plant.stationName}: ${offlineInv ? `Inverter ${offlineInv.deviceSn} offline` : 'Station offline'} — verify inverter & comms link`,
          severity: 'warning',
        };
      }
      const demand = p.demandKw ?? 0;
      const gridVal = p.gridPowerKw ?? 0;
      const offsetPct =
        demand > 0 ? Math.min(100, Math.round((p.livePowerKw / demand) * 100)) : null;
      const gridInsight =
        gridVal > 0.5
          ? `exporting +${gridVal.toFixed(1)} kW surplus to grid`
          : gridVal < -0.5
            ? `importing ${Math.abs(gridVal).toFixed(1)} kW from grid`
            : 'zero net grid draw';
      return {
        headline:
          offsetPct !== null
            ? `${p.plant.stationName}: Covering ${offsetPct}% of ${demand.toFixed(1)} kW load (${gridInsight}) · ${formatSavings(p.dailyYieldKwh)} saved today`
            : `${p.plant.stationName}: Operating at ${Math.round(p.utilizationPct)}% capacity (${gridInsight}) · ${formatSavings(p.dailyYieldKwh)} saved today`,
        severity: 'normal',
      };
    }

    case 'financial': {
      const profit = computeTvWeeklyProfitSummary(weeklySeries, tariffRatePhp, exportCreditPhp);
      if (profit) {
        const co2Kg = Math.round(profit.weekSolarKwh * PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH);
        const days = (weeklySeries ?? []).slice(-7);
        const peakDay = days.length > 0
          ? [...days].sort((a, b) => (b.solarYieldKwh || 0) - (a.solarYieldKwh || 0))[0]
          : null;
        const peakNote = peakDay && peakDay.solarYieldKwh > 0
          ? ` · Peak harvest on ${peakDay.date.slice(5)} (${peakDay.solarYieldKwh.toFixed(0)} kWh)`
          : '';
        if (profit.hasDemandData && profit.demandOffsetPct !== null) {
          return {
            headline: `${slide.title}: ₱${Math.round(profit.realizedProfitPhp).toLocaleString('en-US')} bill profit (${profit.demandOffsetPct}% of ${profit.weekDemandKwh.toFixed(0)} kWh demand offset)${peakNote}`,
            severity: 'normal',
          };
        }
        return {
          headline: `${slide.title}: ₱${Math.round(profit.realizedProfitPhp).toLocaleString('en-US')} avoided cost over 7D (${co2Kg.toLocaleString('en-US')} kg CO₂ offset)${peakNote}`,
          severity: 'normal',
        };
      }
      return {
        headline: `${slide.title}: ${slide.dailyYieldKwh.toFixed(0)} kWh today (${formatSavings(slide.dailyYieldKwh)} at ₱${tariffRatePhp.toFixed(2)}/kWh)`,
        severity: 'normal',
      };
    }

    case 'triage': {
      const top = slide.entries[0];
      const priorityText = top ? ` · Priority: ${top.stationName} (${top.accountName})` : '';
      return {
        headline: `Asset Health Triage: ${slide.totalFaults} fault, ${slide.totalOffline} offline${priorityText}`,
        severity: slide.totalFaults > 0 ? 'critical' : 'warning',
      };
    }
  }
}

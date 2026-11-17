import {
  buildFleetAccountTree,
  type FleetAccountNode,
  type FleetInverterNode,
  type FleetPlantNode,
} from '@/app/fleet/types';
import type { HistoryScope } from '@/app/fleet/components/useScopedHistory';
import type { AuthUser } from '@/lib/role-context';
import type { AccountSummary, FleetMatrixNode } from '@/lib/types';

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

/**
 * Enforces strict tenant isolation for TV slides so consumer accounts only see
 * their authorized accounts/stations and never leak another tenant's data.
 */
export function filterTvAuthorizedAccounts(
  accounts: AccountSummary[],
  auth: TvAuthFilterOptions
): AccountSummary[] {
  if (!Array.isArray(accounts) || accounts.length === 0) return [];

  let list = accounts;
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

  // 1. Multi-account Fleet Portfolio Overview + separated Fleet Curve + Fleet 7D Analytics
  if (!reqSta && scopedTree.length > 1) {
    slides.push({
      id: 'overview',
      kind: 'overview',
      title: 'Fleet Overview',
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
      title: 'Fleet · 7D Analytics',
      scope: {},
      scopeLabel: `${scopedTree.length} Accounts · ${summary.allPlants.length} Stations`,
      liveSolarKw: summary.liveSolarKw,
      dailyYieldKwh: summary.dailyYieldKwh,
      capacityKw: summary.capacityKw,
      accounts: scopedTree,
    });
  }

  // 2. Per-Account and Per-Station dynamic slides across ALL authorized accounts
  for (const acc of scopedTree) {
    const accScope: HistoryScope = { accountId: acc.account.id };

    // Account-level separated rollup slides when account manages 2+ stations (or 0 mapped plants)
    if (!reqSta && (acc.plants.length > 1 || acc.plants.length === 0)) {
      slides.push({
        id: `account-${acc.account.id}`,
        kind: 'account',
        title: `${acc.account.name} · Live Telemetry`,
        scope: accScope,
        account: acc,
      });

      if (acc.plants.length > 1) {
        slides.push({
          id: `account-stations-${acc.account.id}`,
          kind: 'account-stations',
          title: `${acc.account.name} · Stations`,
          scope: accScope,
          account: acc,
        });
      }

      slides.push({
        id: `financial-acc-${acc.account.id}`,
        kind: 'financial',
        title: `${acc.account.name} · 7D Analytics`,
        scope: accScope,
        scopeLabel: `${acc.plants.length} Stations`,
        liveSolarKw: acc.livePowerKw,
        dailyYieldKwh: acc.dailyYieldKwh,
        capacityKw: acc.capacityKw,
        accounts: [acc],
      });
    }

    // Dedicated Per-Station slides (Live Curve & Inverters + Station 7D Analytics)
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

  // 3. Dynamic triage slide strictly when genuine faults or offline assets exist in active scope
  const triageEntries: TvTriageEntry[] = [];
  for (const acc of scopedTree) {
    for (const plant of acc.plants) {
      const faultInvs = plant.inverters.filter((i) => i.status === 'FAULT');
      const offlineInvs = plant.inverters.filter((i) => i.status === 'OFFLINE');
      if (faultInvs.length > 0 || offlineInvs.length > 0 || plant.hasOfflineLogger) {
        triageEntries.push({
          accountId: acc.account.id,
          accountName: acc.account.name,
          stationId: String(plant.plant.stationId),
          stationName: plant.plant.stationName,
          status: faultInvs.length > 0 ? 'FAULT' : 'OFFLINE',
          faultInverters: faultInvs,
          offlineInverters: offlineInvs,
          hasOfflineLogger: plant.hasOfflineLogger,
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

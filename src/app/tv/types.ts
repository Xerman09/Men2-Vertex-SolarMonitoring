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
  id: 'overview';
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

export interface TvAccountSlide {
  id: string;
  kind: 'account';
  title: string;
  scope: HistoryScope;
  account: FleetAccountNode;
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
  id: 'triage';
  kind: 'triage';
  title: string;
  scope: HistoryScope;
  entries: TvTriageEntry[];
  totalFaults: number;
  totalOffline: number;
}

export interface TvFinancialSlide {
  id: 'financial';
  kind: 'financial';
  title: string;
  scope: HistoryScope;
  liveSolarKw: number;
  dailyYieldKwh: number;
  capacityKw: number;
  accounts: FleetAccountNode[];
}

export type TvSlide =
  | TvOverviewSlide
  | TvAccountSlide
  | TvTriageSlide
  | TvFinancialSlide;

export interface TvAuthFilterOptions {
  isAdmin: boolean;
  isConsumer: boolean;
  user: AuthUser | null;
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
    const userIdStr = auth.user.id !== undefined && auth.user.id !== null ? String(auth.user.id) : '';

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
                String(p.stationId) === cleanStation ||
                `station-${p.stationId}` === userAccId
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
}

/**
 * Deterministically converts authorized fleet telemetry into ordered TV slides:
 * Fleet/Tenant Overview -> Active Account Spotlights -> Triage (only if faults/offline exist) -> Financial & 7D.
 */
export function buildTvSlides(
  authorizedAccounts: AccountSummary[],
  nodes: FleetMatrixNode[] = [],
  options: BuildTvSlidesOptions = {}
): TvSlide[] {
  const tree = buildFleetAccountTree(authorizedAccounts, nodes);
  if (tree.length === 0) return [];

  const allPlants = tree.flatMap((a) => a.plants);
  const allInverters = allPlants.flatMap((p) => p.inverters);

  const liveSolarKw = Number(tree.reduce((s, a) => s + a.livePowerKw, 0).toFixed(1));
  const capacityKw = Number(tree.reduce((s, a) => s + a.capacityKw, 0).toFixed(1));
  const dailyYieldKwh = Number(tree.reduce((s, a) => s + a.dailyYieldKwh, 0).toFixed(1));
  const demandKw = Number(tree.reduce((s, a) => s + (a.demandKw ?? 0), 0).toFixed(1));
  const gridNetKw = Number(tree.reduce((s, a) => s + (a.gridPowerKw ?? 0), 0).toFixed(1));

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

  const overviewScope: HistoryScope = options.isConsumer && tree[0]
    ? { accountId: tree[0].account.id }
    : {};

  const overviewTitle =
    options.isConsumer && tree[0]
      ? `${tree[0].account.name} Overview`
      : 'Fleet Overview';

  const slides: TvSlide[] = [
    {
      id: 'overview',
      kind: 'overview',
      title: overviewTitle,
      scope: overviewScope,
      accounts: tree,
      plants: allPlants,
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
    },
  ];

  // Add per-account spotlight slides for accounts that have stations or live telemetry
  const spotlightAccounts = tree.filter(
    (acc) => acc.plants.length > 0 || acc.account.isLive
  );
  for (const acc of spotlightAccounts) {
    // Avoid duplicating overview when consumer has 1 account
    if (options.isConsumer && spotlightAccounts.length === 1) break;
    slides.push({
      id: `account-${acc.account.id}`,
      kind: 'account',
      title: acc.account.name,
      scope: { accountId: acc.account.id },
      account: acc,
    });
  }

  // Build dynamic triage slide strictly when genuine faults or offline assets exist
  const triageEntries: TvTriageEntry[] = [];
  for (const acc of tree) {
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
      scope: overviewScope,
      entries: triageEntries,
      totalFaults: faultCount,
      totalOffline: offlineCount,
    });
  }

  slides.push({
    id: 'financial',
    kind: 'financial',
    title: '7D Harvest & Financial Yield',
    scope: overviewScope,
    liveSolarKw,
    dailyYieldKwh,
    capacityKw,
    accounts: tree,
  });

  return slides;
}

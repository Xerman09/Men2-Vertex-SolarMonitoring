import type {
  AccountSummary,
  DeviceInfo,
  FleetMatrixNode,
  PlantInfo,
} from '@/lib/types';

export type AssetHealthStatus = 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
export type StatusFilter = 'ALL' | 'ONLINE' | 'STANDBY' | 'FAULT' | 'OFFLINE';
export type FleetSortKey =
  | 'severity'
  | 'power_desc'
  | 'utilization_desc'
  | 'specific_yield_desc'
  | 'yield_desc'
  | 'name_asc';
export type FleetViewMode = 'workspace' | 'matrix';

export interface FleetScopeSelection {
  mode: 'fleet' | 'account' | 'plant';
  accountId?: string;
  stationId?: string;
}

export interface FleetInverterNode extends DeviceInfo {
  ratedKw: number;
  liveSolarPowerKw: number;
  dailyYieldKwh: number;
  specificYieldKwhKwp: number | null;
  utilizationPct: number;
  status: AssetHealthStatus;
  loggerStatus: AssetHealthStatus;
  batterySoc: number;
  mode?: string;
  model: string;
}

export interface FleetPlantNode {
  plantKey: string;
  accountId: string;
  accountName: string;
  plant: PlantInfo;
  inverters: FleetInverterNode[];
  loggers: DeviceInfo[];
  livePowerKw: number;
  dailyYieldKwh: number;
  capacityKw: number;
  specificYieldKwhKwp: number | null;
  utilizationPct: number;
  demandKw?: number;
  gridPowerKw?: number;
  batterySoc?: number;
  status: AssetHealthStatus;
  hasOfflineLogger: boolean;
}

export interface FleetAccountNode {
  account: AccountSummary;
  isDemo: boolean;
  plants: FleetPlantNode[];
  livePowerKw: number;
  dailyYieldKwh: number;
  capacityKw: number;
  specificYieldKwhKwp: number | null;
  utilizationPct: number;
  demandKw?: number;
  gridPowerKw?: number;
  batterySoc?: number;
  invertersCount: number;
  loggersCount: number;
  faultCount: number;
  offlineCount: number;
  standbyCount: number;
  onlineCount: number;
}

export interface NocInverterRow {
  rowId: string;
  accountId: string;
  accountName: string;
  stationId: string;
  stationName: string;
  deviceSn: string;
  model: string;
  loggerSn: string;
  loggerStatus: AssetHealthStatus;
  status: AssetHealthStatus;
  severityRank: number;
  liveSolarPowerKw: number;
  ratedKw: number;
  utilizationPct: number;
  dailyYieldKwh: number;
  specificYieldKwhKwp: number | null;
  batterySoc: number;
  mode: string;
}

export type NocSortColumn =
  | 'deviceSn'
  | 'stationName'
  | 'status'
  | 'loggerSn'
  | 'liveSolarPowerKw'
  | 'ratedKw'
  | 'utilizationPct'
  | 'dailyYieldKwh'
  | 'specificYieldKwhKwp'
  | 'batterySoc';

export type NocSortDirection = 'ascending' | 'descending';

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function getSeverityRank(status: string | undefined): number {
  switch (status) {
    case 'FAULT':
      return 3;
    case 'OFFLINE':
      return 2;
    case 'STANDBY':
      return 1;
    default:
      return 0;
  }
}

export function computeSpecificYield(
  dailyYieldKwh: number,
  capacityKw: number
): number | null {
  if (!Number.isFinite(capacityKw) || capacityKw <= 0) return null;
  if (!Number.isFinite(dailyYieldKwh) || dailyYieldKwh < 0) return 0;
  return Number((dailyYieldKwh / capacityKw).toFixed(2));
}

export function computeUtilizationPct(
  livePowerKw: number,
  capacityKw: number
): number {
  if (!Number.isFinite(capacityKw) || capacityKw <= 0) return 0;
  if (!Number.isFinite(livePowerKw) || livePowerKw <= 0) return 0;
  return Number(Math.min(100, (livePowerKw / capacityKw) * 100).toFixed(1));
}

/**
 * Normalizes authorized accounts + fleet matrix nodes into structured account/plant/inverter tree
 * using 100% authentic telemetry with zero equal-split division or hardcoded 50/120 kW fallbacks.
 */
export function buildFleetAccountTree(
  authorizedAccounts: AccountSummary[],
  nodes: FleetMatrixNode[] = []
): FleetAccountNode[] {
  if (!authorizedAccounts || authorizedAccounts.length === 0) return [];

  return authorizedAccounts.map((acc) => {
    const isAccDemo = Boolean(acc.isDemo);

    const plants: FleetPlantNode[] = (acc.plants || []).map((plant) => {
      const plantKey = `${acc.id}:${plant.stationId}`;
      const plantNodes = nodes.filter(
        (n) =>
          String(n.stationId) === String(plant.stationId) &&
          n.accountId === acc.id
      );

      const plantInverterDevices = (plant.devices || []).filter(
        (d) => d.deviceType === 'INVERTER'
      );
      const loggers = (plant.devices || []).filter(
        (d) => d.deviceType === 'LOGGER'
      );
      const isSingleInverterPlant = plantInverterDevices.length === 1;

      const inverters: FleetInverterNode[] = plantInverterDevices.map(
        (device, idx) => {
          const matchedNode = plantNodes.find(
            (n) => n.deviceSn === device.deviceSn
          );

          // Single-inverter station maps 1-to-1 to plant telemetry if node summary is absent;
          // multi-inverter stations without per-inverter readings report honest 0 (never divided).
          const liveKw = matchedNode
            ? matchedNode.liveSolarPowerKw
            : isSingleInverterPlant
            ? plant.liveSolarPowerKw ?? 0
            : 0;
          const dailyYield = matchedNode
            ? matchedNode.dailyYieldKwh ?? 0
            : isSingleInverterPlant
            ? plant.dailyYieldKwh ?? 0
            : 0;

          const rated = device.ratedKw || matchedNode?.ratedKw || 0;
          const status: AssetHealthStatus =
            (matchedNode?.status as AssetHealthStatus) ||
            (device.status as AssetHealthStatus) ||
            'ONLINE';

          const pairedLogger =
            loggers.find((l) => l.deviceSn === device.loggerSn) ||
            loggers[idx] ||
            loggers[0];
          const loggerSn = device.loggerSn || matchedNode?.loggerSn || pairedLogger?.deviceSn;
          const loggerStatus: AssetHealthStatus =
            (matchedNode?.loggerStatus as AssetHealthStatus) ||
            (pairedLogger?.status as AssetHealthStatus) ||
            (status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE');

          const batterySoc = matchedNode?.batterySoc ?? 0;

          return {
            ...device,
            ratedKw: rated,
            liveSolarPowerKw: Number((liveKw || 0).toFixed(2)),
            dailyYieldKwh: Number((dailyYield || 0).toFixed(2)),
            specificYieldKwhKwp: computeSpecificYield(dailyYield || 0, rated),
            utilizationPct: computeUtilizationPct(liveKw || 0, rated),
            status,
            loggerSn,
            loggerStatus,
            batterySoc,
            mode: matchedNode?.mode,
            model: device.model || matchedNode?.model || 'Deye Inverter',
          };
        }
      );

      const sumInvLiveKw = inverters.reduce(
        (sum, inv) => sum + inv.liveSolarPowerKw,
        0
      );
      const plantLivePowerKw =
        inverters.length > 0 && sumInvLiveKw !== 0
          ? sumInvLiveKw
          : plant.liveSolarPowerKw ?? sumInvLiveKw;

      const sumInvDailyKwh = inverters.reduce(
        (sum, inv) => sum + inv.dailyYieldKwh,
        0
      );
      const plantDailyYieldKwh =
        inverters.length > 0 && sumInvDailyKwh > 0
          ? sumInvDailyKwh
          : plant.dailyYieldKwh ?? sumInvDailyKwh;

      const sumRatedKw = inverters.reduce((sum, inv) => sum + inv.ratedKw, 0);
      const capacityKw =
        plant.installedCapacityKw && plant.installedCapacityKw > 0
          ? plant.installedCapacityKw
          : sumRatedKw;

      const plantDemandKw =
        typeof plant.consumptionPowerKw === 'number'
          ? plant.consumptionPowerKw
          : plantNodes.some((n) => typeof n.consumptionPowerKw === 'number')
          ? plantNodes.reduce((sum, n) => sum + (n.consumptionPowerKw || 0), 0)
          : undefined;

      const plantGridPowerKw =
        typeof plant.gridPowerKw === 'number'
          ? plant.gridPowerKw
          : plantNodes.some((n) => typeof n.gridPowerKw === 'number')
          ? plantNodes.reduce((sum, n) => sum + (n.gridPowerKw || 0), 0)
          : undefined;

      const plantBatterySoc =
        typeof plant.batterySoc === 'number' && plant.batterySoc > 0
          ? plant.batterySoc
          : plantNodes.find((n) => n.batterySoc > 0)?.batterySoc;

      const hasFault = inverters.some((i) => i.status === 'FAULT');
      const allOffline =
        inverters.length > 0 && inverters.every((i) => i.status === 'OFFLINE');
      const hasOfflineLogger =
        loggers.some((l) => l.status === 'OFFLINE') ||
        inverters.some((i) => i.loggerStatus === 'OFFLINE');

      let plantStatus: AssetHealthStatus = 'ONLINE';
      if (hasFault) plantStatus = 'FAULT';
      else if (allOffline) plantStatus = 'OFFLINE';
      else if (plantLivePowerKw === 0) plantStatus = 'STANDBY';

      return {
        plantKey,
        accountId: acc.id,
        accountName: acc.name,
        plant,
        inverters,
        loggers,
        livePowerKw: Number(plantLivePowerKw.toFixed(2)),
        dailyYieldKwh: Number(plantDailyYieldKwh.toFixed(2)),
        capacityKw: Number(capacityKw.toFixed(1)),
        specificYieldKwhKwp: computeSpecificYield(plantDailyYieldKwh, capacityKw),
        utilizationPct: computeUtilizationPct(plantLivePowerKw, capacityKw),
        demandKw:
          plantDemandKw !== undefined
            ? Number(plantDemandKw.toFixed(2))
            : undefined,
        gridPowerKw:
          plantGridPowerKw !== undefined
            ? Number(plantGridPowerKw.toFixed(2))
            : undefined,
        batterySoc: plantBatterySoc,
        status: plantStatus,
        hasOfflineLogger,
      };
    });

    const sumPlantLiveKw = plants.reduce((sum, p) => sum + p.livePowerKw, 0);
    const accLivePowerKw =
      sumPlantLiveKw !== 0 ? sumPlantLiveKw : acc.liveSolarPowerKw || 0;
    const sumPlantDailyKwh = plants.reduce((sum, p) => sum + p.dailyYieldKwh, 0);
    const accDailyYieldKwh =
      sumPlantDailyKwh > 0 ? sumPlantDailyKwh : acc.dailyYieldKwh || 0;
    const sumPlantCapKw = plants.reduce((sum, p) => sum + p.capacityKw, 0);
    const accCapacityKw =
      sumPlantCapKw > 0 ? sumPlantCapKw : acc.capacityKw || 0;

    const accDemandKw =
      typeof acc.consumptionPowerKw === 'number'
        ? acc.consumptionPowerKw
        : plants.some((p) => typeof p.demandKw === 'number')
        ? plants.reduce((sum, p) => sum + (p.demandKw || 0), 0)
        : undefined;

    const accGridPowerKw =
      typeof acc.gridPowerKw === 'number'
        ? acc.gridPowerKw
        : plants.some((p) => typeof p.gridPowerKw === 'number')
        ? plants.reduce((sum, p) => sum + (p.gridPowerKw || 0), 0)
        : undefined;

    const allInverters = plants.flatMap((p) => p.inverters);
    const faultCount = allInverters.filter((i) => i.status === 'FAULT').length;
    const offlineCount = allInverters.filter(
      (i) => i.status === 'OFFLINE'
    ).length;
    const standbyCount = allInverters.filter(
      (i) => i.status === 'STANDBY' || (i.status === 'ONLINE' && i.liveSolarPowerKw === 0)
    ).length;
    const onlineCount = Math.max(
      0,
      allInverters.length - faultCount - offlineCount
    );

    return {
      account: acc,
      isDemo: isAccDemo,
      plants,
      livePowerKw: Number(accLivePowerKw.toFixed(2)),
      dailyYieldKwh: Number(accDailyYieldKwh.toFixed(2)),
      capacityKw: Number(accCapacityKw.toFixed(1)),
      specificYieldKwhKwp: computeSpecificYield(
        accDailyYieldKwh,
        accCapacityKw
      ),
      utilizationPct: computeUtilizationPct(accLivePowerKw, accCapacityKw),
      demandKw:
        accDemandKw !== undefined ? Number(accDemandKw.toFixed(2)) : undefined,
      gridPowerKw:
        accGridPowerKw !== undefined
          ? Number(accGridPowerKw.toFixed(2))
          : undefined,
      batterySoc:
        typeof acc.batterySoc === 'number' && acc.batterySoc > 0
          ? acc.batterySoc
          : undefined,
      invertersCount: allInverters.length,
      loggersCount: plants.reduce((sum, p) => sum + p.loggers.length, 0),
      faultCount,
      offlineCount,
      standbyCount,
      onlineCount,
    };
  });
}

export function sortPlants(
  plants: FleetPlantNode[],
  sortKey: FleetSortKey
): FleetPlantNode[] {
  const list = [...plants];
  list.sort((a, b) => {
    switch (sortKey) {
      case 'severity': {
        const diff = getSeverityRank(b.status) - getSeverityRank(a.status);
        if (diff !== 0) return diff;
        return b.livePowerKw - a.livePowerKw;
      }
      case 'power_desc':
        return b.livePowerKw - a.livePowerKw;
      case 'utilization_desc':
        return b.utilizationPct - a.utilizationPct;
      case 'specific_yield_desc':
        return (b.specificYieldKwhKwp ?? -1) - (a.specificYieldKwhKwp ?? -1);
      case 'yield_desc':
        return b.dailyYieldKwh - a.dailyYieldKwh;
      case 'name_asc':
        return textCollator.compare(a.plant.stationName, b.plant.stationName);
      default:
        return 0;
    }
  });
  return list;
}

export function sortInverters(
  inverters: FleetInverterNode[],
  sortKey: FleetSortKey
): FleetInverterNode[] {
  const list = [...inverters];
  list.sort((a, b) => {
    switch (sortKey) {
      case 'severity': {
        const diff = getSeverityRank(b.status) - getSeverityRank(a.status);
        if (diff !== 0) return diff;
        return b.liveSolarPowerKw - a.liveSolarPowerKw;
      }
      case 'power_desc':
        return b.liveSolarPowerKw - a.liveSolarPowerKw;
      case 'utilization_desc':
        return b.utilizationPct - a.utilizationPct;
      case 'specific_yield_desc':
        return (b.specificYieldKwhKwp ?? -1) - (a.specificYieldKwhKwp ?? -1);
      case 'yield_desc':
        return b.dailyYieldKwh - a.dailyYieldKwh;
      case 'name_asc':
        return textCollator.compare(a.deviceSn, b.deviceSn);
      default:
        return 0;
    }
  });
  return list;
}

export function sortAccounts(
  accounts: FleetAccountNode[],
  sortKey: FleetSortKey
): FleetAccountNode[] {
  const list = [...accounts];
  list.sort((a, b) => {
    switch (sortKey) {
      case 'severity': {
        const aRank = a.faultCount > 0 ? 3 : a.offlineCount > 0 ? 2 : a.livePowerKw === 0 ? 1 : 0;
        const bRank = b.faultCount > 0 ? 3 : b.offlineCount > 0 ? 2 : b.livePowerKw === 0 ? 1 : 0;
        if (bRank !== aRank) return bRank - aRank;
        return b.livePowerKw - a.livePowerKw;
      }
      case 'power_desc':
        return b.livePowerKw - a.livePowerKw;
      case 'utilization_desc':
        return b.utilizationPct - a.utilizationPct;
      case 'specific_yield_desc':
        return (b.specificYieldKwhKwp ?? -1) - (a.specificYieldKwhKwp ?? -1);
      case 'yield_desc':
        return b.dailyYieldKwh - a.dailyYieldKwh;
      case 'name_asc':
        return textCollator.compare(a.account.name, b.account.name);
      default:
        return 0;
    }
  });
  return list;
}

export function filterFleetTree(
  tree: FleetAccountNode[],
  searchQuery: string,
  statusFilter: StatusFilter,
  sortKey: FleetSortKey
): FleetAccountNode[] {
  const q = searchQuery.toLowerCase().trim();

  const filtered = tree
    .map((accGroup) => {
      const matchesAccName =
        !q || accGroup.account.name.toLowerCase().includes(q);

      const matchingPlants = accGroup.plants
        .map((pGroup) => {
          const matchesPlantStatus =
            statusFilter === 'ALL' || pGroup.status === statusFilter;
          const matchesPlantText =
            !q ||
            pGroup.plant.stationName.toLowerCase().includes(q) ||
            String(pGroup.plant.stationId).toLowerCase().includes(q) ||
            matchesAccName;

          const matchingInverters = pGroup.inverters.filter((inv) => {
            const matchesInvStatus =
              statusFilter === 'ALL' || inv.status === statusFilter;
            const matchesInvText =
              !q ||
              inv.deviceSn.toLowerCase().includes(q) ||
              (inv.model && inv.model.toLowerCase().includes(q)) ||
              (inv.loggerSn && inv.loggerSn.toLowerCase().includes(q)) ||
              matchesPlantText;
            return matchesInvStatus && matchesInvText;
          });

          if (
            matchingInverters.length > 0 ||
            (matchesPlantStatus && matchesPlantText && pGroup.inverters.length === 0)
          ) {
            return {
              ...pGroup,
              inverters: sortInverters(
                matchingInverters.length > 0
                  ? matchingInverters
                  : pGroup.inverters,
                sortKey
              ),
            };
          }
          return null;
        })
        .filter((p): p is FleetPlantNode => p !== null);

      if (matchingPlants.length > 0 || (!q && statusFilter === 'ALL')) {
        return {
          ...accGroup,
          plants: sortPlants(matchingPlants, sortKey),
        };
      }
      if (matchesAccName && statusFilter === 'ALL' && q) {
        return {
          ...accGroup,
          plants: sortPlants(accGroup.plants, sortKey),
        };
      }
      return null;
    })
    .filter((a): a is FleetAccountNode => a !== null);

  return sortAccounts(filtered, sortKey);
}

export function buildNocTableRows(
  accounts: FleetAccountNode[],
  scope: FleetScopeSelection
): NocInverterRow[] {
  const rows: NocInverterRow[] = [];

  for (const acc of accounts) {
    if (
      scope.mode !== 'fleet' &&
      scope.accountId &&
      acc.account.id !== scope.accountId
    ) {
      continue;
    }

    for (const plant of acc.plants) {
      if (
        scope.mode === 'plant' &&
        scope.stationId &&
        String(plant.plant.stationId) !== String(scope.stationId)
      ) {
        continue;
      }

      for (const inv of plant.inverters) {
        rows.push({
          rowId: `${acc.account.id}:${plant.plant.stationId}:${inv.deviceSn}`,
          accountId: acc.account.id,
          accountName: acc.account.name,
          stationId: String(plant.plant.stationId),
          stationName: plant.plant.stationName,
          deviceSn: inv.deviceSn,
          model: inv.model,
          loggerSn: inv.loggerSn || '--',
          loggerStatus: inv.loggerStatus,
          status: inv.status,
          severityRank: getSeverityRank(inv.status),
          liveSolarPowerKw: inv.liveSolarPowerKw,
          ratedKw: inv.ratedKw,
          utilizationPct: inv.utilizationPct,
          dailyYieldKwh: inv.dailyYieldKwh,
          specificYieldKwhKwp: inv.specificYieldKwhKwp,
          batterySoc: inv.batterySoc,
          mode: inv.mode || '--',
        });
      }
    }
  }

  return rows;
}

export function sortNocTableRows(
  rows: NocInverterRow[],
  column: NocSortColumn,
  direction: NocSortDirection
): NocInverterRow[] {
  const factor = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (column) {
      case 'deviceSn':
      case 'stationName':
      case 'loggerSn':
        return factor * textCollator.compare(a[column], b[column]);
      case 'status':
        return factor * (a.severityRank - b.severityRank);
      case 'specificYieldKwhKwp':
        return factor * ((a.specificYieldKwhKwp ?? -1) - (b.specificYieldKwhKwp ?? -1));
      case 'liveSolarPowerKw':
      case 'ratedKw':
      case 'utilizationPct':
      case 'dailyYieldKwh':
      case 'batterySoc':
        return factor * (a[column] - b[column]);
      default:
        return 0;
    }
  });
}

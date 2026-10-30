import { DeyeCloudClient } from './deye-client';
import {
  DeyeAccountConfig,
  AccountSummary,
  AggregatedFleetSummary,
  FleetMatrixNode,
} from './types';

/**
 * Pure helper: single-node SN-filtered view over an aggregated fleet summary.
 * Returns null for blank/ALL passthrough (caller keeps the full fleet
 * byte-identical) and for unknown SN (caller maps to 404, never 403, so
 * SN existence across tenants is not leaked).
 */
export function filterFleetByDeviceSn(
  aggregate: AggregatedFleetSummary,
  sn: string | null | undefined
): { nodes: FleetMatrixNode[]; deviceSn: string } | null {
  if (sn === null || sn === undefined) return null;
  const clean = String(sn).trim();
  if (clean === '' || clean === 'ALL' || clean === 'ALL_FLEET') return null;
  const matched = aggregate.nodes.filter(
    (n) => n && n.deviceSn != null && String(n.deviceSn).trim() === clean
  );
  if (matched.length === 0) return null;
  return { nodes: matched, deviceSn: clean };
}

export class FleetAggregator {
  /**
   * Poll all active accounts (or specific allowed accounts), plants, and inverters concurrently
   * to compute high-performance fleet aggregate and node matrix.
   */
  public async aggregateFleet(
    allClients: DeyeCloudClient[],
    allRawAccounts: DeyeAccountConfig[],
    accountIds?: string[]
  ): Promise<AggregatedFleetSummary> {
    let rawAccounts = allRawAccounts.filter((a) => a.enabled !== false);
    if (rawAccounts.length === 0 && allRawAccounts.length > 0) {
      rawAccounts = allRawAccounts;
    }

    // Ensure every rawAccount has a client instance so no database account is ever dropped
    const clientById = new Map<string, DeyeCloudClient>();
    for (const c of allClients) {
      clientById.set(c.accountId, c);
    }
    for (const acc of rawAccounts) {
      if (!clientById.has(acc.id)) {
        clientById.set(acc.id, new DeyeCloudClient(acc));
      }
    }

    const enabledAccountIds = new Set(rawAccounts.map((a) => a.id));
    let clients = Array.from(clientById.values()).filter((c) => enabledAccountIds.has(c.accountId));

    if (accountIds && accountIds.length > 0) {
      const allowedSet = new Set(accountIds.map((id) => String(id).trim()));
      const filteredClients = clients.filter((c) => {
        if (allowedSet.has(c.accountId)) return true;
        if (
          c.directusId &&
          (allowedSet.has(String(c.directusId)) ||
            allowedSet.has(`directus-${c.directusId}`) ||
            allowedSet.has(`deye-cfg-${c.directusId}`))
        ) {
          return true;
        }
        if (c.accountEmail && allowedSet.has(c.accountEmail.toLowerCase())) {
          return true;
        }
        if (
          c.plants?.some(
            (p) =>
              allowedSet.has(String(p.stationId)) ||
              allowedSet.has(`station-${p.stationId}`)
          )
        ) {
          return true;
        }
        return false;
      });
      // If an account exists in the database, never allow an ID alias mismatch to produce 0 accounts
      if (filteredClients.length > 0) {
        clients = filteredClients;
      }
    }

    const promises = clients.map(async (client) => {
      const accConfig = rawAccounts.find((a) => a.id === client.accountId);
      const plants = accConfig?.plants || [];
      const inverterSns = plants
        .flatMap((p) => p.devices)
        .filter((d) => d.deviceType === 'INVERTER')
        .map((d) => d.deviceSn);

      const [stationRes, batchData, health] = await Promise.all([
        client.getStationSummary(),
        inverterSns.length > 0 ? client.getBatchDeviceLatest(inverterSns) : Promise.resolve(new Map()),
        client.getHealth(),
      ]);

      return {
        client,
        station: stationRes.data,
        isLive: stationRes.isLive,
        batchData,
        health,
      };
    });

    const results = await Promise.allSettled(promises);

    let totalCapacityKw = 0;
    let totalSolarPowerKw = 0;
    let totalDailyYieldKwh = 0;
    let totalLifetimeYieldMwh = 0;
    let totalBatteryPowerKw = 0;
    let netGridPowerKw = 0;
    let totalLoadPowerKw = 0;
    let sumBatterySoc = 0;
    let activeAccounts = 0;
    let anyLive = false;

    const accountSummaries: AccountSummary[] = [];
    const nodes: FleetMatrixNode[] = [];
    let totalPlants = 0;
    let totalInverters = 0;
    let totalLoggers = 0;

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const client = clients[i];
      const accConfig = rawAccounts.find((a) => a.id === client.accountId);

      const plants = accConfig?.plants || [];
      totalPlants += plants.length;

      let invCount = 0;
      let logCount = 0;

      if (res.status === 'fulfilled') {
        const item = res.value;
        const configuredPlantCapSum = plants.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0);
        const accountCapacityKw = item.station.capacityKw > 0 ? item.station.capacityKw : configuredPlantCapSum;
        totalCapacityKw += accountCapacityKw;
        totalBatteryPowerKw += item.station.batteryPowerKw;
        netGridPowerKw += item.station.gridPowerKw;
        totalLoadPowerKw += item.station.loadPowerKw;
        sumBatterySoc += item.station.batterySoc;
        activeAccounts += 1;
        if (item.isLive) anyLive = true;

        let accSolarKw = 0;
        let accDailyKwh = 0;
        let accLifetimeMwh = 0;

        // Build nodes for inverters in each plant of this account, embedding logger details
        for (const plant of plants) {
          const inverters = plant.devices.filter((d) => d.deviceType === 'INVERTER');
          const loggers = plant.devices.filter((d) => d.deviceType === 'LOGGER');
          logCount += loggers.length;

          const plantSum = item.station.plantsSummary?.find(
            (ps) => String(ps.stationId) === String(plant.stationId)
          );

          // Check whether any inverter in this plant reported live batch power/yield
          // so standby (0 kW) inverters are not double-counted with plant average power.
          const plantHasBatchSolar = inverters.some((inv) => {
            const d = item.batchData?.get(inv.deviceSn);
            return d ? parseFloat(d.get('TotalActiveACOutputPower') || '0') > 0 : false;
          });
          const plantHasBatchDaily = inverters.some((inv) => {
            const d = item.batchData?.get(inv.deviceSn);
            return d ? parseFloat(d.get('DailyActiveProduction') || '0') > 0 : false;
          });

          let plantSolarKw = 0;
          let plantDailyKwh = 0;

          if (inverters.length === 0 && plantSum) {
            plantSolarKw = plantSum.liveSolarPowerKw || 0;
            plantDailyKwh = plantSum.dailyYieldKwh || 0;
            accSolarKw += plantSolarKw;
            accDailyKwh += plantDailyKwh;
            accLifetimeMwh += plantSum.totalYieldMwh || 0;
          }

          for (let invIdx = 0; invIdx < inverters.length; invIdx++) {
            const device = inverters[invIdx];
            invCount++;

            // Pair with corresponding logger
            const matchingLogger =
              loggers.find((l) => l.deviceSn === device.loggerSn) ||
              loggers[invIdx] ||
              loggers[0];
            const loggerSn = device.loggerSn || matchingLogger?.deviceSn;
            const loggerStatus = matchingLogger?.status || 'ONLINE';

            const devData = item.batchData?.get(device.deviceSn);
            const liveKw = devData
              ? parseFloat((parseFloat(devData.get('TotalActiveACOutputPower') || '0') / 1000).toFixed(2))
              : 0;
            const dailyKwh = devData
              ? parseFloat(devData.get('DailyActiveProduction') || '0')
              : 0;
            const lifetimeKwh = devData
              ? parseFloat(devData.get('TotalActiveProduction') || '0')
              : 0;
            const ratedPowerW = devData
              ? parseFloat(devData.get('RatedPower') || '50000')
              : (device.ratedKw ? device.ratedKw * 1000 : 50000);
            const consKw = devData
              ? parseFloat((parseFloat(devData.get('TotalConsumptionPower') || '0') / 1000).toFixed(2))
              : 0;

            // Use per-plant telemetry from plantsSummary only if this plant had no live inverter batch readings
            const assignedLiveKw = plantHasBatchSolar
              ? liveKw
              : plantSum
              ? parseFloat(((plantSum.liveSolarPowerKw || 0) / (inverters.length || 1)).toFixed(2))
              : plants.length <= 1
              ? parseFloat(((item.station.liveSolarPowerKw || 0) / (inverters.length || 1)).toFixed(2))
              : 0;
            const assignedDailyKwh = plantHasBatchDaily
              ? dailyKwh
              : plantSum
              ? parseFloat(((plantSum.dailyYieldKwh || 0) / (inverters.length || 1)).toFixed(2))
              : plants.length <= 1
              ? parseFloat(((item.station.dailyYieldKwh || 0) / (inverters.length || 1)).toFixed(2))
              : 0;
            const assignedGridKw = plantSum ? plantSum.gridPowerKw : item.station.gridPowerKw;
            const assignedConsKw = consKw > 0
              ? consKw
              : plantSum
              ? parseFloat(((plantSum.loadPowerKw || 0) / (inverters.length || 1)).toFixed(2))
              : 0;
            const assignedBatterySoc = plantSum?.batterySoc ?? (item.station.batterySoc || 0);

            plantSolarKw += assignedLiveKw;
            plantDailyKwh += assignedDailyKwh;
            accSolarKw += assignedLiveKw;
            accDailyKwh += assignedDailyKwh;
            accLifetimeMwh += lifetimeKwh > 0 ? lifetimeKwh / 1000 : (plantSum?.totalYieldMwh || item.station.totalYieldMwh || 0);

            nodes.push({
              accountId: client.accountId,
              accountName: client.accountName,
              stationName: plant.stationName,
              stationId: plant.stationId,
              deviceSn: device.deviceSn,
              deviceType: 'INVERTER',
              model: `SUN-${Math.round(ratedPowerW / 1000)}K-SG01HP3-EU-AM2`,
              ratedKw: Math.round(ratedPowerW / 1000),
              loggerSn: loggerSn,
              loggerStatus: loggerStatus,
              liveSolarPowerKw: assignedLiveKw,
              dailyYieldKwh: assignedDailyKwh,
              gridPowerKw: assignedGridKw,
              consumptionPowerKw: assignedConsKw,
              batterySoc: assignedBatterySoc,
              mode: 'PEAK SHAVING',
              status: devData ? 'ONLINE' : (plantSum?.status === 'ONLINE' || device.status === 'ONLINE') ? 'ONLINE' : 'STANDBY',
              isLive: item.isLive,
            });
          }

          // Synchronize plant-level live metrics so Account & Fleet views share identical plant telemetry
          plant.liveSolarPowerKw = parseFloat(
            (plantSolarKw > 0 ? plantSolarKw : (plantSum?.liveSolarPowerKw ?? plant.liveSolarPowerKw ?? 0)).toFixed(2)
          );
          plant.dailyYieldKwh = parseFloat(
            (plantDailyKwh > 0 ? plantDailyKwh : (plantSum?.dailyYieldKwh ?? plant.dailyYieldKwh ?? 0)).toFixed(2)
          );
          if (plantSum) {
            plant.consumptionPowerKw = plantSum.loadPowerKw;
            plant.gridPowerKw = plantSum.gridPowerKw;
            plant.batterySoc = plantSum.batterySoc;
            if (plantSum.capacityKw > 0) {
              plant.installedCapacityKw = plantSum.capacityKw;
            }
          }
        }

        // Use station solar kW and yield if individual inverters weren't in current plant batch
        const finalSolarKw = accSolarKw > 0 ? accSolarKw : item.station.liveSolarPowerKw;
        const finalDailyKwh = accDailyKwh > 0 ? accDailyKwh : item.station.dailyYieldKwh;
        const finalLifetimeMwh = accLifetimeMwh > 0 ? accLifetimeMwh : (item.station.totalYieldMwh || 0);
        totalSolarPowerKw += finalSolarKw;
        totalDailyYieldKwh += finalDailyKwh;
        totalLifetimeYieldMwh += finalLifetimeMwh;

        totalInverters += invCount;
        totalLoggers += logCount;

        accountSummaries.push({
          id: client.accountId,
          directusId: accConfig?.directusId,
          userId: accConfig?.userId,
          name: client.accountName,
          email: accConfig?.email,
          enabled: accConfig?.enabled,
          admin: accConfig?.admin,
          isDemo: Boolean(accConfig?.isDemo),
          isLive: item.isLive,
          stationCount: plants.length,
          deviceCount: invCount + logCount,
          inverterCount: invCount,
          loggerCount: logCount,
          liveSolarPowerKw: parseFloat(finalSolarKw.toFixed(2)),
          dailyYieldKwh: parseFloat(finalDailyKwh.toFixed(2)),
          gridPowerKw: item.station.gridPowerKw,
          consumptionPowerKw: item.station.loadPowerKw,
          batterySoc: item.station.batterySoc,
          capacityKw: parseFloat(accountCapacityKw.toFixed(1)),
          status: item.isLive ? 'ONLINE' : 'OFFLINE',
          lastPingMs: item.health.pingMs,
          plants,
          autoDiscovered: accConfig?.autoDiscovered,
          lastSyncedAt: accConfig?.lastSyncedAt,
        });
      } else {
        const fallbackCap = plants.reduce((sum, p) => sum + (p.installedCapacityKw || 0), 0);
        totalCapacityKw += fallbackCap;
        accountSummaries.push({
          id: client.accountId,
          directusId: accConfig?.directusId,
          userId: accConfig?.userId,
          name: client.accountName,
          email: accConfig?.email,
          enabled: accConfig?.enabled,
          admin: accConfig?.admin,
          isDemo: Boolean(accConfig?.isDemo),
          isLive: false,
          stationCount: plants.length,
          deviceCount: 0,
          inverterCount: 0,
          loggerCount: 0,
          liveSolarPowerKw: 0,
          dailyYieldKwh: 0,
          capacityKw: parseFloat(fallbackCap.toFixed(1)),
          status: 'OFFLINE',
          lastPingMs: 999,
          plants,
          autoDiscovered: accConfig?.autoDiscovered,
          lastSyncedAt: accConfig?.lastSyncedAt,
        });
      }
    }

    const count = activeAccounts || 1;
    const avgBatterySoc = parseFloat((sumBatterySoc / count).toFixed(1));

    return {
      totalAccounts: Math.max(clients.length, accountSummaries.length),
      activeAccounts,
      totalPlants,
      totalInverters,
      totalLoggers,
      totalCapacityKw: parseFloat(totalCapacityKw.toFixed(1)),
      totalSolarPowerKw: parseFloat(totalSolarPowerKw.toFixed(1)),
      totalDailyYieldKwh: parseFloat(totalDailyYieldKwh.toFixed(1)),
      totalLifetimeYieldMwh: parseFloat(totalLifetimeYieldMwh.toFixed(1)),
      avgBatterySoc,
      totalBatteryPowerKw: parseFloat(totalBatteryPowerKw.toFixed(1)),
      netGridPowerKw: parseFloat(netGridPowerKw.toFixed(1)),
      totalLoadPowerKw: parseFloat(totalLoadPowerKw.toFixed(1)),
      accounts: accountSummaries,
      nodes,
      isLive: anyLive,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export const fleetAggregator = new FleetAggregator();

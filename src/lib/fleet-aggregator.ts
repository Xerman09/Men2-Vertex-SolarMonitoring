import { DeyeCloudClient } from './deye-client';
import {
  DeyeAccountConfig,
  AccountSummary,
  AggregatedFleetSummary,
  FleetMatrixNode,
} from './types';

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
    let clients = allClients.filter((c) => c.hasCredentials());
    if (accountIds && accountIds.length > 0) {
      const allowedSet = new Set(accountIds);
      clients = clients.filter((c) => allowedSet.has(c.accountId));
    }

    const rawAccounts = allRawAccounts.filter((a) => a.enabled !== false);

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
        totalCapacityKw += item.station.capacityKw;
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

            // Use per-plant telemetry from plantsSummary if individual inverter batchData is empty
            const plantSum = item.station.plantsSummary?.find((ps) => String(ps.stationId) === String(plant.stationId));
            const assignedLiveKw = liveKw > 0
              ? liveKw
              : plantSum
              ? parseFloat(((plantSum.liveSolarPowerKw || 0) / (inverters.length || 1)).toFixed(2))
              : 0;
            const assignedDailyKwh = dailyKwh > 0
              ? dailyKwh
              : plantSum
              ? parseFloat(((plantSum.dailyYieldKwh || 0) / (inverters.length || 1)).toFixed(2))
              : 0;
            const assignedGridKw = plantSum ? plantSum.gridPowerKw : item.station.gridPowerKw;
            const assignedConsKw = consKw > 0
              ? consKw
              : plantSum
              ? parseFloat(((plantSum.loadPowerKw || 0) / (inverters.length || 1)).toFixed(2))
              : 0;
            const assignedBatterySoc = plantSum?.batterySoc ?? (item.station.batterySoc || 0);

            accSolarKw += assignedLiveKw;
            accDailyKwh += assignedDailyKwh;
            accLifetimeMwh += lifetimeKwh > 0 ? lifetimeKwh / 1000 : (plantSum?.totalYieldMwh || 0);

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
        }

        // Use station solar kW if individual inverters weren't in current plant batch
        const finalSolarKw = accSolarKw > 0 ? accSolarKw : item.station.liveSolarPowerKw;
        totalSolarPowerKw += finalSolarKw;
        totalDailyYieldKwh += accDailyKwh;
        totalLifetimeYieldMwh += accLifetimeMwh;

        totalInverters += invCount;
        totalLoggers += logCount;

        accountSummaries.push({
          id: client.accountId,
          name: client.accountName,
          isLive: item.isLive,
          stationCount: plants.length,
          deviceCount: invCount + logCount,
          inverterCount: invCount,
          loggerCount: logCount,
          liveSolarPowerKw: parseFloat(finalSolarKw.toFixed(2)),
          dailyYieldKwh: parseFloat(accDailyKwh.toFixed(2)),
          gridPowerKw: item.station.gridPowerKw,
          consumptionPowerKw: item.station.loadPowerKw,
          capacityKw: item.station.capacityKw,
          status: item.isLive ? 'ONLINE' : 'OFFLINE',
          lastPingMs: item.health.pingMs,
          plants,
          autoDiscovered: accConfig?.autoDiscovered,
          lastSyncedAt: accConfig?.lastSyncedAt,
        });
      } else {
        accountSummaries.push({
          id: client.accountId,
          name: client.accountName,
          isLive: false,
          stationCount: plants.length,
          deviceCount: 0,
          inverterCount: 0,
          loggerCount: 0,
          liveSolarPowerKw: 0,
          dailyYieldKwh: 0,
          capacityKw: 0,
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
      totalAccounts: clients.length,
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

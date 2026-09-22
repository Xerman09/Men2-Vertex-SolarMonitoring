import fs from 'fs';
import path from 'path';
import {
  DeyeAccountConfig,
  AccountSummary,
  AggregatedFleetSummary,
  FleetMatrixNode,
  PlantInfo,
  DeviceInfo,
} from './types';
import { DeyeCloudClient } from './deye-client';

class DeyeAccountManager {
  private accountsCache: DeyeAccountConfig[] | null = null;
  private clientMap: Map<string, DeyeCloudClient> = new Map();
  private lastLoadedAt: number = 0;

  private getConfigPath(): string {
    return path.resolve(process.cwd(), 'deye-accounts.json');
  }

  /**
   * Return ALL accounts from file, including enabled and disabled
   */
  public getAllRawAccounts(forceReload = false): DeyeAccountConfig[] {
    const configPath = this.getConfigPath();
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.accounts)) {
          return parsed.accounts;
        }
      }
    } catch (e) {
      console.warn('[DeyeAccountManager] Failed reading raw deye-accounts.json:', e);
    }
    return [];
  }

  /**
   * Save accounts list to deye-accounts.json
   */
  public saveAccountsToFile(accounts: DeyeAccountConfig[]): boolean {
    const configPath = this.getConfigPath();
    try {
      const payload = { accounts };
      fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf8');
      this.accountsCache = accounts.filter((acc) => acc.enabled !== false);
      this.lastLoadedAt = Date.now();
      this.syncClients();
      return true;
    } catch (e) {
      console.error('[DeyeAccountManager] Failed saving accounts to disk:', e);
      return false;
    }
  }

  /**
   * Load active enabled accounts with caching
   */
  public loadAccounts(forceReload = false): DeyeAccountConfig[] {
    const now = Date.now();
    if (!forceReload && this.accountsCache && now - this.lastLoadedAt < 5000) {
      return this.accountsCache;
    }

    const all = this.getAllRawAccounts(forceReload);
    if (all.length > 0) {
      this.accountsCache = all.filter((acc) => acc.enabled !== false);
      this.syncClients();
      this.lastLoadedAt = now;
      return this.accountsCache;
    }

    // Fallback: build from environment variables
    const fallbackAccount: DeyeAccountConfig = {
      id: 'default-site',
      name: 'Primary Facility',
      enabled: true,
      baseUrl: process.env.DEYE_BASE_URL?.trim() || 'https://api.deyecloud.com',
      appId: process.env.DEYE_APP_ID?.trim() || '',
      appSecret: process.env.DEYE_APP_SECRET?.trim() || '',
      email: process.env.DEYE_EMAIL?.trim() || '',
      password: process.env.DEYE_PASSWORD?.trim() || '',
      defaultStationId: process.env.DEYE_DEFAULT_STATION_ID?.trim() || 'SP_04',
      defaultDeviceSn: process.env.DEYE_DEFAULT_DEVICE_SN?.trim() || '2209X891104',
      plants: [],
    };

    this.accountsCache = [fallbackAccount];
    this.syncClients();
    this.lastLoadedAt = now;
    return this.accountsCache;
  }

  /**
   * Synchronize active DeyeCloudClient instances with enabled accounts
   */
  private syncClients() {
    const currentConfigs = this.accountsCache || [];
    const validIds = new Set(currentConfigs.map((acc) => acc.id));

    // Remove obsolete clients
    for (const id of Array.from(this.clientMap.keys())) {
      if (!validIds.has(id)) {
        this.clientMap.delete(id);
      }
    }

    // Add or update clients
    for (const config of currentConfigs) {
      this.clientMap.set(config.id, new DeyeCloudClient(config));
    }
  }

  /**
   * Get client for specific account
   */
  public getClient(accountId?: string): DeyeCloudClient {
    this.loadAccounts();
    if (accountId && this.clientMap.has(accountId)) {
      return this.clientMap.get(accountId)!;
    }
    const firstClient = this.clientMap.values().next().value;
    if (firstClient) {
      return firstClient;
    }
    return new DeyeCloudClient();
  }

  public getAllClients(): DeyeCloudClient[] {
    this.loadAccounts();
    return Array.from(this.clientMap.values());
  }

  /**
   * Add a new account and automatically discover its plants and devices
   */
  public async addAccount(data: Partial<DeyeAccountConfig>): Promise<{
    success: boolean;
    account: DeyeAccountConfig;
    plantsDiscovered: number;
    devicesDiscovered: number;
  }> {
    const id = data.id?.trim() || `acc-${Date.now().toString(36)}`;
    const newAccount: DeyeAccountConfig = {
      id,
      name: data.name?.trim() || 'New Deye Site',
      enabled: data.enabled ?? true,
      baseUrl: data.baseUrl?.trim() || 'https://eu1-developer.deyecloud.com',
      appId: data.appId?.trim() || '',
      appSecret: data.appSecret?.trim() || '',
      email: data.email?.trim() || '',
      password: data.password?.trim() || '',
      defaultStationId: data.defaultStationId?.trim() || '',
      defaultDeviceSn: data.defaultDeviceSn?.trim() || '',
      autoDiscovered: true,
      lastSyncedAt: new Date().toISOString(),
      plants: data.plants || [],
      inverters: data.inverters || [],
    };

    // Auto-discover plants from DeyeCloud OpenAPI
    const tempClient = new DeyeCloudClient(newAccount);
    const discovery = await tempClient.discoverPlantsAndDevices();
    newAccount.plants = discovery.plants;

    if (newAccount.plants.length > 0) {
      if (!newAccount.defaultStationId) {
        newAccount.defaultStationId = newAccount.plants[0].stationId;
      }
      const firstInverter = newAccount.plants[0].devices.find(
        (d) => d.deviceType === 'INVERTER'
      );
      if (firstInverter && !newAccount.defaultDeviceSn) {
        newAccount.defaultDeviceSn = firstInverter.deviceSn;
      }
    }

    const all = this.getAllRawAccounts(true);
    // Replace if exists, else append
    const existingIndex = all.findIndex((a) => a.id === id);
    if (existingIndex >= 0) {
      all[existingIndex] = newAccount;
    } else {
      all.push(newAccount);
    }

    this.saveAccountsToFile(all);

    let totalDevices = 0;
    for (const p of newAccount.plants) {
      totalDevices += p.devices.length;
    }

    return {
      success: true,
      account: newAccount,
      plantsDiscovered: newAccount.plants.length,
      devicesDiscovered: totalDevices,
    };
  }

  /**
   * Update an existing account (e.g. toggle enabled, edit name)
   */
  public async updateAccount(
    id: string,
    updates: Partial<DeyeAccountConfig>
  ): Promise<{ success: boolean; account?: DeyeAccountConfig }> {
    const all = this.getAllRawAccounts(true);
    const index = all.findIndex((a) => a.id === id);
    if (index === -1) {
      return { success: false };
    }

    const updated = {
      ...all[index],
      ...updates,
    };
    all[index] = updated;

    this.saveAccountsToFile(all);
    return { success: true, account: updated };
  }

  /**
   * Delete an account
   */
  public async deleteAccount(id: string): Promise<{ success: boolean }> {
    const all = this.getAllRawAccounts(true);
    const filtered = all.filter((a) => a.id !== id);
    if (filtered.length === all.length) {
      return { success: false };
    }

    this.saveAccountsToFile(filtered);
    this.clientMap.delete(id);
    return { success: true };
  }

  /**
   * Trigger automatic plant & hardware discovery for an account
   */
  public async syncAccount(
    id: string
  ): Promise<{ success: boolean; plants: PlantInfo[]; isLive: boolean }> {
    const all = this.getAllRawAccounts(true);
    const target = all.find((a) => a.id === id);
    if (!target) {
      return { success: false, plants: [], isLive: false };
    }

    const client = new DeyeCloudClient(target);
    const discovery = await client.discoverPlantsAndDevices();

    target.plants = discovery.plants;
    target.autoDiscovered = true;
    target.lastSyncedAt = new Date().toISOString();

    if (discovery.plants.length > 0) {
      if (!target.defaultStationId) {
        target.defaultStationId = discovery.plants[0].stationId;
      }
      const firstInverter = discovery.plants[0].devices.find(
        (d) => d.deviceType === 'INVERTER'
      );
      if (firstInverter && !target.defaultDeviceSn) {
        target.defaultDeviceSn = firstInverter.deviceSn;
      }
    }

    this.saveAccountsToFile(all);

    return {
      success: true,
      plants: discovery.plants,
      isLive: discovery.isLive,
    };
  }

  /**
   * Manually add or update a plant inside an account
   */
  public async addPlant(
    accountId: string,
    plant: PlantInfo
  ): Promise<{ success: boolean; plants: PlantInfo[] }> {
    const all = this.getAllRawAccounts(true);
    const target = all.find((a) => a.id === accountId);
    if (!target) {
      return { success: false, plants: [] };
    }

    if (!Array.isArray(target.plants)) {
      target.plants = [];
    }

    const pIndex = target.plants.findIndex(
      (p) => p.stationId === plant.stationId
    );
    if (pIndex >= 0) {
      target.plants[pIndex] = plant;
    } else {
      target.plants.push(plant);
    }

    this.saveAccountsToFile(all);
    return { success: true, plants: target.plants };
  }

  /**
   * Dynamically synchronize plant names, capacity, addresses, and devices from Deye Cloud OpenAPI
   */
  public async syncDynamicPlantMetadata(
    acc: DeyeAccountConfig,
    client: DeyeCloudClient
  ): Promise<boolean> {
    try {
      const discovery = await client.discoverPlantsAndDevices();
      if (!discovery.isLive || !discovery.plants || discovery.plants.length === 0) {
        return false;
      }

      let changed = false;
      if (!acc.plants) acc.plants = [];

      for (const livePlant of discovery.plants) {
        const existing = acc.plants.find((p) => p.stationId === livePlant.stationId);
        if (existing) {
          if (existing.stationName !== livePlant.stationName) {
            console.log(
              `[DeyeAccountManager] Dynamic plant name update: "${existing.stationName}" -> "${livePlant.stationName}" (Station ID: ${livePlant.stationId})`
            );
            existing.stationName = livePlant.stationName;
            changed = true;
          }
          if (existing.installedCapacityKw !== livePlant.installedCapacityKw) {
            existing.installedCapacityKw = livePlant.installedCapacityKw;
            changed = true;
          }
          if (existing.address !== livePlant.address) {
            existing.address = livePlant.address;
            changed = true;
          }
          if (livePlant.devices && livePlant.devices.length > 0) {
            existing.devices = livePlant.devices;
            changed = true;
          }
        } else {
          console.log(
            `[DeyeAccountManager] Discovered new plant dynamically: "${livePlant.stationName}" (Station ID: ${livePlant.stationId})`
          );
          acc.plants.push(livePlant);
          changed = true;
        }
      }

      // If plants on Deye Cloud were deleted or re-assigned
      const liveIds = new Set(discovery.plants.map((p) => p.stationId));
      if (acc.plants.length > discovery.plants.length) {
        acc.plants = acc.plants.filter((p) => liveIds.has(p.stationId));
        changed = true;
      }

      acc.lastSyncedAt = new Date().toISOString();
      acc.autoDiscovered = true;

      // Persist dynamic updates to deye-accounts.json
      const all = this.getAllRawAccounts(true);
      const targetIdx = all.findIndex((a) => a.id === acc.id);
      if (targetIdx >= 0) {
        all[targetIdx].plants = acc.plants;
        all[targetIdx].lastSyncedAt = acc.lastSyncedAt;
        all[targetIdx].autoDiscovered = true;
        this.saveAccountsToFile(all);
      }

      return changed;
    } catch (e) {
      console.warn(`[DeyeAccountManager] Dynamic plant sync failed for account ${acc.id}:`, e);
      return false;
    }
  }

  /**
   * Get sanitized summary of all accounts with their discovered plants and hardware counts.
   * Dynamically synchronizes plant names and devices from live Deye Cloud on a short TTL (30s) or when forced.
   */
  public async getAccountsSummary(forceSync = false): Promise<AccountSummary[]> {
    const rawAccounts = this.getAllRawAccounts(true);
    const summaries: AccountSummary[] = [];

    for (const acc of rawAccounts) {
      const client = new DeyeCloudClient(acc);
      let isLive = false;
      let pingMs = 25;
      let liveKw = 0;
      let dailyYield = 0;

      if (acc.enabled) {
        try {
          const health = await client.getHealth();
          isLive = health.isLive;
          pingMs = health.pingMs;

          if (isLive) {
            // Dynamic auto-sync: refresh plant names & devices every 30s or on forceSync
            const lastSyncTime = acc.lastSyncedAt ? new Date(acc.lastSyncedAt).getTime() : 0;
            const needsSync = forceSync || !acc.lastSyncedAt || (Date.now() - lastSyncTime > 30_000);
            if (needsSync) {
              await this.syncDynamicPlantMetadata(acc, client);
            }

            const activePlants = acc.plants || [];
            const activeInvSns = activePlants
              .flatMap((p) => p.devices)
              .filter((d) => d.deviceType === 'INVERTER')
              .map((d) => d.deviceSn);

            const [stSummary, batchDev] = await Promise.all([
              client.getStationSummary(),
              activeInvSns.length > 0 ? client.getBatchDeviceLatest(activeInvSns) : Promise.resolve(new Map()),
            ]);
            liveKw = stSummary.data.liveSolarPowerKw;
            // Sum daily yield from real inverter telemetry
            for (const [, devData] of batchDev) {
              dailyYield += parseFloat(devData.get('DailyActiveProduction') || '0');
            }
          }
        } catch {
          isLive = false;
        }
      }

      const plants = acc.plants || [];
      let inverterCount = 0;
      let loggerCount = 0;
      let capacity = 0;

      for (const p of plants) {
        capacity += p.installedCapacityKw || 0;
        for (const d of p.devices) {
          if (d.deviceType === 'INVERTER') inverterCount++;
          if (d.deviceType === 'LOGGER') loggerCount++;
        }
      }

      summaries.push({
        id: acc.id,
        name: acc.name,
        isLive,
        stationCount: plants.length,
        deviceCount: inverterCount + loggerCount,
        inverterCount,
        loggerCount,
        liveSolarPowerKw: parseFloat(liveKw.toFixed(2)),
        dailyYieldKwh: parseFloat(dailyYield.toFixed(2)),
        capacityKw: parseFloat(capacity.toFixed(1)),
        status: !acc.enabled
          ? 'OFFLINE'
          : isLive
          ? 'ONLINE'
          : 'OFFLINE',
        lastPingMs: pingMs,
        plants,
        autoDiscovered: acc.autoDiscovered,
        lastSyncedAt: acc.lastSyncedAt,
      });
    }

    return summaries;
  }

  /**
   * Poll all accounts, plants, and inverters concurrently to compute fleet aggregate
   */
  public async getAggregatedFleetSummary(): Promise<AggregatedFleetSummary> {
    const clients = this.getAllClients();
    const rawAccounts = this.getAllRawAccounts(true).filter(
      (a) => a.enabled !== false
    );

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

export const accountManager = new DeyeAccountManager();

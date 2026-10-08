import fs from 'fs';
import path from 'path';
import {
  DeyeAccountConfig,
  AccountSummary,
  AggregatedFleetSummary,
  PlantInfo,
  DeviceInfo,
  SolarDeyeCloudConfig,
  SolarStationRecord,
  SolarDeviceRecord,
  SolarUser,
  SolarInverterControlLog,
  SolarUserStationPermission,
} from './types';
import { DeyeCloudClient } from './deye-client';
import { sanitizeDeyeBaseUrl, sanitizeDirectusBaseUrl } from './url-validator';
import { hashPassword } from './auth-crypto';
import { env } from './env';
import { createLogger } from './logger';
import { FileAccountCache } from './file-account-cache';
import { directusTransport, DirectusTransport, DIRECTUS_COLLECTIONS as COLLECTIONS } from './directus-transport';
import { clientRegistry, ClientRegistry } from './client-registry';
import { fleetAggregator, FleetAggregator } from './fleet-aggregator';

export { COLLECTIONS };

const log = createLogger('DeyeAccountManager');

class DeyeAccountManager {
  private accountsCache: DeyeAccountConfig[] | null = null;
  private clientRegistry: ClientRegistry = clientRegistry;
  private fleetAggregator: FleetAggregator = fleetAggregator;
  private lastLoadedAt: number = 0;
  private lastDirectusSyncAt: number = 0;
  private directusTransport: DirectusTransport = directusTransport;

  private getConfigPath(): string {
    return FileAccountCache.getConfigPath();
  }

  public getDirectusHealth() {
    return this.directusTransport.getHealth();
  }

  public getDirectusCollection(): string {
    return this.directusTransport.getDirectusCollection();
  }

  /**
   * Generic Directus collection reader for the normalized schema
   */
  public async fetchCollection<T = any>(collection: string, query = '?limit=-1'): Promise<T[] | null> {
    return this.directusTransport.fetchCollection<T>(collection, query);
  }

  /**
   * Generic create helper for any Directus collection
   */
  public async createItem<T = Record<string, any>>(collection: string, payload: Record<string, any>): Promise<T | null> {
    return this.directusTransport.createItem<T>(collection, payload);
  }

  /**
   * Generic update helper for any Directus collection
   */
  public async updateItem(collection: string, id: string | number, payload: Record<string, unknown>): Promise<boolean> {
    return this.directusTransport.updateItem(collection, id, payload);
  }

  /**
   * Generic delete helper for any Directus collection
   */
  public async deleteItem(collection: string, id: string | number): Promise<boolean> {
    return this.directusTransport.deleteItem(collection, id);
  }

  /**
   * Record an immutable audit log when workmode or grid charge controls are dispatched
   */
  public async logInverterControl(logEntry: SolarInverterControlLog): Promise<boolean> {
    return this.directusTransport.logInverterControl(logEntry);
  }

  /**
   * Query Directus REST API with a resilient timeout (fallback compatibility)
   */
  public async fetchFromDirectus(): Promise<Record<string, any>[] | null> {
    return this.directusTransport.fetchFromDirectus();
  }

  /**
   * Synchronize accounts from Directus into the local accounts list and cache.
   * Priority:
   * 1. Normalized tables: iot_solar_deye_cloud_configs + iot_solar_stations + iot_solar_devices
   * 2. Legacy collection: iot_solar_accounts
   * 3. Local disk cache: deye-accounts.json
   */
  public async syncWithDirectus(force = false): Promise<DeyeAccountConfig[]> {
    const now = Date.now();
    if (!force && this.accountsCache && now - this.lastDirectusSyncAt < 10000) {
      return this.accountsCache;
    }

    const diskAccounts = this.getAllRawAccounts(true);

    // 1. Try reading from the normalized tables (iot_solar_deye_cloud_configs, stations, devices)
    try {
      const [configs, stations, devices] = await Promise.all([
        this.fetchCollection<SolarDeyeCloudConfig>(COLLECTIONS.CONFIGS),
        this.fetchCollection<SolarStationRecord>(COLLECTIONS.STATIONS),
        this.fetchCollection<SolarDeviceRecord>(COLLECTIONS.DEVICES),
      ]);

      if (configs !== null && configs.length > 0) {
        const mergedAccounts: DeyeAccountConfig[] = [];

        for (const cfg of configs) {
          const cfgId = String(cfg.id);
          const existing = diskAccounts.find(
            (d) => d.directusId === cfgId || d.email.toLowerCase() === cfg.account_email.toLowerCase()
          );

          // Find stations associated with this config
          const configStations = Array.isArray(stations)
            ? stations.filter((s) => s.deye_config_id === cfg.id || (!s.deye_config_id && stations.length === 1))
            : [];

          const plants: PlantInfo[] = configStations.map((st) => {
            const stDevices = Array.isArray(devices)
              ? devices.filter((dev) => dev.station_id === st.station_id)
              : [];

            const mappedDevices: DeviceInfo[] = stDevices.map((dev) => ({
              deviceSn: dev.device_sn,
              deviceType: dev.device_type,
              name: dev.name || `Device (${dev.device_sn})`,
              model: dev.model,
              ratedKw: Number(dev.rated_kw) || 0,
              loggerSn: dev.logger_sn,
              status: dev.status,
              lastSeen: dev.last_seen_at,
            }));

            return {
              stationId: st.station_id,
              stationName: st.name,
              installedCapacityKw: Number(st.installed_capacity_kw) || 0,
              address: st.address || '',
              devices: mappedDevices,
            };
          });

          // Merge plants by stationId so no stations are lost
          const plantMap = new Map<string, PlantInfo>();
          (existing?.plants || []).forEach((p) => plantMap.set(String(p.stationId), p));
          plants.forEach((p) => plantMap.set(String(p.stationId), p));
          const finalPlants = plantMap.size > 0 ? Array.from(plantMap.values()) : [];
          const firstInverter = finalPlants[0]?.devices?.find((d) => d.deviceType === 'INVERTER');

          const accountName = (cfg.profile_name && cfg.profile_name !== 'EU/Asia Developer Gateway' && cfg.profile_name !== 'New Solar Gateway')
            ? cfg.profile_name
            : (existing?.name || cfg.profile_name || cfg.account_email);

          const accountConfig: DeyeAccountConfig = {
            id: existing ? existing.id : `deye-cfg-${cfgId}`,
            directusId: cfgId,
            name: accountName,
            enabled: cfg.status !== 'OFFLINE',
            admin: true,
            baseUrl: sanitizeDeyeBaseUrl(cfg.base_url),
            appId: cfg.app_id || existing?.appId || '',
            appSecret: cfg.app_secret || existing?.appSecret || '',
            email: cfg.account_email || existing?.email || '',
            password: cfg.account_password || existing?.password || '',
            defaultStationId: finalPlants[0]?.stationId || existing?.defaultStationId || '',
            defaultDeviceSn: firstInverter?.deviceSn || existing?.defaultDeviceSn || '',
            autoDiscovered: finalPlants.length > 0,
            lastSyncedAt: cfg.last_checked_at || new Date().toISOString(),
            plants: finalPlants,
            source: 'directus',
          };

          mergedAccounts.push(accountConfig);
        }

        if (mergedAccounts.length > 0) {
          this.saveAccountsToFile(mergedAccounts);
          this.lastDirectusSyncAt = now;
          this.accountsCache = mergedAccounts.filter((a) => a.enabled !== false);
          this.syncClients();
          return this.accountsCache;
        }
      }
    } catch (err) {
      log.warn('Normalized table sync skipped, trying legacy collection', {}, err);
    }

    // 2. Fallback to legacy single collection (iot_solar_accounts)
    const directusRows = await this.fetchFromDirectus();

    if (directusRows !== null && directusRows.length > 0) {
      const mergedAccounts: DeyeAccountConfig[] = [];

      for (const row of directusRows) {
        const rowId = row.id !== undefined && row.id !== null ? String(row.id) : undefined;
        const rowEmail = (row.email || '').trim().toLowerCase();

        const existing = diskAccounts.find(
          (d) =>
            (rowId && (d.directusId === rowId || String(d.id) === rowId || String(d.id) === `directus-${rowId}`)) ||
            (rowEmail && d.email.trim().toLowerCase() === rowEmail)
        );

        const appId = String(row.app_id || row.appId || existing?.appId || '').trim();
        const appSecret = String(row.app_secret || row.appSecret || existing?.appSecret || '').trim();
        const baseUrl = sanitizeDeyeBaseUrl(String(row.base_url || row.baseUrl || existing?.baseUrl || ''));
        const isEnabled =
          row.enabled !== undefined
            ? Boolean(row.enabled !== false && row.enabled !== 0 && row.enabled !== 'false' && row.enabled !== '0')
            : (existing?.enabled ?? true);

        const isAdmin = Boolean(
          row.admin === true ||
          row.admin === 1 ||
          row.admin === 'true' ||
          row.admin === '1' ||
          row.is_admin === true ||
          row.is_admin === 1 ||
          row.is_admin === 'true' ||
          row.is_admin === '1' ||
          (row.email && row.email.trim().toLowerCase() === 'admin')
        );

        const accountConfig: DeyeAccountConfig = {
          id: existing ? existing.id : (rowId ? `db-${rowId}` : `acc-${Date.now().toString(36)}`),
          directusId: rowId,
          name: row.name || existing?.name || row.email || 'Solar Site',
          enabled: isEnabled,
          admin: isAdmin,
          baseUrl,
          appId,
          appSecret,
          email: row.email || existing?.email || '',
          password: row.password || existing?.password || '',
          defaultStationId: row.default_station_id || row.defaultStationId || existing?.defaultStationId || '',
          defaultDeviceSn: row.default_device_sn || row.defaultDeviceSn || existing?.defaultDeviceSn || '',
          autoDiscovered: existing?.autoDiscovered ?? false,
          lastSyncedAt: existing?.lastSyncedAt,
          plants: existing?.plants || [],
          inverters: existing?.inverters || [],
          source: 'directus',
        };

        mergedAccounts.push(accountConfig);
      }

      for (const disk of diskAccounts) {
        if (!mergedAccounts.some((m) => m.id === disk.id || m.email.toLowerCase() === disk.email.toLowerCase())) {
          mergedAccounts.push({
            ...disk,
            source: 'cache',
          });
        }
      }

      this.saveAccountsToFile(mergedAccounts);
      this.lastDirectusSyncAt = now;
      this.accountsCache = mergedAccounts.filter((a) => a.enabled !== false);
      this.syncClients();
      return this.accountsCache;
    }

    // 3. Directus unreachable or empty: fallback to disk cache
    if (diskAccounts.length > 0) {
      this.accountsCache = diskAccounts
        .filter((a) => a.enabled !== false)
        .map((a) => ({ ...a, source: 'cache' as const }));
      this.syncClients();
      this.lastLoadedAt = now;
      return this.accountsCache;
    }

    return this.loadAccounts(true);
  }

  /**
   * Return ALL accounts from file, including enabled and disabled
   */
  public getAllRawAccounts(forceReload = false): DeyeAccountConfig[] {
    return FileAccountCache.getAllRawAccounts(forceReload);
  }

  /**
   * Save accounts list to deye-accounts.json with atomic write
   */
  public saveAccountsToFile(accounts: DeyeAccountConfig[]): boolean {
    const success = FileAccountCache.saveAccountsToFile(accounts);
    if (success) {
      this.accountsCache = accounts.filter((acc) => acc.enabled !== false);
      this.lastLoadedAt = Date.now();
      this.syncClients();
    }
    return success;
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
      baseUrl: sanitizeDeyeBaseUrl(env.DEYE_BASE_URL),
      appId: env.DEYE_APP_ID || '',
      appSecret: env.DEYE_APP_SECRET || '',
      email: env.DEYE_EMAIL || '',
      password: env.DEYE_PASSWORD || '',
      defaultStationId: env.DEYE_DEFAULT_STATION_ID || 'SP_04',
      defaultDeviceSn: env.DEYE_DEFAULT_DEVICE_SN || '2209X891104',
      plants: [],
    };

    this.accountsCache = [fallbackAccount];
    this.syncClients();
    this.lastLoadedAt = now;
    return this.accountsCache;
  }

  /**
   * Synchronize active DeyeCloudClient instances with enabled accounts
   * Preserves existing instances so in-memory token caches are retained.
   */
  private syncClients() {
    this.clientRegistry.syncClients(this.accountsCache || []);
  }

  /**
   * Get client for specific account.
   * If accountId is provided, returns that account's client or null if not found (preventing cross-tenant leaks).
   * If accountId is omitted, returns the primary/first configured client or null.
   */
  public getClient(accountId?: string): DeyeCloudClient | null {
    this.loadAccounts();
    return this.clientRegistry.getClient(accountId);
  }

  public getAllClients(): DeyeCloudClient[] {
    this.loadAccounts();
    return this.clientRegistry.getAllClients();
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
    let directusId: string | undefined;
    const safeBaseUrl = sanitizeDeyeBaseUrl(data.baseUrl);

    // 1. Try to create in normalized iot_solar_deye_cloud_configs table
    try {
      const configPayload = {
        profile_name: data.name?.trim() || data.email?.trim() || 'New Solar Gateway',
        base_url: safeBaseUrl,
        app_id: data.appId?.trim() || '',
        app_secret: data.appSecret?.trim() || '',
        account_email: data.email?.trim() || '',
        account_password: data.password?.trim() || '',
        status: (data.enabled ?? true) ? 'OPTIMAL' : 'OFFLINE',
      };

      const createdCfg = await this.createItem(COLLECTIONS.CONFIGS, configPayload);
      if (createdCfg?.id) {
        directusId = String(createdCfg.id);
      } else {
        // Fallback to legacy single collection if needed
        const legacyPayload = {
          name: data.name?.trim() || data.email?.trim() || 'New Solar Site',
          email: data.email?.trim() || '',
          password: data.password?.trim() || '',
          app_id: data.appId?.trim() || '',
          app_secret: data.appSecret?.trim() || '',
          base_url: safeBaseUrl,
          enabled: data.enabled ?? true,
        };
        const createdLegacy = await this.createItem(this.getDirectusCollection(), legacyPayload);
        if (createdLegacy?.id) {
          directusId = String(createdLegacy.id);
        }
      }
    } catch (err) {
      log.warn('Failed to post new account to Directus, caching locally', {}, err);
    }

    const id = directusId ? `directus-${directusId}` : (data.id?.trim() || `acc-${Date.now().toString(36)}`);
    const newAccount: DeyeAccountConfig = {
      id,
      directusId,
      name: data.name?.trim() || 'New Deye Site',
      enabled: data.enabled ?? true,
      baseUrl: safeBaseUrl,
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
      source: directusId ? 'directus' : 'cache',
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

      // Persist discovered stations & devices into iot_solar_stations and iot_solar_devices
      try {
        for (const p of newAccount.plants) {
          await this.createItem(COLLECTIONS.STATIONS, {
            station_id: p.stationId,
            name: p.stationName,
            installed_capacity_kw: p.installedCapacityKw,
            address: p.address || '',
            deye_config_id: directusId ? Number(directusId) : null,
          });

          for (const d of p.devices) {
            await this.createItem(COLLECTIONS.DEVICES, {
              device_sn: d.deviceSn,
              station_id: p.stationId,
              device_type: d.deviceType,
              name: d.name,
              model: d.model || '',
              rated_kw: d.ratedKw || 0,
              status: d.status || 'ONLINE',
            });
          }
        }
      } catch (err) {
        log.warn('Non-fatal error saving stations/devices to database', {}, err);
      }
    }

    // Persist registered user into iot_solar_users with hashed password
    if (data.email) {
      try {
        await this.createItem(COLLECTIONS.USERS, {
          email: data.email.trim().toLowerCase(),
          username: data.email.split('@')[0],
          password_hash: hashPassword(data.password || 'password'),
          full_name: data.name || data.email,
          role: 'consumer',
          is_active: 1,
        });
      } catch (e) {
        // User creation non-fatal
      }
    }

    const all = this.getAllRawAccounts(true);
    // Replace if exists, else append
    const existingIndex = all.findIndex((a) => a.id === id || (directusId && a.directusId === directusId));
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
   * Update an existing account with mass-assignment protection
   */
  public async updateAccount(
    id: string,
    updates: Partial<DeyeAccountConfig>
  ): Promise<{ success: boolean; account?: DeyeAccountConfig }> {
    const all = this.getAllRawAccounts(true);
    const index = all.findIndex((a) => a.id === id || (a.directusId && String(a.directusId) === id));
    if (index === -1) {
      return { success: false };
    }

    const target = all[index];
    const directusId = target.directusId || (target.id.startsWith('directus-') ? target.id.replace('directus-', '') : undefined);

    // Filter allowed fields to prevent mass-assignment privilege escalation
    const safeUpdates: Partial<DeyeAccountConfig> = {};
    if (updates.name !== undefined) safeUpdates.name = updates.name.trim();
    if (updates.email !== undefined) safeUpdates.email = updates.email.trim();
    if (updates.password !== undefined) safeUpdates.password = updates.password.trim();
    if (updates.baseUrl !== undefined) safeUpdates.baseUrl = sanitizeDeyeBaseUrl(updates.baseUrl);
    if (updates.appId !== undefined) safeUpdates.appId = updates.appId.trim();
    if (updates.appSecret !== undefined) safeUpdates.appSecret = updates.appSecret.trim();
    if (updates.enabled !== undefined) safeUpdates.enabled = Boolean(updates.enabled);
    if (updates.defaultStationId !== undefined) safeUpdates.defaultStationId = updates.defaultStationId.trim();
    if (updates.defaultDeviceSn !== undefined) safeUpdates.defaultDeviceSn = updates.defaultDeviceSn.trim();

    // Sync update to Directus
    if (directusId) {
      try {
        const patchPayload: Record<string, any> = {};
        if (safeUpdates.name !== undefined) {
          patchPayload.name = safeUpdates.name;
          patchPayload.profile_name = safeUpdates.name;
        }
        if (safeUpdates.email !== undefined) {
          patchPayload.email = safeUpdates.email;
          patchPayload.account_email = safeUpdates.email;
        }
        if (safeUpdates.password !== undefined) {
          patchPayload.password = safeUpdates.password;
          patchPayload.account_password = safeUpdates.password;
        }
        if (safeUpdates.appId !== undefined) patchPayload.app_id = safeUpdates.appId;
        if (safeUpdates.appSecret !== undefined) patchPayload.app_secret = safeUpdates.appSecret;
        if (safeUpdates.baseUrl !== undefined) patchPayload.base_url = safeUpdates.baseUrl;
        if (safeUpdates.enabled !== undefined) {
          patchPayload.enabled = safeUpdates.enabled ? 1 : 0;
          patchPayload.status = safeUpdates.enabled ? 'OPTIMAL' : 'OFFLINE';
        }

        await this.updateItem(COLLECTIONS.CONFIGS, directusId, patchPayload);
        await this.updateItem(this.getDirectusCollection(), directusId, patchPayload);
      } catch (err) {
        log.warn(`Failed to patch Directus item ${directusId}`, { directusId }, err);
      }
    }

    const updated: DeyeAccountConfig = {
      ...all[index],
      ...safeUpdates,
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
    const target = all.find((a) => a.id === id || (a.directusId && String(a.directusId) === id));

    if (!target) {
      return { success: false };
    }

    // Sync delete to Directus
    const directusId = target.directusId || (target.id.startsWith('directus-') ? target.id.replace('directus-', '') : undefined);
    if (directusId) {
      try {
        await this.deleteItem(COLLECTIONS.CONFIGS, directusId);
        await this.deleteItem(this.getDirectusCollection(), directusId);
      } catch (err) {
        log.warn(`Failed to delete Directus item ${directusId}`, { directusId }, err);
      }
    }

    const filtered = all.filter((a) => a.id !== target.id);
    this.saveAccountsToFile(filtered);
    this.clientRegistry.removeClient(target.id);
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

      // Persist discovered stations & devices into iot_solar_stations and iot_solar_devices
      try {
        const directusId = target.directusId ? Number(target.directusId) : null;
        for (const p of discovery.plants) {
          await this.createItem(COLLECTIONS.STATIONS, {
            station_id: p.stationId,
            name: p.stationName,
            installed_capacity_kw: p.installedCapacityKw,
            address: p.address || '',
            deye_config_id: directusId,
            org_id: 1,
            grid_type: '3-PHASE',
            is_active: 1,
          });

          for (const d of p.devices) {
            await this.createItem(COLLECTIONS.DEVICES, {
              device_sn: d.deviceSn,
              station_id: p.stationId,
              device_type: d.deviceType,
              name: d.name,
              model: d.model || '',
              rated_kw: d.ratedKw || 0,
              status: d.status || 'ONLINE',
            });
          }
        }
      } catch (err) {
        log.warn('Non-fatal error saving synced stations to database', {}, err);
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
            log.info(
              `Dynamic plant name update: "${existing.stationName}" -> "${livePlant.stationName}" (Station ID: ${livePlant.stationId})`,
              { stationId: livePlant.stationId }
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
          log.info(
            `Discovered new plant dynamically: "${livePlant.stationName}" (Station ID: ${livePlant.stationId})`,
            { stationId: livePlant.stationId }
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
      log.warn(`Dynamic plant sync failed for account ${acc.id}`, { accountId: acc.id }, e);
      return false;
    }
  }

  /**
   * Get sanitized summary of all accounts with their discovered plants and hardware counts.
   * Dynamically synchronizes plant names and devices from live Deye Cloud on a short TTL (30s) or when forced.
   */
  public async getAccountsSummary(forceSync = false): Promise<AccountSummary[]> {
    // Synchronize with Directus (or fallback to cache if offline)
    await this.syncWithDirectus(forceSync);

    const rawAccounts = this.getAllRawAccounts(true);
    const summaries: AccountSummary[] = [];

    for (const acc of rawAccounts) {
      const client = new DeyeCloudClient(acc);
      let isLive = false;
      let pingMs = 25;
      let liveKw = 0;
      let dailyYield = 0;

      if (acc.enabled && client.hasCredentials()) {
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
        directusId: acc.directusId,
        name: acc.name,
        email: acc.email,
        enabled: acc.enabled !== false,
        admin: acc.admin,
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
        source: acc.source || (acc.directusId ? 'directus' : 'cache'),
      });
    }

    return summaries;
  }

  /**
   * Poll all accounts (or specific allowed accounts), plants, and inverters concurrently to compute fleet aggregate
   */
  public async getAggregatedFleetSummary(accountIds?: string[]): Promise<AggregatedFleetSummary> {
    const clients = this.getAllClients();
    const rawAccounts = this.loadAccounts(false);
    return this.fleetAggregator.aggregateFleet(clients, rawAccounts, accountIds);
  }
}

export const accountManager = new DeyeAccountManager();

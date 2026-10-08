import { env } from './env';
import { sanitizeDirectusBaseUrl } from './url-validator';
import { SolarInverterControlLog } from './types';
import { createLogger } from './logger';

const log = createLogger('DirectusTransport');

export const DIRECTUS_COLLECTIONS = {
  USERS: 'iot_solar_users',
  CONFIGS: 'iot_solar_deye_cloud_configs',
  STATIONS: 'iot_solar_stations',
  DEVICES: 'iot_solar_devices',
  PERMISSIONS: 'iot_solar_user_station_permissions',
  CONTROL_LOGS: 'iot_solar_inverter_control_logs',
  ALARMS: 'iot_solar_inverter_alarms',
  TARIFFS: 'iot_solar_station_tariffs',
  DAILY_YIELDS: 'iot_solar_station_daily_yields',
  TELEMETRY: 'iot_solar_telemetry_snapshots',
  LEGACY_ACCOUNTS: 'iot_solar_accounts',
} as const;

export interface DirectusHealthStatus {
  connected: boolean;
  lastChecked: string;
  error?: string;
}

export class DirectusTransport {
  private directusStatus: DirectusHealthStatus = {
    connected: false,
    lastChecked: '',
  };

  public getDirectusBaseUrl(): string {
    return sanitizeDirectusBaseUrl(env.DIRECTUS_BASE_URL, env.NODE_ENV === 'production');
  }

  public getDirectusCollection(): string {
    return env.DIRECTUS_COLLECTION;
  }

  public getDirectusHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (env.DIRECTUS_API_TOKEN) {
      headers['Authorization'] = `Bearer ${env.DIRECTUS_API_TOKEN}`;
    }
    return headers;
  }

  public getHealth(): DirectusHealthStatus {
    return this.directusStatus;
  }

  /**
   * Generic Directus collection reader
   */
  public async fetchCollection<T = unknown>(collection: string, query = '?limit=-1'): Promise<T[] | null> {
    try {
      const safeCollection = encodeURIComponent(collection);
      const url = `${this.getDirectusBaseUrl()}/items/${safeCollection}${query}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getDirectusHeaders(),
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        if (res.status === 404) return null; // Collection does not exist yet
        throw new Error(`Directus HTTP status ${res.status}`);
      }

      const json = await res.json();
      this.directusStatus = {
        connected: true,
        lastChecked: new Date().toISOString(),
      };
      return Array.isArray(json.data) ? json.data : [];
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.directusStatus = {
        connected: false,
        lastChecked: new Date().toISOString(),
        error: errorMsg || 'Unreachable',
      };
      return null;
    }
  }

  /**
   * Generic create helper for any Directus collection
   */
  public async createItem<T = Record<string, unknown>>(collection: string, payload: Record<string, unknown>): Promise<T | null> {
    try {
      const safeCollection = encodeURIComponent(collection);
      const url = `${this.getDirectusBaseUrl()}/items/${safeCollection}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getDirectusHeaders(),
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || null;
      }
      return null;
    } catch (err) {
      log.warn(`Failed to create item in ${collection}`, { collection }, err);
      return null;
    }
  }

  /**
   * Generic update helper for any Directus collection
   */
  public async updateItem(collection: string, id: string | number, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const safeCollection = encodeURIComponent(collection);
      const safeId = encodeURIComponent(String(id));
      const url = `${this.getDirectusBaseUrl()}/items/${safeCollection}/${safeId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: this.getDirectusHeaders(),
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      log.warn(`Failed to update item ${id} in ${collection}`, { collection, id }, err);
      return false;
    }
  }

  /**
   * Generic delete helper for any Directus collection
   */
  public async deleteItem(collection: string, id: string | number): Promise<boolean> {
    try {
      const safeCollection = encodeURIComponent(collection);
      const safeId = encodeURIComponent(String(id));
      const url = `${this.getDirectusBaseUrl()}/items/${safeCollection}/${safeId}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.getDirectusHeaders(),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      log.warn(`Failed to delete item ${id} from ${collection}`, { collection, id }, err);
      return false;
    }
  }

  /**
   * Record an immutable audit log when workmode or grid charge controls are dispatched
   */
  public async logInverterControl(logEntry: SolarInverterControlLog): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        station_id: logEntry.station_id,
        device_sn: logEntry.device_sn,
        action: logEntry.action,
        work_mode: logEntry.work_mode || null,
        parameters_payload:
          typeof logEntry.parameters_payload === 'string'
            ? JSON.parse(logEntry.parameters_payload)
            : logEntry.parameters_payload,
        status: logEntry.status,
        upstream_code: logEntry.upstream_code || null,
        upstream_message: logEntry.upstream_message || null,
        user_id: logEntry.user_id || null,
        client_ip: logEntry.client_ip || null,
      };
      await this.createItem(DIRECTUS_COLLECTIONS.CONTROL_LOGS, payload);
      return true;
    } catch (e) {
      log.warn('Failed logging inverter control to database', {}, e);
      return false;
    }
  }

  /**
   * Query configured default Directus collection
   */
  public async fetchFromDirectus(): Promise<Record<string, unknown>[] | null> {
    return this.fetchCollection(this.getDirectusCollection());
  }
}

export const directusTransport = new DirectusTransport();

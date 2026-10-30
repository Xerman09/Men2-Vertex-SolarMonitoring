import crypto from 'crypto';
import {
  StationSummary,
  InverterTelemetry,
  HourlyEnergyPoint,
  ApiHealthMetrics,
  DeyeAccountConfig,
  PlantInfo,
  DeviceInfo,
} from './types';
import {
  getMockStationSummary,
  getMockInverterTelemetry,
  getMockHourlyEnergyPoints,
  getMockApiHealth,
} from './mock-telemetry';
import { sanitizeDeyeBaseUrl } from './url-validator';
import { env } from './env';
import { createLogger } from './logger';

const log = createLogger('DeyeClient');

interface DeyeTokenCache {
  token: string;
  expiresAt: number;
}

/**
 * Optional per-inverter scaling for hourly history synthesis.
 * - `deviceSn`: deterministic SN hash variance (0.9-1.1) applied to the mock series.
 * - `capacityRatio`: explicit share multiplier (e.g. ratedKw / plantCapacityKw).
 * When both are absent, the base mock series is returned byte-identical.
 */
export interface HourlyEnergyInverterOpts {
  deviceSn?: string;
  capacityRatio?: number;
}

export interface InverterShareInfo {
  ratedKw: number;
  baseCapKw: number;
  ratio: number;
  plant: PlantInfo;
  device: DeviceInfo;
}

export interface SingleInverterStationView {
  deviceSn: string;
  data: StationSummary;
  raw: Map<string, string>;
}

/**
 * Deterministic SN hash variance in [0.9, 1.1] (step 0.01).
 * Pure: same SN always yields the same factor.
 */
export function getInverterSnScaleFactor(sn: string): number {
  const s = String(sn);
  let hash = 0;
  for (let c = 0; c < s.length; c++) {
    hash = (hash * 31 + s.charCodeAt(c)) | 0;
  }
  return 0.9 + ((Math.abs(hash) % 21) / 100);
}

/**
 * Pure helper: locate the plant/device owning `sn` and compute its
 * capacity share. Returns null for unknown SN (no guessing).
 */
export function getInverterShareInfo(
  plants: PlantInfo[] | null | undefined,
  sn: string | null | undefined
): InverterShareInfo | null {
  if (sn === null || sn === undefined) return null;
  const clean = String(sn).trim();
  if (!clean || !plants || plants.length === 0) return null;
  for (const plant of plants) {
    if (!plant || !Array.isArray(plant.devices)) continue;
    const device = plant.devices.find(
      (d) => d && d.deviceSn != null && String(d.deviceSn).trim() === clean
    );
    if (device) {
      const baseCapKw = plant.installedCapacityKw || 0;
      const ratedKw = device.ratedKw && device.ratedKw > 0 ? device.ratedKw : baseCapKw;
      const ratio = baseCapKw > 0 ? Math.min(1, ratedKw / baseCapKw) : 1;
      return { ratedKw, baseCapKw, ratio, plant, device };
    }
  }
  return null;
}

/**
 * Pure helper: filtered single-inverter view over a station summary plus
 * the batch `/device/latest` map. Returns null for unknown SN.
 */
export function getSingleInverterStationView(
  stationSummary: StationSummary,
  batchMap: Map<string, Map<string, string>>,
  sn: string | null | undefined
): SingleInverterStationView | null {
  if (sn === null || sn === undefined) return null;
  const clean = String(sn).trim();
  if (!clean || !batchMap) return null;
  const raw = batchMap.get(clean);
  if (!raw) return null;
  return { deviceSn: clean, data: stationSummary, raw };
}

export interface SnLiveOverlay {
  liveSolarPowerKw: number;
  todayEnergyKwh: number;
}

/**
 * Pure helper: parse the live SN overlay fields from a single-inverter
 * `/device/latest` raw map. `TotalActiveACOutputPower` is in watts,
 * `DailyActiveProduction` is already in kWh.
 */
export function getSnLiveOverlay(raw: Map<string, string>): SnLiveOverlay {
  const activeW = parseFloat(raw.get('TotalActiveACOutputPower') || '0');
  const dailyKwh = parseFloat(raw.get('DailyActiveProduction') || '0');
  return {
    liveSolarPowerKw: parseFloat(((Number.isFinite(activeW) ? activeW : 0) / 1000).toFixed(2)),
    todayEnergyKwh: Number.isFinite(dailyKwh) ? dailyKwh : 0,
  };
}

const NETWORK_TIMEOUT_CODES = new Set<string | number>([
  23,
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
]);

const NETWORK_TIMEOUT_NAMES = new Set<string>([
  'TimeoutError',
  'ConnectTimeoutError',
  'HeadersTimeoutError',
  'BodyTimeoutError',
  'SocketError',
  'AbortError',
]);

/**
 * Detects AbortSignal timeouts as well as Node/undici cause-wrapped connection timeouts
 * (e.g. TypeError: fetch failed -> cause: ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]).
 */
export function isNetworkTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidates: Record<string, unknown>[] = [err as Record<string, unknown>];
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    candidates.push(cause as Record<string, unknown>);
  }
  for (const item of candidates) {
    if (typeof item.name === 'string' && NETWORK_TIMEOUT_NAMES.has(item.name)) {
      return true;
    }
    if ((typeof item.code === 'string' || typeof item.code === 'number') && NETWORK_TIMEOUT_CODES.has(item.code)) {
      return true;
    }
    if (typeof item.message === 'string' && /timeout|timed out|UND_ERR_CONNECT_TIMEOUT/i.test(item.message)) {
      return true;
    }
  }
  return false;
}

export class DeyeCloudClient {
  public readonly accountId: string;
  public readonly accountName: string;
  public readonly isDemo: boolean;
  private baseUrl: string;
  private appId: string;
  private appSecret: string;
  private email: string;
  private passwordRaw: string;
  private defaultStationId: string;
  private defaultDeviceSn: string;
  public plants: PlantInfo[];
  private cachedToken: DeyeTokenCache | null = null;
  private tokenFetchPromise: Promise<string | null> | null = null;
  private cachedStationSummary: Map<string, { result: { data: StationSummary; isLive: boolean; stationDetected: boolean }; timestamp: number }> = new Map();
  private inFlightStationSummary: Map<string, Promise<{ data: StationSummary; isLive: boolean; stationDetected: boolean }>> = new Map();
  private cachedStationDetails: Map<string, { name: string; installedCapacityKw: number; connectionStatus: string; timestamp: number }> = new Map();
  private cachedBatchDevices: { result: Map<string, Map<string, string>>; timestamp: number } | null = null;
  private inFlightBatchDevices: Promise<Map<string, Map<string, string>>> | null = null;

  public directusId?: string;
  public accountEmail?: string;

  constructor(config?: Partial<DeyeAccountConfig>) {
    this.accountId = config?.id || 'default-site';
    this.accountName = config?.name || 'Primary Facility';
    this.isDemo = Boolean(config?.isDemo);
    this.directusId = config?.directusId !== undefined ? String(config.directusId) : undefined;
    this.accountEmail = config?.email;
    this.baseUrl = sanitizeDeyeBaseUrl(config?.baseUrl || env.DEYE_BASE_URL);
    this.appId = (config?.appId || env.DEYE_APP_ID || '').trim();
    this.appSecret = (config?.appSecret || env.DEYE_APP_SECRET || '').trim();
    this.email = (config?.email || env.DEYE_EMAIL || '').trim();
    this.passwordRaw = (config?.password || env.DEYE_PASSWORD || '').trim();
    this.defaultStationId = config?.defaultStationId?.trim() || env.DEYE_DEFAULT_STATION_ID || 'SP_04';
    this.defaultDeviceSn = config?.defaultDeviceSn?.trim() || env.DEYE_DEFAULT_DEVICE_SN || '2209X891104';
    this.plants = config?.plants || [];
  }

  public updateConfig(config: Partial<DeyeAccountConfig>): void {
    if (config.directusId !== undefined) this.directusId = String(config.directusId);
    if (config.email !== undefined) {
      this.email = config.email.trim();
      this.accountEmail = config.email.trim();
    }
    if (config.baseUrl) this.baseUrl = sanitizeDeyeBaseUrl(config.baseUrl);
    if (config.appId !== undefined) this.appId = config.appId.trim();
    if (config.appSecret !== undefined) this.appSecret = config.appSecret.trim();
    if (config.password !== undefined) this.passwordRaw = config.password.trim();
    if (config.defaultStationId !== undefined) this.defaultStationId = config.defaultStationId.trim();
    if (config.defaultDeviceSn !== undefined) this.defaultDeviceSn = config.defaultDeviceSn.trim();
    if (config.plants !== undefined) this.plants = config.plants;
  }

  public getDefaultStationId(): string {
    return this.defaultStationId;
  }

  public getDefaultDeviceSn(): string {
    return this.defaultDeviceSn;
  }

  public invalidateToken(): void {
    this.cachedToken = null;
  }

  /**
   * Has the user configured real DeyeCloud API credentials?
   * Avoids attempting token acquisition for internal admin accounts or dummy '0' placeholders.
   */
  public hasCredentials(): boolean {
    if (this.isDemo) return false;
    const hasValidAppId = Boolean(this.appId && this.appId !== '0' && this.appId.length > 3);
    const hasValidSecret = Boolean(this.appSecret && this.appSecret !== '0' && this.appSecret.length > 5);
    const hasValidEmail = Boolean(this.email && this.email !== '0');
    const hasValidPassword = Boolean(this.passwordRaw && this.passwordRaw !== '0');
    return Boolean(hasValidAppId && hasValidSecret && hasValidEmail && hasValidPassword);
  }

  /**
   * Generates lowercased SHA-256 hash required by DeyeCloud OpenAPI auth
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex').toLowerCase();
  }

  /**
   * Retrieves or refreshes the 60-day DeyeCloud Bearer Token with a concurrency lock.
   */
  public async getAccessToken(): Promise<string | null> {
    if (!this.hasCredentials()) {
      return null;
    }

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60000) {
      return this.cachedToken.token;
    }

    // Reuse existing in-flight token request if active
    if (this.tokenFetchPromise) {
      return this.tokenFetchPromise;
    }

    this.tokenFetchPromise = this.performTokenFetch().finally(() => {
      this.tokenFetchPromise = null;
    });

    return this.tokenFetchPromise;
  }

  private async performTokenFetch(): Promise<string | null> {
    const url = `${this.baseUrl}/v1.0/account/token?appId=${encodeURIComponent(this.appId)}`;
    const sha256Password = this.hashPassword(this.passwordRaw);
    const timeoutMs = env.DEYE_API_TIMEOUT_MS ?? 15000;

    const doFetch = () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          appSecret: this.appSecret,
          email: this.email,
          password: sha256Password,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });

    try {
      let res: Response;
      try {
        res = await doFetch();
      } catch (firstErr: unknown) {
        if (isNetworkTimeoutError(firstErr)) {
          await new Promise((r) => setTimeout(r, 250));
          res = await doFetch();
        } else {
          throw firstErr;
        }
      }

      if (!res.ok) {
        log.warn('Auth failed with status', { accountName: this.accountName, status: res.status });
        return null;
      }

      const data = await res.json();
      const token = data.accessToken || data.data?.accessToken;
      if (token && (data.code === '1000000' || data.code === '0' || data.success === true)) {
        const expiresInMs = (parseInt(data.expiresIn || data.data?.expiresIn || '5184000', 10)) * 1000;
        this.cachedToken = {
          token,
          expiresAt: Date.now() + expiresInMs,
        };
        return this.cachedToken.token;
      }

      log.warn('Auth response did not return token', { accountName: this.accountName, data });
      return null;
    } catch (err: unknown) {
      if (isNetworkTimeoutError(err)) {
        log.warn('Auth token request timed out', {
          accountName: this.accountName,
          timeoutMs,
        });
      } else {
        log.error('Network error during token acquisition', err, { accountName: this.accountName });
      }
      return null;
    }
  }

  /**
   * Resilient HTTP client wrapper for Deye OpenAPI:
   * - Injects Bearer token
   * - Enforces configurable timeout (default 15s)
   * - Blocks redirects
   * - Retries once on transient connect/socket timeouts
   * - Automatically invalidates token and retries once on 401
   */
  private async fetchWithAuth(endpoint: string, init: RequestInit = {}): Promise<Response | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    const timeoutMs = env.DEYE_API_TIMEOUT_MS ?? 15000;
    const url = `${this.baseUrl}${endpoint}`;
    const makeReq = async (currentToken: string) => {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${currentToken}`);
      headers.set('Content-Type', 'application/json');
      headers.set('Accept', 'application/json');

      return fetch(url, {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    };

    try {
      let res: Response;
      try {
        res = await makeReq(token);
      } catch (firstErr: unknown) {
        if (isNetworkTimeoutError(firstErr)) {
          await new Promise((r) => setTimeout(r, 250));
          res = await makeReq(token);
        } else {
          throw firstErr;
        }
      }

      // Invalidate and retry once if token expired
      if (res.status === 401) {
        this.invalidateToken();
        const freshToken = await this.getAccessToken();
        if (freshToken) {
          res = await makeReq(freshToken);
        }
      }

      return res;
    } catch (err: unknown) {
      if (isNetworkTimeoutError(err)) {
        log.warn('Request timed out (upstream cloud latency)', {
          accountName: this.accountName,
          endpoint,
          timeoutMs,
        });
      } else {
        log.warn('Fetch error', { accountName: this.accountName, endpoint }, err);
      }
      return null;
    }
  }

  /**
   * Fetch list of registered stations/plants under this DeyeCloud account
   */
  public async getStationList(): Promise<{ total: number; stations: Record<string, unknown>[]; isLive: boolean }> {
    const res = await this.fetchWithAuth('/v1.0/station/listWithDevice', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (res && res.ok) {
      try {
        const body = await res.json();
        const stationList = body.stationList || body.data?.stationList || [];
        return {
          total: body.stationTotal || body.total || stationList.length,
          stations: stationList,
          isLive: true,
        };
      } catch (e) {
        log.warn('Failed to parse station list', { accountName: this.accountName }, e);
      }
    }

    return { total: 0, stations: [], isLive: false };
  }

  /**
   * Auto-discover all plants and hardware (inverters and loggers) registered under this DeyeCloud account
   */
  public async discoverPlantsAndDevices(): Promise<{ plants: PlantInfo[]; isLive: boolean }> {
    const res = await this.fetchWithAuth('/v1.0/station/listWithDevice', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (res && res.ok) {
      try {
        const body = await res.json();
        const stationList = body.stationList || body.data?.stationList || [];

        if (Array.isArray(stationList) && stationList.length > 0) {
          const plants: PlantInfo[] = stationList.map((st: Record<string, unknown>) => {
            const rawDevices = (st.deviceListItems || st.deviceList || st.devices || []) as Record<string, unknown>[];
            const devices: DeviceInfo[] = rawDevices.map((d: Record<string, unknown>) => {
              const isLogger =
                d.deviceType === 'LOGGER' ||
                d.deviceType === 'COLLECTOR' ||
                d.deviceType === 2 ||
                d.deviceType === '2' ||
                d.loggerSn === d.deviceSn;

              const isOnline =
                d.connectStatus === 1 ||
                d.connectStatus === '1' ||
                d.connectionStatus === '1' ||
                d.status === '1' ||
                d.status === 'ONLINE';

              return {
                deviceSn: String(d.deviceSn || d.sn || ''),
                deviceType: (isLogger ? 'LOGGER' : 'INVERTER') as 'INVERTER' | 'LOGGER',
                name: String(
                  d.deviceName ||
                  d.name ||
                  (isLogger ? `Deye Collector/Logger (${d.deviceSn})` : `Deye Inverter (${d.deviceSn})`)
                ),
                model: String(d.deviceModel || d.model || (isLogger ? 'Deye Smart Collector Logger' : 'SUN-100K-SG01HP3-EU-AM2')),
                ratedKw: parseFloat(String(d.ratedPower || d.capacity || (isLogger ? '0' : '100'))),
                loggerSn: d.loggerSn ? String(d.loggerSn) : undefined,
                status: isOnline ? 'ONLINE' : 'STANDBY',
                lastSeen: d.collectionTime
                  ? new Date(Number(d.collectionTime) * 1000).toISOString()
                  : new Date().toISOString(),
              };
            });

            return {
              stationId: String(st.id || st.stationId || this.defaultStationId),
              stationName: String(st.name || st.stationName || `${this.accountName} Plant`),
              installedCapacityKw: parseFloat(String(st.installedCapacity || st.capacity || '100.0')),
              address: String(st.locationAddress || st.address || st.location || 'Site Array Location'),
              liveSolarPowerKw: parseFloat(String(st.generationPower || st.livePower || '0.0')),
              dailyYieldKwh: parseFloat(String(st.dailyEnergy || st.dailyYield || '0.0')),
              devices,
            };
          });

          return { plants, isLive: true };
        }
      } catch (err) {
        log.warn('Auto-discovery parse error', { accountName: this.accountName }, err);
      }
    }

    return { plants: this.getSimulatedPlants(), isLive: false };
  }

  /**
   * Fallback plants structure
   */
  public getSimulatedPlants(): PlantInfo[] {
    return [];
  }

  /**
   * Fetch a single station summary from DeyeCloud OpenAPI
   */
  public async getSingleStationSummary(stationId?: string): Promise<{ data: StationSummary; isLive: boolean; stationDetected: boolean }> {
    const id = stationId || this.defaultStationId;
    const idKey = String(id || '');
    const matchingPlant = this.plants.find((p) => String(p.stationId) === idKey);

    const emptySummary: StationSummary = {
      stationId: idKey,
      name: matchingPlant?.stationName || this.accountName,
      capacityKw: matchingPlant?.installedCapacityKw || 0,
      liveSolarPowerKw: 0,
      dailyYieldKwh: 0,
      totalYieldMwh: 0,
      batterySoc: 0,
      batteryPowerKw: 0,
      gridPowerKw: 0,
      loadPowerKw: 0,
      status: 'OFFLINE',
      lastUpdated: new Date().toISOString(),
    };

    if (!id || !this.hasCredentials()) {
      return { data: emptySummary, isLive: false, stationDetected: false };
    }

    const now = Date.now();
    try {
      const numStationId = parseInt(id, 10) || id;
      const cachedDetail = this.cachedStationDetails.get(idKey);
      const hasKnownPlantMetadata =
        Boolean(matchingPlant?.stationName && (matchingPlant.installedCapacityKw ?? 0) > 0) ||
        Boolean(cachedDetail && now - cachedDetail.timestamp < 600_000);

      // Only query /v1.0/station/detail when static metadata (name/capacity) is not already known or cached,
      // halving concurrent TCP/TLS handshakes per poll cycle.
      const [latestRes, detailRes] = await Promise.all([
        this.fetchWithAuth('/v1.0/station/latest', {
          method: 'POST',
          body: JSON.stringify({ stationId: numStationId }),
        }),
        hasKnownPlantMetadata
          ? Promise.resolve(null)
          : this.fetchWithAuth('/v1.0/station/detail', {
              method: 'POST',
              body: JSON.stringify({ stationId: numStationId }),
            }),
      ]);

      let stationName = cachedDetail?.name || matchingPlant?.stationName || `${this.accountName} Plant`;
      let installedCapacityKw = cachedDetail?.installedCapacityKw || matchingPlant?.installedCapacityKw || 0;
      let connectionStatus = cachedDetail?.connectionStatus || 'NORMAL';

      if (detailRes && detailRes.ok) {
        const detailData = await detailRes.json();
        if (detailData.station) {
          if (detailData.station.name) {
            stationName = detailData.station.name;
            if (matchingPlant) {
              matchingPlant.stationName = stationName;
            }
          }
          installedCapacityKw = parseFloat(detailData.station.installedCapacity || String(installedCapacityKw));
          if (installedCapacityKw > 0 && matchingPlant) {
            matchingPlant.installedCapacityKw = installedCapacityKw;
          }
          connectionStatus = detailData.station.connectionStatus || 'NORMAL';
          this.cachedStationDetails.set(idKey, {
            name: stationName,
            installedCapacityKw,
            connectionStatus,
            timestamp: Date.now(),
          });
        }
      }

      if (latestRes && latestRes.ok) {
        const latestData = await latestRes.json();
        if (latestData.code === '1000000' || latestData.success === true) {
          const genW = latestData.generationPower != null ? Number(latestData.generationPower) : 0;
          const consW = latestData.consumptionPower != null ? Number(latestData.consumptionPower) : 0;
          const wireW = latestData.wirePower != null ? Number(latestData.wirePower) : 0;
          const batW = latestData.batteryPower != null ? Number(latestData.batteryPower) : 0;
          const batSoc = latestData.batterySOC != null ? Number(latestData.batterySOC) : 0;

          const summary: StationSummary = {
            stationId: idKey,
            name: stationName,
            capacityKw: installedCapacityKw > 0 ? installedCapacityKw : (matchingPlant?.installedCapacityKw || 0),
            liveSolarPowerKw: parseFloat((genW / 1000).toFixed(2)),
            dailyYieldKwh: 0,
            totalYieldMwh: 0,
            batterySoc: batSoc,
            batteryPowerKw: parseFloat((batW / 1000).toFixed(2)),
            gridPowerKw: parseFloat((wireW / 1000).toFixed(2)),
            loadPowerKw: parseFloat((consW / 1000).toFixed(2)),
            status: connectionStatus === 'NORMAL' ? 'ONLINE' : 'ALARM',
            lastUpdated: new Date().toISOString(),
          };

          const liveResult = { data: summary, isLive: true, stationDetected: true };
          this.cachedStationSummary.set(idKey, { result: liveResult, timestamp: Date.now() });
          return liveResult;
        }
      }
    } catch (err) {
      log.warn('Station summary fetch failed', { accountName: this.accountName, stationId: id }, err);
    }

    // Stale-while-revalidate fallback if this station had a recent live reading within the last 120 seconds
    const staleSingle = this.cachedStationSummary.get(idKey);
    if (staleSingle && now - staleSingle.timestamp < 120_000) {
      return staleSingle.result;
    }

    return { data: emptySummary, isLive: false, stationDetected: false };
  }

  /**
   * Fetch Station Summary (Single or Multi-Plant Aggregation) with in-flight deduplication
   */
  public async getStationSummary(stationId?: string): Promise<{ data: StationSummary; isLive: boolean; stationDetected: boolean }> {
    const cacheKey = stationId || 'ALL';
    const now = Date.now();
    const cached = this.cachedStationSummary.get(cacheKey);
    if (cached && now - cached.timestamp < 20000) {
      return cached.result;
    }

    const existingInFlight = this.inFlightStationSummary.get(cacheKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const fetchPromise = this.performStationSummaryFetch(stationId, cacheKey, now, cached).finally(() => {
      this.inFlightStationSummary.delete(cacheKey);
    });
    this.inFlightStationSummary.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async performStationSummaryFetch(
    stationId: string | undefined,
    cacheKey: string,
    now: number,
    cached: { result: { data: StationSummary; isLive: boolean; stationDetected: boolean }; timestamp: number } | undefined
  ): Promise<{ data: StationSummary; isLive: boolean; stationDetected: boolean }> {
    if (stationId && stationId !== 'ALL') {
      const res = await this.getSingleStationSummary(stationId);
      if (res.isLive || !cached || now - cached.timestamp >= 60000) {
        this.cachedStationSummary.set(cacheKey, { result: res, timestamp: Date.now() });
        return res;
      }
      return cached.result;
    }

    // Multi-plant account aggregation
    if (this.plants && this.plants.length > 0) {
      const settled = await Promise.allSettled(
        this.plants.map((p) => this.getSingleStationSummary(p.stationId))
      );

      const results = settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value;
        const p = this.plants[i];
        log.warn('Failed getting summary for plant', { stationId: p?.stationId }, s.reason);
        return {
          isLive: false,
          data: {
            stationId: p?.stationId || 'UNKNOWN',
            name: p?.stationName || 'Offline Plant',
            status: 'OFFLINE' as const,
            capacityKw: p?.installedCapacityKw || 0,
            liveSolarPowerKw: 0,
            dailyYieldKwh: 0,
            totalYieldMwh: 0,
            batteryPowerKw: 0,
            gridPowerKw: 0,
            loadPowerKw: 0,
            batterySoc: 0,
            lastUpdated: new Date().toISOString(),
          },
        };
      });

      let totalCapacityKw = 0;
      let totalLiveSolarPowerKw = 0;
      let totalDailyYieldKwh = 0;
      let totalYieldMwh = 0;
      let totalBatteryPowerKw = 0;
      let totalGridPowerKw = 0;
      let totalLoadPowerKw = 0;
      let sumBatterySoc = 0;
      let batteryCount = 0;
      let anyLive = false;
      let anyAlarm = false;

      const plantsSummary = results.map((res, i) => {
        const p = this.plants[i];
        if (res.isLive) anyLive = true;
        if (res.data.status === 'ALARM') anyAlarm = true;

        const cap = res.data.capacityKw > 0 ? res.data.capacityKw : (p.installedCapacityKw || 0);
        totalCapacityKw += cap;
        totalLiveSolarPowerKw += res.data.liveSolarPowerKw || 0;
        totalDailyYieldKwh += res.data.dailyYieldKwh || 0;
        totalYieldMwh += res.data.totalYieldMwh || 0;
        totalBatteryPowerKw += res.data.batteryPowerKw || 0;
        totalGridPowerKw += res.data.gridPowerKw || 0;
        totalLoadPowerKw += res.data.loadPowerKw || 0;

        if (res.data.batterySoc > 0) {
          sumBatterySoc += res.data.batterySoc;
          batteryCount++;
        }

        return {
          stationId: res.data.stationId || p.stationId,
          stationName: res.data.name || p.stationName,
          capacityKw: cap,
          liveSolarPowerKw: res.data.liveSolarPowerKw || 0,
          dailyYieldKwh: res.data.dailyYieldKwh || 0,
          totalYieldMwh: res.data.totalYieldMwh || 0,
          batterySoc: res.data.batterySoc || 0,
          batteryPowerKw: res.data.batteryPowerKw || 0,
          gridPowerKw: res.data.gridPowerKw || 0,
          loadPowerKw: res.data.loadPowerKw || 0,
          status: res.data.status,
          lastUpdated: res.data.lastUpdated,
        };
      });

      const aggregated: StationSummary = {
        stationId: 'ALL',
        name: `${this.accountName} (All ${this.plants.length} Plants)`,
        capacityKw: parseFloat(totalCapacityKw.toFixed(1)),
        liveSolarPowerKw: parseFloat(totalLiveSolarPowerKw.toFixed(2)),
        dailyYieldKwh: parseFloat(totalDailyYieldKwh.toFixed(2)),
        totalYieldMwh: parseFloat(totalYieldMwh.toFixed(2)),
        batterySoc: batteryCount > 0 ? Math.round(sumBatterySoc / batteryCount) : 0,
        batteryPowerKw: parseFloat(totalBatteryPowerKw.toFixed(2)),
        gridPowerKw: parseFloat(totalGridPowerKw.toFixed(2)),
        loadPowerKw: parseFloat(totalLoadPowerKw.toFixed(2)),
        status: anyAlarm ? 'ALARM' : anyLive ? 'ONLINE' : 'OFFLINE',
        lastUpdated: new Date().toISOString(),
        plantsSummary,
      };

      const finalRes = {
        data: aggregated,
        isLive: anyLive,
        stationDetected: true,
      };

      if (anyLive || !cached || now - cached.timestamp >= 60000) {
        this.cachedStationSummary.set(cacheKey, { result: finalRes, timestamp: Date.now() });
        return finalRes;
      }
      return cached.result;
    }

    const defaultRes = await this.getSingleStationSummary(this.defaultStationId);
    if (defaultRes.isLive || !cached || now - cached.timestamp >= 60000) {
      this.cachedStationSummary.set(cacheKey, { result: defaultRes, timestamp: Date.now() });
      return defaultRes;
    }
    return cached.result;
  }

  /**
   * Batch fetch raw device telemetry from DeyeCloud OpenAPI (/v1.0/device/latest)
   * Uses Promise.allSettled and in-flight deduplication to avoid duplicate concurrent calls
   */
  public async getBatchDeviceLatest(deviceSnList: string[]): Promise<Map<string, Map<string, string>>> {
    if (!deviceSnList || deviceSnList.length === 0) {
      return new Map<string, Map<string, string>>();
    }

    const now = Date.now();
    if (this.cachedBatchDevices && now - this.cachedBatchDevices.timestamp < 20000) {
      const hasAllRequested = deviceSnList.every((sn) => this.cachedBatchDevices!.result.has(sn));
      if (hasAllRequested || this.cachedBatchDevices.result.size > 0) {
        return this.cachedBatchDevices.result;
      }
    }

    if (this.inFlightBatchDevices) {
      const sharedResult = await this.inFlightBatchDevices;
      if (sharedResult.size > 0) {
        return sharedResult;
      }
    }

    this.inFlightBatchDevices = this.performBatchDeviceFetch(deviceSnList, now).finally(() => {
      this.inFlightBatchDevices = null;
    });
    return this.inFlightBatchDevices;
  }

  private async performBatchDeviceFetch(
    deviceSnList: string[],
    now: number
  ): Promise<Map<string, Map<string, string>>> {
    const result = new Map<string, Map<string, string>>();
    const chunkSize = 8;
    const chunks: string[][] = [];
    for (let i = 0; i < deviceSnList.length; i += chunkSize) {
      chunks.push(deviceSnList.slice(i, i + chunkSize));
    }

    try {
      const promises = chunks.map(async (chunk) => {
        const res = await this.fetchWithAuth('/v1.0/device/latest', {
          method: 'POST',
          body: JSON.stringify({ deviceList: chunk }),
        });

        if (res && res.ok) {
          const body = await res.json();
          if (body.code === '1000000' && Array.isArray(body.deviceDataList)) {
            for (const item of body.deviceDataList) {
              const dataMap = new Map<string, string>();
              if (Array.isArray(item.dataList)) {
                for (const p of item.dataList) {
                  if (p.key) dataMap.set(p.key, String(p.value));
                }
              }
              result.set(String(item.deviceSn), dataMap);
            }
          }
        }
      });

      await Promise.allSettled(promises);
    } catch (e) {
      log.warn('Batch device latest error', { accountName: this.accountName }, e);
    }

    if (result.size > 0) {
      this.cachedBatchDevices = { result, timestamp: Date.now() };
      return result;
    }

    // Stale-while-revalidate fallback: If current fetch returned no data (e.g. timeout or network glitch)
    // but we have a recent cached reading within the last 60 seconds, retain it rather than dropping to 0kW.
    if (this.cachedBatchDevices && now - this.cachedBatchDevices.timestamp < 60000) {
      return this.cachedBatchDevices.result;
    }

    this.cachedBatchDevices = { result, timestamp: Date.now() };
    return result;
  }

  /**
   * Fetch Inverter Telemetry
   */
  public async getInverterTelemetry(deviceSn?: string): Promise<{ data: InverterTelemetry; isLive: boolean }> {
    const sn = deviceSn || this.defaultDeviceSn;
    const emptyTelemetry: InverterTelemetry = {
      deviceSn: sn || 'UNKNOWN',
      model: 'Deye Solar Inverter',
      firmwareVersion: 'N/A',
      connectionStatus: 'STANDBY',
      efficiencyPct: 0,
      heatsinkTempC: 0,
      ambientTempC: 0,
      powerFactor: 0,
      thdPct: 0,
      gridFrequencyHz: 0,
      mpptStrings: [],
      phases: [],
      totalActivePowerKw: 0,
      totalReactivePowerKvar: 0,
      todayEnergyKwh: 0,
      totalEnergyMwh: 0,
      runningHours: 0,
      activeWorkMode: 'PEAK_SHAVING',
      gridChargeEnabled: false,
      activeFaults: [],
    };

    if (!sn) {
      return { data: emptyTelemetry, isLive: false };
    }

    const batch = await this.getBatchDeviceLatest([sn]);
    const dataMap = batch.get(sn);

    if (dataMap && dataMap.size > 0) {
      const activeW = parseFloat(dataMap.get('TotalActiveACOutputPower') || '0');
      const dailyKwh = parseFloat(dataMap.get('DailyActiveProduction') || '0');
      const totalKwh = parseFloat(dataMap.get('TotalActiveProduction') || '0');
      const ratedW = parseFloat(dataMap.get('RatedPower') || '50000');
      const freqHz = parseFloat(dataMap.get('ACOutputFrequencyR') || '60.0');

      const mpptStrings = [
        {
          stringId: 'PV1 String',
          voltageV: parseFloat(dataMap.get('DCVoltagePV1') || '0'),
          currentA: parseFloat(dataMap.get('DCCurrentPV1') || '0'),
          powerKw: parseFloat((parseFloat(dataMap.get('DCPowerPV1') || '0') / 1000).toFixed(2)),
        },
        {
          stringId: 'PV2 String',
          voltageV: parseFloat(dataMap.get('DCVoltagePV2') || '0'),
          currentA: parseFloat(dataMap.get('DCCurrentPV2') || '0'),
          powerKw: parseFloat((parseFloat(dataMap.get('DCPowerPV2') || '0') / 1000).toFixed(2)),
        },
        {
          stringId: 'PV3 String',
          voltageV: parseFloat(dataMap.get('DCVoltagePV3') || '0'),
          currentA: parseFloat(dataMap.get('DCCurrentPV3') || '0'),
          powerKw: parseFloat((parseFloat(dataMap.get('DCPowerPV3') || '0') / 1000).toFixed(2)),
        },
        {
          stringId: 'PV4 String',
          voltageV: parseFloat(dataMap.get('DCVoltagePV4') || '0'),
          currentA: parseFloat(dataMap.get('DCCurrentPV4') || '0'),
          powerKw: parseFloat((parseFloat(dataMap.get('DCPowerPV4') || '0') / 1000).toFixed(2)),
        },
      ].filter((s) => s.voltageV > 0 || s.powerKw > 0);

      const phases = [
        {
          phase: 'L1' as const,
          voltageV: parseFloat(dataMap.get('ACVoltageRUA') || '0'),
          currentA: parseFloat(dataMap.get('ACCurrentRUA') || '0'),
          frequencyHz: freqHz,
        },
        {
          phase: 'L2' as const,
          voltageV: parseFloat(dataMap.get('ACVoltageSVB') || '0'),
          currentA: parseFloat(dataMap.get('ACCurrentSVB') || '0'),
          frequencyHz: freqHz,
        },
        {
          phase: 'L3' as const,
          voltageV: parseFloat(dataMap.get('ACVoltageTWC') || '0'),
          currentA: parseFloat(dataMap.get('ACCurrentTWC') || '0'),
          frequencyHz: freqHz,
        },
      ];

      const rawEfficiency = dataMap.get('InverterEfficiency') || dataMap.get('Efficiency');
      const rawHeatsink = dataMap.get('RadiatorTemperature') || dataMap.get('DeviceTemperature') || dataMap.get('TempHeatsink');
      const rawAmbient = dataMap.get('AmbientTemperature') || dataMap.get('EnvTemperature');
      const rawPF = dataMap.get('PowerFactor') || dataMap.get('PF');
      const rawTHD = dataMap.get('THD') || dataMap.get('THDu');
      const rawReactive = dataMap.get('ReactivePower') || dataMap.get('TotalReactivePower');
      const rawRunningHours = dataMap.get('TotalRunningHours') || dataMap.get('RunningHours');
      const rawWorkMode = dataMap.get('WorkMode') || dataMap.get('CurrentWorkMode');

      const telemetry: InverterTelemetry = {
        deviceSn: sn,
        model: `SUN-${Math.round(ratedW / 1000)}K-SG01HP3-EU-AM2`,
        firmwareVersion: 'Deye Live Protocol',
        connectionStatus: 'ONLINE',
        efficiencyPct: rawEfficiency ? parseFloat(rawEfficiency) : 98.4,
        heatsinkTempC: rawHeatsink ? parseFloat(rawHeatsink) : 45.0,
        ambientTempC: rawAmbient ? parseFloat(rawAmbient) : 30.0,
        powerFactor: rawPF ? parseFloat(rawPF) : 0.99,
        thdPct: rawTHD ? parseFloat(rawTHD) : 1.5,
        gridFrequencyHz: freqHz,
        mpptStrings,
        phases,
        totalActivePowerKw: parseFloat((activeW / 1000).toFixed(2)),
        totalReactivePowerKvar: rawReactive ? parseFloat(rawReactive) : 0,
        todayEnergyKwh: dailyKwh,
        totalEnergyMwh: parseFloat((totalKwh / 1000).toFixed(2)),
        runningHours: rawRunningHours ? parseFloat(rawRunningHours) : 0,
        activeWorkMode: (rawWorkMode as InverterTelemetry['activeWorkMode']) || 'PEAK_SHAVING',
        gridChargeEnabled: true,
        activeFaults: [],
      };

      return { data: telemetry, isLive: true };
    }

    return { data: emptyTelemetry, isLive: false };
  }

  /**
   * Dispatch Work Mode control command to physical inverter via OpenAPI
   */
  public async setWorkMode(params: {
    deviceSn?: string;
    mode: 'PEAK_SHAVING' | 'BATTERY_FIRST' | 'LOAD_FIRST' | 'SELLING_FIRST';
    gridCharge: boolean;
  }): Promise<{ success: boolean; message: string; isLive: boolean }> {
    const sn = params.deviceSn || this.defaultDeviceSn;

    if (!this.hasCredentials()) {
      return {
        success: false,
        message: `Authentication credentials not configured for account "${this.accountName}". Configure credentials before dispatching inverter commands.`,
        isLive: false,
      };
    }

    const res = await this.fetchWithAuth('/v1.0/control/workmode', {
      method: 'POST',
      body: JSON.stringify({
        device_sn: sn,
        mode: params.mode,
        grid_charge: params.gridCharge,
      }),
    });

    if (!res) {
      return {
        success: false,
        message: `Network failure connecting to DeyeCloud API for account "${this.accountName}"`,
        isLive: false,
      };
    }

    try {
      const body = await res.json();
      if (res.ok && body.code === '0') {
        return {
          success: true,
          message: `[DeyeCloud Live] Successfully dispatched ${params.mode} command to inverter ${sn}.`,
          isLive: true,
        };
      }
      return {
        success: false,
        message: `[DeyeCloud Live Error] ${body.msg || body.message || 'Command rejected by hardware'}`,
        isLive: true,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to parse inverter control response: ${String(err)}`,
        isLive: false,
      };
    }
  }

  /**
   * Check Gateway Health & Latency
   */
  public async getHealth(): Promise<ApiHealthMetrics> {
    const start = Date.now();
    const isConfigured = this.hasCredentials();

    if (!isConfigured) {
      return {
        gatewayUrl: this.baseUrl,
        region: 'Unconfigured Developer Gateway',
        isLive: false,
        status: 'OFFLINE',
        pingMs: 0,
        rateLimitUsed: 0,
        rateLimitMax: 10000,
        tokenExpiresAt: null,
        lastChecked: new Date().toISOString(),
      };
    }

    try {
      const token = await this.getAccessToken();
      const pingMs = Date.now() - start;

      return {
        gatewayUrl: `${this.baseUrl}/v1.0`,
        region: 'Configured Developer Gateway',
        isLive: Boolean(token),
        status: token ? 'OPTIMAL' : 'DEGRADED',
        pingMs: Math.max(1, pingMs),
        rateLimitUsed: token ? 1 : 0,
        rateLimitMax: 10000,
        tokenExpiresAt: this.cachedToken ? new Date(this.cachedToken.expiresAt).toISOString() : null,
        lastChecked: new Date().toISOString(),
      };
    } catch {
      return {
        gatewayUrl: this.baseUrl,
        region: 'Configured Developer Gateway',
        status: 'DEGRADED',
        isLive: false,
        pingMs: 0,
        rateLimitUsed: 0,
        rateLimitMax: 10000,
        tokenExpiresAt: null,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Hourly curves (Returns model-driven diurnal curves).
   * Optional 4th arg `opts` scales the mock series per inverter:
   * factor = SN-hash variance [0.9, 1.1] x capacityRatio (explicit or
   * looked up from this.plants). Absent opts => byte-identical base series.
   */
  public getHourlyEnergy(
    range: string = 'TODAY',
    stepMinutes: number = 5,
    date?: string,
    opts?: HourlyEnergyInverterOpts
  ): HourlyEnergyPoint[] {
    const base = getMockHourlyEnergyPoints(range, undefined, stepMinutes, date);
    if (!opts || (opts.deviceSn === undefined && opts.capacityRatio === undefined)) {
      return base;
    }
    const snFactor = opts.deviceSn ? getInverterSnScaleFactor(opts.deviceSn) : 1;
    let shareRatio = 1;
    if (opts.capacityRatio !== undefined) {
      shareRatio = opts.capacityRatio;
    } else if (opts.deviceSn) {
      const info = getInverterShareInfo(this.plants, opts.deviceSn);
      shareRatio = info ? info.ratio : 1;
    }
    const factor = snFactor * shareRatio;
    return base.map((p) => {
      if (p.solarYieldKw === null || p.solarYieldKw === undefined) return p;
      const solar = Number((p.solarYieldKw * factor).toFixed(2));
      const load = p.loadDemandKw ?? 0;
      const gridFlow = Number((solar - load).toFixed(2));
      return {
        ...p,
        solarYieldKw: solar,
        gridFlowKw: p.gridFlowKw === null ? null : gridFlow,
        gridExportKw: p.gridExportKw === null ? null : Number(Math.max(0, gridFlow).toFixed(2)),
      };
    });
  }
}

export const deyeClient = new DeyeCloudClient();

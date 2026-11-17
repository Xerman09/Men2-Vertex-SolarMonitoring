import { z } from 'zod';
import {
  GEMINI_FLASH_LITE_MODEL,
  invokeGeminiStructuredJson,
  type StructuredInteractionInvoke,
} from './gemini-client';
import { createLogger } from './logger';
import { getManilaNowParts } from './manila-time';
import { DEFAULT_TARIFF_SCHEDULE } from './tariff-rates';
import type { AggregatedFleetSummary } from './types';

const log = createLogger('GeminiTvBrief');

export const TV_BRIEF_MODEL = GEMINI_FLASH_LITE_MODEL;
const BRIEF_CACHE_TTL_MS = 5 * 60_000;
const BRIEF_TIMEOUT_MS = 8_000;

export type TvBriefSeverity = 'normal' | 'warning' | 'critical';

export interface TvStationHealthSnapshot {
  stationId: string;
  stationName: string;
  accountName: string;
  livePowerKw: number;
  dailyYieldKwh: number;
  capacityKw: number;
  status: 'ONLINE' | 'FAULT' | 'OFFLINE' | 'STANDBY';
  offlineLoggers: number;
  faultInverters: number;
}

export interface TvTelemetrySnapshot {
  scopeKey: string;
  manilaTimestamp: string;
  isLive: boolean;
  totalAccounts: number;
  totalPlants: number;
  totalInverters: number;
  onlineInverters: number;
  faultCount: number;
  offlineInverterCount: number;
  offlineLoggerCount: number;
  liveSolarKw: number;
  capacityKw: number;
  dailyYieldKwh: number;
  facilityLoadKw: number;
  gridNetKw: number;
  avgBatterySoc: number;
  estimatedSavingsPhp: number;
  stations: TvStationHealthSnapshot[];
}

export interface TvBriefResult {
  headline: string;
  severity: TvBriefSeverity;
  priorityStationId: string | null;
  source: 'gemini' | 'fallback';
  model: string;
  generatedAt: string;
}

const tvBriefOutputSchema = z.object({
  headline: z.string().min(1).max(200),
  severity: z.enum(['normal', 'warning', 'critical']),
  priorityStationId: z.string().nullable().optional(),
});

const TV_BRIEF_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description:
        'Single concise status ticker line (max 90 chars) strictly citing verified telemetry metrics or faulted station names.',
    },
    severity: {
      type: 'string',
      enum: ['normal', 'warning', 'critical'],
      description:
        'critical if faultCount > 0, warning if offline devices/loggers > 0 or !isLive, normal otherwise.',
    },
    priorityStationId: {
      type: ['string', 'null'],
      description:
        'Exact stationId from input stations needing operator attention, or null when nominal.',
    },
  },
  required: ['headline', 'severity', 'priorityStationId'],
  additionalProperties: false,
};

interface BriefCacheEntry {
  result: TvBriefResult;
  expiresAt: number;
}

const briefCache = new Map<string, BriefCacheEntry>();
const inFlightBriefs = new Map<string, Promise<TvBriefResult>>();

export function _resetTvBriefCacheForTesting(): void {
  briefCache.clear();
  inFlightBriefs.clear();
}

function clampHeadline(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 90) return normalized;
  return `${normalized.slice(0, 87).trimEnd()}...`;
}

export function extractTvSnapshotFromAggregate(
  aggregate: AggregatedFleetSummary,
  scopeKey: string,
  tariffRatePhpPerKwh: number = DEFAULT_TARIFF_SCHEDULE.peakRatePerKwh
): TvTelemetrySnapshot {
  const nowParts = getManilaNowParts();
  const manilaTimestamp = `${nowParts.dateStr} ${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')} PHT`;

  const nodes = Array.isArray(aggregate.nodes) ? aggregate.nodes : [];
  const onlineInverters = nodes.filter((n) => n.deviceType === 'INVERTER' && n.status === 'ONLINE').length;
  const faultCount = nodes.filter((n) => n.deviceType === 'INVERTER' && n.status === 'FAULT').length;
  const offlineInverterCount = nodes.filter((n) => n.deviceType === 'INVERTER' && n.status === 'OFFLINE').length;
  const offlineLoggerCount = nodes.filter(
    (n) => (n.deviceType === 'LOGGER' && n.status === 'OFFLINE') || n.loggerStatus === 'OFFLINE'
  ).length;

  const stations: TvStationHealthSnapshot[] = [];
  for (const acc of aggregate.accounts || []) {
    for (const plant of acc.plants || []) {
      const sid = String(plant.stationId);
      const stNodes = nodes.filter(
        (n) => String(n.stationId) === sid && n.accountId === acc.id
      );
      const stFaults = stNodes.filter((n) => n.deviceType === 'INVERTER' && n.status === 'FAULT').length;
      const stOfflineInvs = stNodes.filter((n) => n.deviceType === 'INVERTER' && n.status === 'OFFLINE').length;
      const stInvs = (plant.devices || []).filter((d) => d.deviceType === 'INVERTER').length;
      const stLoggersOffline =
        (plant.devices || []).filter((d) => d.deviceType === 'LOGGER' && d.status === 'OFFLINE').length +
        stNodes.filter((n) => n.loggerStatus === 'OFFLINE').length;
      const livePowerKw = Number((plant.liveSolarPowerKw ?? 0).toFixed(1));
      const status: TvStationHealthSnapshot['status'] =
        stFaults > 0
          ? 'FAULT'
          : stInvs > 0 && stOfflineInvs >= stInvs
            ? 'OFFLINE'
            : livePowerKw === 0
              ? 'STANDBY'
              : 'ONLINE';

      stations.push({
        stationId: sid,
        stationName: plant.stationName || `Station ${sid}`,
        accountName: acc.name || acc.id,
        livePowerKw,
        dailyYieldKwh: Number((plant.dailyYieldKwh ?? 0).toFixed(1)),
        capacityKw: Number((plant.installedCapacityKw ?? 0).toFixed(1)),
        status,
        offlineLoggers: stLoggersOffline,
        faultInverters: stFaults,
      });
    }
  }

  const dailyYieldKwh = Number((aggregate.totalDailyYieldKwh ?? 0).toFixed(1));
  const safeTariff = Number.isFinite(tariffRatePhpPerKwh) && tariffRatePhpPerKwh > 0
    ? tariffRatePhpPerKwh
    : DEFAULT_TARIFF_SCHEDULE.peakRatePerKwh;

  return {
    scopeKey,
    manilaTimestamp,
    isLive: Boolean(aggregate.isLive),
    totalAccounts: aggregate.totalAccounts ?? (aggregate.accounts?.length || 0),
    totalPlants: aggregate.totalPlants ?? stations.length,
    totalInverters: aggregate.totalInverters ?? 0,
    onlineInverters,
    faultCount,
    offlineInverterCount,
    offlineLoggerCount,
    liveSolarKw: Number((aggregate.totalSolarPowerKw ?? 0).toFixed(1)),
    capacityKw: Number((aggregate.totalCapacityKw ?? 0).toFixed(1)),
    dailyYieldKwh,
    facilityLoadKw: Number((aggregate.totalLoadPowerKw ?? 0).toFixed(1)),
    gridNetKw: Number((aggregate.netGridPowerKw ?? 0).toFixed(1)),
    avgBatterySoc: Number((aggregate.avgBatterySoc ?? 0).toFixed(0)),
    estimatedSavingsPhp: Number((dailyYieldKwh * safeTariff).toFixed(0)),
    stations,
  };
}

export function buildDeterministicTvBrief(snapshot: TvTelemetrySnapshot): TvBriefResult {
  const issueStation =
    snapshot.stations.find((s) => s.status === 'FAULT' || s.faultInverters > 0) ||
    snapshot.stations.find((s) => s.status === 'OFFLINE' || s.offlineLoggers > 0) ||
    null;

  let severity: TvBriefSeverity = 'normal';
  let headline: string;

  if (snapshot.faultCount > 0 || (issueStation && issueStation.faultInverters > 0)) {
    severity = 'critical';
    const targetName = issueStation?.stationName || 'Inverter array';
    headline = `ALERT: ${snapshot.faultCount || issueStation?.faultInverters || 1} inverter fault at ${targetName} · Live ${snapshot.liveSolarKw.toFixed(1)} kW`;
  } else if (snapshot.offlineLoggerCount > 0 || snapshot.offlineInverterCount > 0 || issueStation) {
    severity = 'warning';
    const issueLabel =
      snapshot.offlineInverterCount > 0
        ? `${snapshot.offlineInverterCount} inverter offline`
        : `${snapshot.offlineLoggerCount} logger offline`;
    const place = issueStation ? ` · ${issueStation.stationName}` : '';
    headline = `Solar ${snapshot.liveSolarKw.toFixed(1)} kW · ${issueLabel}${place}`;
  } else if (!snapshot.isLive && snapshot.totalPlants === 0) {
    severity = 'warning';
    headline = 'Awaiting live DeyeCloud station telemetry';
  } else {
    severity = 'normal';
    const gridTag =
      snapshot.gridNetKw >= 0
        ? `+${snapshot.gridNetKw.toFixed(1)} kW export`
        : `${snapshot.gridNetKw.toFixed(1)} kW import`;
    headline = `Solar ${snapshot.liveSolarKw.toFixed(1)} kW · ${snapshot.dailyYieldKwh.toFixed(0)} kWh today · ₱${snapshot.estimatedSavingsPhp.toLocaleString('en-US')} saved · ${gridTag}`;
  }

  return {
    headline: clampHeadline(headline),
    severity,
    priorityStationId: issueStation ? issueStation.stationId : null,
    source: 'fallback',
    model: TV_BRIEF_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

export interface TvBriefDeps {
  apiKey?: string;
  createInteraction?: StructuredInteractionInvoke;
}

export async function getCachedOrGenerateTvBrief(
  snapshot: TvTelemetrySnapshot,
  deps?: TvBriefDeps
): Promise<TvBriefResult> {
  const now = Date.now();
  const cached = briefCache.get(snapshot.scopeKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const pending = inFlightBriefs.get(snapshot.scopeKey);
  if (pending) return pending;

  const promise = (async (): Promise<TvBriefResult> => {
    const systemInstruction =
      'You write a single ultra-concise NOC TV ticker headline (<= 90 chars) strictly from verified Philippine solar telemetry JSON. ' +
      'Never invent metrics, stations, or causes not present in the JSON. Format currency with ₱ (PHP). ' +
      'Prioritize faults or offline loggers/inverters first; otherwise report live kW, today kWh, ₱ savings, or grid exchange.';

    const inputPayload = JSON.stringify({
      manilaTimestamp: snapshot.manilaTimestamp,
      isLive: snapshot.isLive,
      liveSolarKw: snapshot.liveSolarKw,
      capacityKw: snapshot.capacityKw,
      dailyYieldKwh: snapshot.dailyYieldKwh,
      facilityLoadKw: snapshot.facilityLoadKw,
      gridNetKw: snapshot.gridNetKw,
      avgBatterySoc: snapshot.avgBatterySoc,
      estimatedSavingsPhp: snapshot.estimatedSavingsPhp,
      faultCount: snapshot.faultCount,
      offlineInverterCount: snapshot.offlineInverterCount,
      offlineLoggerCount: snapshot.offlineLoggerCount,
      stations: snapshot.stations.slice(0, 12),
    });

    const response = await invokeGeminiStructuredJson({
      model: TV_BRIEF_MODEL,
      systemInstruction,
      input: inputPayload,
      jsonSchema: TV_BRIEF_JSON_SCHEMA,
      outputSchema: tvBriefOutputSchema,
      timeoutMs: BRIEF_TIMEOUT_MS,
      apiKey: deps?.apiKey,
      createInteraction: deps?.createInteraction,
    });

    if (!response.ok) {
      if (response.reason === 'error') {
        log.warn('Falling back to deterministic TV brief', { scopeKey: snapshot.scopeKey });
      }
      const fallback = buildDeterministicTvBrief(snapshot);
      briefCache.set(snapshot.scopeKey, { result: fallback, expiresAt: Date.now() + 60_000 });
      return fallback;
    }

    const validStationIds = new Set(snapshot.stations.map((s) => s.stationId));
    const priorityStationId =
      response.data.priorityStationId && validStationIds.has(response.data.priorityStationId)
        ? response.data.priorityStationId
        : null;

    const result: TvBriefResult = {
      headline: clampHeadline(response.data.headline),
      severity: response.data.severity,
      priorityStationId,
      source: 'gemini',
      model: response.model,
      generatedAt: new Date().toISOString(),
    };
    briefCache.set(snapshot.scopeKey, { result, expiresAt: Date.now() + BRIEF_CACHE_TTL_MS });
    return result;
  })().finally(() => {
    inFlightBriefs.delete(snapshot.scopeKey);
  });

  inFlightBriefs.set(snapshot.scopeKey, promise);
  return promise;
}

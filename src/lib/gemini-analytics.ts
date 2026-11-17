import { z } from 'zod';
import type {
  AnalyticsSummary,
  DailyAnalyticsPoint,
  MonthlyAnalyticsPoint,
} from './analytics-data';
import {
  GEMINI_FLASH_LITE_MODEL,
  invokeGeminiStructuredJson,
  type StructuredInteractionInvoke,
} from './gemini-client';
import { createLogger } from './logger';
import { DEFAULT_TARIFF_SCHEDULE } from './tariff-rates';
import type { HourlyEnergyPoint } from './types';

const log = createLogger('GeminiAnalytics');

export const ANALYTICS_INSIGHTS_MODEL = GEMINI_FLASH_LITE_MODEL;
const INSIGHTS_CACHE_TTL_MS = 5 * 60_000;
const INSIGHTS_TIMEOUT_MS = 10_000;

export type AnalyticsInsightStatus = 'optimal' | 'watch' | 'critical';
export type AnalyticsFindingCategory = 'performance' | 'economics' | 'action';

export interface AnalyticsFinding {
  category: AnalyticsFindingCategory;
  title: string;
  metric: string;
  detail: string;
}

export interface AnalyticsInsightsResult {
  summary: string;
  status: AnalyticsInsightStatus;
  findings: AnalyticsFinding[];
  answer?: string | null;
  source: 'gemini' | 'fallback';
  model: string;
  generatedAt: string;
}

export interface AnalyticsTariffInput {
  utilityName: string;
  peakRatePhp: number;
  offPeakRatePhp: number;
  exportCreditPhp: number;
  peakStartHour: number;
  peakEndHour: number;
}

export interface AnalyticsTelemetryFacts {
  cacheKey: string;
  scopeLabel: string;
  range: string;
  dateStr: string;
  capacityKw: number;
  recordedFrames: number;
  totalSolarYieldKwh: number;
  totalLoadDemandKwh: number;
  selfConsumptionPct: number;
  selfSufficiencyPct: number;
  gridExportKwh: number;
  gridImportKwh: number;
  netGridBalanceKwh: number;
  performanceRatioPct: number;
  specificYieldKwhKwp: number;
  co2AvoidedKg: number;
  peakSolarKw: number;
  peakSolarHour: string | null;
  avgMiddaySolarKw: number;
  avgMiddayLoadKw: number;
  avgPeakTariffSolarKw: number;
  avgPeakTariffLoadKw: number;
  peakTariffImportKwh: number;
  estimatedSavingsPhp: number;
  estimatedImportCostPhp: number;
  estimatedExportCreditPhp: number;
  tariff: AnalyticsTariffInput;
  faultCount: number;
  offlineCount: number;
  dailySeriesPreview: Array<{
    date: string;
    solarYieldKwh: number;
    loadDemandKwh: number;
    performanceRatioPct: number;
  }>;
  monthlySeriesPreview: Array<{
    month: string;
    solarYieldMwh: number;
    loadDemandMwh: number;
    performanceRatioPct: number;
  }>;
}

const findingSchema = z.object({
  category: z.enum(['performance', 'economics', 'action']),
  title: z.string().min(1).max(80),
  metric: z.string().min(1).max(60),
  detail: z.string().min(1).max(180),
});

const analyticsInsightsOutputSchema = z.object({
  summary: z.string().min(1).max(260),
  status: z.enum(['optimal', 'watch', 'critical']),
  findings: z.array(findingSchema).min(1).max(4),
  answer: z.string().nullable().optional(),
});

const ANALYTICS_INSIGHTS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Crisp 1-sentence executive summary (<= 175 chars) citing real kW, kWh, kWh/kWp, or ₱ values from the input.',
    },
    status: {
      type: 'string',
      enum: ['optimal', 'watch', 'critical'],
      description:
        'critical if faultCount > 0; watch if offlineCount > 0, low performance ratio, or heavy peak grid import; optimal otherwise.',
    },
    findings: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['performance', 'economics', 'action'] },
          title: { type: 'string', description: 'Short label <= 36 chars.' },
          metric: { type: 'string', description: 'Headline metric value e.g. "2.41 kWh/kWp" or "₱8,420 saved".' },
          detail: { type: 'string', description: 'Single factual finding <= 115 chars.' },
        },
        required: ['category', 'title', 'metric', 'detail'],
        additionalProperties: false,
      },
    },
    answer: {
      type: ['string', 'null'],
      description:
        'Concise answer (<= 260 chars) strictly addressing userQuestion if provided, else null.',
    },
  },
  required: ['summary', 'status', 'findings', 'answer'],
  additionalProperties: false,
};

interface InsightsCacheEntry {
  result: AnalyticsInsightsResult;
  expiresAt: number;
}

const insightsCache = new Map<string, InsightsCacheEntry>();
const inFlightInsights = new Map<string, Promise<AnalyticsInsightsResult>>();

export function _resetAnalyticsInsightsCacheForTesting(): void {
  insightsCache.clear();
  inFlightInsights.clear();
}

function clampText(raw: string, maxLen: number): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3).trimEnd()}...`;
}

export function extractAnalyticsTelemetryFacts(opts: {
  cacheKey: string;
  scopeLabel: string;
  range: string;
  dateStr: string;
  capacityKw: number;
  recordedFrames: number;
  summary: AnalyticsSummary;
  points: HourlyEnergyPoint[];
  dailySeries?: DailyAnalyticsPoint[];
  monthlySeries?: MonthlyAnalyticsPoint[];
  tariff?: Partial<AnalyticsTariffInput>;
  faultCount?: number;
  offlineCount?: number;
}): AnalyticsTelemetryFacts {
  const tariff: AnalyticsTariffInput = {
    utilityName: opts.tariff?.utilityName?.trim() || 'Philippine Grid TOU',
    peakRatePhp:
      typeof opts.tariff?.peakRatePhp === 'number' && opts.tariff.peakRatePhp > 0
        ? opts.tariff.peakRatePhp
        : DEFAULT_TARIFF_SCHEDULE.peakRatePerKwh,
    offPeakRatePhp:
      typeof opts.tariff?.offPeakRatePhp === 'number' && opts.tariff.offPeakRatePhp > 0
        ? opts.tariff.offPeakRatePhp
        : DEFAULT_TARIFF_SCHEDULE.offPeakRatePerKwh,
    exportCreditPhp:
      typeof opts.tariff?.exportCreditPhp === 'number' && opts.tariff.exportCreditPhp >= 0
        ? opts.tariff.exportCreditPhp
        : DEFAULT_TARIFF_SCHEDULE.exportCreditPerKwh,
    peakStartHour:
      typeof opts.tariff?.peakStartHour === 'number'
        ? opts.tariff.peakStartHour
        : DEFAULT_TARIFF_SCHEDULE.peakStartHour,
    peakEndHour:
      typeof opts.tariff?.peakEndHour === 'number'
        ? opts.tariff.peakEndHour
        : DEFAULT_TARIFF_SCHEDULE.peakEndHour,
  };

  const elapsed = (opts.points || []).filter((p) => p.isElapsed && p.solarYieldKw !== null);
  let peakSolarKw = opts.summary.peakSolarKw || 0;
  let peakSolarHour: string | null = null;

  let middaySolarSum = 0;
  let middayLoadSum = 0;
  let middayCount = 0;
  let peakWinSolarSum = 0;
  let peakWinLoadSum = 0;
  let peakWinImportKwh = 0;
  let peakWinCount = 0;

  // Approximate step duration in hours for interval energy integration
  const stepHours = elapsed.length >= 200 ? 5 / 60 : elapsed.length >= 40 ? 15 / 60 : 1;

  for (const pt of elapsed) {
    const solar = pt.solarYieldKw ?? 0;
    const load = pt.loadDemandKw ?? 0;
    const grid = pt.gridFlowKw ?? solar - load;
    const h = pt.hourDecimal ?? (parseInt(String(pt.hour || '0').split(':')[0], 10) || 0);

    if (solar > peakSolarKw || (peakSolarHour === null && solar > 0)) {
      if (solar >= peakSolarKw) {
        peakSolarKw = solar;
        peakSolarHour = pt.hour;
      }
    }

    if (h >= 10 && h <= 14) {
      middaySolarSum += solar;
      middayLoadSum += load;
      middayCount += 1;
    }

    if (h >= tariff.peakStartHour && h <= tariff.peakEndHour) {
      peakWinSolarSum += solar;
      peakWinLoadSum += load;
      peakWinCount += 1;
      if (grid < 0) {
        peakWinImportKwh += Math.abs(grid) * stepHours;
      }
    }
  }

  const totalSolar = Number((opts.summary.totalSolarYieldKwh ?? 0).toFixed(1));
  const totalLoad = Number((opts.summary.totalLoadDemandKwh ?? 0).toFixed(1));
  const selfConsumed = Number((opts.summary.totalSelfConsumedKwh ?? 0).toFixed(1));
  const gridExport = Number((opts.summary.totalGridExportKwh ?? 0).toFixed(1));
  const gridImport = Number((opts.summary.totalGridImportKwh ?? 0).toFixed(1));

  const avgRate = (tariff.peakRatePhp + tariff.offPeakRatePhp) / 2;
  const estimatedSelfSavings = selfConsumed * avgRate;
  const estimatedExportCreditPhp = gridExport * tariff.exportCreditPhp;
  const estimatedImportCostPhp =
    peakWinImportKwh * tariff.peakRatePhp +
    Math.max(0, gridImport - peakWinImportKwh) * tariff.offPeakRatePhp;

  return {
    cacheKey: opts.cacheKey,
    scopeLabel: opts.scopeLabel,
    range: opts.range,
    dateStr: opts.dateStr,
    capacityKw: Number((opts.capacityKw || 0).toFixed(1)),
    recordedFrames: opts.recordedFrames,
    totalSolarYieldKwh: totalSolar,
    totalLoadDemandKwh: totalLoad,
    selfConsumptionPct: Number((opts.summary.selfConsumptionPct ?? 0).toFixed(1)),
    selfSufficiencyPct: Number((opts.summary.selfSufficiencyPct ?? 0).toFixed(1)),
    gridExportKwh: gridExport,
    gridImportKwh: gridImport,
    netGridBalanceKwh: Number((opts.summary.netGridBalanceKwh ?? 0).toFixed(1)),
    performanceRatioPct: Number((opts.summary.performanceRatioPct ?? 0).toFixed(1)),
    specificYieldKwhKwp: Number((opts.summary.specificYieldKwhKwp ?? 0).toFixed(2)),
    co2AvoidedKg: Number((opts.summary.co2AvoidedKg ?? 0).toFixed(1)),
    peakSolarKw: Number(peakSolarKw.toFixed(1)),
    peakSolarHour,
    avgMiddaySolarKw: middayCount > 0 ? Number((middaySolarSum / middayCount).toFixed(1)) : 0,
    avgMiddayLoadKw: middayCount > 0 ? Number((middayLoadSum / middayCount).toFixed(1)) : 0,
    avgPeakTariffSolarKw: peakWinCount > 0 ? Number((peakWinSolarSum / peakWinCount).toFixed(1)) : 0,
    avgPeakTariffLoadKw: peakWinCount > 0 ? Number((peakWinLoadSum / peakWinCount).toFixed(1)) : 0,
    peakTariffImportKwh: Number(peakWinImportKwh.toFixed(1)),
    estimatedSavingsPhp: Number((estimatedSelfSavings + estimatedExportCreditPhp).toFixed(0)),
    estimatedImportCostPhp: Number(estimatedImportCostPhp.toFixed(0)),
    estimatedExportCreditPhp: Number(estimatedExportCreditPhp.toFixed(0)),
    tariff,
    faultCount: opts.faultCount ?? 0,
    offlineCount: opts.offlineCount ?? 0,
    dailySeriesPreview: (opts.dailySeries || []).slice(-10).map((d) => ({
      date: d.date,
      solarYieldKwh: d.solarYieldKwh,
      loadDemandKwh: d.loadDemandKwh,
      performanceRatioPct: d.performanceRatioPct,
    })),
    monthlySeriesPreview: (opts.monthlySeries || []).slice(-12).map((m) => ({
      month: m.month,
      solarYieldMwh: m.solarYieldMwh,
      loadDemandMwh: m.loadDemandMwh,
      performanceRatioPct: m.performanceRatioPct,
    })),
  };
}

export function buildDeterministicAnalyticsInsights(
  facts: AnalyticsTelemetryFacts,
  question?: string
): AnalyticsInsightsResult {
  const status: AnalyticsInsightStatus =
    facts.faultCount > 0
      ? 'critical'
      : facts.offlineCount > 0 || facts.peakTariffImportKwh > 25
        ? 'watch'
        : 'optimal';

  const summary = clampText(
    `${facts.scopeLabel} generated ${facts.totalSolarYieldKwh.toFixed(1)} kWh (${facts.specificYieldKwhKwp.toFixed(2)} kWh/kWp) with ₱${facts.estimatedSavingsPhp.toLocaleString('en-US')} estimated solar savings.`,
    180
  );

  const findings: AnalyticsFinding[] = [
    {
      category: 'performance',
      title: 'Solar Yield & Peak',
      metric:
        facts.peakSolarHour
          ? `${facts.peakSolarKw.toFixed(1)} kW @ ${facts.peakSolarHour}`
          : `${facts.specificYieldKwhKwp.toFixed(2)} kWh/kWp`,
      detail: clampText(
        `Midday solar averaged ${facts.avgMiddaySolarKw.toFixed(1)} kW against ${facts.capacityKw.toFixed(0)} kWp (${facts.performanceRatioPct.toFixed(1)}% PR).`,
        115
      ),
    },
    {
      category: 'economics',
      title: `${facts.tariff.utilityName} Arbitrage`,
      metric: `₱${facts.estimatedSavingsPhp.toLocaleString('en-US')} saved`,
      detail: clampText(
        `Self-sufficiency ${facts.selfSufficiencyPct.toFixed(0)}%; peak-window grid import ${facts.peakTariffImportKwh.toFixed(1)} kWh (₱${facts.estimatedImportCostPhp.toLocaleString('en-US')} import).`,
        115
      ),
    },
    {
      category: 'action',
      title: facts.faultCount > 0 || facts.offlineCount > 0 ? 'Asset Attention' : 'Load Alignment',
      metric:
        facts.faultCount > 0
          ? `${facts.faultCount} fault`
          : facts.offlineCount > 0
            ? `${facts.offlineCount} offline`
            : `${facts.selfConsumptionPct.toFixed(0)}% self-used`,
      detail: clampText(
        facts.faultCount > 0 || facts.offlineCount > 0
          ? `Inspect ${facts.faultCount} faulted and ${facts.offlineCount} offline device(s) in Fleet Monitoring.`
          : facts.gridExportKwh > 20
            ? `Shift flexible loads into 10:00–14:00 to absorb ${facts.gridExportKwh.toFixed(0)} kWh export locally.`
            : `Maintain daytime load alignment during 10:00–14:00 (${facts.avgMiddaySolarKw.toFixed(1)} kW avg PV).`,
        115
      ),
    },
  ];

  const answer = question?.trim()
    ? clampText(
        `${facts.scopeLabel}: ${facts.totalSolarYieldKwh.toFixed(1)} kWh yield, ${facts.totalLoadDemandKwh.toFixed(1)} kWh demand, net grid ${facts.netGridBalanceKwh >= 0 ? '+' : ''}${facts.netGridBalanceKwh.toFixed(1)} kWh, est. ₱${facts.estimatedSavingsPhp.toLocaleString('en-US')} saved (${facts.tariff.utilityName}).`,
        260
      )
    : null;

  return {
    summary,
    status,
    findings,
    answer,
    source: 'fallback',
    model: ANALYTICS_INSIGHTS_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

export interface AnalyticsInsightsDeps {
  apiKey?: string;
  createInteraction?: StructuredInteractionInvoke;
}

export async function getCachedOrGenerateAnalyticsInsights(
  facts: AnalyticsTelemetryFacts,
  opts: {
    force?: boolean;
    question?: string;
    deps?: AnalyticsInsightsDeps;
  } = {}
): Promise<AnalyticsInsightsResult> {
  const cleanQuestion = opts.question?.trim() || '';
  const shouldCache = !cleanQuestion;

  if (shouldCache && !opts.force) {
    const cached = insightsCache.get(facts.cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    const pending = inFlightInsights.get(facts.cacheKey);
    if (pending) return pending;
  }

  const run = async (): Promise<AnalyticsInsightsResult> => {
    const systemInstruction =
      'You are an engineering solar telemetry analyst for Philippine commercial & residential PV arrays. ' +
      'Analyze ONLY the verified telemetry JSON provided. Never invent metrics, causes, weather, or assets absent from the JSON. ' +
      'Format currency strictly in Philippine Pesos (₱). Return exactly 3 findings with categories "performance", "economics", and "action".';

    const inputPayload = JSON.stringify({
      scopeLabel: facts.scopeLabel,
      range: facts.range,
      date: facts.dateStr,
      capacityKw: facts.capacityKw,
      recordedFrames: facts.recordedFrames,
      totalSolarYieldKwh: facts.totalSolarYieldKwh,
      totalLoadDemandKwh: facts.totalLoadDemandKwh,
      selfConsumptionPct: facts.selfConsumptionPct,
      selfSufficiencyPct: facts.selfSufficiencyPct,
      gridExportKwh: facts.gridExportKwh,
      gridImportKwh: facts.gridImportKwh,
      netGridBalanceKwh: facts.netGridBalanceKwh,
      performanceRatioPct: facts.performanceRatioPct,
      specificYieldKwhKwp: facts.specificYieldKwhKwp,
      co2AvoidedKg: facts.co2AvoidedKg,
      peakSolarKw: facts.peakSolarKw,
      peakSolarHour: facts.peakSolarHour,
      avgMiddaySolarKw: facts.avgMiddaySolarKw,
      avgMiddayLoadKw: facts.avgMiddayLoadKw,
      avgPeakTariffSolarKw: facts.avgPeakTariffSolarKw,
      avgPeakTariffLoadKw: facts.avgPeakTariffLoadKw,
      peakTariffImportKwh: facts.peakTariffImportKwh,
      estimatedSavingsPhp: facts.estimatedSavingsPhp,
      estimatedImportCostPhp: facts.estimatedImportCostPhp,
      estimatedExportCreditPhp: facts.estimatedExportCreditPhp,
      tariff: facts.tariff,
      faultCount: facts.faultCount,
      offlineCount: facts.offlineCount,
      dailySeriesPreview: facts.dailySeriesPreview,
      monthlySeriesPreview: facts.monthlySeriesPreview,
      userQuestion: cleanQuestion || null,
    });

    const response = await invokeGeminiStructuredJson({
      model: ANALYTICS_INSIGHTS_MODEL,
      systemInstruction,
      input: inputPayload,
      jsonSchema: ANALYTICS_INSIGHTS_JSON_SCHEMA,
      outputSchema: analyticsInsightsOutputSchema,
      timeoutMs: INSIGHTS_TIMEOUT_MS,
      apiKey: opts.deps?.apiKey,
      createInteraction: opts.deps?.createInteraction,
    });

    if (!response.ok) {
      if (response.reason === 'error') {
        log.warn('Falling back to deterministic analytics insights', { cacheKey: facts.cacheKey });
      }
      const fallback = buildDeterministicAnalyticsInsights(facts, cleanQuestion);
      if (shouldCache) {
        insightsCache.set(facts.cacheKey, { result: fallback, expiresAt: Date.now() + 60_000 });
      }
      return fallback;
    }

    const categories: AnalyticsFindingCategory[] = ['performance', 'economics', 'action'];
    const rawFindings = response.data.findings;
    const normalizedFindings: AnalyticsFinding[] = categories.map((cat, idx) => {
      const matched = rawFindings.find((f) => f.category === cat) || rawFindings[idx] || rawFindings[0];
      return {
        category: cat,
        title: clampText(matched.title, 44),
        metric: clampText(matched.metric, 40),
        detail: clampText(matched.detail, 125),
      };
    });

    const result: AnalyticsInsightsResult = {
      summary: clampText(response.data.summary, 185),
      status: response.data.status,
      findings: normalizedFindings,
      answer: cleanQuestion
        ? clampText(response.data.answer || response.data.summary, 280)
        : null,
      source: 'gemini',
      model: response.model,
      generatedAt: new Date().toISOString(),
    };

    if (shouldCache) {
      insightsCache.set(facts.cacheKey, {
        result,
        expiresAt: Date.now() + INSIGHTS_CACHE_TTL_MS,
      });
    }
    return result;
  };

  if (!shouldCache) {
    return run();
  }

  const promise = run().finally(() => {
    inFlightInsights.delete(facts.cacheKey);
  });
  inFlightInsights.set(facts.cacheKey, promise);
  return promise;
}

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
  detail: z.string().min(1).max(260),
});

const analyticsInsightsOutputSchema = z.object({
  summary: z.string().min(1).max(360),
  status: z.enum(['optimal', 'watch', 'critical']),
  findings: z.array(findingSchema).min(1).max(4),
  answer: z.string().max(600).nullable().optional(),
});

const ANALYTICS_INSIGHTS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Executive business diagnosis (<= 300 chars) explaining WHAT the telemetry means for bill reduction, operational efficiency, or risk—never merely restate raw kW/kWh totals.',
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
          title: { type: 'string', description: 'Short business theme <= 40 chars.' },
          metric: { type: 'string', description: 'Key indicator e.g. "74% Bill Offset" or "₱2,150/day Peak Exposure".' },
          detail: {
            type: 'string',
            description:
              'Business interpretation <= 220 chars explaining WHY this matters financially/operationally and what action to take—do not just repeat chart numbers.',
          },
        },
        required: ['category', 'title', 'metric', 'detail'],
        additionalProperties: false,
      },
    },
    answer: {
      type: ['string', 'null'],
      description:
        'Executive business analysis (<= 500 chars) directly addressing userQuestion with diagnosis, ₱ financial impact, and concrete operational recommendations; null if no userQuestion.',
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

  const totalBillBaselinePhp = facts.estimatedSavingsPhp + facts.estimatedImportCostPhp;
  const billReductionPct =
    totalBillBaselinePhp > 0
      ? Math.round((facts.estimatedSavingsPhp / totalBillBaselinePhp) * 100)
      : 0;
  const peakExposurePhp = Math.round(facts.peakTariffImportKwh * facts.tariff.peakRatePhp);
  const spreadPerKwh = Math.max(0, facts.tariff.peakRatePhp - facts.tariff.exportCreditPhp);
  const loadShiftOpportunityPhp = Math.round(facts.gridExportKwh * spreadPerKwh);

  const prVerdict =
    facts.performanceRatioPct > 0 && facts.performanceRatioPct < 65
      ? 'Array conversion is underperforming nameplate expectations—inspect for panel soiling, shading, or inverter derating.'
      : facts.performanceRatioPct >= 78
        ? 'Array is converting irradiance efficiently with minimal thermal or clipping losses.'
        : 'Array conversion is moderate; scheduled panel cleaning and midday thermal checks can recover additional yield.';

  const summary = clampText(
    facts.faultCount > 0
      ? `Revenue at risk on ${facts.scopeLabel}: ${facts.faultCount} inverter fault is suppressing harvest—prioritize immediate field dispatch to protect ₱${facts.estimatedSavingsPhp.toLocaleString('en-US')} daily savings.`
      : peakExposurePhp > 500
        ? `Solar is cutting electricity spend by ${billReductionPct}%, but ₱${peakExposurePhp.toLocaleString('en-US')} in peak-tariff grid imports remains the largest controllable cost lever.`
        : loadShiftOpportunityPhp > 300
          ? `Solar cuts utility spend by ${billReductionPct}%; shifting flexible daytime loads into 10:00–14:00 can capture up to ₱${loadShiftOpportunityPhp.toLocaleString('en-US')} more value instead of exporting.`
          : `${facts.scopeLabel} is delivering a ${billReductionPct}% electricity bill reduction with strong daytime solar-to-load alignment under ${facts.tariff.utilityName} rates.`,
    300
  );

  const findings: AnalyticsFinding[] = [
    {
      category: 'performance',
      title: 'Asset Utilization & Health',
      metric: `${facts.performanceRatioPct.toFixed(0)}% PR · ${facts.specificYieldKwhKwp.toFixed(2)} kWh/kWp`,
      detail: clampText(prVerdict, 220),
    },
    {
      category: 'economics',
      title: 'Bill Reduction & Peak Risk',
      metric: `${billReductionPct}% Bill Cut`,
      detail: clampText(
        peakExposurePhp > 0
          ? `Peak-window grid draw (${facts.tariff.peakStartHour}:00–${facts.tariff.peakEndHour}:00) costs ~₱${peakExposurePhp.toLocaleString('en-US')} at ₱${facts.tariff.peakRatePhp.toFixed(2)}/kWh; reducing peak demand directly boosts ROI.`
          : `Zero peak-window grid exposure—solar and self-consumption are fully shielding the facility from ₱${facts.tariff.peakRatePhp.toFixed(2)}/kWh peak rates.`,
        220
      ),
    },
    {
      category: 'action',
      title: facts.faultCount > 0 || facts.offlineCount > 0 ? 'Immediate Maintenance' : 'Profit Optimization',
      metric:
        facts.faultCount > 0
          ? `${facts.faultCount} Fault`
          : loadShiftOpportunityPhp > 0
            ? `+₱${loadShiftOpportunityPhp.toLocaleString('en-US')} Upside`
            : `${facts.selfConsumptionPct.toFixed(0)}% Self-Used`,
      detail: clampText(
        facts.faultCount > 0 || facts.offlineCount > 0
          ? `Dispatch technicians to clear ${facts.faultCount} faulted and ${facts.offlineCount} offline unit(s) to recover lost kWh and prevent ongoing bill inflation.`
          : loadShiftOpportunityPhp > 0
            ? `Schedule heavy equipment (HVAC, pumps, compressors) during 10:00–14:00 to absorb ${facts.gridExportKwh.toFixed(0)} kWh surplus locally rather than exporting at lower credit.`
            : `Self-consumption is already well-aligned with generation; consider battery peak-shaving if evening peak imports grow.`,
        220
      ),
    },
  ];

  const answer = question?.trim()
    ? clampText(
        `Executive Takeaway (${facts.scopeLabel}): Solar currently offsets ${billReductionPct}% of electricity cost under ${facts.tariff.utilityName}. ` +
          (peakExposurePhp > 0
            ? `The primary cost leak is ₱${peakExposurePhp.toLocaleString('en-US')} in peak-hour grid imports—shifting discretionary loads to midday (10:00–14:00) or shaving peak demand will maximize ₱ ROI.`
            : loadShiftOpportunityPhp > 0
              ? `You have ₱${loadShiftOpportunityPhp.toLocaleString('en-US')} in untapped self-consumption upside by shifting flexible loads into midday solar surplus.`
              : `Operations are well-optimized with minimal grid leakage; focus on maintaining ${facts.performanceRatioPct.toFixed(0)}% PR through routine panel maintenance.`),
        500
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
      'You are a senior commercial solar energy & financial advisor for Philippine facilities. ' +
      'Analyze ONLY the verified telemetry JSON provided. Do NOT merely restate raw kW/kWh totals—deliver executive business insights: ' +
      'quantify bill reduction impact, peak-tariff exposure (₱/kWh), yield efficiency vs rated capacity, load-shifting or self-consumption optimization opportunities, ' +
      'and prioritized operational actions. Format currency strictly in Philippine Pesos (₱). ' +
      'Never invent metrics, causes, weather, or assets absent from the JSON. ' +
      'Return exactly 3 findings with categories "performance", "economics", and "action".';

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

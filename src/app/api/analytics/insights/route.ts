import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import {
  computeAnalyticsSummary,
  type DailyAnalyticsPoint,
  type MonthlyAnalyticsPoint,
} from '@/lib/analytics-data';
import {
  DeyeCloudClient,
  getInverterShareInfo,
  getManilaDateParts,
  mergeDailySeries,
  mergeHourlySeries,
  mergeMonthlySeries,
  shiftIsoDate,
  shiftIsoMonth,
  type LiveDayHistoryResult,
} from '@/lib/deye-client';
import {
  extractAnalyticsTelemetryFacts,
  getCachedOrGenerateAnalyticsInsights,
} from '@/lib/gemini-analytics';
import { parseJsonBody, withGate } from '@/lib/gate';
import { createLogger } from '@/lib/logger';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { ACCOUNT_ID_REGEX, enforceTenantAccess } from '@/lib/session';
import { KG_CO2_PER_TREE_ANNUAL, PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH } from '@/lib/tariff-rates';

const log = createLogger('AnalyticsInsightsRoute');

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const safeIdRegex = /^[A-Za-z0-9_-]{1,64}$/;

function applyPeriodRollupToSummary(
  baseSummary: ReturnType<typeof computeAnalyticsSummary>,
  totals: { solarKwh: number; loadKwh: number; exportKwh: number; importKwh: number },
  capacityKw: number
) {
  const totalSolar = Number(totals.solarKwh.toFixed(1));
  const totalLoad = Number(totals.loadKwh.toFixed(1));
  const totalExport = Number(totals.exportKwh.toFixed(1));
  const totalImport = Number(totals.importKwh.toFixed(1));
  const selfCons = Math.max(0, totalSolar - totalExport);
  const co2 = Number((totalSolar * PHILIPPINES_GRID_EMISSION_FACTOR_KG_PER_KWH).toFixed(1));
  return {
    ...baseSummary,
    totalSolarYieldKwh: totalSolar,
    totalLoadDemandKwh: totalLoad,
    totalSelfConsumedKwh: Number(selfCons.toFixed(1)),
    selfConsumptionPct: totalSolar > 0 ? Number(Math.min(100, (selfCons / totalSolar) * 100).toFixed(1)) : 0,
    selfSufficiencyPct: totalLoad > 0 ? Number(Math.min(100, (selfCons / totalLoad) * 100).toFixed(1)) : 0,
    totalGridExportKwh: totalExport,
    totalGridImportKwh: totalImport,
    netGridBalanceKwh: Number((totalExport - totalImport).toFixed(1)),
    specificYieldKwhKwp: capacityKw > 0 ? Number((totalSolar / capacityKw).toFixed(2)) : 0,
    co2AvoidedKg: co2,
    treesEquivalent: Math.round(co2 / KG_CO2_PER_TREE_ANNUAL),
  };
}

export const analyticsInsightsRequestSchema = z.object({
  accountId: z.string().min(1).max(64).regex(ACCOUNT_ID_REGEX).optional(),
  stationId: z.string().min(1).max(64).regex(safeIdRegex).optional(),
  deviceSn: z.string().min(1).max(64).regex(safeIdRegex).optional(),
  range: z.enum(['TODAY', 'WEEK', 'MONTH', 'YEAR']).default('TODAY'),
  date: z.string().regex(isoDateRegex).optional(),
  startDate: z.string().regex(isoDateRegex).optional(),
  endDate: z.string().regex(isoDateRegex).optional(),
  force: z.boolean().optional().default(false),
  question: z.string().max(240).optional(),
  tariff: z
    .object({
      utilityName: z.string().max(80).optional(),
      peakRatePhp: z.number().positive().max(100).optional(),
      offPeakRatePhp: z.number().positive().max(100).optional(),
      exportCreditPhp: z.number().min(0).max(100).optional(),
      peakStartHour: z.number().int().min(0).max(23).optional(),
      peakEndHour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
});

export const POST = withGate(
  {
    allowUnauthenticated: false,
    rateLimit: {
      keyPrefix: 'analytics_insights',
      maxRequests: RATE_LIMIT_CONFIGS.ANALYTICS_INSIGHTS.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.ANALYTICS_INSIGHTS.windowMs,
    },
  },
  async (req, { session }) => {
    const bodyParsed = await parseJsonBody<unknown>(req);
    if (!bodyParsed.ok) return bodyParsed.errorResponse;

    const parsed = analyticsInsightsRequestSchema.safeParse(bodyParsed.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid analytics insights payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      accountId: requestedAccountId,
      stationId: requestedStationId,
      deviceSn: requestedDeviceSn,
      range,
      date,
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      force,
      question,
      tariff,
    } = parsed.data;

    const normalizedAccount =
      !requestedAccountId || requestedAccountId === 'ALL' || requestedAccountId === 'ALL_FLEET'
        ? null
        : requestedAccountId;

    const tenantCheck = enforceTenantAccess(session, normalizedAccount);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      if (
        accountManager.getAllClients().length === 0 ||
        (tenantCheck.targetAccountId && !accountManager.getClient(tenantCheck.targetAccountId))
      ) {
        await accountManager.syncWithDirectus().catch((e) => {
          log.warn('Non-fatal Directus sync error before AI insights lookup', {}, e);
        });
      }

      const isAdmin = session.role === 'admin';
      let candidateClients: DeyeCloudClient[] = [];
      if (tenantCheck.targetAccountId) {
        const specific = accountManager.getClient(tenantCheck.targetAccountId);
        if (specific && (isAdmin || !specific.isDemo)) {
          candidateClients = [specific];
        }
      } else {
        candidateClients = accountManager.getAllClients().filter((c) => isAdmin || !c.isDemo);
      }

      const normalizedStationId =
        requestedStationId && requestedStationId !== 'ALL' ? requestedStationId : undefined;
      const cleanSn =
        requestedDeviceSn && requestedDeviceSn !== 'ALL' && requestedDeviceSn !== 'ALL_FLEET'
          ? requestedDeviceSn.trim()
          : undefined;

      const dateStr = date || getManilaDateParts().dateStr;
      const periodStart =
        requestedStartDate ||
        (range === 'MONTH' ? shiftIsoDate(dateStr, -29) : shiftIsoDate(dateStr, -6));
      const periodEnd = requestedEndDate || dateStr;

      let scopeLabel = 'Global Fleet Aggregate';
      let capacityKw = 0;
      let points = [] as LiveDayHistoryResult['points'];
      let recordedCount = 0;
      let dailySeries: DailyAnalyticsPoint[] = [];
      let monthlySeries: MonthlyAnalyticsPoint[] = [];
      let isLive = false;
      let faultCount = 0;
      let offlineCount = 0;

      if (cleanSn) {
        let ownerClient: DeyeCloudClient | null = null;
        let shareInfo = null;
        for (const c of candidateClients) {
          const info = getInverterShareInfo(c.plants, cleanSn);
          if (info) {
            ownerClient = c;
            shareInfo = info;
            break;
          }
        }
        if (!ownerClient || !shareInfo) {
          return NextResponse.json({ error: `Unknown device SN "${cleanSn}"` }, { status: 404 });
        }

        scopeLabel = `Inverter ${cleanSn} (${shareInfo.plant.stationName})`;
        const devMeta = (shareInfo.plant.devices || []).find((d) => d.deviceSn === cleanSn);
        capacityKw = devMeta?.ratedKw || shareInfo.plant.installedCapacityKw || 0;
        if (devMeta?.status === 'FAULT') faultCount = 1;
        else if (devMeta?.status === 'OFFLINE') offlineCount = 1;

        if (ownerClient.hasCredentials() && !ownerClient.isDemo) {
          const [liveDay, dailyRes, monthlyRes] = await Promise.all([
            ownerClient.getLiveDayHistory({
              stationId: String(shareInfo.plant.stationId),
              deviceSn: cleanSn,
              date: dateStr,
              stepMinutes: 5,
            }),
            range === 'WEEK' || range === 'MONTH'
              ? ownerClient.getLiveDailyHistory({
                  stationId: String(shareInfo.plant.stationId),
                  startDate: periodStart,
                  endDate: periodEnd,
                  deviceSn: cleanSn,
                })
              : ownerClient.getLiveDailyHistory({
                  stationId: String(shareInfo.plant.stationId),
                  startDate: dateStr,
                  endDate: dateStr,
                  deviceSn: cleanSn,
                }),
            range === 'YEAR'
              ? ownerClient.getLiveMonthlyHistory({
                  stationId: String(shareInfo.plant.stationId),
                  startMonth: shiftIsoMonth(dateStr.slice(0, 7), -11),
                  endMonth: dateStr.slice(0, 7),
                  deviceSn: cleanSn,
                })
              : Promise.resolve(null),
          ]);

          if (liveDay && liveDay.isLive) {
            points = liveDay.points;
            recordedCount = liveDay.recordedCount;
            isLive = true;
          }
          if (dailyRes) dailySeries = dailyRes.items;
          if (monthlyRes) monthlySeries = monthlyRes.items;
        }
      } else {
        let scopedClients = candidateClients;
        if (normalizedStationId && scopedClients.length > 1) {
          const owners = scopedClients.filter((c) =>
            c.plants.some((p) => String(p.stationId) === normalizedStationId)
          );
          if (owners.length > 0) scopedClients = owners;
        }

        const liveClients = scopedClients.filter((c) => c.hasCredentials() && !c.isDemo);
        if (normalizedStationId) {
          const plant = liveClients
            .flatMap((c) => c.plants || [])
            .find((p) => String(p.stationId) === normalizedStationId);
          scopeLabel = plant?.stationName || `Station ${normalizedStationId}`;
          capacityKw = plant?.installedCapacityKw || 0;
          const invs = (plant?.devices || []).filter((d) => d.deviceType === 'INVERTER');
          faultCount = invs.filter((i) => i.status === 'FAULT').length;
          offlineCount = invs.filter((i) => i.status === 'OFFLINE').length;
        } else if (tenantCheck.targetAccountId && liveClients[0]) {
          scopeLabel = liveClients[0].accountName || tenantCheck.targetAccountId;
          capacityKw = (liveClients[0].plants || []).reduce(
            (s, p) => s + (p.installedCapacityKw || 0),
            0
          );
        } else {
          scopeLabel = `Global Fleet (${liveClients.length} Account${liveClients.length === 1 ? '' : 's'})`;
          capacityKw = liveClients
            .flatMap((c) => c.plants || [])
            .reduce((s, p) => s + (p.installedCapacityKw || 0), 0);
        }

        if (liveClients.length > 0) {
          const [dayResList, dailyResList, monthlyResList] = await Promise.all([
            Promise.all(
              liveClients.map((c) =>
                c.getLiveDayHistory({
                  stationId: normalizedStationId,
                  date: dateStr,
                  stepMinutes: 5,
                })
              )
            ),
            Promise.all(
              liveClients.map((c) =>
                c.getLiveDailyHistory({
                  stationId: normalizedStationId,
                  startDate: range === 'WEEK' || range === 'MONTH' ? periodStart : dateStr,
                  endDate: range === 'WEEK' || range === 'MONTH' ? periodEnd : dateStr,
                })
              )
            ),
            range === 'YEAR'
              ? Promise.all(
                  liveClients.map((c) =>
                    c.getLiveMonthlyHistory({
                      stationId: normalizedStationId,
                      startMonth: shiftIsoMonth(dateStr.slice(0, 7), -11),
                      endMonth: dateStr.slice(0, 7),
                    })
                  )
                )
              : Promise.resolve([]),
          ]);

          const validDays = dayResList.filter((r): r is LiveDayHistoryResult => r !== null);
          if (validDays.length > 0) {
            points = mergeHourlySeries(validDays.map((v) => v.points));
            recordedCount = validDays.reduce((s, v) => s + v.recordedCount, 0);
            isLive = true;
          }
          const validDaily = dailyResList.filter((r): r is { items: DailyAnalyticsPoint[]; isLive: boolean } => r !== null);
          if (validDaily.length > 0) {
            dailySeries = mergeDailySeries(validDaily.map((v) => v.items));
          }
          const validMonthly = monthlyResList.filter(
            (r): r is { items: MonthlyAnalyticsPoint[]; isLive: boolean } => r !== null
          );
          if (validMonthly.length > 0) {
            monthlySeries = mergeMonthlySeries(validMonthly.map((v) => v.items));
          }
        }
      }

      if (!isLive && dailySeries.length === 0 && monthlySeries.length === 0) {
        return NextResponse.json({
          isLive: false,
          insights: null,
          notice: 'No live DeyeCloud telemetry recorded for this selection.',
        });
      }

      const safeCap = capacityKw > 0 ? capacityKw : 1;
      let summary = computeAnalyticsSummary(points, safeCap, false, {
        dailyYieldKwh: dailySeries.find((d) => d.date === dateStr)?.solarYieldKwh,
        allowZeroYield: isLive,
      });

      if ((range === 'WEEK' || range === 'MONTH') && dailySeries.length > 0) {
        summary = applyPeriodRollupToSummary(
          summary,
          {
            solarKwh: dailySeries.reduce((s, d) => s + d.solarYieldKwh, 0),
            loadKwh: dailySeries.reduce((s, d) => s + d.loadDemandKwh, 0),
            exportKwh: dailySeries.reduce((s, d) => s + d.gridExportKwh, 0),
            importKwh: dailySeries.reduce((s, d) => s + d.gridImportKwh, 0),
          },
          capacityKw
        );
      } else if (range === 'YEAR' && monthlySeries.length > 0) {
        summary = applyPeriodRollupToSummary(
          summary,
          {
            solarKwh: monthlySeries.reduce((s, m) => s + m.solarYieldMwh, 0) * 1000,
            loadKwh: monthlySeries.reduce((s, m) => s + m.loadDemandMwh, 0) * 1000,
            exportKwh: monthlySeries.reduce((s, m) => s + m.gridExportMwh, 0) * 1000,
            importKwh: monthlySeries.reduce((s, m) => s + m.gridImportMwh, 0) * 1000,
          },
          capacityKw
        );
      }

      const cacheKey = [
        tenantCheck.targetAccountId || (isAdmin ? 'FLEET_ADMIN' : 'FLEET'),
        normalizedStationId || 'ALL',
        cleanSn || 'ALL',
        range,
        dateStr,
        tariff?.utilityName || 'default',
        tariff?.peakRatePhp ?? '',
      ].join(':');

      const facts = extractAnalyticsTelemetryFacts({
        cacheKey,
        scopeLabel,
        range,
        dateStr,
        capacityKw,
        recordedFrames: recordedCount,
        summary,
        points,
        dailySeries,
        monthlySeries,
        tariff,
        faultCount,
        offlineCount,
      });

      const insights = await getCachedOrGenerateAnalyticsInsights(facts, {
        force,
        question,
      });

      return NextResponse.json({
        isLive: true,
        insights,
        scopeLabel,
      });
    } catch (err) {
      log.error('Error generating analytics AI insights', err, { route: 'analytics/insights' });
      return NextResponse.json(
        { error: 'Failed to generate AI telemetry analysis' },
        { status: 500 }
      );
    }
  }
);

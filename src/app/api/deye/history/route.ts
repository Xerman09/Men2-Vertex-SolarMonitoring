import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deyeClient,
  DeyeCloudClient,
  getInverterShareInfo,
  getInverterSnScaleFactor,
  getManilaDateParts,
  LiveDayHistoryResult,
  mergeDailySeries,
  mergeHourlySeries,
  mergeMonthlySeries,
  shiftIsoDate,
  shiftIsoMonth,
} from '@/lib/deye-client';
import { accountManager } from '@/lib/account-manager';
import type { DailyAnalyticsPoint, MonthlyAnalyticsPoint } from '@/lib/analytics-data';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { ACCOUNT_ID_REGEX, enforceTenantAccess } from '@/lib/session';
import { createLogger } from '@/lib/logger';

const log = createLogger('HistoryRoute');

export const historyQuerySchema = z.object({
  accountId: z
    .string()
    .min(1)
    .max(64)
    .regex(ACCOUNT_ID_REGEX, 'Invalid account ID format')
    .optional(),
  station_id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid station ID format')
    .optional(),
  range: z
    .string()
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid range format')
    .default('TODAY'),
  step: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(5),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (must be YYYY-MM-DD)')
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid startDate format (must be YYYY-MM-DD)')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid endDate format (must be YYYY-MM-DD)')
    .optional(),
  device_sn: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid device SN format')
    .optional(),
  part: z.enum(['all', 'day', 'period']).default('all'),
});

export const GET = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'read_history',
      maxRequests: RATE_LIMIT_CONFIGS.READ_HISTORY.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_HISTORY.windowMs,
    },
  },
  async (request, { session }) => {
    const { searchParams } = new URL(request.url);
    const parsed = historyQuerySchema.safeParse({
      accountId: searchParams.get('accountId') || undefined,
      station_id: searchParams.get('station_id') || undefined,
      range: searchParams.get('range') || undefined,
      step: searchParams.get('step') || undefined,
      date: searchParams.get('date') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      device_sn: searchParams.get('device_sn') || undefined,
      part: searchParams.get('part') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      accountId: requestedAccountId,
      station_id: requestedStationId,
      range,
      step,
      date,
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      device_sn,
      part,
    } = parsed.data;

    // Consumer Tenant Scoping
    if (session?.role === 'consumer') {
      if (!session.accountId) {
        return NextResponse.json(
          { error: 'Forbidden: Consumer account is not assigned to any solar station' },
          { status: 403 }
        );
      }
      if (
        requestedAccountId &&
        requestedAccountId !== session.accountId &&
        requestedAccountId !== 'ALL' &&
        requestedAccountId !== 'ALL_FLEET'
      ) {
        const cleanSessionId = session.accountId.startsWith('station-')
          ? session.accountId.replace('station-', '')
          : session.accountId;
        const isMatch =
          requestedAccountId === cleanSessionId ||
          session.accountId === `station-${requestedAccountId}` ||
          requestedAccountId === `station-${session.accountId}`;

        if (!isMatch) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have permission to view history for this account' },
            { status: 403 }
          );
        }
      }
    }

    // Tenant boundary (preserved): resolve target account for plant lookup.
    const normalizedRequestedAccount =
      requestedAccountId === 'ALL' || requestedAccountId === 'ALL_FLEET'
        ? null
        : requestedAccountId ?? null;
    const tenantCheck = enforceTenantAccess(session, normalizedRequestedAccount);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      // Hot-path optimization: Skip redundant sync with Directus if clients are already loaded in memory
      if (accountManager.getAllClients().length === 0) {
        await accountManager.syncWithDirectus().catch((e) => {
          log.warn('Non-fatal Directus sync error before history lookup', {}, e);
        });
      }

      const rawSn = device_sn?.trim();
      const isFleetSn = !rawSn || rawSn === 'ALL' || rawSn === 'ALL_FLEET';
      const dateStr = date || getManilaDateParts().dateStr;
      const upperRange = (range || 'TODAY').toUpperCase();
      const normalizedStationId =
        requestedStationId && requestedStationId !== 'ALL' ? requestedStationId : undefined;

      // Resolve candidate clients obeying tenant & demo boundaries
      const isAdmin = session?.role === 'admin';
      let candidateClients: DeyeCloudClient[] = [];
      if (tenantCheck.targetAccountId) {
        const specific = accountManager.getClient(tenantCheck.targetAccountId);
        if (specific && (isAdmin || !specific.isDemo)) {
          candidateClients = [specific];
        }
      } else {
        const all = accountManager.getAllClients();
        candidateClients = all.filter((c) => isAdmin || !c.isDemo);
      }

      const periodStart =
        requestedStartDate ||
        (upperRange === 'MONTH' ? shiftIsoDate(dateStr, -29) : shiftIsoDate(dateStr, -6));
      const periodEnd = requestedEndDate || dateStr;

      const fetchPeriodForClients = async (clientsToQuery: DeyeCloudClient[], sn?: string) => {
        let dailySeries: DailyAnalyticsPoint[] | undefined;
        let monthlySeries: MonthlyAnalyticsPoint[] | undefined;
        let dailySummary: DailyAnalyticsPoint | undefined;

        if (part === 'day') {
          return { dailySeries, monthlySeries, dailySummary };
        }

        const liveCapable = clientsToQuery.filter((c) => c.hasCredentials() && !c.isDemo);
        if (liveCapable.length === 0) return { dailySeries, monthlySeries, dailySummary };

        if (upperRange === 'YEAR') {
          const endMonth = dateStr.slice(0, 7);
          const startMonth = shiftIsoMonth(endMonth, -11);
          const [monthResList, dayResList] = await Promise.all([
            Promise.all(
              liveCapable.map((c) =>
                c.getLiveMonthlyHistory({
                  stationId: normalizedStationId,
                  startMonth,
                  endMonth,
                  deviceSn: sn,
                })
              )
            ),
            Promise.all(
              liveCapable.map((c) =>
                c.getLiveDailyHistory({
                  stationId: normalizedStationId,
                  startDate: dateStr,
                  endDate: dateStr,
                  deviceSn: sn,
                })
              )
            ),
          ]);
          const validMonths = monthResList.filter((r): r is { items: MonthlyAnalyticsPoint[]; isLive: boolean } => r !== null);
          if (validMonths.length > 0) {
            monthlySeries = mergeMonthlySeries(validMonths.map((v) => v.items));
          }
          const validDays = dayResList.filter((r): r is { items: DailyAnalyticsPoint[]; isLive: boolean } => r !== null);
          if (validDays.length > 0) {
            const mergedDay = mergeDailySeries(validDays.map((v) => v.items));
            dailySummary = mergedDay.find((d) => d.date === dateStr) || mergedDay[0];
          }
        } else {
          // Fetch daily series for WEEK/MONTH OR single-day/7D window ending at dateStr
          const resList = await Promise.all(
            liveCapable.map((c) =>
              c.getLiveDailyHistory({
                stationId: normalizedStationId,
                startDate: periodStart,
                endDate: periodEnd,
                deviceSn: sn,
              })
            )
          );
          const validDays = resList.filter((r): r is { items: DailyAnalyticsPoint[]; isLive: boolean } => r !== null);
          if (validDays.length > 0) {
            const merged = mergeDailySeries(validDays.map((v) => v.items));
            dailySeries = merged;
            dailySummary = merged.find((d) => d.date === dateStr);
          }
        }
        return { dailySeries, monthlySeries, dailySummary };
      };

      // Fleet / Account / Station View (No SN)
      if (isFleetSn) {
        let scopedClients = candidateClients;
        if (normalizedStationId && scopedClients.length > 1) {
          const owners = scopedClients.filter((c) =>
            c.plants.some((p) => String(p.stationId) === normalizedStationId)
          );
          if (owners.length > 0) scopedClients = owners;
        }

        const liveClients = scopedClients.filter((c) => c.hasCredentials() && !c.isDemo);
        if (liveClients.length > 0) {
          const [dayResList, periodData] = await Promise.all([
            part === 'period'
              ? Promise.resolve([] as (LiveDayHistoryResult | null)[])
              : Promise.all(
                  liveClients.map((c) =>
                    c.getLiveDayHistory({
                      stationId: normalizedStationId,
                      date: dateStr,
                      stepMinutes: step,
                    })
                  )
                ),
            fetchPeriodForClients(liveClients),
          ]);

          if (part === 'period') {
            return NextResponse.json({
              data: [],
              isLive: true,
              isModelSimulated: false,
              recordedCount: 0,
              range,
              stepMinutes: step,
              date: dateStr,
              stationId: normalizedStationId,
              dailySummary: periodData.dailySummary,
              dailySeries: periodData.dailySeries,
              monthlySeries: periodData.monthlySeries,
            });
          }

          const validDays = dayResList.filter((r): r is LiveDayHistoryResult => r !== null);
          if (validDays.length > 0) {
            const mergedPoints = mergeHourlySeries(validDays.map((v) => v.points));
            const totalRecorded = validDays.reduce((s, v) => s + v.recordedCount, 0);
            return NextResponse.json({
              data: mergedPoints,
              isLive: true,
              isModelSimulated: false,
              recordedCount: totalRecorded,
              range,
              stepMinutes: step,
              date: dateStr,
              stationId: normalizedStationId,
              dailySummary: periodData.dailySummary,
              dailySeries: periodData.dailySeries,
              monthlySeries: periodData.monthlySeries,
              notice:
                totalRecorded > 0
                  ? `Live DeyeCloud historical telemetry (${totalRecorded} recorded frames for ${dateStr}).`
                  : `Live DeyeCloud history connected (0 active generation frames recorded on ${dateStr}).`,
            });
          }
        }

        // Resilient deterministic fallback when no live DeyeCloud credentials or upstream timeout
        if (part === 'period') {
          return NextResponse.json({
            data: [],
            isLive: false,
            isModelSimulated: true,
            range,
            stepMinutes: step,
            date: date || undefined,
            notice: 'Simulated fallback period data.',
          });
        }
        const fallbackClient = scopedClients[0] ?? (tenantCheck.targetAccountId ? accountManager.getClient(tenantCheck.targetAccountId) : null) ?? deyeClient;
        const points = fallbackClient.getHourlyEnergy(range, step, dateStr);
        return NextResponse.json({
          data: points,
          isLive: false,
          isModelSimulated: true,
          range,
          stepMinutes: step,
          date: date || undefined,
          notice:
            'Historical interval data is synthesized via date-seeded clear-sky model (offline / simulated fallback).',
        });
      }

      // Per-inverter view: resolve owning client & plant
      const cleanSn = String(rawSn);
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

      // Legacy fallback: direct tenant client lookup
      if (!ownerClient && tenantCheck.targetAccountId) {
        const client = accountManager.getClient(tenantCheck.targetAccountId);
        if (client) {
          const info = getInverterShareInfo(client.plants, cleanSn);
          if (info) {
            ownerClient = client;
            shareInfo = info;
          }
        }
      }

      if (!ownerClient || !shareInfo) {
        return NextResponse.json(
          { error: `Unknown device SN "${cleanSn}" for this account` },
          { status: 404 }
        );
      }

      if (ownerClient.hasCredentials() && !ownerClient.isDemo) {
        const [liveDay, periodData] = await Promise.all([
          part === 'period'
            ? null
            : ownerClient.getLiveDayHistory({
                stationId: String(shareInfo.plant.stationId),
                deviceSn: cleanSn,
                date: dateStr,
                stepMinutes: step,
              }),
          fetchPeriodForClients([ownerClient], cleanSn),
        ]);

        if (part === 'period') {
          return NextResponse.json({
            data: [],
            isLive: true,
            isModelSimulated: false,
            recordedCount: 0,
            range,
            stepMinutes: step,
            date: dateStr,
            deviceSn: cleanSn,
            dailySummary: periodData.dailySummary,
            dailySeries: periodData.dailySeries,
            monthlySeries: periodData.monthlySeries,
          });
        }

        if (liveDay && liveDay.isLive) {
          return NextResponse.json({
            data: liveDay.points,
            isLive: true,
            isModelSimulated: false,
            recordedCount: liveDay.recordedCount,
            source: liveDay.source,
            range,
            stepMinutes: step,
            date: dateStr,
            deviceSn: cleanSn,
            appliedRatio: liveDay.appliedRatio ?? 1,
            dailySummary: periodData.dailySummary,
            dailySeries: periodData.dailySeries,
            monthlySeries: periodData.monthlySeries,
            notice: `Live DeyeCloud per-inverter history for SN ${cleanSn} (${liveDay.recordedCount} frames on ${dateStr}).`,
          });
        }
      }

      if (part === 'period') {
        return NextResponse.json({
          data: [],
          isLive: false,
          isModelSimulated: true,
          range,
          stepMinutes: step,
          date: date || undefined,
          deviceSn: cleanSn,
          notice: 'Simulated fallback period data for inverter.',
        });
      }

      const snFactor = getInverterSnScaleFactor(cleanSn);
      const appliedRatio = Number((snFactor * shareInfo.ratio).toFixed(4));
      const points = ownerClient.getHourlyEnergy(range, step, dateStr, {
        deviceSn: cleanSn,
        capacityRatio: shareInfo.ratio,
      });
      return NextResponse.json({
        data: points,
        isLive: false,
        isModelSimulated: true,
        range,
        stepMinutes: step,
        date: date || undefined,
        deviceSn: cleanSn,
        appliedRatio,
        notice:
          `Historical interval data is synthesized via date-seeded clear-sky model (offline fallback). Per-inverter estimate for SN ${cleanSn} (appliedRatio ${appliedRatio}).`,
      });
    } catch (error) {
      log.error('Error retrieving hourly history', error, { route: 'history', range, step, date });
      return NextResponse.json(
        { error: 'Failed to retrieve hourly history' },
        { status: 500 }
      );
    }
  }
);

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { ACCOUNT_ID_REGEX, enforceTenantAccess } from '@/lib/session';
import {
  extractTvSnapshotFromAggregate,
  getCachedOrGenerateTvBrief,
} from '@/lib/gemini-tv-brief';
import { createLogger } from '@/lib/logger';
import type { AggregatedFleetSummary } from '@/lib/types';

const log = createLogger('TvBriefRoute');

export const tvBriefQuerySchema = z.object({
  accountId: z
    .string()
    .min(1)
    .max(64)
    .regex(ACCOUNT_ID_REGEX, 'Invalid account ID format')
    .optional(),
  stationId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid station ID format')
    .optional(),
  tariffRate: z.coerce.number().positive().max(100).optional(),
});

function scopeAggregateToAccount(
  aggregate: AggregatedFleetSummary,
  accountId: string
): AggregatedFleetSummary {
  const matchedAccounts = (aggregate.accounts || []).filter(
    (a) =>
      a.id === accountId ||
      a.directusId === accountId ||
      `deye-cfg-${a.directusId || ''}` === accountId
  );
  const matchedIds = new Set(matchedAccounts.map((a) => a.id));
  const matchedNodes = (aggregate.nodes || []).filter((n) => matchedIds.has(n.accountId));

  const totalSolarPowerKw = matchedAccounts.reduce((s, a) => s + (a.liveSolarPowerKw || 0), 0);
  const totalDailyYieldKwh = matchedAccounts.reduce((s, a) => s + (a.dailyYieldKwh || 0), 0);
  const totalCapacityKw = matchedAccounts.reduce((s, a) => s + (a.capacityKw || 0), 0);
  const totalLoadPowerKw = matchedAccounts.reduce((s, a) => s + (a.consumptionPowerKw || 0), 0);
  const netGridPowerKw = matchedAccounts.reduce((s, a) => s + (a.gridPowerKw || 0), 0);
  const totalPlants = matchedAccounts.reduce((s, a) => s + (a.plants?.length || 0), 0);
  const totalInverters = matchedAccounts.reduce((s, a) => s + (a.inverterCount || 0), 0);

  return {
    ...aggregate,
    totalAccounts: matchedAccounts.length,
    activeAccounts: matchedAccounts.filter((a) => a.isLive).length,
    totalPlants,
    totalInverters,
    totalCapacityKw,
    totalSolarPowerKw,
    totalDailyYieldKwh,
    totalLoadPowerKw,
    netGridPowerKw,
    accounts: matchedAccounts,
    nodes: matchedNodes,
    isLive: matchedAccounts.some((a) => a.isLive),
  };
}

function scopeAggregateToStation(
  aggregate: AggregatedFleetSummary,
  stationId: string
): AggregatedFleetSummary {
  const scopedAccounts = (aggregate.accounts || [])
    .map((acc) => {
      const plants = (acc.plants || []).filter((p) => String(p.stationId) === stationId);
      if (plants.length === 0) return null;
      const liveSolarPowerKw = plants.reduce((s, p) => s + (p.liveSolarPowerKw || 0), 0);
      const dailyYieldKwh = plants.reduce((s, p) => s + (p.dailyYieldKwh || 0), 0);
      const capacityKw = plants.reduce((s, p) => s + (p.installedCapacityKw || 0), 0);
      const consumptionPowerKw = plants.reduce((s, p) => s + (p.consumptionPowerKw || 0), 0);
      const gridPowerKw = plants.reduce((s, p) => s + (p.gridPowerKw || 0), 0);
      const inverterCount = plants.reduce(
        (s, p) => s + (p.devices || []).filter((d) => d.deviceType === 'INVERTER').length,
        0
      );
      return {
        ...acc,
        plants,
        stationCount: plants.length,
        inverterCount,
        liveSolarPowerKw,
        dailyYieldKwh,
        capacityKw,
        consumptionPowerKw,
        gridPowerKw,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const matchedNodes = (aggregate.nodes || []).filter((n) => String(n.stationId) === stationId);
  const totalSolarPowerKw = scopedAccounts.reduce((s, a) => s + (a.liveSolarPowerKw || 0), 0);
  const totalDailyYieldKwh = scopedAccounts.reduce((s, a) => s + (a.dailyYieldKwh || 0), 0);
  const totalCapacityKw = scopedAccounts.reduce((s, a) => s + (a.capacityKw || 0), 0);
  const totalLoadPowerKw = scopedAccounts.reduce((s, a) => s + (a.consumptionPowerKw || 0), 0);
  const netGridPowerKw = scopedAccounts.reduce((s, a) => s + (a.gridPowerKw || 0), 0);
  const totalPlants = scopedAccounts.reduce((s, a) => s + (a.plants?.length || 0), 0);
  const totalInverters = scopedAccounts.reduce((s, a) => s + (a.inverterCount || 0), 0);

  return {
    ...aggregate,
    totalAccounts: scopedAccounts.length,
    activeAccounts: scopedAccounts.filter((a) => a.isLive).length,
    totalPlants,
    totalInverters,
    totalCapacityKw,
    totalSolarPowerKw,
    totalDailyYieldKwh,
    totalLoadPowerKw,
    netGridPowerKw,
    accounts: scopedAccounts,
    nodes: matchedNodes,
    isLive: scopedAccounts.some((a) => a.isLive),
  };
}

export const GET = withGate(
  {
    allowUnauthenticated: false,
    rateLimit: {
      keyPrefix: 'tv_brief',
      maxRequests: RATE_LIMIT_CONFIGS.TV_BRIEF.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.TV_BRIEF.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const parsed = tvBriefQuerySchema.safeParse({
      accountId: searchParams.get('accountId') || undefined,
      stationId: searchParams.get('stationId') || searchParams.get('station_id') || undefined,
      tariffRate: searchParams.get('tariffRate') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { accountId: requestedAccountId, stationId: requestedStationId, tariffRate } = parsed.data;
    const normalizedRequested =
      requestedAccountId === 'ALL' || requestedAccountId === 'ALL_FLEET'
        ? null
        : requestedAccountId ?? null;
    const normalizedStationId =
      requestedStationId === 'ALL' ? undefined : requestedStationId;

    const tenantCheck = enforceTenantAccess(session, normalizedRequested);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      const targetAccountId = tenantCheck.targetAccountId;
      const targetIds = targetAccountId ? [targetAccountId] : undefined;
      let aggregate = await accountManager.getAggregatedFleetSummary(targetIds, session.role);

      if (targetAccountId) {
        aggregate = scopeAggregateToAccount(aggregate, targetAccountId);
      } else if (session.role !== 'admin') {
        const nonDemo = (aggregate.accounts || []).filter((a) => !a.isDemo);
        aggregate = { ...aggregate, accounts: nonDemo };
      }

      if (normalizedStationId) {
        aggregate = scopeAggregateToStation(aggregate, normalizedStationId);
      }

      const baseScope = targetAccountId || (session.role === 'admin' ? 'ALL_ADMIN' : 'ALL');
      const scopeKey = normalizedStationId ? `${baseScope}:STA:${normalizedStationId}` : baseScope;
      const snapshot = extractTvSnapshotFromAggregate(aggregate, scopeKey, tariffRate);
      const brief = await getCachedOrGenerateTvBrief(snapshot);

      return NextResponse.json({
        ...brief,
        snapshot: {
          scopeKey: snapshot.scopeKey,
          manilaTimestamp: snapshot.manilaTimestamp,
          totalPlants: snapshot.totalPlants,
          faultCount: snapshot.faultCount,
          offlineInverterCount: snapshot.offlineInverterCount,
          offlineLoggerCount: snapshot.offlineLoggerCount,
        },
      });
    } catch (err) {
      log.error('Failed generating TV telemetry brief', err, { route: 'tv/brief' });
      return NextResponse.json(
        { error: 'Failed to generate TV telemetry brief' },
        { status: 500 }
      );
    }
  }
);

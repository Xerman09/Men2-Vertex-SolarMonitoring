import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { filterFleetByDeviceSn } from '@/lib/fleet-aggregator';
import type { AggregatedFleetSummary } from '@/lib/types';

function snFilteredOrNotFound(aggregate: AggregatedFleetSummary, sn: string | undefined) {
  const clean = sn?.trim();
  if (!clean || clean === 'ALL' || clean === 'ALL_FLEET') {
    return NextResponse.json(aggregate);
  }
  const filtered = filterFleetByDeviceSn(aggregate, clean);
  if (!filtered) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }
  return NextResponse.json({ ...aggregate, ...filtered });
}

const log = createLogger('AggregateRoute');

export const aggregateQuerySchema = z.object({
  device_sn: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid device SN format')
    .optional(),
});

export const GET = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'read_aggregate',
      maxRequests: RATE_LIMIT_CONFIGS.READ_AGGREGATE.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_AGGREGATE.windowMs,
    },
  },
  async (_req, { session }) => {
    try {
      const { searchParams } = new URL(_req.url);
      const parsed = aggregateQuerySchema.safeParse({
        device_sn: searchParams.get('device_sn') || undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      // If consumer role, scope aggregate to their assigned account (with fallback to production accounts if unassigned)
      if (session?.role === 'consumer') {
        const targetIds = session.accountId ? [session.accountId] : undefined;
        const aggregate = await accountManager.getAggregatedFleetSummary(targetIds, session.role);
        return snFilteredOrNotFound(aggregate, parsed.data.device_sn);
      }

      // Admin role can view full fleet aggregate summary including demo accounts.
      // Non-admin / viewer roles aggregate production accounts.
      const aggregate = await accountManager.getAggregatedFleetSummary(undefined, session?.role || 'viewer');
      return snFilteredOrNotFound(aggregate, parsed.data.device_sn);
    } catch (error) {
      log.error('Error aggregating fleet', error, { route: 'aggregate' });
      return NextResponse.json(
        { error: 'Failed to aggregate fleet telemetry' },
        { status: 500 }
      );
    }
  }
);

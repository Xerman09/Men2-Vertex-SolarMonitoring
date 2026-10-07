import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('AggregateRoute');

export const GET = withGate(
  {
    rateLimit: {
      keyPrefix: 'read_aggregate',
      maxRequests: RATE_LIMIT_CONFIGS.READ_AGGREGATE.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_AGGREGATE.windowMs,
    },
  },
  async (_req, { session }) => {
    try {
      // If consumer role, strictly scope aggregate to their assigned account
      if (session.role === 'consumer') {
        if (!session.accountId) {
          return NextResponse.json(
            { error: 'Forbidden: Consumer account is not assigned to any solar station' },
            { status: 403 }
          );
        }
        const aggregate = await accountManager.getAggregatedFleetSummary([session.accountId]);
        return NextResponse.json(aggregate);
      }

      // Admin & Viewer roles can view full fleet aggregate summary
      const aggregate = await accountManager.getAggregatedFleetSummary();
      return NextResponse.json(aggregate);
    } catch (error) {
      log.error('Error aggregating fleet', error, { route: 'aggregate' });
      return NextResponse.json(
        { error: 'Failed to aggregate fleet telemetry' },
        { status: 500 }
      );
    }
  }
);

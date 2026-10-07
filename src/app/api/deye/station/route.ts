import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';
import { enforceTenantAccess } from '@/lib/session';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('StationRoute');

export const GET = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'read_station',
      maxRequests: RATE_LIMIT_CONFIGS.READ_STATIONS.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_STATIONS.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const stationId = searchParams.get('station_id') || searchParams.get('stationId') || undefined;
    const accountId = searchParams.get('accountId') || undefined;

    const tenantCheck = enforceTenantAccess(session, accountId);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      const client = accountManager.getClient(tenantCheck.targetAccountId);
      if (!client) {
        return NextResponse.json(
          {
            error: tenantCheck.targetAccountId
              ? `Account "${tenantCheck.targetAccountId}" not found`
              : 'No configured solar gateway account found',
          },
          { status: 404 }
        );
      }

      const result = await client.getStationSummary(stationId);
      return NextResponse.json({
        ...result,
        accountId: client.accountId,
        accountName: client.accountName,
      });
    } catch (error) {
      log.error('Error retrieving station telemetry', error, { route: 'station', stationId });
      return NextResponse.json(
        { error: 'Failed to retrieve station telemetry' },
        { status: 500 }
      );
    }
  }
);

import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';
import { enforceTenantAccess } from '@/lib/session';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('TelemetryRoute');

export const GET = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'read_telemetry',
      maxRequests: RATE_LIMIT_CONFIGS.READ_TELEMETRY.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_TELEMETRY.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const deviceSn = searchParams.get('device_sn') || undefined;
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

      const result = await client.getInverterTelemetry(deviceSn);
      return NextResponse.json({
        ...result,
        accountId: client.accountId,
        accountName: client.accountName,
      });
    } catch (error) {
      log.error('Error fetching telemetry', error, { route: 'telemetry', deviceSn });
      return NextResponse.json(
        { error: 'Failed to retrieve inverter telemetry' },
        { status: 500 }
      );
    }
  }
);

import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';
import { enforceTenantAccess } from '@/lib/session';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('HealthRoute');

export const GET = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'read_health',
      maxRequests: RATE_LIMIT_CONFIGS.READ_HEALTH.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_HEALTH.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || undefined;

    const tenantCheck = enforceTenantAccess(session, accountId);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      if (tenantCheck.targetAccountId) {
        const client = accountManager.getClient(tenantCheck.targetAccountId);
        if (!client) {
          return NextResponse.json(
            { error: `Account "${tenantCheck.targetAccountId}" not found` },
            { status: 404 }
          );
        }
        const health = await client.getHealth();
        return NextResponse.json({
          ...health,
          accountId: client.accountId,
          accountName: client.accountName,
        });
      }

      // Return primary client's health with multi-account fleet indicators
      const primaryClient = accountManager.getClient();
      const clients = accountManager.getAllClients();

      if (!primaryClient) {
        return NextResponse.json({
          gatewayUrl: 'https://api.deyecloud.com',
          region: 'Unconfigured Fleet',
          isLive: false,
          status: 'OFFLINE',
          pingMs: 0,
          rateLimitUsed: 0,
          rateLimitMax: 10000,
          tokenExpiresAt: null,
          lastChecked: new Date().toISOString(),
          totalConfiguredAccounts: 0,
        });
      }

      const health = await primaryClient.getHealth();

      return NextResponse.json({
        ...health,
        totalConfiguredAccounts: clients.length,
        accountId: primaryClient.accountId,
        accountName: primaryClient.accountName,
      });
    } catch (error) {
      log.error('Error querying gateway health', error, { route: 'health' });
      return NextResponse.json(
        { error: 'Failed to query gateway health' },
        { status: 500 }
      );
    }
  }
);

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { verifySessionToken, SESSION_COOKIE_NAME, enforceTenantAccess } from '@/lib/session';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('accountId') || undefined;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

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
    console.error('[HealthRoute] Error querying gateway health:', error);
    return NextResponse.json(
      { error: 'Failed to query gateway health' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  enforceTenantAccess,
  requireAuthenticatedSession,
} from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('accountId') || undefined;

  // 1. IP Rate Limiting (60 requests per minute)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = checkRateLimit(`read_stations_${clientIp}`, 60, 60 * 1000);
  if (!rate.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded: Maximum 60 station requests per minute.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 2. Enforce Authenticated Session (ADR-08 Default-Deny)
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  const authCheck = requireAuthenticatedSession(session);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: authCheck.error || 'Authentication required to access station telemetry' },
      { status: authCheck.status }
    );
  }

  // 3. If consumer role, strictly restrict to their assigned account
  if (session?.role === 'consumer') {
    if (!session.accountId) {
      return NextResponse.json(
        { error: 'Forbidden: Consumer account is not assigned to any solar station' },
        { status: 403 }
      );
    }
    if (accountId && accountId !== session.accountId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to view stations for this account' },
        { status: 403 }
      );
    }
    const client = accountManager.getClient(session.accountId);
    if (!client) {
      return NextResponse.json(
        { error: `Assigned account "${session.accountId}" not found` },
        { status: 404 }
      );
    }
    const result = await client.getStationList();
    return NextResponse.json({
      ...result,
      accountId: client.accountId,
      accountName: client.accountName,
    });
  }

  try {
    if (accountId) {
      const tenantCheck = enforceTenantAccess(session, accountId);
      if (!tenantCheck.allowed) {
        return NextResponse.json(
          { error: tenantCheck.error || 'Access denied' },
          { status: tenantCheck.status || 403 }
        );
      }

      const client = accountManager.getClient(tenantCheck.targetAccountId);
      if (!client) {
        return NextResponse.json(
          { error: `Account "${tenantCheck.targetAccountId}" not found` },
          { status: 404 }
        );
      }
      const result = await client.getStationList();
      return NextResponse.json({
        ...result,
        accountId: client.accountId,
        accountName: client.accountName,
      });
    }

    // Query all accounts with Promise.allSettled for fault tolerance
    const clients = accountManager.getAllClients();
    const settled = await Promise.allSettled(clients.map((c) => c.getStationList()));
    const allStations: Array<Record<string, any>> = [];
    let anyLive = false;

    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        const l = res.value;
        if (l.isLive) anyLive = true;
        l.stations.forEach((s) => {
          allStations.push({
            ...s,
            accountId: clients[idx].accountId,
            accountName: clients[idx].accountName,
          });
        });
      } else {
        console.warn(`[StationsRoute] Failed querying station list for account ${clients[idx].accountId}:`, res.reason);
      }
    });

    return NextResponse.json({
      total: allStations.length,
      stations: allStations,
      isLive: anyLive,
    });
  } catch (error) {
    console.error('[StationsRoute] Error querying stations:', error);
    return NextResponse.json(
      { error: 'Failed to query registered stations' },
      { status: 500 }
    );
  }
}

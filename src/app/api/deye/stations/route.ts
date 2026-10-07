import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';
import { enforceTenantAccess } from '@/lib/session';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';

export const GET = withGate(
  {
    rateLimit: {
      keyPrefix: 'read_stations',
      maxRequests: RATE_LIMIT_CONFIGS.READ_STATIONS.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_STATIONS.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || undefined;

    // Consumer role is strictly restricted to their assigned account
    if (session.role === 'consumer') {
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
);

import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('accountId') || undefined;

  try {
    if (accountId) {
      const client = accountManager.getClient(accountId);
      if (!client) {
        return NextResponse.json(
          { error: `Account "${accountId}" not found` },
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

    // Query all accounts
    const clients = accountManager.getAllClients();
    const lists = await Promise.all(clients.map((c) => c.getStationList()));
    const allStations = lists.flatMap((l, idx) =>
      l.stations.map((s) => ({
        ...s,
        accountId: clients[idx].accountId,
        accountName: clients[idx].accountName,
      }))
    );

    return NextResponse.json({
      total: allStations.length,
      stations: allStations,
      isLive: lists.some((l) => l.isLive),
    });
  } catch (error) {
    console.error('[StationsRoute] Error querying stations:', error);
    return NextResponse.json(
      { error: 'Failed to query registered stations' },
      { status: 500 }
    );
  }
}

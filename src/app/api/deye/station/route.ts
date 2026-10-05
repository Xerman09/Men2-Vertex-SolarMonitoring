import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { verifySessionToken, SESSION_COOKIE_NAME, enforceTenantAccess } from '@/lib/session';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const stationId = searchParams.get('station_id') || searchParams.get('stationId') || undefined;
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
    const client = accountManager.getClient(tenantCheck.targetAccountId);
    if (!client) {
      return NextResponse.json(
        { error: tenantCheck.targetAccountId ? `Account "${tenantCheck.targetAccountId}" not found` : 'No configured solar gateway account found' },
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
    console.error('[StationRoute] Error retrieving station telemetry:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve station telemetry' },
      { status: 500 }
    );
  }
}

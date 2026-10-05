import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  try {
    // If consumer role, strictly scope aggregate to their assigned account
    if (session?.role === 'consumer') {
      if (!session.accountId) {
        return NextResponse.json(
          { error: 'Forbidden: Consumer account is not assigned to any solar station' },
          { status: 403 }
        );
      }
      const aggregate = await accountManager.getAggregatedFleetSummary([session.accountId]);
      return NextResponse.json(aggregate);
    }

    const aggregate = await accountManager.getAggregatedFleetSummary();
    return NextResponse.json(aggregate);
  } catch (error) {
    console.error('[AggregateRoute] Error aggregating fleet:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate fleet telemetry' },
      { status: 500 }
    );
  }
}

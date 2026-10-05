import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';

export async function GET() {
  try {
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

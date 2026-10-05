import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  requireAuthenticatedSession,
} from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  // 1. IP Rate Limiting (60 requests per minute)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = checkRateLimit(`read_aggregate_${clientIp}`, 60, 60 * 1000);
  if (!rate.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded: Maximum 60 aggregate requests per minute.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 2. Enforce Authenticated Session
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  const authCheck = requireAuthenticatedSession(session);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: authCheck.error || 'Authentication required to access aggregate telemetry' },
      { status: authCheck.status }
    );
  }

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

    // Admin & Viewer roles can view full fleet aggregate summary
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

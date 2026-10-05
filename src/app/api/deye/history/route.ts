import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deyeClient } from '@/lib/deye-client';
import { verifySessionToken, SESSION_COOKIE_NAME, requireAuthenticatedSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  // 1. IP Rate Limiting (30 requests per minute)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = checkRateLimit(`read_history_${clientIp}`, 30, 60 * 1000);
  if (!rate.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded: Maximum 30 history requests per minute.' },
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
      { error: authCheck.error || 'Authentication required to access historical telemetry' },
      { status: authCheck.status }
    );
  }

  // 3. Consumer Tenant Scoping
  const { searchParams } = new URL(request.url);
  const requestedAccountId = searchParams.get('accountId');

  if (session?.role === 'consumer') {
    if (!session.accountId) {
      return NextResponse.json(
        { error: 'Forbidden: Consumer account is not assigned to any solar station' },
        { status: 403 }
      );
    }
    if (requestedAccountId && requestedAccountId !== session.accountId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to view history for this account' },
        { status: 403 }
      );
    }
  }

  try {
    const range = searchParams.get('range') || 'TODAY';
    const step = parseInt(searchParams.get('step') || '5', 10) || 5;
    const points = deyeClient.getHourlyEnergy(range, step);
    return NextResponse.json({
      data: points,
      isLive: false,
      isModelSimulated: true,
      range,
      stepMinutes: step,
      notice:
        'Historical interval data is synthesized via sinusoidal clear-sky model until Deye historical telemetry aggregation tier is activated.',
    });
  } catch (error) {
    console.error('[HistoryRoute] Error retrieving hourly history:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve hourly history' },
      { status: 500 }
    );
  }
}

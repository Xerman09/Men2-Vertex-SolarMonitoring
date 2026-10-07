import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deyeClient } from '@/lib/deye-client';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { ACCOUNT_ID_REGEX } from '@/lib/session';

export const historyQuerySchema = z.object({
  accountId: z
    .string()
    .min(1)
    .max(64)
    .regex(ACCOUNT_ID_REGEX, 'Invalid account ID format')
    .optional(),
  range: z
    .string()
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid range format')
    .default('TODAY'),
  step: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(5),
});

export const GET = withGate(
  {
    rateLimit: {
      keyPrefix: 'read_history',
      maxRequests: RATE_LIMIT_CONFIGS.READ_HISTORY.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_HISTORY.windowMs,
    },
  },
  async (request, { session }) => {
    const { searchParams } = new URL(request.url);
    const parsed = historyQuerySchema.safeParse({
      accountId: searchParams.get('accountId') || undefined,
      range: searchParams.get('range') || undefined,
      step: searchParams.get('step') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { accountId: requestedAccountId, range, step } = parsed.data;

    // Consumer Tenant Scoping
    if (session.role === 'consumer') {
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
);

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deyeClient, getInverterShareInfo, getInverterSnScaleFactor } from '@/lib/deye-client';
import { accountManager } from '@/lib/account-manager';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { ACCOUNT_ID_REGEX, enforceTenantAccess } from '@/lib/session';
import { createLogger } from '@/lib/logger';

const log = createLogger('HistoryRoute');

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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (must be YYYY-MM-DD)')
    .optional(),
  device_sn: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid device SN format')
    .optional(),
});

export const GET = withGate(
  {
    allowUnauthenticated: true,
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
      date: searchParams.get('date') || undefined,
      device_sn: searchParams.get('device_sn') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { accountId: requestedAccountId, range, step, date, device_sn } = parsed.data;

    // Consumer Tenant Scoping
    if (session?.role === 'consumer') {
      if (!session.accountId) {
        return NextResponse.json(
          { error: 'Forbidden: Consumer account is not assigned to any solar station' },
          { status: 403 }
        );
      }
      if (
        requestedAccountId &&
        requestedAccountId !== session.accountId &&
        requestedAccountId !== 'ALL' &&
        requestedAccountId !== 'ALL_FLEET'
      ) {
        const cleanSessionId = session.accountId.startsWith('station-')
          ? session.accountId.replace('station-', '')
          : session.accountId;
        const isMatch =
          requestedAccountId === cleanSessionId ||
          session.accountId === `station-${requestedAccountId}` ||
          requestedAccountId === `station-${session.accountId}`;

        if (!isMatch) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have permission to view history for this account' },
            { status: 403 }
          );
        }
      }
    }

    // Tenant boundary (preserved): resolve target account for plant lookup.
    const tenantCheck = enforceTenantAccess(session, requestedAccountId ?? null);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      const rawSn = device_sn?.trim();
      const isFleetSn = !rawSn || rawSn === 'ALL' || rawSn === 'ALL_FLEET';

      // Fleet view (no SN): unchanged shape, byte-identical base series.
      if (isFleetSn) {
        const tenantClient = tenantCheck.targetAccountId
          ? accountManager.getClient(tenantCheck.targetAccountId)
          : null;
        const points = (tenantClient ?? deyeClient).getHourlyEnergy(range, step, date);
        return NextResponse.json({
          data: points,
          isLive: false,
          isModelSimulated: true,
          range,
          stepMinutes: step,
          date: date || undefined,
          notice:
            'Historical interval data is synthesized via sinusoidal clear-sky model until Deye historical telemetry aggregation tier is activated.',
        });
      }

      // Per-inverter view: resolve owning plant, scale synth series.
      const cleanSn = String(rawSn);
      const client = accountManager.getClient(tenantCheck.targetAccountId);
      const plants = client?.plants ?? null;
      const shareInfo = getInverterShareInfo(plants, cleanSn);
      if (!client || !shareInfo) {
        return NextResponse.json(
          { error: `Unknown device SN "${cleanSn}" for this account` },
          { status: 404 }
        );
      }

      const snFactor = getInverterSnScaleFactor(cleanSn);
      const appliedRatio = Number((snFactor * shareInfo.ratio).toFixed(4));
      const points = client.getHourlyEnergy(range, step, date, {
        deviceSn: cleanSn,
        capacityRatio: shareInfo.ratio,
      });
      return NextResponse.json({
        data: points,
        isLive: false,
        isModelSimulated: true,
        range,
        stepMinutes: step,
        date: date || undefined,
        deviceSn: cleanSn,
        appliedRatio,
        notice:
          `Historical interval data is synthesized via sinusoidal clear-sky model until Deye historical telemetry aggregation tier is activated. Per-inverter estimate for SN ${cleanSn} (appliedRatio ${appliedRatio}).`,
      });
    } catch (error) {
      log.error('Error retrieving hourly history', error, { route: 'history', range, step, date });
      return NextResponse.json(
        { error: 'Failed to retrieve hourly history' },
        { status: 500 }
      );
    }
  }
);

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import { ACCOUNT_ID_REGEX } from '@/lib/session';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { withGate, parseJsonBody } from '@/lib/gate';
import { createLogger } from '@/lib/logger';

const log = createLogger('ControlRoute');

export const VALID_WORK_MODES = [
  'PEAK_SHAVING',
  'BATTERY_FIRST',
  'LOAD_FIRST',
  'SELLING_FIRST',
  'ZERO_EXPORT_TO_LOAD',
  'ZERO_EXPORT_TO_CT',
] as const;

export type ValidWorkMode = (typeof VALID_WORK_MODES)[number];

export const controlBodySchema = z.object({
  deviceSn: z
    .string()
    .regex(/^[A-Za-z0-9_-]{6,32}$/, 'Invalid device serial number format')
    .optional(),
  mode: z.enum(VALID_WORK_MODES, {
    message: `Invalid work mode. Allowed modes: ${VALID_WORK_MODES.join(', ')}`,
  }),
  gridCharge: z.boolean().default(false),
  accountId: z
    .string()
    .min(1)
    .max(64)
    .regex(ACCOUNT_ID_REGEX, 'Invalid account ID format')
    .optional(),
});

export const POST = withGate(
  {
    roles: ['admin', 'consumer'],
    rateLimit: {
      keyPrefix: 'control',
      maxRequests: RATE_LIMIT_CONFIGS.CONTROL.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.CONTROL.windowMs,
    },
  },
  async (req, { session, clientIp }) => {
    // 1. Safely parse JSON body with uniform error handling
    const jsonParsed = await parseJsonBody(req);
    if (!jsonParsed.ok) {
      return jsonParsed.errorResponse;
    }

    const parseResult = controlBodySchema.safeParse(jsonParsed.data);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { deviceSn, mode, gridCharge, accountId } = parseResult.data;

    // 2. Tenant isolation check for consumer roles
    let targetAccountId = accountId;
    if (session.role === 'consumer') {
      if (!session.accountId) {
        return NextResponse.json(
          { error: 'Forbidden: Consumer account is not assigned to any solar station' },
          { status: 403 }
        );
      }
      if (accountId && session.accountId !== accountId) {
        const cleanSessionId = session.accountId.startsWith('station-')
          ? session.accountId.replace('station-', '')
          : session.accountId;
        const isMatch =
          accountId === cleanSessionId ||
          session.accountId === `station-${accountId}` ||
          accountId === `station-${session.accountId}`;

        if (!isMatch) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have permission to control hardware for this account' },
            { status: 403 }
          );
        }
      }
      targetAccountId = session.accountId;
    }

    // 3. Retrieve target DeyeCloud client
    const client = accountManager.getClient(targetAccountId);
    if (!client) {
      return NextResponse.json(
        { error: `Account with ID "${targetAccountId || 'default'}" not found` },
        { status: 404 }
      );
    }

    // Map to client supported mode
    const clientMode = (
      mode === 'ZERO_EXPORT_TO_LOAD'
        ? 'LOAD_FIRST'
        : mode === 'ZERO_EXPORT_TO_CT'
        ? 'SELLING_FIRST'
        : mode
    ) as 'PEAK_SHAVING' | 'BATTERY_FIRST' | 'LOAD_FIRST' | 'SELLING_FIRST';

    try {
      const result = await client.setWorkMode({
        deviceSn: deviceSn ? String(deviceSn).trim() : undefined,
        mode: clientMode,
        gridCharge: Boolean(gridCharge),
      });

      // 4. Record audit trail in database with caller identity
      try {
        await accountManager.logInverterControl({
          station_id: client.getDefaultStationId() || 'SP_04',
          device_sn: deviceSn || client.getDefaultDeviceSn() || '2209X891104',
          action: `SET_WORK_MODE_${mode}`,
          work_mode: clientMode,
          parameters_payload: { mode, gridCharge: Boolean(gridCharge), accountId: client.accountId },
          status: result.success ? 'SUCCESS' : 'FAILED',
          upstream_code: result.success ? 200 : 502,
          upstream_message: result.message || 'Workmode dispatch acknowledged',
          user_id:
            typeof session.userId === 'number'
              ? session.userId
              : parseInt(String(session.userId), 10) || null,
          client_ip: clientIp || null,
        });
      } catch (logErr) {
        log.warn('Failed recording command audit', { route: 'control' }, logErr);
      }

      // 5. Return proper HTTP status code: 200 on success, 502 Bad Gateway on upstream error
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.message || 'Upstream inverter controller rejected command',
            isLive: result.isLive,
            accountId: client.accountId,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ...result,
        accountId: client.accountId,
        accountName: client.accountName,
      });
    } catch (error) {
      log.error('Hardware dispatch failed', error, { route: 'control', targetAccountId });
      return NextResponse.json(
        { error: 'Failed to dispatch workmode control command to inverter' },
        { status: 500 }
      );
    }
  }
);

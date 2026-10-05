import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

const VALID_WORK_MODES = [
  'PEAK_SHAVING',
  'BATTERY_FIRST',
  'LOAD_FIRST',
  'SELLING_FIRST',
  'ZERO_EXPORT_TO_LOAD',
  'ZERO_EXPORT_TO_CT',
] as const;

type ValidWorkMode = (typeof VALID_WORK_MODES)[number];

export async function POST(req: Request) {
  // 1. Authenticate caller session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionToken);

  if (!session || (session.role !== 'admin' && session.role !== 'consumer')) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required to execute inverter hardware commands' },
      { status: 401 }
    );
  }

  // 2. Safely parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const { deviceSn, mode, gridCharge, accountId } = body || {};

  // 3. Validate mode enum strictly
  if (!mode || !VALID_WORK_MODES.includes(mode as ValidWorkMode)) {
    return NextResponse.json(
      {
        error: `Invalid work mode "${mode}". Allowed modes: ${VALID_WORK_MODES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // 4. Tenant isolation check for consumer roles
  if (session.role === 'consumer' && session.accountId && accountId && session.accountId !== accountId) {
    return NextResponse.json(
      { error: 'Forbidden: You do not have permission to control hardware for this account' },
      { status: 403 }
    );
  }

  // 5. Retrieve target DeyeCloud client
  const client = accountManager.getClient(accountId);
  if (!client) {
    return NextResponse.json(
      { error: `Account with ID "${accountId}" not found` },
      { status: 404 }
    );
  }

  // Map to client supported mode
  const clientMode = (
    mode === 'ZERO_EXPORT_TO_LOAD' ? 'LOAD_FIRST' :
    mode === 'ZERO_EXPORT_TO_CT' ? 'SELLING_FIRST' :
    mode
  ) as 'PEAK_SHAVING' | 'BATTERY_FIRST' | 'LOAD_FIRST' | 'SELLING_FIRST';

  try {
    const result = await client.setWorkMode({
      deviceSn: deviceSn ? String(deviceSn).trim() : undefined,
      mode: clientMode,
      gridCharge: Boolean(gridCharge),
    });

    // 6. Record audit trail in database with caller identity
    try {
      await accountManager.logInverterControl({
        station_id: client.getDefaultStationId() || 'SP_04',
        device_sn: deviceSn || client.getDefaultDeviceSn() || '2209X891104',
        action: `SET_WORK_MODE_${mode}`,
        work_mode: mode,
        parameters_payload: { mode, gridCharge: Boolean(gridCharge), accountId: client.accountId },
        status: result.success ? 'SUCCESS' : 'FAILED',
        upstream_code: result.success ? 200 : 502,
        upstream_message: result.message || 'Workmode dispatch acknowledged',
        user_id: typeof session.userId === 'number' ? session.userId : (parseInt(String(session.userId), 10) || null),
        client_ip: req.headers.get('x-forwarded-for') || null,
      });
    } catch (logErr) {
      console.warn('[ControlRoute] Failed recording command audit:', logErr);
    }

    // 7. Return proper HTTP status code: 200 on success, 502 Bad Gateway on upstream error
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
    console.error('[ControlRoute] Hardware dispatch failed:', error);
    return NextResponse.json(
      { error: 'Failed to dispatch workmode control command to inverter' },
      { status: 500 }
    );
  }
}

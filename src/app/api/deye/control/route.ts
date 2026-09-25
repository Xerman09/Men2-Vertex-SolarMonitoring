import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { deviceSn, mode, gridCharge, accountId } = body;

    if (!mode) {
      return NextResponse.json(
        { error: 'Field "mode" is required (e.g. PEAK_SHAVING, BATTERY_FIRST, LOAD_FIRST)' },
        { status: 400 }
      );
    }

    const client = accountManager.getClient(accountId);
    const result = await client.setWorkMode({
      deviceSn,
      mode,
      gridCharge: Boolean(gridCharge),
    });

    // Record audit trail in database (iot_solar_inverter_control_logs)
    try {
      await accountManager.logInverterControl({
        station_id: client.getDefaultStationId() || 'SP_04',
        device_sn: deviceSn || client.getDefaultDeviceSn() || '2209X891104',
        action: `SET_WORK_MODE_${mode}`,
        work_mode: mode,
        parameters_payload: { mode, gridCharge: Boolean(gridCharge), accountId },
        status: result.success ? 'SUCCESS' : 'FAILED',
        upstream_code: result.success ? 200 : 500,
        upstream_message: result.message || 'Workmode dispatch acknowledged',
        client_ip: req.headers.get('x-forwarded-for') || null,
      });
    } catch (logErr) {
      console.warn('[ControlRoute] Failed recording command audit:', logErr);
    }

    return NextResponse.json({
      ...result,
      accountId: client.accountId,
      accountName: client.accountName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to dispatch workmode control command', details: String(error) },
      { status: 500 }
    );
  }
}

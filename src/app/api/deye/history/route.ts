import { NextResponse } from 'next/server';
import { deyeClient } from '@/lib/deye-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'TODAY';
    const step = parseInt(searchParams.get('step') || '5', 10) || 5;
    const points = deyeClient.getHourlyEnergy(range, step);
    return NextResponse.json({
      data: points,
      isLive: false,
      isModelSimulated: true,
      range,
      stepMinutes: step,
      notice: 'Historical interval data is synthesized via sinusoidal clear-sky model until Deye historical telemetry aggregation tier is activated.',
    });
  } catch (error) {
    console.error('[HistoryRoute] Error retrieving hourly history:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve hourly history' },
      { status: 500 }
    );
  }
}

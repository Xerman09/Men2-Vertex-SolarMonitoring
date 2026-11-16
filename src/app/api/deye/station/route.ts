import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import { enforceTenantAccess } from '@/lib/session';
import { withGate } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import {
  extractDeviceDailyYieldKwh,
  extractDeviceRatedKw,
  extractDeviceSolarPowerWatts,
  getSingleInverterStationView,
  getSnLiveOverlay,
} from '@/lib/deye-client';
import { isValidInverterSn } from '@/lib/telemetry-cache';

const log = createLogger('StationRoute');

export const stationQuerySchema = z.object({
  station_id: z.string().min(1).max(64).optional(),
  stationId: z.string().min(1).max(64).optional(),
  accountId: z.string().min(1).max(64).optional(),
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
      keyPrefix: 'read_station',
      maxRequests: RATE_LIMIT_CONFIGS.READ_STATIONS.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_STATIONS.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const parsed = stationQuerySchema.safeParse({
      station_id: searchParams.get('station_id') || undefined,
      stationId: searchParams.get('stationId') || undefined,
      accountId: searchParams.get('accountId') || undefined,
      device_sn: searchParams.get('device_sn') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const stationId = parsed.data.station_id || parsed.data.stationId || undefined;
    const accountId = parsed.data.accountId || undefined;
    const deviceSn = parsed.data.device_sn?.trim() || undefined;

    const tenantCheck = enforceTenantAccess(session, accountId);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        { error: tenantCheck.error || 'Access denied' },
        { status: tenantCheck.status || 403 }
      );
    }

    try {
      const client = accountManager.getClient(tenantCheck.targetAccountId);
      if (!client) {
        return NextResponse.json(
          {
            error: tenantCheck.targetAccountId
              ? `Account "${tenantCheck.targetAccountId}" not found`
              : 'No configured solar gateway account found',
          },
          { status: 404 }
        );
      }

      const result = await client.getStationSummary(stationId);
      const base = {
        ...result,
        accountId: client.accountId,
        accountName: client.accountName,
      };

      if (!deviceSn || deviceSn === 'ALL' || deviceSn === 'ALL_FLEET') {
        const targetPlants =
          stationId && stationId !== 'ALL'
            ? (client.plants || []).filter((p) => String(p.stationId) === String(stationId))
            : client.plants || [];
        const inverterSns = targetPlants
          .flatMap((p) => p.devices || [])
          .filter((d) => String(d.deviceType || '').toUpperCase() === 'INVERTER')
          .map((d) => d.deviceSn);

        const devices: Record<string, {
          liveSolarPowerKw: number;
          dailyYieldKwh: number;
          totalYieldKwh: number;
          ratedKw: number;
        }> = {};

        if (inverterSns.length > 0) {
          try {
            const batch = await client.getBatchDeviceLatest(inverterSns);
            const nowSec = Math.floor(Date.now() / 1000);
            for (const sn of inverterSns) {
              const devData = batch.get(sn);
              if (devData) {
                const collSec = parseFloat(devData.get('__collectionTime') || '0');
                const isStale = collSec > 0 && nowSec - collSec > 86400 * 2;
                const liveKw = !isStale
                  ? parseFloat((extractDeviceSolarPowerWatts(devData) / 1000).toFixed(2))
                  : 0;
                const dailyKwh = !isStale
                  ? extractDeviceDailyYieldKwh(devData)
                  : 0;
                const totalKwh = parseFloat(devData.get('TotalActiveProduction') || '0');
                const ratedKw = extractDeviceRatedKw(devData);
                devices[sn] = {
                  liveSolarPowerKw: liveKw,
                  dailyYieldKwh: dailyKwh,
                  totalYieldKwh: totalKwh,
                  ratedKw,
                };
              }
            }
          } catch (batchErr) {
            log.warn('Could not fetch batch device telemetry for station', { stationId, error: batchErr });
          }
        }

        return NextResponse.json({
          ...base,
          devices,
        });
      }

      if (!isValidInverterSn(client.plants, deviceSn)) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
      }

      const batch = await client.getBatchDeviceLatest([deviceSn]);
      const view = getSingleInverterStationView(result.data, batch, deviceSn);
      if (!view) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
      }

      const overlay = getSnLiveOverlay(view.raw);
      return NextResponse.json({
        ...base,
        deviceSn: view.deviceSn,
        liveSolarPowerKw: overlay.liveSolarPowerKw,
        todayEnergyKwh: overlay.todayEnergyKwh,
      });
    } catch (error) {
      log.error('Error retrieving station telemetry', error, { route: 'station', stationId });
      return NextResponse.json(
        { error: 'Failed to retrieve station telemetry' },
        { status: 500 }
      );
    }
  }
);

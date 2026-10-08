import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import { DeyeAccountConfig, PlantInfo, DeviceInfo } from '@/lib/types';
import { enforceTenantAccess, ACCOUNT_ID_REGEX } from '@/lib/session';
import { withGate, requireAdminSession, parseJsonBody } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('PlantsRoute');

export const deviceInfoSchema = z.object({
  deviceSn: z.string(),
  deviceType: z.enum(['INVERTER', 'LOGGER', 'METER', 'BATTERY']).default('INVERTER'),
  name: z.string().default('Inverter Unit'),
  model: z.string().optional(),
  ratedKw: z.number().optional(),
  loggerSn: z.string().optional(),
  status: z.enum(['ONLINE', 'STANDBY', 'FAULT', 'OFFLINE']).default('ONLINE'),
  lastSeen: z.string().optional(),
});

export const addPlantBodySchema = z.object({
  accountId: z.string().regex(ACCOUNT_ID_REGEX, 'Invalid account ID format'),
  plant: z.object({
    stationId: z.union([z.string(), z.number()]).transform(String),
    stationName: z.string().min(1, 'Field "stationName" is required'),
    installedCapacityKw: z.number().default(0),
    address: z.string().optional(),
    liveSolarPowerKw: z.number().optional(),
    dailyYieldKwh: z.number().optional(),
    gridPowerKw: z.number().optional(),
    consumptionPowerKw: z.number().optional(),
    devices: z.array(deviceInfoSchema).default([]),
  }),
});

export const GET = withGate(
  {
    rateLimit: {
      keyPrefix: 'read_plants',
      maxRequests: RATE_LIMIT_CONFIGS.READ_PLANTS.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_PLANTS.windowMs,
    },
  },
  async (req, { session }) => {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    // Consumer role is strictly restricted to their assigned account
    if (session.role === 'consumer') {
      if (!session.accountId) {
        return NextResponse.json(
          { error: 'Forbidden: Consumer account is not assigned to any solar station' },
          { status: 403 }
        );
      }
      if (accountId && accountId !== session.accountId && accountId !== 'ALL' && accountId !== 'ALL_FLEET') {
        const cleanSessionId = session.accountId.startsWith('station-')
          ? session.accountId.replace('station-', '')
          : session.accountId;
        const isMatch =
          accountId === cleanSessionId ||
          session.accountId === `station-${accountId}` ||
          accountId === `station-${session.accountId}`;

        if (!isMatch) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have permission to view plants for this account' },
            { status: 403 }
          );
        }
      }

      const rawAccounts: DeyeAccountConfig[] = accountManager.getAllRawAccounts();
      const cleanSessionId = session.accountId.startsWith('station-')
        ? session.accountId.replace('station-', '')
        : session.accountId;

      const target = rawAccounts.find(
        (a) =>
          a.id === session.accountId ||
          a.directusId === session.accountId ||
          (cleanSessionId && (a.directusId === cleanSessionId || a.id === cleanSessionId)) ||
          (session.email && a.email?.toLowerCase() === session.email.toLowerCase()) ||
          a.plants?.some(
            (p) =>
              String(p.stationId) === cleanSessionId ||
              `station-${p.stationId}` === session.accountId
          )
      );

      return NextResponse.json({
        accountId: target?.id || session.accountId,
        plants: target?.plants || [],
        total: target?.plants?.length || 0,
      });
    }

    try {
      const rawAccounts: DeyeAccountConfig[] = accountManager.getAllRawAccounts();

      if (accountId) {
        const tenantCheck = enforceTenantAccess(session, accountId);
        if (!tenantCheck.allowed) {
          return NextResponse.json(
            { error: tenantCheck.error || 'Access denied' },
            { status: tenantCheck.status || 403 }
          );
        }

        const target = rawAccounts.find((a) => a.id === tenantCheck.targetAccountId);
        if (!target) {
          return NextResponse.json(
            { error: `Account "${tenantCheck.targetAccountId}" not found` },
            { status: 404 }
          );
        }
        return NextResponse.json({
          accountId: target.id,
          plants: target.plants || [],
          total: target.plants?.length || 0,
        });
      }

      const allPlants = rawAccounts.flatMap((a: DeyeAccountConfig) =>
        (a.plants || []).map((p: PlantInfo) => ({
          ...p,
          accountId: a.id,
          accountName: a.name,
        }))
      );

      return NextResponse.json({
        total: allPlants.length,
        plants: allPlants,
      });
    } catch (error) {
      log.error('Error getting plants', error, { route: 'plants' });
      return NextResponse.json(
        { error: 'Failed to retrieve plants' },
        { status: 500 }
      );
    }
  }
);

export async function POST(req: Request) {
  const { errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
  }

  const jsonParsed = await parseJsonBody(req);
  if (!jsonParsed.ok) {
    return jsonParsed.errorResponse;
  }

  const parsed = addPlantBodySchema.safeParse(jsonParsed.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { accountId, plant } = parsed.data;
  const plantInfo: PlantInfo = {
    stationId: plant.stationId,
    stationName: plant.stationName,
    installedCapacityKw: plant.installedCapacityKw,
    address: plant.address,
    liveSolarPowerKw: plant.liveSolarPowerKw,
    dailyYieldKwh: plant.dailyYieldKwh,
    gridPowerKw: plant.gridPowerKw,
    consumptionPowerKw: plant.consumptionPowerKw,
    devices: plant.devices as DeviceInfo[],
  };

  try {
    const result = await accountManager.addPlant(accountId, plantInfo);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Error adding plant', error, { route: 'plants', accountId });
    return NextResponse.json(
      { error: 'Failed to add plant' },
      { status: 500 }
    );
  }
}

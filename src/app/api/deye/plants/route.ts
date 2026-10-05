import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { DeyeAccountConfig, PlantInfo } from '@/lib/types';
import { verifySessionToken, SESSION_COOKIE_NAME, enforceTenantAccess } from '@/lib/session';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('accountId');

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  // If consumer role, strictly restrict to their assigned account
  if (session?.role === 'consumer') {
    if (!session.accountId) {
      return NextResponse.json(
        { error: 'Forbidden: Consumer account is not assigned to any solar station' },
        { status: 403 }
      );
    }
    if (accountId && accountId !== session.accountId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to view plants for this account' },
        { status: 403 }
      );
    }
    const rawAccounts: DeyeAccountConfig[] = accountManager.getAllRawAccounts();
    const target = rawAccounts.find((a) => a.id === session.accountId);
    return NextResponse.json({
      accountId: session.accountId,
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
    console.error('[PlantsRoute] Error getting plants:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve plants' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin privileges required to add plants' },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const { accountId, plant } = body || {};

  if (!accountId || !plant || !plant.stationId || !plant.stationName) {
    return NextResponse.json(
      { error: 'Fields "accountId" and "plant" with "stationId" & "stationName" are required' },
      { status: 400 }
    );
  }

  try {
    const result = await accountManager.addPlant(accountId, plant);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[PlantsRoute] Error adding plant:', error);
    return NextResponse.json(
      { error: 'Failed to add plant' },
      { status: 500 }
    );
  }
}

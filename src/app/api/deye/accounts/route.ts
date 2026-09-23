import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceSync = searchParams.get('sync') === 'true' || searchParams.get('force') === 'true';
    const accounts = await accountManager.getAccountsSummary(forceSync);
    const directus = accountManager.getDirectusHealth();
    return NextResponse.json({
      total: accounts.length,
      accounts,
      directus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve multi-account status', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, appId, appSecret, email, password } = body;

    if (!name || !appId || !appSecret || !email || !password) {
      return NextResponse.json(
        { error: 'Fields "name", "appId", "appSecret", "email", and "password" are required' },
        { status: 400 }
      );
    }

    const result = await accountManager.addAccount(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add account and discover plants', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Field "id" is required to update account' },
        { status: 400 }
      );
    }

    const result = await accountManager.updateAccount(id, updates);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update account', details: String(error) },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Query parameter "id" is required to delete account' },
        { status: 400 }
      );
    }

    const result = await accountManager.deleteAccount(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete account', details: String(error) },
      { status: 500 }
    );
  }
}

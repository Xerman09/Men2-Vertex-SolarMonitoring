import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin privileges required to sync accounts' },
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

  const { accountId } = body || {};

  if (!accountId) {
    return NextResponse.json(
      { error: 'Field "accountId" is required' },
      { status: 400 }
    );
  }

  try {
    const result = await accountManager.syncAccount(accountId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[SyncRoute] Failed syncing account:', error);
    return NextResponse.json(
      { error: 'Failed to sync account plants' },
      { status: 500 }
    );
  }
}

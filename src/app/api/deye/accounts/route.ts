import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accountManager } from '@/lib/account-manager';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { isValidDeyeBaseUrl } from '@/lib/url-validator';

import { checkRateLimit } from '@/lib/rate-limit';

async function requireAdminSession(req?: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session || session.role !== 'admin') {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Administrator privileges required for solar gateway account modifications' },
        { status: 401 }
      ),
    };
  }

  if (req) {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rate = checkRateLimit(`account_mutation_${clientIp}_${session.userId}`, 20, 60 * 1000);
    if (!rate.success) {
      return {
        session: null,
        errorResponse: NextResponse.json(
          { error: 'Too many account modification requests. Rate limit is 20 requests per minute.' },
          { status: 429 }
        ),
      };
    }
  }

  return { session, errorResponse: null };
}

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
    console.error('[AccountsRoute] Failed getting accounts summary:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve multi-account status' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const { session, errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
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

  const { name, appId, appSecret, email, password, baseUrl } = body || {};

  if (!name || !appId || !appSecret || !email || !password) {
    return NextResponse.json(
      { error: 'Fields "name", "appId", "appSecret", "email", and "password" are required' },
      { status: 400 }
    );
  }

  // SSRF prevention: ensure target baseUrl is valid
  if (baseUrl && !isValidDeyeBaseUrl(baseUrl)) {
    return NextResponse.json(
      {
        error:
          'Invalid or prohibited baseUrl. Must be an approved HTTPS DeyeCloud developer endpoint (e.g. https://api.deyecloud.com).',
      },
      { status: 400 }
    );
  }

  try {
    const result = await accountManager.addAccount(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[AccountsRoute] Failed adding account:', error);
    return NextResponse.json(
      { error: 'Failed to add account and discover plants' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const { session, errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
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

  const { id, ...updates } = body || {};

  if (!id) {
    return NextResponse.json(
      { error: 'Field "id" is required to update account' },
      { status: 400 }
    );
  }

  if (updates.baseUrl && !isValidDeyeBaseUrl(updates.baseUrl)) {
    return NextResponse.json(
      {
        error: 'Invalid or prohibited baseUrl. Must be an approved HTTPS DeyeCloud endpoint.',
      },
      { status: 400 }
    );
  }

  try {
    const result = await accountManager.updateAccount(id, updates);
    if (!result.success) {
      return NextResponse.json({ error: `Account "${id}" not found` }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[AccountsRoute] Failed updating account:', error);
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;

export async function DELETE(req: Request) {
  const { session, errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
  }

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
    if (!result.success) {
      return NextResponse.json({ error: `Account "${id}" not found` }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[AccountsRoute] Failed deleting account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}

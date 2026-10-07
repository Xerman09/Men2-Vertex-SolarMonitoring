import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager } from '@/lib/account-manager';
import { ACCOUNT_ID_REGEX } from '@/lib/session';
import { isValidDeyeBaseUrl } from '@/lib/url-validator';
import { withGate, requireAdminSession } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';

export const addAccountSchema = z.object({
  name: z.string().min(1, 'Field "name" is required'),
  appId: z.string().min(1, 'Field "appId" is required'),
  appSecret: z.string().min(1, 'Field "appSecret" is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Field "password" is required'),
  baseUrl: z.string().optional(),
  defaultStationId: z.string().optional(),
  defaultDeviceSn: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const updateAccountSchema = z.object({
  id: z.string().regex(ACCOUNT_ID_REGEX, 'Valid alphanumeric "id" is required to update account'),
  name: z.string().optional(),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
  baseUrl: z.string().optional(),
  defaultStationId: z.string().optional(),
  defaultDeviceSn: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const GET = withGate(
  {
    rateLimit: {
      keyPrefix: 'read_accounts',
      maxRequests: RATE_LIMIT_CONFIGS.READ_ACCOUNTS.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.READ_ACCOUNTS.windowMs,
    },
  },
  async (req, { session }) => {
    try {
      const { searchParams } = new URL(req.url);
      const forceSync = searchParams.get('sync') === 'true' || searchParams.get('force') === 'true';
      const accounts = await accountManager.getAccountsSummary(forceSync);
      const directus = accountManager.getDirectusHealth();

      // Consumer role is strictly scoped to their assigned account metadata
      if (session.role === 'consumer') {
        const consumerAccounts = session.accountId
          ? accounts.filter((a) => a.id === session.accountId)
          : [];
        return NextResponse.json({
          total: consumerAccounts.length,
          accounts: consumerAccounts,
        });
      }

      // Admin & Viewer roles receive registered accounts and Directus sync status
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
);

export async function POST(req: Request) {
  const { errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = addAccountSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // SSRF prevention: ensure target baseUrl is valid
  if (data.baseUrl && !isValidDeyeBaseUrl(data.baseUrl)) {
    return NextResponse.json(
      {
        error:
          'Invalid or prohibited baseUrl. Must be an approved HTTPS DeyeCloud developer endpoint (e.g. https://api.deyecloud.com).',
      },
      { status: 400 }
    );
  }

  try {
    const result = await accountManager.addAccount(data);
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
  const { errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = updateAccountSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { id, ...updates } = parsed.data;

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
  const { errorResponse } = await requireAdminSession(req);
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || !ACCOUNT_ID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Valid alphanumeric query parameter "id" is required to delete account' },
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

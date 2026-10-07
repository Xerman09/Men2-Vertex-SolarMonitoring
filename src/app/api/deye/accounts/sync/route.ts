import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';
import { withGate, parseJsonBody } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('SyncRoute');

export const POST = withGate(
  {
    requireRole: 'admin',
    rateLimit: {
      keyPrefix: 'sync_account',
      maxRequests: RATE_LIMIT_CONFIGS.SYNC_ACCOUNT.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.SYNC_ACCOUNT.windowMs,
    },
  },
  async (req) => {
    const jsonParsed = await parseJsonBody<{ accountId?: string }>(req);
    if (!jsonParsed.ok) {
      return jsonParsed.errorResponse;
    }

    const { accountId } = jsonParsed.data || {};

    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json(
        { error: 'Field "accountId" is required' },
        { status: 400 }
      );
    }

    try {
      const result = await accountManager.syncAccount(accountId);
      return NextResponse.json(result);
    } catch (error) {
      log.error('Failed syncing account', error, { route: 'sync', accountId });
      return NextResponse.json(
        { error: 'Failed to sync account plants' },
        { status: 500 }
      );
    }
  }
);

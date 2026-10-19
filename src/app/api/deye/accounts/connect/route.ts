import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager, COLLECTIONS } from '@/lib/account-manager';
import { DeyeCloudClient } from '@/lib/deye-client';
import { isValidDeyeBaseUrl, sanitizeDeyeBaseUrl } from '@/lib/url-validator';
import { withGate, parseJsonBody } from '@/lib/gate';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { createSessionToken, applySessionCookies } from '@/lib/session';

const log = createLogger('AccountsConnectRoute');

export const connectAccountSchema = z.object({
  name: z.string().trim().max(100).optional(),
  appId: z.string().trim().min(1, 'DeyeCloud App ID is required'),
  appSecret: z.string().trim().min(1, 'DeyeCloud App Secret is required'),
  email: z.string().trim().email('Valid DeyeCloud account email is required'),
  password: z.string().min(1, 'DeyeCloud account password is required'),
  baseUrl: z.string().trim().optional(),
});

export const POST = withGate(
  {
    rateLimit: {
      keyPrefix: 'account_connect',
      maxRequests: RATE_LIMIT_CONFIGS.AUTH_LOGIN.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.AUTH_LOGIN.windowMs,
    },
  },
  async (req, { session }) => {
    // 1. Session check: user must be authenticated
    if (!session || (session.role !== 'consumer' && session.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required to link a DeyeCloud solar account' },
        { status: 401 }
      );
    }

    const jsonParsed = await parseJsonBody(req);
    if (!jsonParsed.ok) {
      return jsonParsed.errorResponse;
    }

    const parsed = connectAccountSchema.safeParse(jsonParsed.data);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const targetBaseUrl = data.baseUrl?.trim() || 'https://api.deyecloud.com';

    // 2. SSRF Protection: ensure target baseUrl is valid
    if (!isValidDeyeBaseUrl(targetBaseUrl)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid or prohibited API endpoint. Must be an approved HTTPS DeyeCloud endpoint (e.g. https://api.deyecloud.com).',
        },
        { status: 400 }
      );
    }

    const safeBaseUrl = sanitizeDeyeBaseUrl(targetBaseUrl);

    try {
      log.info('Testing DeyeCloud credentials and discovering plants for user', {
        userId: session.userId,
        email: data.email,
      });

      // 3. Test credentials and auto-discover plants with DeyeCloud
      const testAccountConfig = {
        id: `probe-${Date.now()}`,
        name: data.name || data.email,
        enabled: true,
        baseUrl: safeBaseUrl,
        appId: data.appId,
        appSecret: data.appSecret,
        email: data.email,
        password: data.password,
      };

      const probeClient = new DeyeCloudClient(testAccountConfig);
      let discovery;
      try {
        discovery = await probeClient.discoverPlantsAndDevices();
      } catch (probeErr: unknown) {
        const msg = probeErr instanceof Error ? probeErr.message : String(probeErr);
        log.warn('DeyeCloud connection probe failed', { userId: session.userId }, probeErr);
        return NextResponse.json(
          {
            success: false,
            error: `Failed to authenticate with DeyeCloud: ${msg}. Please check your App ID, App Secret, Email, and Password.`,
          },
          { status: 400 }
        );
      }

      // 4. Save account with userId attached and skipUserCreation
      const addResult = await accountManager.addAccount({
        name: data.name?.trim() || `Solar Site (${data.email})`,
        appId: data.appId,
        appSecret: data.appSecret,
        email: data.email,
        password: data.password,
        baseUrl: safeBaseUrl,
        userId: session.userId,
        skipUserCreation: true, // Do not overwrite existing portal user password
        plants: discovery.plants,
        enabled: true,
      });

      // 5. Persist plant permissions linking session.userId to each discovered station
      if (addResult.account.plants && addResult.account.plants.length > 0) {
        for (const plant of addResult.account.plants) {
          try {
            await accountManager.createItem(COLLECTIONS.PERMISSIONS, {
              user_id: session.userId,
              station_id: plant.stationId,
              can_control: 1,
              can_view_financials: 1,
            });
          } catch (permErr) {
            log.warn('Non-fatal: failed writing station permission', { stationId: plant.stationId }, permErr);
          }
        }
      }

      // 6. Issue updated session cookie with accountId attached
      const primaryStationId = addResult.account.plants?.[0]?.stationId;
      const updatedSessionToken = await createSessionToken({
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        accountId: addResult.account.id,
      });

      const response = NextResponse.json(
        {
          success: true,
          message: 'DeyeCloud account linked successfully!',
          account: addResult.account,
          plantsDiscovered: addResult.plantsDiscovered,
          devicesDiscovered: addResult.devicesDiscovered,
          defaultStationId: primaryStationId,
        },
        { status: 201 }
      );

      applySessionCookies(response, updatedSessionToken, req);

      log.info('DeyeCloud account connected successfully', {
        userId: session.userId,
        accountId: addResult.account.id,
        plants: addResult.plantsDiscovered,
        devices: addResult.devicesDiscovered,
      });

      return response;
    } catch (error) {
      log.error('Failed to link DeyeCloud account', error, { route: 'accounts/connect' });
      return NextResponse.json(
        { success: false, error: 'Internal error linking DeyeCloud account. Please try again.' },
        { status: 500 }
      );
    }
  }
);

import { NextResponse } from 'next/server';
import { accountManager, COLLECTIONS } from '@/lib/account-manager';
import { SolarUser, SolarUserStationPermission } from '@/lib/types';
import { verifyPassword } from '@/lib/auth-crypto';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { withGate, parseJsonBody } from '@/lib/gate';
import { createLogger } from '@/lib/logger';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  HOST_SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SECONDS,
} from '@/lib/session';
import { env } from '@/lib/env';

const log = createLogger('AuthRole');

function applySessionCookies(response: NextResponse, token: string, req: Request) {
  const isHttps =
    req.headers.get('x-forwarded-proto') === 'https' ||
    req.url.startsWith('https:') ||
    env.NODE_ENV === 'production';

  const cookieOptions = {
    value: token,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: DEFAULT_SESSION_TTL_SECONDS,
  };

  response.cookies.set({ name: SESSION_COOKIE_NAME, ...cookieOptions });
  if (isHttps) {
    response.cookies.set({ name: HOST_SESSION_COOKIE_NAME, ...cookieOptions });
  }
}

export const POST = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'auth_login',
      maxRequests: RATE_LIMIT_CONFIGS.AUTH_LOGIN.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.AUTH_LOGIN.windowMs,
    },
  },
  async (req) => {
    const jsonParsed = await parseJsonBody<{ email?: string; password?: string }>(req);
    if (!jsonParsed.ok) {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    const { email, password } = jsonParsed.data || {};
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Username/Email and password are required' },
        { status: 400 }
      );
    }

  const inputIdentifier = String(email).trim().toLowerCase();
  const inputPassword = String(password).trim();

  try {
    // 0. Check Master Admin PIN override if configured
    if (
      (inputIdentifier === 'admin' || inputIdentifier === 'root') &&
      env.ADMIN_ACCESS_PIN &&
      verifyPassword(inputPassword, env.ADMIN_ACCESS_PIN)
    ) {
      const user = {
        id: 'master-admin',
        email: 'admin@solar.local',
        name: 'Master Operations Administrator',
        role: 'admin' as const,
      };
      const sessionToken = await createSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: 'admin',
      });

      const response = NextResponse.json({
        success: true,
        role: 'admin',
        user,
      });

      applySessionCookies(response, sessionToken, req);

      return response;
    }

    // 1. Check normalized table: iot_solar_users
    try {
      const users = await accountManager.fetchCollection<SolarUser>(COLLECTIONS.USERS);
      if (users && users.length > 0) {
        const matchedUser = users.find((u) => {
          const uEmail = (u.email || '').trim().toLowerCase();
          const uName = (u.username || '').trim().toLowerCase();
          const matchesIdent = uEmail === inputIdentifier || uName === inputIdentifier;
          return matchesIdent && verifyPassword(inputPassword, u.password_hash || '');
        });

        if (matchedUser) {
          const isAdmin =
            matchedUser.role === 'admin' ||
            matchedUser.email.toLowerCase() === 'admin' ||
            matchedUser.username.toLowerCase() === 'admin';

          let assignedStationId: string | undefined;
          try {
            const perms = await accountManager.fetchCollection<SolarUserStationPermission>(
              COLLECTIONS.PERMISSIONS,
              `?filter[user_id][_eq]=${encodeURIComponent(String(matchedUser.id))}`
            );
            if (perms && perms.length > 0) {
              assignedStationId = perms[0].station_id;
            }
          } catch (permErr) {
            log.warn('Permissions lookup non-fatal', { userId: matchedUser.id }, permErr);
          }

          const role = isAdmin ? ('admin' as const) : ('consumer' as const);
          const user = {
            id: matchedUser.id,
            email: matchedUser.email,
            name: matchedUser.full_name || matchedUser.username || (isAdmin ? 'Admin' : 'Customer'),
            role,
            accountId: assignedStationId ? `station-${assignedStationId}` : String(matchedUser.id),
            stationId: assignedStationId,
          };

          const sessionToken = await createSessionToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role,
            accountId: user.accountId,
          });

          const response = NextResponse.json({
            success: true,
            role,
            user,
          });

          applySessionCookies(response, sessionToken, req);

          return response;
        }
      }
    } catch (dbErr) {
      log.warn('iot_solar_users lookup failed, falling back to legacy accounts', {}, dbErr);
    }

    // 2. Fallback to legacy iot_solar_accounts or local cache
    let records = await accountManager.fetchFromDirectus();
    if (!records || records.length === 0) {
      records = accountManager.getAllRawAccounts(true);
    }

    const matched = records.find((row) => {
      const rowEmail = (row.email || '').trim().toLowerCase();
      const rowName = (row.name || '').trim().toLowerCase();
      const matchesIdent = rowEmail === inputIdentifier || rowName === inputIdentifier;
      return matchesIdent && verifyPassword(inputPassword, row.password || '');
    });

    if (!matched) {
      return NextResponse.json(
        { success: false, error: 'Invalid username/email or password.' },
        { status: 401 }
      );
    }

    const hasAdminPrivilege = Boolean(
      matched.admin === true ||
      matched.admin === 1 ||
      matched.admin === 'true' ||
      matched.admin === '1' ||
      matched.is_admin === true ||
      matched.is_admin === 1 ||
      matched.is_admin === 'true' ||
      matched.is_admin === '1' ||
      (matched.email && matched.email.trim().toLowerCase() === 'admin')
    );

    const role = hasAdminPrivilege ? ('admin' as const) : ('consumer' as const);
    const user = {
      id: matched.id,
      email: matched.email || matched.name,
      name: matched.name || matched.email || (hasAdminPrivilege ? 'Admin' : 'Customer'),
      role,
      accountId: String(matched.id),
    };

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      accountId: user.accountId,
    });

    const response = NextResponse.json({
      success: true,
      role,
      user,
    });

    applySessionCookies(response, sessionToken, req);

    return response;
  } catch (error) {
    log.error('Authentication error', error, { route: 'auth/role' });
    return NextResponse.json(
      { success: false, error: 'Authentication service error. Please try again.' },
      { status: 500 }
    );
  }
}
);

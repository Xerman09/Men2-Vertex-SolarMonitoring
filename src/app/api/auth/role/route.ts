import { NextResponse } from 'next/server';
import { accountManager, COLLECTIONS } from '@/lib/account-manager';
import { SolarUser, SolarUserStationPermission } from '@/lib/types';
import { verifyPassword } from '@/lib/auth-crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { env } from '@/lib/env';

export async function POST(req: Request) {
  // IP-based Rate limiting (10 attempts per minute per IP)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = `auth_login_${clientIp}`;
  const rateLimit = checkRateLimit(rateLimitKey, 10, 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, error: 'Too many authentication attempts. Please try again later.' },
      { status: 429 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const { email, password } = body;
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

      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 3600,
      });

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
              `?filter[user_id][_eq]=${matchedUser.id}`
            );
            if (perms && perms.length > 0) {
              assignedStationId = perms[0].station_id;
            }
          } catch {
            // Permissions lookup non-fatal
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

          response.cookies.set({
            name: SESSION_COOKIE_NAME,
            value: sessionToken,
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 3600,
          });

          return response;
        }
      }
    } catch (dbErr) {
      console.warn('[AuthRole] iot_solar_users lookup failed, falling back to legacy accounts:', dbErr);
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

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });

    return response;
  } catch (error) {
    console.error('[AuthRole] Authentication error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication service error. Please try again.' },
      { status: 500 }
    );
  }
}

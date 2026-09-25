import { NextResponse } from 'next/server';
import { accountManager, COLLECTIONS } from '@/lib/account-manager';
import { SolarUser, SolarUserStationPermission } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Username/Email and password are required' },
        { status: 400 }
      );
    }

    const inputIdentifier = String(email).trim().toLowerCase();
    const inputPassword = String(password).trim();

    // 1. First, check normalized table: iot_solar_users
    try {
      const users = await accountManager.fetchCollection<SolarUser>(COLLECTIONS.USERS);
      if (users && users.length > 0) {
        const matchedUser = users.find((u) => {
          const uEmail = (u.email || '').trim().toLowerCase();
          const uName = (u.username || '').trim().toLowerCase();
          return (uEmail === inputIdentifier || uName === inputIdentifier) &&
                 String(u.password_hash || '').trim() === inputPassword;
        });

        if (matchedUser) {
          const isAdmin = matchedUser.role === 'admin' || 
                          matchedUser.email.toLowerCase() === 'admin' || 
                          matchedUser.username.toLowerCase() === 'admin';

          // Check permissions table for assigned stations
          let assignedStationId: string | undefined;
          try {
            const perms = await accountManager.fetchCollection<SolarUserStationPermission>(
              COLLECTIONS.PERMISSIONS,
              `?filter[user_id][_eq]=${matchedUser.id}`
            );
            if (perms && perms.length > 0) {
              assignedStationId = perms[0].station_id;
            }
          } catch (e) {
            // Permissions lookup non-fatal
          }

          if (isAdmin) {
            return NextResponse.json({
              success: true,
              role: 'admin',
              user: {
                id: matchedUser.id,
                email: matchedUser.email,
                name: matchedUser.full_name || matchedUser.username || 'Admin',
                role: 'admin',
              },
            });
          }

          return NextResponse.json({
            success: true,
            role: 'consumer',
            user: {
              id: matchedUser.id,
              email: matchedUser.email,
              name: matchedUser.full_name || matchedUser.username || 'Customer',
              role: 'consumer',
              accountId: assignedStationId ? `station-${assignedStationId}` : String(matchedUser.id),
              stationId: assignedStationId,
            },
          });
        }
      }
    } catch (dbErr) {
      console.warn('[AuthRole] iot_solar_users lookup failed, falling back to legacy accounts:', dbErr);
    }

    // 2. Fallback to legacy iot_solar_accounts or local cache
    let records: any[] | null = await accountManager.fetchFromDirectus();
    if (!records || records.length === 0) {
      records = accountManager.getAllRawAccounts(true);
    }

    const matched = records.find((row) => {
      const rowEmail = (row.email || '').trim().toLowerCase();
      const rowName = (row.name || '').trim().toLowerCase();
      return (rowEmail === inputIdentifier || rowName === inputIdentifier) && String(row.password || '').trim() === inputPassword;
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

    if (hasAdminPrivilege) {
      return NextResponse.json({
        success: true,
        role: 'admin',
        user: {
          id: matched.id,
          email: matched.email || matched.name,
          name: matched.name || matched.email || 'Admin',
          role: 'admin',
        },
      });
    }

    return NextResponse.json({
      success: true,
      role: 'consumer',
      user: {
        id: matched.id,
        email: matched.email || matched.name,
        name: matched.name || matched.email || 'Customer',
        role: 'consumer',
        accountId: String(matched.id),
      },
    });
  } catch (error: any) {
    console.error('[AuthRole] Database authentication error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication service error. Please try again.' },
      { status: 500 }
    );
  }
}

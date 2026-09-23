import { NextResponse } from 'next/server';
import { accountManager } from '@/lib/account-manager';

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

    // 1. Fetch live records from the database table (or fallback to cache)
    let records: any[] | null = await accountManager.fetchFromDirectus();
    if (!records || records.length === 0) {
      // Fallback to local accounts cache
      records = accountManager.getAllRawAccounts(true);
    }

    // 2. Find matching account by email or username
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

    // 3. Verify admin privilege
    // Accepts admin: true/1/'true', is_admin: true/1/'true', or username 'admin'
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

    // 4. Consumer / Customer Account
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

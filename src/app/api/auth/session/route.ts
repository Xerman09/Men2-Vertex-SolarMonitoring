import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionCookie);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      role: 'viewer',
      user: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    role: session.role,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      accountId: session.accountId,
    },
  });
}

export async function POST() {
  // Logout endpoint: clear session cookie
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}

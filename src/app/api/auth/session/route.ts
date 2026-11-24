import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  HOST_SESSION_COOKIE_NAME,
  extractSessionToken,
} from '@/lib/session';

import { withGate } from '@/lib/gate';

export const GET = withGate(
  {
    allowUnauthenticated: true,
  },
  async (_req, { session }) => {
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
);

export async function POST(req: Request) {
  // Logout endpoint: clear session cookies
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  const isHttps =
    req.headers.get('x-forwarded-proto') === 'https' ||
    req.url.startsWith('https:') ||
    process.env.NODE_ENV === 'production';

  const clearOptions = {
    value: '',
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };

  response.cookies.set({ name: SESSION_COOKIE_NAME, ...clearOptions });
  if (isHttps) {
    response.cookies.set({ name: HOST_SESSION_COOKIE_NAME, ...clearOptions });
  }
  return response;
}

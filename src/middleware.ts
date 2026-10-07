import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, extractSessionToken } from './lib/session';
import { createLogger } from './lib/logger';

const log = createLogger('Middleware');

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // 1. CSRF Protection for state-changing API requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/')) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');

    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        // Compare origin host to host header
        if (originUrl.host !== host) {
          log.warn(`[CSRF Block] Origin mismatch: ${originUrl.host} vs ${host}`, {
            originHost: originUrl.host,
            reqHost: host,
          });
          return NextResponse.json(
            { error: 'Cross-origin request blocked' },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid origin header' },
          { status: 400 }
        );
      }
    }
  }

  // 2. Control Inverter API Protection
  if (pathname.startsWith('/api/deye/control')) {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session || (session.role !== 'admin' && session.role !== 'consumer')) {
      return NextResponse.json(
        { error: 'Authentication required to execute inverter hardware commands' },
        { status: 401 }
      );
    }
  }

  // 3. Multi-Account Management API Protection (Mutations & Sync)
  if (
    (pathname.startsWith('/api/deye/accounts') && ['POST', 'PUT', 'DELETE'].includes(method)) ||
    pathname.startsWith('/api/deye/accounts/sync')
  ) {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Administrator privileges required for solar gateway account modifications' },
        { status: 403 }
      );
    }
  }

  // 4. Protected Page Routes
  if (pathname.startsWith('/accounts') || pathname.startsWith('/api-diagnostics')) {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/deye/:path*',
    '/accounts/:path*',
    '/api-diagnostics/:path*',
  ],
};

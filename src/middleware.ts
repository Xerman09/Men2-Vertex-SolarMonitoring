import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, extractSessionToken } from './lib/session';
import { createLogger } from './lib/logger';

const log = createLogger('Middleware');

function applyCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  // Allow all origins: mirror back origin or '*'
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;
  const requestOrigin = req.headers.get('origin');

  // Handle CORS Preflight requests for API routes
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), requestOrigin);
  }

  // 1. CSRF Protection for state-changing API requests
  // TEMPORARY: Allowed origins set to all (set to false to restore strict origin check)
  const TEMPORARILY_ALLOW_ALL_ORIGINS = true;

  if (!TEMPORARILY_ALLOW_ALL_ORIGINS && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/')) {
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
          return applyCorsHeaders(
            NextResponse.json(
              { error: 'Cross-origin request blocked' },
              { status: 403 }
            ),
            origin
          );
        }
      } catch {
        return applyCorsHeaders(
          NextResponse.json(
            { error: 'Invalid origin header' },
            { status: 400 }
          ),
          origin
        );
      }
    }
  }

  // 2. Control Inverter API Protection
  if (pathname.startsWith('/api/deye/control')) {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session || (session.role !== 'admin' && session.role !== 'consumer')) {
      return applyCorsHeaders(
        NextResponse.json(
          { error: 'Authentication required to execute inverter hardware commands' },
          { status: 401 }
        ),
        requestOrigin
      );
    }
  }

  // 3. Multi-Account Management API Protection (Mutations & Sync)
  if (
    (pathname.startsWith('/api/deye/accounts') &&
      !pathname.startsWith('/api/deye/accounts/connect') &&
      ['POST', 'PUT', 'DELETE'].includes(method)) ||
    pathname.startsWith('/api/deye/accounts/sync')
  ) {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session || session.role !== 'admin') {
      return applyCorsHeaders(
        NextResponse.json(
          { error: 'Administrator privileges required for solar gateway account modifications' },
          { status: 403 }
        ),
        requestOrigin
      );
    }
  }

  // 3.5. Customer Direct DeyeCloud Account Link (Model 3)
  if (pathname.startsWith('/api/deye/accounts/connect') && method === 'POST') {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session || (session.role !== 'admin' && session.role !== 'consumer')) {
      return applyCorsHeaders(
        NextResponse.json(
          { error: 'Authentication required to link DeyeCloud account' },
          { status: 401 }
        ),
        requestOrigin
      );
    }
  }

  // 4. Protected Page Routes
  if (pathname.startsWith('/accounts') || pathname.startsWith('/api-diagnostics') || pathname.startsWith('/fleet')) {
    const token = extractSessionToken(req.cookies);
    const session = await verifySessionToken(token);

    if (!session) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return applyCorsHeaders(NextResponse.next(), requestOrigin);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/accounts/:path*',
    '/api-diagnostics/:path*',
    '/fleet/:path*',
    '/fleet',
  ],
};

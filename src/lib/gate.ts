import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  extractSessionToken,
  verifySessionToken,
  SessionData,
  requireAuthenticatedSession,
} from './session';
import { checkRateLimit, RATE_LIMIT_CONFIGS, RATE_LIMIT_WINDOW_S, ONE_MINUTE_MS } from './rate-limit';

export { RATE_LIMIT_WINDOW_S };

export interface GateRateLimitOptions {
  keyPrefix: string;
  maxRequests: number;
  windowMs?: number;
}

export interface GateOptions {
  rateLimit?: GateRateLimitOptions;
  roles?: ('admin' | 'consumer' | 'viewer')[];
  requireRole?: 'admin' | 'consumer' | 'viewer';
  allowUnauthenticated?: boolean;
}

export interface GateContext<S = SessionData> {
  session: S;
  clientIp: string;
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Standardized 429 response helper with Retry-After header
 */
export function standard429(
  maxRequests: number = 60,
  resetAt?: number,
  customMessage?: string
): NextResponse {
  const retryAfter = resetAt
    ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    : RATE_LIMIT_WINDOW_S;
  return NextResponse.json(
    { error: customMessage || `Rate limit exceeded: Maximum ${maxRequests} requests per minute.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

/**
 * Safe JSON body extraction with uniform 400 error response on parse failure
 */
export async function parseJsonBody<T = unknown>(
  req: Request
): Promise<{ ok: true; data: T } | { ok: false; errorResponse: NextResponse }> {
  try {
    const data = (await req.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      errorResponse: NextResponse.json(
        { error: 'Malformed JSON payload' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Standardized session extraction and verification helper
 */
export async function getSessionFromCookies(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = extractSessionToken(cookieStore);
  return verifySessionToken(token);
}

/**
 * Unified admin session check with rate limiting for mutation endpoints
 */
export async function requireAdminSession(req?: Request): Promise<{
  session: SessionData | null;
  errorResponse: NextResponse | null;
}> {
  const session = await getSessionFromCookies();
  if (!session || session.role !== 'admin') {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Administrator privileges required for solar gateway account modifications' },
        { status: 401 }
      ),
    };
  }

  if (req) {
    const clientIp = getClientIp(req);
    const rate = checkRateLimit(
      `account_mutation_${clientIp}_${session.userId}`,
      RATE_LIMIT_CONFIGS.ACCOUNT_MUTATION.maxRequests,
      RATE_LIMIT_CONFIGS.ACCOUNT_MUTATION.windowMs
    );
    if (!rate.success) {
      return {
        session: null,
        errorResponse: standard429(
          RATE_LIMIT_CONFIGS.ACCOUNT_MUTATION.maxRequests,
          rate.resetAt,
          'Too many account modification requests. Rate limit is 20 requests per minute.'
        ),
      };
    }
  }

  return { session, errorResponse: null };
}

/**
 * Higher-order function wrapping API route handlers with unified rate limiting,
 * __Host- cookie session verification, and role-based access checks.
 */
export function withGate<TArgs extends unknown[] = unknown[]>(
  options: GateOptions & { allowUnauthenticated: true },
  handler: (
    req: Request,
    ctx: GateContext<SessionData | null>,
    ...args: TArgs
  ) => Promise<Response> | Response
): (req: Request, ...args: TArgs) => Promise<Response>;

export function withGate<TArgs extends unknown[] = unknown[]>(
  options: GateOptions,
  handler: (
    req: Request,
    ctx: GateContext<SessionData>,
    ...args: TArgs
  ) => Promise<Response> | Response
): (req: Request, ...args: TArgs) => Promise<Response>;

export function withGate<TArgs extends unknown[] = unknown[]>(
  options: GateOptions,
  handler: (
    req: Request,
    ctx: GateContext<SessionData>,
    ...args: TArgs
  ) => Promise<Response> | Response
): (req: Request, ...args: TArgs) => Promise<Response> {
  return async (req: Request, ...args: TArgs): Promise<Response> => {
    const clientIp = getClientIp(req);

    // 1. IP Rate Limiting
    if (options.rateLimit) {
      const { keyPrefix, maxRequests, windowMs = ONE_MINUTE_MS } = options.rateLimit;
      const rate = checkRateLimit(`${keyPrefix}_${clientIp}`, maxRequests, windowMs);
      if (!rate.success) {
        return standard429(maxRequests, rate.resetAt);
      }
    }

    // 2. Session verification
    const session = await getSessionFromCookies();
    if (!options.allowUnauthenticated) {
      const authCheck = requireAuthenticatedSession(session, options.requireRole);
      if (!authCheck.allowed || !session) {
        return NextResponse.json(
          { error: authCheck.error || 'Authentication required to access solar monitoring resources' },
          { status: authCheck.status }
        );
      }

      // 3. Optional multi-role filtering
      if (options.roles && !options.roles.includes(session.role)) {
        return NextResponse.json(
          { error: `Forbidden: Access restricted to [${options.roles.join(', ')}] roles` },
          { status: 403 }
        );
      }

      return handler(req, { session, clientIp }, ...args);
    }

    type UnauthHandler = (req: Request, ctx: GateContext<SessionData | null>, ...args: TArgs) => Promise<Response> | Response;
    return (handler as unknown as UnauthHandler)(req, { session, clientIp }, ...args);
  };
}

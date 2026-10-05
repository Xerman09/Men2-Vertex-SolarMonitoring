import { env } from './env';

export interface SessionData {
  userId: string | number;
  email: string;
  name?: string;
  role: 'admin' | 'consumer' | 'viewer';
  accountId?: string;
  exp: number; // Unix timestamp in seconds
}

export const SESSION_COOKIE_NAME = 'dsm_session';

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export const DEFAULT_SESSION_TTL_SECONDS = 12 * 3600; // 12 hours

/**
 * Sign session data into a compact HMAC-SHA256 token:
 * format: <payload_base64url>.<signature_base64url>
 */
export async function createSessionToken(
  data: Omit<SessionData, 'exp'>,
  expiresInSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload: SessionData = { ...data, exp };
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const enc = new TextEncoder();
  const key = await getHmacKey(env.SESSION_SECRET);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(encodedPayload));
  const signature = Buffer.from(signatureBuffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verify session token and return the payload if valid and unexpired
 */
export async function verifySessionToken(token?: string | null): Promise<SessionData | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  try {
    const enc = new TextEncoder();
    const key = await getHmacKey(env.SESSION_SECRET);

    let sigBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');
    while (sigBase64.length % 4) sigBase64 += '=';
    const sigBuffer = Buffer.from(sigBase64, 'base64');

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBuffer,
      enc.encode(encodedPayload)
    );

    if (!isValid) return null;

    const payloadJson = base64UrlDecode(encodedPayload);
    const data: SessionData = JSON.parse(payloadJson);

    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return data;
  } catch {
    return null;
  }
}

export interface TenantAccessResult {
  allowed: boolean;
  targetAccountId?: string;
  status?: number;
  error?: string;
}

/**
 * Enforces tenant boundary isolation between Admin, Consumer, and Viewer roles.
 */
export function enforceTenantAccess(
  session: SessionData | null,
  requestedAccountId?: string | null
): TenantAccessResult {
  // 1. Unauthenticated requests
  if (!session) {
    if (requestedAccountId) {
      return {
        allowed: false,
        status: 401,
        error: 'Authentication required to access account-specific telemetry',
      };
    }
    return { allowed: true, targetAccountId: undefined };
  }

  // 2. Admin role has unrestricted access across all accounts
  if (session.role === 'admin') {
    return { allowed: true, targetAccountId: requestedAccountId || undefined };
  }

  // 3. Consumer role is strictly locked to their assigned account
  if (session.role === 'consumer') {
    if (!session.accountId) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Consumer account is not assigned to any solar station',
      };
    }
    if (requestedAccountId && requestedAccountId !== session.accountId) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: You do not have permission to access telemetry for this account',
      };
    }
    return { allowed: true, targetAccountId: session.accountId };
  }

  // 4. Viewer role can only view public/fleet default summary, cannot target specific accounts
  if (requestedAccountId) {
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Viewer role cannot query account-specific telemetry',
    };
  }
  return { allowed: true, targetAccountId: undefined };
}

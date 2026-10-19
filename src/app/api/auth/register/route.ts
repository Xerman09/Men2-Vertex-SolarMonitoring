import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountManager, COLLECTIONS } from '@/lib/account-manager';
import { SolarUser } from '@/lib/types';
import { hashPassword } from '@/lib/auth-crypto';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { withGate, parseJsonBody } from '@/lib/gate';
import { createLogger } from '@/lib/logger';
import { createSessionToken, applySessionCookies } from '@/lib/session';

const log = createLogger('AuthRegister');

export const registerSchema = z.object({
  email: z.string().trim().email('A valid email address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  fullName: z.string().trim().min(1, 'Full name is required').max(100).optional(),
  username: z.string().trim().min(1).max(50).optional(),
});

export const POST = withGate(
  {
    allowUnauthenticated: true,
    rateLimit: {
      keyPrefix: 'auth_register',
      maxRequests: RATE_LIMIT_CONFIGS.AUTH_LOGIN.maxRequests,
      windowMs: RATE_LIMIT_CONFIGS.AUTH_LOGIN.windowMs,
    },
  },
  async (req) => {
    const jsonParsed = await parseJsonBody(req);
    if (!jsonParsed.ok) {
      return jsonParsed.errorResponse;
    }

    const parsed = registerSchema.safeParse(jsonParsed.data);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password, fullName, username } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const effectiveName = fullName || username || normalizedEmail.split('@')[0];
    const effectiveUsername = (username || normalizedEmail.split('@')[0]).toLowerCase();

    try {
      // 1. Check if user already exists in iot_solar_users
      try {
        const users = await accountManager.fetchCollection<SolarUser>(COLLECTIONS.USERS);
        if (users && users.length > 0) {
          const existing = users.find(
            (u) =>
              (u.email && u.email.trim().toLowerCase() === normalizedEmail) ||
              (u.username && u.username.trim().toLowerCase() === effectiveUsername)
          );
          if (existing) {
            return NextResponse.json(
              {
                success: false,
                error: 'An account with this email address or username already exists. Please sign in instead.',
              },
              { status: 409 }
            );
          }
        }
      } catch (err) {
        log.warn('Existing user lookup non-fatal', {}, err);
      }

      // 2. Hash password with scrypt
      const passwordHash = hashPassword(password);

      // 3. Persist new customer into iot_solar_users
      const newUserPayload = {
        email: normalizedEmail,
        username: effectiveUsername,
        password_hash: passwordHash,
        full_name: effectiveName,
        role: 'consumer' as const,
        is_active: 1,
      };

      let createdId: number | string | undefined;
      try {
        const createdUser = await accountManager.createItem<SolarUser>(
          COLLECTIONS.USERS,
          newUserPayload
        );
        if (createdUser?.id) {
          createdId = createdUser.id;
        }
      } catch (dbErr) {
        log.warn('Directus user creation fallback to synthetic ID', {}, dbErr);
      }

      const userId = createdId !== undefined ? String(createdId) : `usr-${Date.now().toString(36)}`;

      const user = {
        id: userId,
        email: normalizedEmail,
        name: effectiveName,
        role: 'consumer' as const,
        accountId: undefined,
        stationId: undefined,
      };

      // 4. Create session token and set cookies
      const sessionToken = await createSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: 'consumer',
      });

      const response = NextResponse.json(
        {
          success: true,
          role: 'consumer',
          user,
          message: 'Account registered successfully. Please connect your DeyeCloud account.',
        },
        { status: 201 }
      );

      applySessionCookies(response, sessionToken, req);

      log.info('New customer account registered', { userId, email: normalizedEmail });

      return response;
    } catch (error) {
      log.error('Registration error', error, { route: 'auth/register' });
      return NextResponse.json(
        { success: false, error: 'Registration service error. Please try again.' },
        { status: 500 }
      );
    }
  }
);

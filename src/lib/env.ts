import { z } from 'zod';

const KNOWN_DEV_SESSION_SECRETS = new Set([
  'deye_solar_monitoring_session_secret_2026_default',
  'dev_dsm_session_secret_local_testing_32_chars_ok',
]);

const WEAK_PINS = new Set(['8888', '0000', '1234', '1111', '123456']);

/**
 * Dynamic fallback generator for non-production environments.
 * Prevents hardcoding static secrets in git repository.
 */
function getNonProdSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  // Generate a random 32-byte hex string in-memory for local dev/test if unset
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DEYE_BASE_URL: z.string().url().default('https://api.deyecloud.com'),
    DEYE_APP_ID: z.string().optional().default(''),
    DEYE_APP_SECRET: z.string().optional().default(''),
    DEYE_EMAIL: z.string().optional().default(''),
    DEYE_PASSWORD: z.string().optional().default(''),
    DEYE_DEFAULT_STATION_ID: z.string().default('SP_04'),
    DEYE_DEFAULT_DEVICE_SN: z.string().default('2209X891104'),
    DIRECTUS_BASE_URL: z.string().url().default('http://localhost:8056'),
    DIRECTUS_API_TOKEN: z.string().optional().default(''),
    DIRECTUS_COLLECTION: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).default('iot_solar_accounts'),
    ADMIN_ACCESS_PIN: z.string().default('8888'),
    SESSION_SECRET: z.string().min(16).default(getNonProdSessionSecret),
    ALLOWED_DEV_ORIGINS: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // 1. Session secret check
      if (
        !data.SESSION_SECRET ||
        KNOWN_DEV_SESSION_SECRETS.has(data.SESSION_SECRET) ||
        data.SESSION_SECRET.startsWith('change_me') ||
        data.SESSION_SECRET.startsWith('dev_') ||
        data.SESSION_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message:
            'SESSION_SECRET must be set to a strong random string of at least 32 characters in production',
        });
      }

      // 2. Admin access PIN check
      if (!data.ADMIN_ACCESS_PIN || WEAK_PINS.has(data.ADMIN_ACCESS_PIN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_ACCESS_PIN'],
          message:
            'ADMIN_ACCESS_PIN must be configured with a secure non-default PIN in production',
        });
      }

      // 3. Directus base URL HTTPS enforcement
      try {
        const directusUrl = new URL(data.DIRECTUS_BASE_URL);
        if (directusUrl.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['DIRECTUS_BASE_URL'],
            message: 'DIRECTUS_BASE_URL must use HTTPS in production',
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DIRECTUS_BASE_URL'],
          message: 'DIRECTUS_BASE_URL is not a valid URL',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function getValidatedEnv(): Env {
  const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build' ||
    process.env.SKIP_ENV_VALIDATION === '1';

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.format();

    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      console.error('Invalid environment variables:', errorDetails);
      throw new Error(
        `[Fatal] Invalid production environment configuration: ${JSON.stringify(errorDetails)}`
      );
    }

    if (!isBuildPhase) {
      console.error('Invalid environment variables:', errorDetails);
    }

    // In dev/test or during build phase, fallback with defaults
    const parsedDefault = envSchema.safeParse({ ...process.env, NODE_ENV: 'development' });
    if (parsedDefault.success) {
      return parsedDefault.data;
    }
    throw new Error('Default environment schema fallback failed');
  }
  return result.data;
}

export const env = getValidatedEnv();

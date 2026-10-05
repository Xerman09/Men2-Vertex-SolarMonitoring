import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEYE_BASE_URL: z.string().url().default('https://api.deyecloud.com'),
  DEYE_APP_ID: z.string().optional().default(''),
  DEYE_APP_SECRET: z.string().optional().default(''),
  DEYE_EMAIL: z.string().optional().default(''),
  DEYE_PASSWORD: z.string().optional().default(''),
  DEYE_DEFAULT_STATION_ID: z.string().default('SP_04'),
  DEYE_DEFAULT_DEVICE_SN: z.string().default('2209X891104'),
  DIRECTUS_BASE_URL: z.string().default('http://goatedcodoer:8056'),
  DIRECTUS_API_TOKEN: z.string().optional().default(''),
  DIRECTUS_COLLECTION: z.string().default('iot_solar_accounts'),
  ADMIN_ACCESS_PIN: z.string().default('8888'),
  SESSION_SECRET: z.string().min(16).default('deye_solar_monitoring_session_secret_2026_default'),
  ALLOWED_DEV_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function getValidatedEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    return envSchema.parse({});
  }
  return result.data;
}

export const env = getValidatedEnv();

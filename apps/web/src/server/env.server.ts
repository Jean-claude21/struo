/** Environment, read once. Never logged: only names and « set / empty » are ever printed. */
export interface Env {
  APP_BASE_URL: string;
  APP_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  DATABASE_OWNER_URL: string;
  BETTER_AUTH_SECRET: string;
  SECRETS_KEY: string;
  PLATFORM_ADMIN_EMAILS: string[];
  S3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string } | null;
  STORAGE_DIR: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_TRANSCRIBE_MODEL: string;
  /** The assistant's model on the company's key (spec 034). */
  OPENAI_AGENT_MODEL: string;
  /** Sign in with ChatGPT (OpenAI partner programme): empty until OpenAI issues the client. */
  OPENAI_SIWC_CLIENT_ID: string;
  OPENAI_SIWC_CLIENT_SECRET: string;
  JOBS_ENABLED: boolean;
  PLATFORM_MONEROO_SECRET_KEY: string;
  PLATFORM_MONEROO_WEBHOOK_SECRET: string;
  PAYMENTS_SIMULATOR: boolean;
}

const read = (name: string, fallback = '') => (process.env[name] ?? fallback).trim();

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const appEnv = read('APP_ENV', process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const s3Bucket = read('S3_BUCKET');
  cached = {
    APP_BASE_URL: read('APP_BASE_URL', 'http://localhost:3000').replace(/\/$/u, ''),
    APP_ENV: appEnv === 'production' || appEnv === 'test' ? appEnv : 'development',
    DATABASE_URL: read('DATABASE_URL'),
    DATABASE_OWNER_URL: read('DATABASE_OWNER_URL'),
    BETTER_AUTH_SECRET: read('BETTER_AUTH_SECRET', appEnv === 'production' ? '' : 'dev-secret-not-for-production-0123456789'),
    SECRETS_KEY: read('SECRETS_KEY'),
    PLATFORM_ADMIN_EMAILS: read('PLATFORM_ADMIN_EMAILS')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    S3: s3Bucket
      ? {
          endpoint: read('S3_ENDPOINT'),
          region: read('S3_REGION', 'auto'),
          bucket: s3Bucket,
          accessKeyId: read('S3_ACCESS_KEY_ID'),
          secretAccessKey: read('S3_SECRET_ACCESS_KEY'),
        }
      : null,
    STORAGE_DIR: read('STORAGE_DIR', './storage'),
    RESEND_API_KEY: read('RESEND_API_KEY'),
    MAIL_FROM: read('MAIL_FROM', 'Struo <noreply@struo.local>'),
    WHATSAPP_TOKEN: read('WHATSAPP_TOKEN'),
    WHATSAPP_PHONE_NUMBER_ID: read('WHATSAPP_PHONE_NUMBER_ID'),
    OPENAI_API_KEY: read('OPENAI_API_KEY'),
    OPENAI_MODEL: read('OPENAI_MODEL', 'gpt-4o-mini'),
    OPENAI_TRANSCRIBE_MODEL: read('OPENAI_TRANSCRIBE_MODEL', 'whisper-1'),
    OPENAI_AGENT_MODEL: read('OPENAI_AGENT_MODEL', 'gpt-4.1-mini'),
    OPENAI_SIWC_CLIENT_ID: read('OPENAI_SIWC_CLIENT_ID'),
    OPENAI_SIWC_CLIENT_SECRET: read('OPENAI_SIWC_CLIENT_SECRET'),
    JOBS_ENABLED: read('JOBS_ENABLED', 'true') !== 'false',
    PLATFORM_MONEROO_SECRET_KEY: read('PLATFORM_MONEROO_SECRET_KEY'),
    PLATFORM_MONEROO_WEBHOOK_SECRET: read('PLATFORM_MONEROO_WEBHOOK_SECRET'),
    // The payment simulator never runs in production unless explicitly allowed (demo instance).
    PAYMENTS_SIMULATOR: appEnv !== 'production' || read('PAYMENTS_SIMULATOR') === 'true',
  };
  if (!cached.DATABASE_URL) throw new Error('DATABASE_URL is empty.');
  if (!cached.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is empty.');
  return cached;
}

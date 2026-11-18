import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// Supabase Edge Functions run on Deno with a read-only FS and no .env file
export const isEdge = typeof globalThis.Deno !== 'undefined' && Boolean(process.env.SB_EXECUTION_ID || process.env.SUPABASE_URL);
if (!isEdge) dotenv.config({ path: path.resolve(here, '../../.env') });

function secretFromJson(v) {
  try { const o = JSON.parse(v || '{}'); return o.default || Object.values(o)[0] || ''; } catch { return ''; }
}

const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || (isEdge ? 'production' : 'development'),
  // Auth is a Bearer token (no cookies), so any origin may call the API by default
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    // Supabase: Project → Connect → "Session pooler" connection string (IPv4-friendly)
    // On Supabase Edge Functions SUPABASE_DB_URL is provided automatically
    url: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
      || `postgresql://${encodeURIComponent(process.env.DB_USER || 'postgres')}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`,
    // SSL is required by Supabase; auto-on for *.supabase.com / *.supabase.co hosts
    ssl: process.env.DB_SSL ? process.env.DB_SSL === '1' || process.env.DB_SSL === 'true'
      : /supabase\.(co|com)/.test(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DB_HOST || ''),
    poolMax: Number(process.env.DB_POOL_MAX || (isEdge ? 3 : 10)),
  },
  // Optional Supabase Storage for product images & shop logo (recommended on
  // cloud hosts whose disk is wiped on every deploy). Leave empty to use local disk.
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    // Edge Functions get SUPABASE_SECRET_KEYS ({"default":"sb_secret_…"}) automatically
    secretKey: process.env.SUPABASE_SECRET_KEY || secretFromJson(process.env.SUPABASE_SECRET_KEYS) || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'bikripro',
  },
  // Optional: if empty, a random secret stored in the database is used
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  uploadDir: path.resolve(here, '../..', process.env.UPLOAD_DIR || 'uploads'),
  sms: {
    provider: process.env.SMS_PROVIDER || 'log',
    apiUrl: process.env.SMS_API_URL || '',
    apiKey: process.env.SMS_API_KEY || '',
    senderId: process.env.SMS_SENDER_ID || '',
  },
  birthdayCron: process.env.BIRTHDAY_SMS_CRON || '0 10 * * *',
  timezone: process.env.TZ || 'Asia/Dhaka',
};


export default env;

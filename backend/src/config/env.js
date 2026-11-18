const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    // Supabase: Project → Connect → "Session pooler" connection string (IPv4-friendly)
    url: process.env.DATABASE_URL
      || `postgresql://${encodeURIComponent(process.env.DB_USER || 'postgres')}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`,
    // SSL is required by Supabase; auto-on for *.supabase.com / *.supabase.co hosts
    ssl: process.env.DB_SSL ? process.env.DB_SSL === '1' || process.env.DB_SSL === 'true'
      : /supabase\.(co|com)/.test(process.env.DATABASE_URL || process.env.DB_HOST || ''),
    poolMax: Number(process.env.DB_POOL_MAX || 10),
  },
  // Optional Supabase Storage for product images & shop logo (recommended on
  // cloud hosts whose disk is wiped on every deploy). Leave empty to use local disk.
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    secretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'bikripro',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  uploadDir: path.resolve(__dirname, '../..', process.env.UPLOAD_DIR || 'uploads'),
  sms: {
    provider: process.env.SMS_PROVIDER || 'log',
    apiUrl: process.env.SMS_API_URL || '',
    apiKey: process.env.SMS_API_KEY || '',
    senderId: process.env.SMS_SENDER_ID || '',
  },
  birthdayCron: process.env.BIRTHDAY_SMS_CRON || '0 10 * * *',
  timezone: process.env.TZ || 'Asia/Dhaka',
};

if (env.nodeEnv === 'production' && env.jwtSecret.startsWith('dev-only')) {
  // Fail loudly rather than run production with a guessable secret.
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = env;

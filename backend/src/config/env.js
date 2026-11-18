const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'bikripro',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bikripro',
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
  dbTimezone: process.env.DB_TIMEZONE || '+06:00',
};

if (env.nodeEnv === 'production' && env.jwtSecret.startsWith('dev-only')) {
  // Fail loudly rather than run production with a guessable secret.
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = env;

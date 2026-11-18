import process from 'node:process';
import env from './config/env.js';
import app from './app.js';
import { pool } from './config/db.js';
import { startCron } from './services/cron.service.js';
import migrate from './db/migrate.js';
import seed from './db/seed.js';
import { ensureBucket, useSupabase } from './services/storage.service.js';

async function main() {
  // Idempotent: creates the database, missing tables/views and first-run data
  // (admin user, cash/MFS accounts…). Safe on every start; disable with AUTO_MIGRATE=0.
  try {
    if (process.env.AUTO_MIGRATE !== '0') {
      await migrate();
      await seed({ demo: false });
    }
    await pool.query('SELECT 1');
  } catch (e) {
    const where = env.db.url.replace(/\/\/([^:@/]+)(:[^@]*)?@/, '//$1:****@');
    console.error(`\n❌ Database not ready (${where}): ${e.message}`);
    console.error('   Check DATABASE_URL in backend/.env (desktop: File → Server settings).\n');
    process.exit(1);
  }
  if (useSupabase()) {
    ensureBucket().then(() => console.log('🗂  Supabase Storage ready')).catch((e) => console.warn('⚠️  Supabase Storage:', e.message));
  }
  startCron();
  app.listen(env.port, () => console.log(`✅ BikriPro API running on http://localhost:${env.port}/api`));
}

main();

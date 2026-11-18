const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');
const { startCron } = require('./services/cron.service');
const migrate = require('./db/migrate');
const seed = require('./db/seed');
const { ensureBucket, useSupabase } = require('./services/storage.service');

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

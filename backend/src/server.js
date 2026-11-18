const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');
const { startCron } = require('./services/cron.service');
const migrate = require('./db/migrate');
const seed = require('./db/seed');

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
    console.error(`\n❌ Database not ready (${env.db.user}@${env.db.host}:${env.db.port}/${env.db.database}): ${e.message}`);
    console.error('   Check DB_HOST / DB_USER / DB_PASSWORD in backend/.env (desktop: File → Server settings).\n');
    process.exit(1);
  }
  startCron();
  app.listen(env.port, () => console.log(`✅ BikriPro API running on http://localhost:${env.port}/api`));
}

main();

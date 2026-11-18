/**
 * Applies the SQL migrations in /supabase/migrations (or backend/migrations
 * when packaged) in filename order. Every migration is idempotent
 * (CREATE … IF NOT EXISTS / CREATE OR REPLACE), so this is safe to run on
 * every start. On Supabase you can also apply them with `supabase db push`.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

function migrationsDir() {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(__dirname, '../../../supabase/migrations'), // repo layout
    path.resolve(__dirname, '../../migrations'),             // packaged (desktop/server)
  ].filter(Boolean);
  const dir = candidates.find((d) => fs.existsSync(d));
  if (!dir) throw new Error('Migrations folder not found');
  return dir;
}

async function migrate() {
  const dir = migrationsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query("SET client_min_messages = 'warning'");
    for (const f of files) await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  } finally {
    client.release();
  }
  console.log(`✅ Database schema up to date (${files.length} migration file${files.length === 1 ? '' : 's'})`);
}

if (require.main === module) {
  migrate().then(() => pool.end()).catch((e) => { console.error('❌ Migration failed:', e.message); process.exit(1); });
}
module.exports = migrate;

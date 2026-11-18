/**
 * Applies the SQL migrations in /supabase/migrations (or backend/migrations
 * when packaged) in filename order. Every migration is idempotent
 * (CREATE … IF NOT EXISTS / CREATE OR REPLACE), so this is safe to run on
 * every start. On Supabase you can also apply them with `supabase db push`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from '../config/db.js';

function migrationsDir() {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations'), // repo layout
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations'),             // packaged (desktop/server)
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate().then(() => pool.end()).catch((e) => { console.error('❌ Migration failed:', e.message); process.exit(1); });
}
export default migrate;

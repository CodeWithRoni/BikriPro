/**
 * Creates the database (if missing) and applies schema.sql.
 * Safe to run repeatedly: all statements are CREATE ... IF NOT EXISTS / OR REPLACE.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function migrate() {
  const { database, ...conn } = env.db;
  const root = await mysql.createConnection({ ...conn, multipleStatements: true });
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`USE \`${database}\``);
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await root.query(sql);
  await root.end();
  console.log(`✅ Schema applied to database "${database}"`);
}

if (require.main === module) {
  migrate().catch((e) => { console.error('❌ Migration failed:', e.message); process.exit(1); });
}
module.exports = migrate;

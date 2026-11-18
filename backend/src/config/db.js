/**
 * PostgreSQL access layer (Supabase or any Postgres 14+).
 *
 * Controllers write SQL with `?` placeholders; this module converts them to
 * $1, $2… and expands arrays:
 *   IN (?)        with [1,2,3]        → IN ($1,$2,$3)
 *   VALUES ?      with [[a,b],[c,d]]  → VALUES ($1,$2),($3,$4)
 *
 * query() returns the row array. For INSERTs it appends `RETURNING id`
 * automatically and exposes `rows.insertId`; every result exposes
 * `rows.rowCount`.
 */
import { Pool, types } from 'pg';
import env from './env.js';

// Return numbers as JS numbers (money is numeric(14,2), counts are bigint)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));  // int8
// Keep DATE / TIMESTAMP exactly as stored (Bangladesh local time strings)
types.setTypeParser(1082, (v) => v);  // date
types.setTypeParser(1114, (v) => v);  // timestamp
types.setTypeParser(1184, (v) => v);  // timestamptz

const pool = new Pool({
  connectionString: env.db.url,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  max: env.db.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  application_name: 'bikripro-api',
});
pool.on('error', (e) => console.error('[db] idle client error', e.message));

// Tables without an `id` column (no RETURNING id on insert)
const NO_ID = new Set(['settings', 'number_sequences']);

/** Convert `?` placeholders to $n, expanding array params. */
function toPg(sql, params = []) {
  const out = [];
  let i = 0;
  let inStr = false;
  let text = '';
  for (let c = 0; c < sql.length; c += 1) {
    const ch = sql[c];
    if (ch === "'") inStr = !inStr;
    if (ch === '?' && !inStr) {
      const p = params[i++];
      if (Array.isArray(p) && p.length && Array.isArray(p[0])) {
        text += p.map((row) => `(${row.map((v) => { out.push(v); return `$${out.length}`; }).join(',')})`).join(',');
      } else if (Array.isArray(p)) {
        if (!p.length) { text += 'NULL'; continue; }
        text += p.map((v) => { out.push(v); return `$${out.length}`; }).join(',');
      } else {
        out.push(p === undefined ? null : p);
        text += `$${out.length}`;
      }
    } else {
      text += ch;
    }
  }
  const m = /^\s*insert\s+into\s+(?:public\.)?"?(\w+)"?/i.exec(text);
  if (m && !NO_ID.has(m[1].toLowerCase()) && !/\breturning\b/i.test(text)) text += ' RETURNING id';
  return { text, values: out };
}

async function run(client, sql, params) {
  const { text, values } = toPg(sql, params);
  const res = await client.query(text, values);
  const rows = res.rows || [];
  rows.rowCount = res.rowCount;
  rows.insertId = rows[0]?.id;
  return rows;
}

/** Run a query, return rows (with .insertId / .rowCount). */
const query = (sql, params = []) => run(pool, sql, params);

/** First row or null. */
const one = async (sql, params = []) => (await query(sql, params))[0] || null;

/**
 * Run fn(conn) in a transaction. conn.query / conn.q return rows,
 * conn.one returns the first row. Commits on success, rolls back on error.
 */
async function transaction(fn) {
  const client = await pool.connect();
  const conn = {
    query: (sql, params) => run(client, sql, params),
    q: (sql, params) => run(client, sql, params),
    one: async (sql, params) => (await run(client, sql, params))[0] || null,
    raw: client,
  };
  try {
    await client.query('BEGIN');
    const result = await fn(conn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export { pool, query, one, transaction, toPg };

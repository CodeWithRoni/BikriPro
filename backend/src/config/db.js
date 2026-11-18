const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,      // DECIMAL -> JS number
  dateStrings: true,         // keep DATE/DATETIME as strings (no TZ shifting)
  timezone: env.dbTimezone,
  charset: 'utf8mb4',
  multipleStatements: false,
});

// Make NOW()/CURDATE() follow Bangladesh time regardless of the MySQL server's zone
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${env.dbTimezone}'`);
});

/** Run a single query and return rows. */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Return first row or null. */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Run `fn(conn)` inside a transaction. Commits on success, rolls back on throw.
 * conn exposes .q(sql, params) -> rows and .one(sql, params) -> row|null helpers.
 */
async function transaction(fn) {
  const conn = await pool.getConnection();
  conn.q = async (sql, params = []) => (await conn.query(sql, params))[0];
  conn.one = async (sql, params = []) => (await conn.q(sql, params))[0] || null;
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };

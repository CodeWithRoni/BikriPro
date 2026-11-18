/**
 * Atomic document numbers, e.g. INV-000123. Uses the LAST_INSERT_ID(expr)
 * trick so concurrent cashiers never get the same number.
 */
const PREFIX = {
  sale: 'INV', purchase: 'PUR', sale_return: 'SR', purchase_return: 'PR',
  supplier_payment: 'PAY', collection: 'COL', hold: 'HLD',
};

async function nextNumber(conn, kind) {
  const prefix = PREFIX[kind];
  if (!prefix) throw new Error(`Unknown sequence ${kind}`);
  await conn.query(
    `INSERT INTO number_sequences (name, last_value) VALUES (?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)`,
    [kind]
  );
  const [[row]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
  return `${prefix}-${String(row.n).padStart(6, '0')}`;
}

module.exports = { nextNumber };

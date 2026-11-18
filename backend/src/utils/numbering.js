/**
 * Atomic document numbers, e.g. INV-000123. The upsert row-locks the counter,
 * so concurrent cashiers never get the same number.
 */
const PREFIX = {
  sale: 'INV', purchase: 'PUR', sale_return: 'SR', purchase_return: 'PR',
  supplier_payment: 'PAY', collection: 'COL', hold: 'HLD',
};

async function nextNumber(conn, kind) {
  const prefix = PREFIX[kind];
  if (!prefix) throw new Error(`Unknown sequence ${kind}`);
  const row = await conn.one(
    `INSERT INTO number_sequences (name, last_value) VALUES (?, 1)
     ON CONFLICT (name) DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [kind]
  );
  return `${prefix}-${String(row.last_value).padStart(6, '0')}`;
}

module.exports = { nextNumber };

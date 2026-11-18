/**
 * Seeds the minimum a fresh shop needs: admin user, security PIN, cash + MFS
 * accounts, a walk-in customer, expense categories and clothing categories.
 * Pass --demo to also add sample products, a supplier and a customer.
 *
 * Default login:  admin / admin123     Security PIN: 1234   (change both after first login!)
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, query } from '../config/db.js';

async function seed({ demo = process.argv.includes('--demo') } = {}) {
  const q = query;

  const [{ n: users }] = await q('SELECT COUNT(*) AS n FROM users');
  if (!users) {
    await q('INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,?)',
      ['Shop Owner', 'admin', await bcrypt.hash('admin123', 10), 'admin']);
    console.log('👤 Admin created → username: admin  password: admin123');
  }
  await q("INSERT INTO settings (setting_key, setting_value) VALUES ('security_pin_hash', ?) ON CONFLICT (setting_key) DO NOTHING",
    [await bcrypt.hash('1234', 10)]);

  const [{ n: accounts }] = await q('SELECT COUNT(*) AS n FROM accounts');
  if (!accounts) {
    await q(`INSERT INTO accounts (name, type, provider, is_default) VALUES
      ('Cash Drawer', 'cash', NULL, true), ('bKash', 'mfs', 'bKash', true), ('Nagad', 'mfs', 'Nagad', false),
      ('Card (POS Machine)', 'card', NULL, true), ('Bank Account', 'bank', NULL, true)`);
  }
  await q("INSERT INTO customers (name, is_walk_in) SELECT 'Walk-in Customer', true WHERE NOT EXISTS (SELECT 1 FROM customers WHERE is_walk_in)");
  for (const n of ['Shop Rent', 'Electricity', 'Staff Salary', 'Transport', 'Snacks & Tea', 'Internet & Mobile', 'Others']) {
    await q('INSERT INTO expense_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [n]);
  }
  for (const n of ['Shirt', 'T-Shirt', 'Polo', 'Panjabi', 'Pant', 'Jeans', 'Saree', 'Three-Piece', 'Kurti', 'Kids Wear', 'Accessories']) {
    await q('INSERT INTO categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [n]);
  }

  if (demo) {
    for (const n of ['Easy', 'Yellow', 'Sailor', 'Local']) await q('INSERT INTO brands (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [n]);
    const cat = async (n) => (await q('SELECT id FROM categories WHERE name = ?', [n]))[0].id;
    const brand = async (n) => (await q('SELECT id FROM brands WHERE name = ?', [n]))[0].id;
    const [{ n: prods }] = await q('SELECT COUNT(*) AS n FROM products');
    if (!prods) {
      const items = [
        ['Cotton Casual Shirt', 'Shirt', 'Easy', [['M', 'Sky Blue', 650, 1150], ['L', 'Sky Blue', 650, 1150], ['XL', 'White', 650, 1150]]],
        ['Premium Polo T-Shirt', 'Polo', 'Yellow', [['M', 'Navy', 420, 790], ['L', 'Navy', 420, 790], ['L', 'Maroon', 420, 790]]],
        ['Eid Special Panjabi', 'Panjabi', 'Sailor', [['40', 'Off White', 1350, 2450], ['42', 'Off White', 1350, 2450]]],
        ['Slim Fit Jeans', 'Jeans', 'Local', [['30', 'Dark Blue', 780, 1350], ['32', 'Dark Blue', 780, 1350], ['34', 'Black', 780, 1350]]],
        ['Printed Three-Piece', 'Three-Piece', 'Local', [['Free', 'Pink', 950, 1650], ['Free', 'Green', 950, null]]],
      ];
      let seq = 1;
      for (const [name, c, b, variants] of items) {
        const r = await q('INSERT INTO products (name, category_id, brand_id, is_favorite) VALUES (?,?,?,?)', [name, await cat(c), await brand(b), seq % 2 === 1]);
        for (const [size, color, cost, price] of variants) {
          const sku = `BP-${String(seq++).padStart(5, '0')}`;
          await q('INSERT INTO product_variants (product_id, sku, barcode, size, color, purchase_price, retail_price, wholesale_price, stock_qty) VALUES (?,?,?,?,?,?,?,?,?)',
            [r.insertId, sku, sku, size, color, cost, price, price ? Math.round(price * 0.9) : null, 20]);
        }
      }
      await q("INSERT INTO suppliers (name, company, phone, address) VALUES ('Rahim Uddin', 'Rahim Garments', '01711000000', 'Islampur, Dhaka')");
      await q("INSERT INTO customers (name, phone, address, area, dob) VALUES ('Karim Ahmed', '01811000000', 'House 12, Road 3, Mirpur', 'Mirpur', '1992-11-18')");
      console.log('🧪 Demo products, supplier and customer added');
    }
  }
  console.log('✅ Seed complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed().then(() => pool.end()).catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); });
}
export default seed;

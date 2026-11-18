-- =====================================================================
-- BikriPro POS & ERP — MySQL 8 / MariaDB 10.6+ schema
-- Garments & clothing retail. All money columns are DECIMAL(14,2) BDT.
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Users, settings, audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  username      VARCHAR(60)  NOT NULL UNIQUE,
  phone         VARCHAR(30)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','manager','cashier') NOT NULL DEFAULT 'cashier',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Key/value settings: shop info, loyalty rates, SMS config, security PIN hash, invoice prefix…
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atomic document numbering (INV, PUR, SR, PR, PAY, COL, HLD)
CREATE TABLE IF NOT EXISTS number_sequences (
  name       VARCHAR(20) PRIMARY KEY,
  last_value BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_logs (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NULL,
  module     VARCHAR(50) NOT NULL,
  action     VARCHAR(50) NOT NULL,
  ref_id     BIGINT UNSIGNED NULL,
  details    TEXT NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_module (module, created_at),
  INDEX idx_activity_user (user_id, created_at),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Cash, Bank & MFS (bKash, Nagad, Rocket, Upay…) accounts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  type            ENUM('cash','bank','mfs','card') NOT NULL,
  provider        VARCHAR(80) NULL,          -- e.g. bKash, Nagad, DBBL, City Bank
  account_no      VARCHAR(60) NULL,
  branch          VARCHAR(100) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_default      TINYINT(1) NOT NULL DEFAULT 0,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every money movement in/out of an account (the cash book)
CREATE TABLE IF NOT EXISTS account_transactions (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id  INT UNSIGNED NOT NULL,
  direction   ENUM('in','out') NOT NULL,
  amount      DECIMAL(14,2) NOT NULL,
  ref_type    ENUM('sale','sale_return','purchase','purchase_return','collection','supplier_payment','expense','transfer','deposit','withdraw','opening') NOT NULL,
  ref_id      BIGINT UNSIGNED NULL,
  note        VARCHAR(255) NULL,
  txn_date    DATE NOT NULL,
  user_id     INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_acc_txn (account_id, txn_date),
  INDEX idx_acc_ref (ref_type, ref_id),
  CONSTRAINT fk_acctxn_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_acctxn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Catalogue: categories, brands, products, variants (size/colour)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  parent_id  INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brands (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  category_id INT UNSIGNED NULL,
  brand_id    INT UNSIGNED NULL,
  description TEXT NULL,
  unit        VARCHAR(20) NOT NULL DEFAULT 'pcs',
  image_path  VARCHAR(255) NULL,          -- normalised 500x500 WebP
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_name (name),
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_variants (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id      INT UNSIGNED NOT NULL,
  sku             VARCHAR(60) NOT NULL UNIQUE,
  barcode         VARCHAR(60) NULL UNIQUE,
  size            VARCHAR(30) NULL,
  color           VARCHAR(40) NULL,
  purchase_price  DECIMAL(14,2) NOT NULL DEFAULT 0,
  retail_price    DECIMAL(14,2) NULL,       -- NULL = unpriced (Price Manager filter)
  wholesale_price DECIMAL(14,2) NULL,
  stock_qty       DECIMAL(12,2) NOT NULL DEFAULT 0,
  low_stock_alert DECIMAL(12,2) NOT NULL DEFAULT 3,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_variant_product (product_id),
  CONSTRAINT fk_variant_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_history (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id          INT UNSIGNED NOT NULL,
  old_purchase_price  DECIMAL(14,2) NULL,
  new_purchase_price  DECIMAL(14,2) NULL,
  old_retail_price    DECIMAL(14,2) NULL,
  new_retail_price    DECIMAL(14,2) NULL,
  old_wholesale_price DECIMAL(14,2) NULL,
  new_wholesale_price DECIMAL(14,2) NULL,
  user_id             INT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_price_hist_variant (variant_id),
  CONSTRAINT fk_ph_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Customers & suppliers (with multiple dynamic contact fields)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  phone           VARCHAR(30) NULL,          -- primary phone (also in customer_contacts)
  address         VARCHAR(255) NULL,
  area            VARCHAR(100) NULL,         -- for ledger "filter by address/area"
  dob             DATE NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0, -- positive = customer owes shop
  loyalty_points  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_purchase  DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes           VARCHAR(255) NULL,
  is_walk_in      TINYINT(1) NOT NULL DEFAULT 0,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer_phone (phone),
  INDEX idx_customer_name (name),
  INDEX idx_customer_dob (dob)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  type        ENUM('phone','email','address','other') NOT NULL DEFAULT 'phone',
  label       VARCHAR(50) NULL,
  value       VARCHAR(255) NOT NULL,
  INDEX idx_cc_value (value),
  CONSTRAINT fk_cc_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  company         VARCHAR(150) NULL,
  phone           VARCHAR(30) NULL,
  address         VARCHAR(255) NULL,
  area            VARCHAR(100) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0, -- positive = shop owes supplier
  notes           VARCHAR(255) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_supplier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  type        ENUM('phone','email','address','other') NOT NULL DEFAULT 'phone',
  label       VARCHAR(50) NULL,
  value       VARCHAR(255) NOT NULL,
  CONSTRAINT fk_sc_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger adjustments: supplier rebates/commission, customer round-off waivers, etc.
-- effect: 'addition' increases what the party owes (customer) / what shop owes (supplier);
--         'deduction' decreases it.
CREATE TABLE IF NOT EXISTS ledger_adjustments (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  party_type  ENUM('customer','supplier') NOT NULL,
  party_id    INT UNSIGNED NOT NULL,
  effect      ENUM('addition','deduction') NOT NULL,
  reason      ENUM('round_off','rebate','discount','commission','correction','other') NOT NULL DEFAULT 'other',
  amount      DECIMAL(14,2) NOT NULL,
  ref_type    VARCHAR(30) NULL,
  ref_id      BIGINT UNSIGNED NULL,
  note        VARCHAR(255) NULL,
  adj_date    DATE NOT NULL,
  user_id     INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_adj_party (party_type, party_id, adj_date),
  CONSTRAINT fk_adj_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Sales (POS) + payments + holds + returns
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no        VARCHAR(30) NOT NULL UNIQUE,
  customer_id       INT UNSIGNED NULL,
  user_id           INT UNSIGNED NULL,
  sale_date         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subtotal          DECIMAL(14,2) NOT NULL DEFAULT 0,
  item_discount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  invoice_discount  DECIMAL(14,2) NOT NULL DEFAULT 0,
  vat_amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
  round_off         DECIMAL(14,2) NOT NULL DEFAULT 0,   -- loose change waived (positive = reduced)
  points_redeemed   DECIMAL(12,2) NOT NULL DEFAULT 0,
  points_value      DECIMAL(14,2) NOT NULL DEFAULT 0,
  grand_total       DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
  change_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
  next_payment_date DATE NULL,                           -- credit-sale follow-up date
  points_earned     DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_total        DECIMAL(14,2) NOT NULL DEFAULT 0,    -- COGS snapshot for profit
  status            ENUM('completed','returned','partial_return','cancelled') NOT NULL DEFAULT 'completed',
  note              VARCHAR(255) NULL,
  sms_sent          TINYINT(1) NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sales_date (sale_date),
  INDEX idx_sales_customer (customer_id, sale_date),
  INDEX idx_sales_due (due_amount, next_payment_date),
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_items (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id       BIGINT UNSIGNED NOT NULL,
  variant_id    INT UNSIGNED NULL,
  product_name  VARCHAR(200) NOT NULL,       -- snapshot for invoices
  variant_label VARCHAR(80) NULL,
  qty           DECIMAL(12,2) NOT NULL,
  returned_qty  DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_price    DECIMAL(14,2) NOT NULL,
  cost_price    DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_total    DECIMAL(14,2) NOT NULL,
  INDEX idx_si_sale (sale_id),
  INDEX idx_si_variant (variant_id),
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_payments (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id    BIGINT UNSIGNED NOT NULL,
  account_id INT UNSIGNED NOT NULL,
  method     ENUM('cash','mfs','card','bank') NOT NULL,
  amount     DECIMAL(14,2) NOT NULL,
  trx_ref    VARCHAR(80) NULL,               -- bKash TrxID / card slip no.
  CONSTRAINT fk_sp_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS held_invoices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hold_ref    VARCHAR(30) NOT NULL,
  user_id     INT UNSIGNED NULL,
  customer_id INT UNSIGNED NULL,
  cart_json   LONGTEXT NOT NULL,
  item_count  INT NOT NULL DEFAULT 0,
  total       DECIMAL(14,2) NOT NULL DEFAULT 0,
  note        VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hold_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_hold_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_returns (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_no     VARCHAR(30) NOT NULL UNIQUE,
  sale_id       BIGINT UNSIGNED NOT NULL,
  customer_id   INT UNSIGNED NULL,
  return_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_amount  DECIMAL(14,2) NOT NULL,
  cost_total    DECIMAL(14,2) NOT NULL DEFAULT 0,
  refund_amount DECIMAL(14,2) NOT NULL DEFAULT 0,  -- cash given back; rest reduces customer due
  account_id    INT UNSIGNED NULL,
  reason        VARCHAR(255) NULL,
  user_id       INT UNSIGNED NULL,
  CONSTRAINT fk_sr_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_sr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_return_items (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_return_id BIGINT UNSIGNED NOT NULL,
  sale_item_id   BIGINT UNSIGNED NOT NULL,
  variant_id     INT UNSIGNED NULL,
  qty            DECIMAL(12,2) NOT NULL,
  unit_price     DECIMAL(14,2) NOT NULL,
  line_total     DECIMAL(14,2) NOT NULL,
  restock        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_sri_return FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_sri_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Purchases + returns
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no    VARCHAR(30) NOT NULL UNIQUE,
  supplier_ref  VARCHAR(60) NULL,           -- supplier's own bill number
  supplier_id   INT UNSIGNED NULL,
  purchase_date DATE NOT NULL,
  subtotal      DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  other_cost    DECIMAL(14,2) NOT NULL DEFAULT 0,   -- transport, labour
  grand_total   DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  status        ENUM('received','returned','partial_return') NOT NULL DEFAULT 'received',
  note          VARCHAR(255) NULL,
  user_id       INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_purchase_date (purchase_date),
  INDEX idx_purchase_supplier (supplier_id, purchase_date),
  CONSTRAINT fk_pur_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_pur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_items (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id   BIGINT UNSIGNED NOT NULL,
  variant_id    INT UNSIGNED NULL,
  product_name  VARCHAR(200) NOT NULL,
  variant_label VARCHAR(80) NULL,
  qty           DECIMAL(12,2) NOT NULL,
  returned_qty  DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_cost     DECIMAL(14,2) NOT NULL,
  line_total    DECIMAL(14,2) NOT NULL,
  INDEX idx_pi_purchase (purchase_id),
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_payments (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id BIGINT UNSIGNED NOT NULL,
  account_id  INT UNSIGNED NOT NULL,
  amount      DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_pp_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_returns (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_no     VARCHAR(30) NOT NULL UNIQUE,
  purchase_id   BIGINT UNSIGNED NOT NULL,
  supplier_id   INT UNSIGNED NULL,
  return_date   DATE NOT NULL,
  total_amount  DECIMAL(14,2) NOT NULL,
  refund_amount DECIMAL(14,2) NOT NULL DEFAULT 0,  -- cash received back; rest reduces payable
  account_id    INT UNSIGNED NULL,
  reason        VARCHAR(255) NULL,
  user_id       INT UNSIGNED NULL,
  CONSTRAINT fk_pr_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  CONSTRAINT fk_pr_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_return_id BIGINT UNSIGNED NOT NULL,
  purchase_item_id   BIGINT UNSIGNED NOT NULL,
  variant_id         INT UNSIGNED NULL,
  qty                DECIMAL(12,2) NOT NULL,
  unit_cost          DECIMAL(14,2) NOT NULL,
  line_total         DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_pri_return FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_pri_item FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Payments to suppliers (Payment menu) & collections from customers (Collection menu)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payments (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  voucher_no   VARCHAR(30) NOT NULL UNIQUE,
  supplier_id  INT UNSIGNED NOT NULL,
  purchase_id  BIGINT UNSIGNED NULL,
  account_id   INT UNSIGNED NOT NULL,
  amount       DECIMAL(14,2) NOT NULL,
  payment_date DATE NOT NULL,
  trx_ref      VARCHAR(80) NULL,
  note         VARCHAR(255) NULL,
  user_id      INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_spay_supplier (supplier_id, payment_date),
  CONSTRAINT fk_spay_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_spay_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  CONSTRAINT fk_spay_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_spay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_collections (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_no        VARCHAR(30) NOT NULL UNIQUE,
  customer_id       INT UNSIGNED NOT NULL,
  sale_id           BIGINT UNSIGNED NULL,
  account_id        INT UNSIGNED NOT NULL,
  amount            DECIMAL(14,2) NOT NULL,
  collection_date   DATE NOT NULL,
  next_payment_date DATE NULL,                 -- reschedule remaining due
  trx_ref           VARCHAR(80) NULL,
  note              VARCHAR(255) NULL,
  user_id           INT UNSIGNED NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coll_customer (customer_id, collection_date),
  CONSTRAINT fk_coll_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_coll_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
  CONSTRAINT fk_coll_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_coll_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Expenses (feed into Profit)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id  INT UNSIGNED NULL,
  account_id   INT UNSIGNED NOT NULL,
  amount       DECIMAL(14,2) NOT NULL,
  expense_date DATE NOT NULL,
  note         VARCHAR(255) NULL,
  user_id      INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expense_date (expense_date),
  CONSTRAINT fk_exp_cat FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_exp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Loyalty & SMS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  sale_id     BIGINT UNSIGNED NULL,
  type        ENUM('earn','redeem','reverse','adjust') NOT NULL,
  points      DECIMAL(12,2) NOT NULL,          -- signed
  note        VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_loyalty_customer (customer_id, created_at),
  CONSTRAINT fk_loy_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_loy_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sms_logs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT UNSIGNED NULL,
  phone        VARCHAR(30) NOT NULL,
  purpose      ENUM('sale','birthday','due_reminder','custom') NOT NULL,
  message      TEXT NOT NULL,
  status       ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  provider_ref VARCHAR(120) NULL,
  error        VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sms_purpose (purpose, created_at),
  CONSTRAINT fk_sms_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Balance views (receivable / payable)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_customer_balance AS
SELECT c.id AS customer_id,
  c.opening_balance
  + COALESCE((SELECT SUM(s.grand_total - s.paid_amount) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'cancelled'), 0)
  - COALESCE((SELECT SUM(r.total_amount - r.refund_amount) FROM sale_returns r WHERE r.customer_id = c.id), 0)
  - COALESCE((SELECT SUM(cc.amount) FROM customer_collections cc WHERE cc.customer_id = c.id), 0)
  + COALESCE((SELECT SUM(CASE WHEN a.effect = 'addition' THEN a.amount ELSE -a.amount END)
              FROM ledger_adjustments a WHERE a.party_type = 'customer' AND a.party_id = c.id), 0)
  AS balance
FROM customers c;

CREATE OR REPLACE VIEW v_supplier_balance AS
SELECT sp.id AS supplier_id,
  sp.opening_balance
  + COALESCE((SELECT SUM(p.grand_total - p.paid_amount) FROM purchases p WHERE p.supplier_id = sp.id), 0)
  - COALESCE((SELECT SUM(r.total_amount - r.refund_amount) FROM purchase_returns r WHERE r.supplier_id = sp.id), 0)
  - COALESCE((SELECT SUM(x.amount) FROM supplier_payments x WHERE x.supplier_id = sp.id), 0)
  + COALESCE((SELECT SUM(CASE WHEN a.effect = 'addition' THEN a.amount ELSE -a.amount END)
              FROM ledger_adjustments a WHERE a.party_type = 'supplier' AND a.party_id = sp.id), 0)
  AS balance
FROM suppliers sp;

SET FOREIGN_KEY_CHECKS = 1;

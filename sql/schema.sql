-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab (ALTER privileges needed).
--
-- Candidate profile restructuring:
-- - Removes birth_date, address, current_position, current_company, and
--   experience_years (manually-typed number) - DESTRUCTIVE if any real
--   candidate already has data in these columns; confirmed intentional.
-- - Adds first_experience_date + graduation_date - "years of experience"
--   and "years since graduation" are now computed live on every render
--   from these dates (see utils/format.js's yearsSince()), never stored
--   as a number, so they never go stale.
-- - Adds expected_tjm (daily-rate expectation, MAD/day - matches how
--   consultants are actually paid elsewhere in this app).
-- - Adds open_to_cdd / open_to_cdi / open_to_freelance - 3 plain
--   booleans (fixed, known set of 3 contract types) for what kind of
--   engagement the candidate is open to; a candidate can be open to more
--   than one.
-- ---------------------------------------------------------------------
ALTER TABLE candidates
  DROP COLUMN birth_date,
  DROP COLUMN address,
  DROP COLUMN current_position,
  DROP COLUMN current_company,
  DROP COLUMN experience_years,
  ADD COLUMN first_experience_date DATE DEFAULT NULL,
  ADD COLUMN graduation_date DATE DEFAULT NULL,
  ADD COLUMN expected_tjm DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN open_to_cdd TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN open_to_cdi TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN open_to_freelance TINYINT(1) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab (ALTER privileges needed).
--
-- - Renames education -> specialty (data preserved) and adds
--   education_level - the free-text field used to hold something like
--   "Master's in Computer Science" mixing degree level and field of
--   study together; now the level is picked from a fixed list first
--   (see candidateModel.EDUCATION_LEVELS) and specialty holds just the
--   field of study ("Computer Science"). Plain VARCHAR + app-level
--   validation, not a MySQL ENUM - same convention as `status` already
--   uses in this table.
-- - Adds gender (also plain VARCHAR + app-level validated, values
--   'male'/'female' - see candidateModel.GENDERS).
-- ---------------------------------------------------------------------
ALTER TABLE candidates
  CHANGE COLUMN education specialty VARCHAR(255) DEFAULT NULL,
  ADD COLUMN education_level VARCHAR(50) DEFAULT NULL,
  ADD COLUMN gender VARCHAR(10) DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab (ALTER privileges needed).
--
-- Certifications (e.g. "Microsoft Certified: Power BI Data Analyst
-- Associate") - one or several, semicolon-separated, same shown-as-tags
-- convention as `skills` (see controllers/candidatesController.js).
-- ---------------------------------------------------------------------
ALTER TABLE candidates
  ADD COLUMN certifications TEXT DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Login attempts for THIS app (the Admin Panel) - separate from the
-- read-only `login_attempts` table below, which belongs to the
-- Consultant Dashboard's own login flow. This one is fully owned by the
-- Admin Panel: written by controllers/authController.js on every login
-- attempt (success or failure), read by
-- controllers/loginAttemptsController.js's "Admin Logins" page.
-- ---------------------------------------------------------------------
CREATE TABLE admin_login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Settings: a new top-level area (gear icon in the topbar, next to
-- Logout) meant to grow over time with more categories. First category:
-- "Administrative Information" - Handsight Solutions' own company/legal/
-- bank details (as opposed to `clients`, which holds the SAME shape of
-- fields but for Handsight's clients, not Handsight itself).
--
-- Singleton row (id always 1, seeded below) - there's only ever one
-- Handsight Solutions record, so this is a single settings row to fetch
-- and update in place, never a list.
-- ---------------------------------------------------------------------
CREATE TABLE company_info (
  id INT PRIMARY KEY,
  ice VARCHAR(50) DEFAULT NULL,
  rc VARCHAR(50) DEFAULT NULL,
  patente VARCHAR(50) DEFAULT NULL,
  tax_identifier VARCHAR(50) DEFAULT NULL,
  cnss_number VARCHAR(50) DEFAULT NULL,
  legal_form VARCHAR(150) DEFAULT NULL,
  legal_name VARCHAR(255) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  website VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  bank_name VARCHAR(150) DEFAULT NULL,
  bank_agency VARCHAR(150) DEFAULT NULL,
  bank_rib VARCHAR(24) DEFAULT NULL,
  bank_iban VARCHAR(34) DEFAULT NULL,
  bank_swift VARCHAR(11) DEFAULT NULL,
  invoice_logo_path VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT INTO company_info (id) VALUES (1);

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Billing: "Facture Client" and "Facture Fournisseur" invoices, both
-- generated together (one "Générer Facturation" click on an approved
-- submission in History produces both) - `type` distinguishes them
-- rather than two separate tables, since they're the same event with
-- two calculation rules, not two independent entities. Amounts are
-- computed once at generation time from that submission's already-
-- frozen client_tjm/consultant_tjm/extra_fee_percent and stored here
-- permanently - reopening an invoice later never recomputes, even if
-- rates change afterward. No FOREIGN KEY constraints, matching this
-- file's existing convention for candidates/career_offers.
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  type ENUM('client', 'supplier') NOT NULL,
  submission_id INT NOT NULL,
  client_id INT NOT NULL,
  consultant_id INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  total_days DECIMAL(6,2) NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  total_ht DECIMAL(12,2) NOT NULL,
  total_tva DECIMAL(12,2) NOT NULL,
  total_ttc DECIMAL(12,2) NOT NULL,
  label VARCHAR(255) NOT NULL,
  pdf_path VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Adds the client's registered legal name ("Raison Sociale"), distinct
-- from `name` (the short/trading name used throughout the panel's lists
-- and links). Invoices must bill the client's full legal entity name -
-- controllers/invoicesController.js falls back to `name` when this is
-- left blank, so existing clients don't break.
-- ---------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN legal_name VARCHAR(255) DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Supplier invoices are generated by Handsight as an internal estimate -
-- the real invoice is a document the consultant/supplier is supposed to
-- issue back to us, which this app has no way to author. is_simulation
-- flags that the PDF on file is Handsight's own simulated stand-in
-- (watermarked as such, see utils/invoicePdf.js) rather than the real
-- document; controllers/invoicesController.js's handleUploadReal clears
-- it once the admin uploads the actual PDF received from the supplier.
-- Always 0 for client invoices - Handsight IS the authoritative issuer
-- of those, so there's no "real" version to wait for.
-- ---------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN is_simulation TINYINT(1) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Combined supplier invoices: sometimes a supplier/agency sends ONE real
-- invoice covering several consultants at once, even across different
-- Handsight clients - client invoices stay one-per-submission
-- (unaffected). A combined supplier invoice's parent `invoices` row has
-- submission_id/client_id/consultant_id/month/total_days/rate/label all
-- NULL (there's no single value for any of them); its actual per-
-- consultant breakdown lives in invoice_line_items instead. Every
-- existing invoice (client, and single-submission supplier) keeps using
-- the flat top-level columns exactly as before - nothing about them
-- changes. total_ht/total_tva/total_ttc on `invoices` stay NOT NULL on
-- every row - for a combined invoice they're the sum across its line
-- items.
-- ---------------------------------------------------------------------
ALTER TABLE invoices
  MODIFY COLUMN submission_id INT NULL,
  MODIFY COLUMN client_id INT NULL,
  MODIFY COLUMN consultant_id INT NULL,
  MODIFY COLUMN month VARCHAR(7) NULL,
  MODIFY COLUMN total_days DECIMAL(6,2) NULL,
  MODIFY COLUMN rate DECIMAL(10,2) NULL,
  MODIFY COLUMN label VARCHAR(255) NULL;

CREATE TABLE invoice_line_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  submission_id INT NOT NULL,
  consultant_id INT NOT NULL,
  client_id INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  label VARCHAR(255) NOT NULL,
  total_days DECIMAL(6,2) NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  total_ht DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Per-admin two-factor authentication (TOTP, Google Authenticator
-- compatible). two_factor_secret holds the pending/confirmed secret -
-- it's written as soon as an admin opens the setup screen, and
-- two_factor_enabled is the only thing that flips once they confirm a
-- real code from their app (see controllers/twoFactorController.js).
-- admin_backup_codes holds 10 one-time recovery codes per admin,
-- bcrypt-hashed like passwords (never stored in plaintext) - used_at
-- marks a code as spent so it can't be reused.
-- ---------------------------------------------------------------------
ALTER TABLE admins
  ADD COLUMN two_factor_secret VARCHAR(64) DEFAULT NULL,
  ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE admin_backup_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  used_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- REFERENCE ONLY - this table already exists live (created outside this
-- app, alongside the public landing page). `IF NOT EXISTS` makes this
-- safe/idempotent to run - it's here purely so this file stays the one
-- place documenting every table the Admin Panel touches.
--
-- career_offers backs the "Career" section: job postings shown on the
-- public landing page (handsight-solutions.com, a different site from
-- this Admin Panel). image_path stores a full public URL (see
-- config/uploadPaths.js's CAREER_IMAGE_PUBLIC_BASE_URL) rather than a
-- bare filename, so both this app and the landing page can use it as-is.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS career_offers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  tags VARCHAR(255) DEFAULT NULL,
  intro TEXT,
  skills JSON,
  apply_email VARCHAR(255) NOT NULL DEFAULT 'candidature@handsight-solutions.com',
  image_path VARCHAR(500) DEFAULT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Suppliers directory (Clients & Suppliers page) - the actual company
-- that issues a supplier invoice, distinct from the consultant (the
-- person being paid) and from the Handsight client. Mirrors the clients
-- table's shape but trimmed to only the fields a Moroccan supplier
-- invoice actually carries. legal_name is the only required field - an
-- admin can quick-add a supplier straight from the Upload Real Invoice
-- dialog with just that, and fill in the rest later from the Suppliers
-- page. Never hard-linked to invoices via a real FK (no other table in
-- this schema uses one either) - see invoices.supplier_id below.
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  ice VARCHAR(50) DEFAULT NULL,
  tp VARCHAR(50) DEFAULT NULL,
  if_number VARCHAR(50) DEFAULT NULL,
  rc VARCHAR(50) DEFAULT NULL,
  siege VARCHAR(500) DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Set only once a real invoice is uploaded and linked to a supplier (see
-- controllers/invoicesController.js's handleUploadReal) - NULL for every
-- simulated invoice (nothing to link yet) and for client invoices
-- (supplier concept doesn't apply to them at all).
ALTER TABLE invoices
  ADD COLUMN supplier_id INT DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- paid_at tracks money actually changing hands, manually toggled either
-- way (controllers/invoicesController.js's handleTogglePaid) and
-- independent of everything else on the row:
--   - Client invoices: the client has actually paid Handsight.
--   - Supplier invoices: Handsight has actually paid the supplier - only
--     togglable once the real invoice is on file (is_simulation = 0),
--     since uploading that document and actually sending the money are
--     two separate moments.
-- ---------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN paid_at TIMESTAMP DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Payroll (Salaries section) - Handsight's own employees, paid a fixed
-- monthly salary rather than a per-day TJM. Deliberately NOT modeled on
-- consultants/month_submissions: there's no client to bill, no approval
-- workflow, and no invoice - just "did this employee get paid this
-- month, and here's their payslip." net_salary/gross_salary on employees
-- are the current/default figures shown when filling in a new month's
-- payment; salary_payments.net_salary/gross_salary are a frozen snapshot
-- of what was actually paid that month (same "freeze at the moment of
-- payment" idea as month_submissions' frozen TJM columns), so a later
-- raise doesn't retroactively rewrite past months.
-- ---------------------------------------------------------------------
CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  job_title VARCHAR(255) DEFAULT NULL,
  net_salary DECIMAL(10,2) DEFAULT NULL,
  gross_salary DECIMAL(10,2) DEFAULT NULL,
  bank_name VARCHAR(255) DEFAULT NULL,
  bank_rib VARCHAR(24) DEFAULT NULL,
  bank_iban VARCHAR(34) DEFAULT NULL,
  bank_swift VARCHAR(11) DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One row per employee per month they were actually paid - a missing row
-- for a given employee+month simply means that month hasn't been
-- recorded yet (no separate "unpaid" state to track). The UNIQUE
-- constraint is the same "rely on the DB, handle ER_DUP_ENTRY in the
-- controller" safety net already used for invoices.invoice_number.
CREATE TABLE salary_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  net_salary DECIMAL(10,2) NOT NULL,
  gross_salary DECIMAL(10,2) NOT NULL,
  paid_date DATE NOT NULL,
  payslip_path VARCHAR(255) DEFAULT NULL,
  payslip_original_name VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY employee_month (employee_id, month)
);

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab.
--
-- Charges section - general company expenses (bank fees, telephony,
-- equipment, etc.), unrelated to consultants/clients/suppliers/payroll.
-- charge_categories is a deliberately open-ended taxonomy, not a fixed
-- ENUM like STATUSES elsewhere in this app: the 8 rows seeded below are
-- starting defaults the admin picks from, but controllers/chargesController.js's
-- quick-add lets them create more inline while recording a charge, the
-- same "select existing or quick-add" pattern as suppliers on the
-- Upload Real Invoice dialog. There's deliberately no rename/delete for
-- categories (out of scope for what was asked) - once created, a
-- category just accumulates charges.
-- ---------------------------------------------------------------------
CREATE TABLE charge_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO charge_categories (name) VALUES
  ('Bank Fees & Charges'),
  ('Telephony & Internet'),
  ('Equipment (Laptops, Phones...)'),
  ('Office Rent'),
  ('Utilities (Electricity, Water...)'),
  ('Software & Subscriptions'),
  ('Office Supplies'),
  ('Travel & Transport');

-- invoice_path is optional - a charge can be recorded before the
-- purchase invoice/receipt is in hand, and attached later (see
-- chargesController.handleUploadInvoice), same "optional at creation,
-- addable later" idea as salary_payments.payslip_path.
CREATE TABLE charges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  label VARCHAR(255) DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  charge_date DATE NOT NULL,
  invoice_path VARCHAR(255) DEFAULT NULL,
  invoice_original_name VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

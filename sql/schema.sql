-- Handsight Admin Panel - additive schema
-- Run this once in phpMyAdmin's SQL tab, against the SAME database the
-- Consultant Dashboard already uses.
--
-- This does NOT create or alter `users`, `clients`, `consultant_clients`,
-- `month_submissions`, `daily_entries`, or `login_attempts` - those
-- already exist and are owned by the Consultant Dashboard's own
-- sql/schema.sql. This file only adds the two tables the Admin Panel
-- itself needs.

-- Admin Panel's own login accounts. There is NO signup or password-reset
-- UI in the app - rows here are created/updated only by hand, via a
-- direct INSERT/UPDATE in phpMyAdmin. Generate the bcrypt hash first
-- with: npm run hash-password -- "YourChosenPassword"
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Example (run after generating a hash):
-- INSERT INTO admins (username, password_hash) VALUES ('admin', '$2a$12$...');

-- Admin Panel's own session store table, required by
-- express-mysql-session (exact schema it expects). Completely separate
-- from the Consultant Dashboard's `sessions` table - never share rows
-- between the two apps.
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT(11) UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab (needs a user with ALTER
-- privileges, e.g. your root/admin phpMyAdmin login - NOT the Admin
-- Panel's own restricted DB user, which must never have ALTER).
--
-- Adds enterprise/legal identification, a main contact ("responsable"),
-- bank account details, and general/billing fields to the existing
-- `clients` table, in prep for the future Facturation module. All
-- columns are nullable - existing client rows are unaffected.
-- ---------------------------------------------------------------------
ALTER TABLE clients
  -- Enterprise / legal identification
  ADD COLUMN ice VARCHAR(20) DEFAULT NULL,
  ADD COLUMN rc VARCHAR(30) DEFAULT NULL,
  ADD COLUMN rc_city VARCHAR(100) DEFAULT NULL,
  ADD COLUMN patente VARCHAR(30) DEFAULT NULL,
  ADD COLUMN tax_identifier VARCHAR(30) DEFAULT NULL, -- IF (Identifiant Fiscal)
  ADD COLUMN cnss_number VARCHAR(30) DEFAULT NULL,
  ADD COLUMN legal_form VARCHAR(50) DEFAULT NULL,
  ADD COLUMN registered_capital DECIMAL(12,2) DEFAULT NULL,
  ADD COLUMN registered_address VARCHAR(255) DEFAULT NULL,
  -- Responsable / main contact
  ADD COLUMN contact_name VARCHAR(150) DEFAULT NULL,
  ADD COLUMN contact_title VARCHAR(150) DEFAULT NULL,
  ADD COLUMN contact_phone VARCHAR(30) DEFAULT NULL,
  ADD COLUMN contact_email VARCHAR(150) DEFAULT NULL,
  -- Bank account information
  ADD COLUMN bank_name VARCHAR(150) DEFAULT NULL,
  ADD COLUMN bank_rib VARCHAR(24) DEFAULT NULL,
  ADD COLUMN bank_iban VARCHAR(34) DEFAULT NULL,
  ADD COLUMN bank_swift VARCHAR(11) DEFAULT NULL,
  -- General / other
  ADD COLUMN company_phone VARCHAR(30) DEFAULT NULL,
  ADD COLUMN company_email VARCHAR(150) DEFAULT NULL,
  ADD COLUMN website VARCHAR(255) DEFAULT NULL,
  ADD COLUMN billing_address VARCHAR(255) DEFAULT NULL,
  ADD COLUMN payment_terms VARCHAR(100) DEFAULT NULL,
  ADD COLUMN notes TEXT DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MySQL user privileges (set up in hPanel, not by this script):
-- The Admin Panel's dedicated DB user needs SELECT/INSERT/UPDATE/DELETE
-- on: admins, admin_sessions, users, clients, consultant_clients,
-- month_submissions, daily_entries. It should only ever need SELECT on
-- login_attempts (the app's own model layer never writes to that table -
-- see models/loginAttemptModel.js). It must never have DROP/ALTER/GRANT.
-- ---------------------------------------------------------------------

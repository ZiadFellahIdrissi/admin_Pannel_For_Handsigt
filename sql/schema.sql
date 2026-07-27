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
-- MIGRATION - run once in phpMyAdmin's SQL tab (ALTER privileges needed).
--
-- Per-(consultant, client) daily rates ("TJM"). Handsight sits between
-- the client and the consultant, so a consultant can be paid a different
-- rate per client, AND there are two separate rates per pairing: what
-- Handsight pays the consultant (cost) vs what Handsight bills the
-- client (revenue) - the difference is Handsight's margin.
--
-- `consultant_clients` holds the CURRENT/default rates for a pairing -
-- the starting value for any new month_submission against it.
-- `month_submissions` holds a FROZEN SNAPSHOT of both rates, copied in
-- at the moment the submission is created, so a rate renegotiated later
-- never silently rewrites a past month's payout/billing figures. See
-- HANDOFF_TJM_SNAPSHOT.md for what the Consultant Dashboard app (which
-- actually creates month_submissions rows) needs to do to populate this.
-- ---------------------------------------------------------------------
ALTER TABLE consultant_clients
  ADD COLUMN consultant_tjm DECIMAL(10,2) DEFAULT NULL,  -- what Handsight pays the consultant
  ADD COLUMN client_tjm DECIMAL(10,2) DEFAULT NULL;      -- what Handsight bills the client

-- Backfill: best-effort default from the consultant's existing flat rate.
-- client_tjm has no historical source at all - stays NULL, the admin
-- sets it per pairing going forward (via the Admin Panel's "Edit Rates").
UPDATE consultant_clients cc
  JOIN users u ON u.id = cc.user_id
   SET cc.consultant_tjm = u.daily_rate
 WHERE cc.consultant_tjm IS NULL;

ALTER TABLE month_submissions
  ADD COLUMN consultant_tjm DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN client_tjm DECIMAL(10,2) DEFAULT NULL;

-- Backfill existing submissions the same best-effort way (can't recover
-- what a rate actually was historically if it has since changed - a
-- known limitation of backfilling old data).
UPDATE month_submissions ms
  JOIN users u ON u.id = ms.user_id
   SET ms.consultant_tjm = u.daily_rate
 WHERE ms.consultant_tjm IS NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab (ALTER privileges needed).
--
-- What role/title this consultant holds AT that specific client (e.g.
-- "Lead Developer", "Project Manager") - a property of the pairing, same
-- as the TJMs above, since a consultant can hold a different role at
-- each client they work with. Named `role_title`, not `position` -
-- POSITION is a reserved word/built-in function in MySQL.
-- ---------------------------------------------------------------------
ALTER TABLE consultant_clients
  ADD COLUMN role_title VARCHAR(150) DEFAULT NULL;

-- ---------------------------------------------------------------------
-- MIGRATION - run once in phpMyAdmin's SQL tab (ALTER privileges needed).
--
-- Optional extra fee percentage per (consultant, client) pairing. This is
-- a cost Handsight itself absorbs - an extra amount Handsight pays out
-- (on top of consultant_tjm) that comes straight out of Handsight's
-- margin, not something charged to the client or the consultant. The
-- percentage is set per pairing (not a fixed number) via "Edit Details"
-- on that consultant's page:
--   no extra fee (0, default): margin = total_billed - total_payout
--   extra fee set to X%:       margin = total_billed - total_payout - (total_payout * X / 100)
--
-- Same snapshot pattern as consultant_tjm/client_tjm above:
-- `consultant_clients.extra_fee_percent` is the CURRENT/default setting
-- for a pairing; `month_submissions.extra_fee_percent` is a FROZEN
-- SNAPSHOT copied in at submission-creation time, so changing this later
-- never rewrites a past month's margin. See HANDOFF_TJM_SNAPSHOT.md for
-- what the Consultant Dashboard app needs to do to populate this.
-- DEFAULT 0 needs no backfill - it correctly means "no extra fee" for
-- every existing row, matching current behavior.
-- ---------------------------------------------------------------------
ALTER TABLE consultant_clients
  ADD COLUMN extra_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE month_submissions
  ADD COLUMN extra_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- CLEANUP - run only if you already applied an earlier draft of the
-- migration above, back when this feature was a `fees_applied` boolean
-- checkbox instead of a percentage. It was redesigned before shipping;
-- no code anywhere references `fees_applied` anymore. If you never ran
-- that earlier ALTER TABLE, skip this - it'll just error "unknown
-- column" harmlessly, there's nothing to clean up.
-- ---------------------------------------------------------------------
ALTER TABLE consultant_clients DROP COLUMN fees_applied;
ALTER TABLE month_submissions DROP COLUMN fees_applied;

-- ---------------------------------------------------------------------
-- OPTIONAL, DO NOT RUN YET - `users.daily_rate` is being retired in
-- favor of per-(consultant, client) TJM above. The Admin Panel no longer
-- reads or writes this column anywhere. DO NOT run this DROP until the
-- Consultant Dashboard has ALSO been updated to stop reading it (see
-- HANDOFF_TJM_SNAPSHOT.md) - it still uses `users.daily_rate` directly
-- today (calendar view, dashboard stats) and WILL throw SQL errors the
-- moment this column disappears if that hasn't shipped yet.
-- ---------------------------------------------------------------------
-- ALTER TABLE users DROP COLUMN daily_rate;

-- ---------------------------------------------------------------------
-- MySQL user privileges (set up in hPanel, not by this script):
-- The Admin Panel's dedicated DB user needs SELECT/INSERT/UPDATE/DELETE
-- on: admins, admin_sessions, users, clients, consultant_clients,
-- month_submissions, daily_entries. It should only ever need SELECT on
-- login_attempts (the app's own model layer never writes to that table -
-- see models/loginAttemptModel.js). It must never have DROP/ALTER/GRANT.
-- ---------------------------------------------------------------------

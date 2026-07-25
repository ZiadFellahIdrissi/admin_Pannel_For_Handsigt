-- ============================================================
-- DESTRUCTIVE - WIPES EVERY CONSULTANT, CLIENT, SUBMISSION, DAILY
-- ENTRY, AND LOGIN RECORD IN THE SHARED DATABASE. IRREVERSIBLE.
--
-- This affects BOTH the Admin Panel and the Consultant Dashboard,
-- since they share one database. Every consultant account, every
-- client, every month_submission and daily_entry, all login
-- history, and all active sessions (both apps) are deleted and
-- every table's auto-increment counter is reset back to 1.
--
-- ONLY the `admins` table is left untouched - your admin login(s)
-- survive this.
--
-- Take a full database backup/export in phpMyAdmin before running
-- this. There is no undo once it's run.
--
-- Run this once in phpMyAdmin's SQL tab.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Business data (shared with the Consultant Dashboard)
TRUNCATE TABLE daily_entries;
TRUNCATE TABLE month_submissions;
TRUNCATE TABLE consultant_clients;
TRUNCATE TABLE users;
TRUNCATE TABLE clients;
TRUNCATE TABLE login_attempts;

-- Session stores (both apps) - clears every active login, including
-- the admin session you're currently using to run this script.
TRUNCATE TABLE sessions;
TRUNCATE TABLE admin_sessions;

SET FOREIGN_KEY_CHECKS = 1;

-- `admins` is intentionally NOT truncated - your admin login(s) are kept.

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

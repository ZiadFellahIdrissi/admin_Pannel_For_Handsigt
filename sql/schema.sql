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

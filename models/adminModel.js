const pool = require('../config/db');

// Account creation and passwords stay read-only here: this app has no
// signup or password-change UI, and admin accounts are created/updated
// exclusively by hand in phpMyAdmin (see sql/schema.sql). Two-factor
// state below is a narrower exception - each admin manages their own via
// Settings, so it needs real write functions, same reasoning as
// companyInfoModel having its own despite also being a manually-seeded
// table originally.

async function findByUsername(username) {
  const [rows] = await pool.query(
    'SELECT * FROM admins WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT * FROM admins WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

// Written as soon as an admin opens the Security setup screen - stays
// unconfirmed (two_factor_enabled still 0) until they prove they scanned
// it by entering a real code.
async function setPendingTwoFactorSecret(id, secret) {
  await pool.query('UPDATE admins SET two_factor_secret = ? WHERE id = ?', [secret, id]);
}

// Only called after twoFactorController verifies a real code against the
// pending secret - the secret itself doesn't change here, just the flag.
// Scoped with `AND two_factor_enabled = 0`, same "only one winner"
// pattern as monthSubmissionModel.approve()/reject() - a duplicate
// activation request (e.g. a double form submit racing the first one
// before it commits) gets affectedRows === 0 back and knows to stand
// down, instead of regenerating a second, unrelated set of backup codes
// on top of the first.
async function enableTwoFactor(id) {
  const [result] = await pool.query(
    'UPDATE admins SET two_factor_enabled = 1 WHERE id = ? AND two_factor_enabled = 0',
    [id]
  );
  return result.affectedRows > 0;
}

// Only called after a re-auth code check passes (see
// controllers/twoFactorController.js's handleDeactivate). Clears the
// secret too, not just the flag, so a future re-activation starts clean.
async function disableTwoFactor(id) {
  await pool.query('UPDATE admins SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?', [id]);
}

module.exports = {
  findByUsername,
  findById,
  setPendingTwoFactorSecret,
  enableTwoFactor,
  disableTwoFactor
};

const pool = require('../config/db');

// Login attempts for THIS app only - unlike models/loginAttemptModel.js
// (read-only, owned by the Consultant Dashboard), this table is fully
// owned by the Admin Panel: written here on every login attempt, read
// here for the "Admin Logins" page.

async function record({ username, ipAddress, success }) {
  await pool.query(
    'INSERT INTO admin_login_attempts (username, ip_address, success) VALUES (?, ?, ?)',
    [username, ipAddress || null, success ? 1 : 0]
  );
}

async function listRecent({ limit = 100, onlyFailures = false } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  if (onlyFailures) {
    const [rows] = await pool.query(
      'SELECT * FROM admin_login_attempts WHERE success = 0 ORDER BY attempted_at DESC LIMIT ?',
      [safeLimit]
    );
    return rows;
  }
  const [rows] = await pool.query(
    'SELECT * FROM admin_login_attempts ORDER BY attempted_at DESC LIMIT ?',
    [safeLimit]
  );
  return rows;
}

module.exports = { record, listRecent };

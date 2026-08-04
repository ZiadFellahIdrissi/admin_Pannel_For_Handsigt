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

// All-time totals for the small Analysis page - same shape as
// loginAttemptModel.js's getStats(), just against this app's own table.
async function getStats() {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total, COALESCE(SUM(success), 0) AS succeeded FROM admin_login_attempts'
  );
  const total = Number(rows[0].total);
  const succeeded = Number(rows[0].succeeded);
  return { total, succeeded, failed: total - succeeded };
}

async function topFailingIps(limit = 5) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;
  const [rows] = await pool.query(
    `SELECT ip_address, COUNT(*) AS failures
       FROM admin_login_attempts
      WHERE success = 0 AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY failures DESC
      LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

module.exports = { record, listRecent, getStats, topFailingIps };

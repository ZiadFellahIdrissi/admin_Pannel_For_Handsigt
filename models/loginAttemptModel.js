const pool = require('../config/db');

// READ-ONLY by design. login_attempts is written exclusively by the
// Consultant Dashboard's own login flow - do not add INSERT/UPDATE/
// DELETE statements to this file.

async function listRecent({ limit = 100, onlyFailures = false } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  if (onlyFailures) {
    const [rows] = await pool.query(
      'SELECT * FROM login_attempts WHERE success = 0 ORDER BY attempted_at DESC LIMIT ?',
      [safeLimit]
    );
    return rows;
  }
  const [rows] = await pool.query(
    'SELECT * FROM login_attempts ORDER BY attempted_at DESC LIMIT ?',
    [safeLimit]
  );
  return rows;
}

// All-time totals for the small Analysis page - success/failure counts
// and a success rate, computed from the whole table (not just the
// most-recent-100 window listRecent uses for the list page).
async function getStats() {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total, COALESCE(SUM(success), 0) AS succeeded FROM login_attempts'
  );
  const total = Number(rows[0].total);
  const succeeded = Number(rows[0].succeeded);
  return { total, succeeded, failed: total - succeeded };
}

// Top IPs by failed-attempt count - the one thing worth flagging on a
// small analysis page (repeated failures from one IP is the classic
// brute-force signal).
async function topFailingIps(limit = 5) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;
  const [rows] = await pool.query(
    `SELECT ip_address, COUNT(*) AS failures
       FROM login_attempts
      WHERE success = 0 AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY failures DESC
      LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

module.exports = { listRecent, getStats, topFailingIps };

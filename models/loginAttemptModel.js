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

module.exports = { listRecent };

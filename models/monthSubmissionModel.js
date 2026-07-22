const pool = require('../config/db');

// Approve/reject/reopen are plain, narrowly-scoped UPDATEs - matching
// the exact SQL in the handoff doc. None of them ever touch
// `notification_sent`: the Consultant Dashboard's own background poller
// watches for status changes and emails the consultant, then sets that
// flag itself.

async function listPending() {
  const [rows] = await pool.query(
    `SELECT ms.id, ms.user_id, ms.client_id,
            CONCAT(u.first_name, ' ', u.last_name) AS consultant_name,
            c.name AS client_name, ms.month, ms.status,
            COALESCE(SUM(de.value), 0) AS total_days,
            COALESCE(SUM(de.value), 0) * u.daily_rate AS total_earnings,
            ms.submitted_at
       FROM month_submissions ms
       JOIN users u ON u.id = ms.user_id
       JOIN clients c ON c.id = ms.client_id
       LEFT JOIN daily_entries de ON de.submission_id = ms.id
      WHERE ms.status = 'pending'
      GROUP BY ms.id
      ORDER BY ms.submitted_at ASC`
  );
  return rows;
}

async function listHistory({ month, clientId, status } = {}) {
  const conditions = [];
  const params = [];

  if (month) {
    conditions.push('ms.month = ?');
    params.push(month);
  }
  if (clientId) {
    conditions.push('ms.client_id = ?');
    params.push(clientId);
  }
  if (status) {
    conditions.push('ms.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ms.id, ms.user_id, ms.client_id,
            CONCAT(u.first_name, ' ', u.last_name) AS consultant_name,
            c.name AS client_name, ms.month, ms.status, ms.admin_comment,
            COALESCE(SUM(de.value), 0) AS total_days,
            COALESCE(SUM(de.value), 0) * u.daily_rate AS total_earnings,
            ms.submitted_at, ms.reviewed_at
       FROM month_submissions ms
       JOIN users u ON u.id = ms.user_id
       JOIN clients c ON c.id = ms.client_id
       LEFT JOIN daily_entries de ON de.submission_id = ms.id
       ${whereClause}
      GROUP BY ms.id
      ORDER BY ms.month DESC, ms.id DESC`,
    params
  );
  return rows;
}

async function listForConsultant(userId) {
  const [rows] = await pool.query(
    `SELECT ms.id, ms.user_id, ms.client_id,
            c.name AS client_name, ms.month, ms.status, ms.admin_comment,
            COALESCE(SUM(de.value), 0) AS total_days,
            COALESCE(SUM(de.value), 0) * u.daily_rate AS total_earnings,
            ms.submitted_at, ms.reviewed_at
       FROM month_submissions ms
       JOIN users u ON u.id = ms.user_id
       JOIN clients c ON c.id = ms.client_id
       LEFT JOIN daily_entries de ON de.submission_id = ms.id
      WHERE ms.user_id = ?
      GROUP BY ms.id
      ORDER BY ms.month DESC, ms.id DESC`,
    [userId]
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ms.*, CONCAT(u.first_name, ' ', u.last_name) AS consultant_name, c.name AS client_name
       FROM month_submissions ms
       JOIN users u ON u.id = ms.user_id
       JOIN clients c ON c.id = ms.client_id
      WHERE ms.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Scoped with `AND status = 'pending'` so a double-click or a second
// admin tab can't re-process an already-decided row - affectedRows === 0
// tells the controller it was already handled.
async function approve(id) {
  const [result] = await pool.query(
    "UPDATE month_submissions SET status = 'approved', reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
    [id]
  );
  return result.affectedRows > 0;
}

async function reject(id, comment) {
  const [result] = await pool.query(
    "UPDATE month_submissions SET status = 'rejected', admin_comment = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
    [comment || null, id]
  );
  return result.affectedRows > 0;
}

async function reopenToDraft(id) {
  await pool.query(
    `UPDATE month_submissions
        SET status = 'draft', submitted_at = NULL, reviewed_at = NULL, admin_comment = NULL
      WHERE id = ?`,
    [id]
  );
}

module.exports = {
  listPending,
  listHistory,
  listForConsultant,
  findById,
  approve,
  reject,
  reopenToDraft
};

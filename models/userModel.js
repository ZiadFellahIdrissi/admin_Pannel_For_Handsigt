const pool = require('../config/db');

// Consultants (the `users` table). Unlike the Consultant Dashboard's own
// read-mostly model for this table, the Admin Panel needs full CRUD -
// this is the model that replaces manual phpMyAdmin edits.

// `active` is 1, 0, or undefined/null (no filter - list everyone).
async function list(active) {
  if (active === 1 || active === 0) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE active = ? ORDER BY last_name ASC, first_name ASC',
      [active]
    );
    return rows;
  }
  const [rows] = await pool.query(
    'SELECT * FROM users ORDER BY last_name ASC, first_name ASC'
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

async function create({ username, firstName, lastName, email, dailyRate, passwordHash }) {
  const [result] = await pool.query(
    `INSERT INTO users
       (username, password_hash, first_name, last_name, email, daily_rate, must_change_password, active)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
    [username, passwordHash, firstName, lastName, email, dailyRate]
  );
  return result.insertId;
}

async function update(id, { firstName, lastName, email, dailyRate, active }) {
  await pool.query(
    `UPDATE users
        SET first_name = ?, last_name = ?, email = ?, daily_rate = ?, active = ?
      WHERE id = ?`,
    [firstName, lastName, email, dailyRate, active ? 1 : 0, id]
  );
}

async function resetPassword(id, passwordHash) {
  await pool.query(
    'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
    [passwordHash, id]
  );
}

async function hasPendingSubmissions(id) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS pending_count FROM month_submissions WHERE user_id = ? AND status = 'pending'",
    [id]
  );
  return rows[0].pending_count > 0;
}

module.exports = {
  list,
  findById,
  findByUsername,
  create,
  update,
  resetPassword,
  hasPendingSubmissions
};

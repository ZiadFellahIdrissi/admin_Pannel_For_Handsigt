const pool = require('../config/db');

// Deliberately read-only: this app has no signup or password-change UI.
// Admin accounts are created/updated exclusively by hand in phpMyAdmin
// (see sql/schema.sql) - do not add write functions here.

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

module.exports = { findByUsername, findById };

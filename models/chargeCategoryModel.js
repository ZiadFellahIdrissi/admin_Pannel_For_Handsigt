const pool = require('../config/db');

// Deliberately no update/remove here - see the schema.sql migration
// comment: categories are seeded + quick-added, never renamed or
// deleted, so there's no "in use" guard to worry about like clients/
// suppliers/employees have.
async function list() {
  const [rows] = await pool.query('SELECT * FROM charge_categories ORDER BY name ASC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM charge_categories WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query('SELECT * FROM charge_categories WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

// Used by the quick-add flow (controllers/chargesController.js) - name
// is UNIQUE at the DB level, so a race between two quick-adds of the
// same new category name surfaces as ER_DUP_ENTRY for the caller to
// handle, same idiom as invoices.invoice_number.
async function create(name) {
  const [result] = await pool.query('INSERT INTO charge_categories (name) VALUES (?)', [name]);
  return result.insertId;
}

module.exports = { list, findById, findByName, create };

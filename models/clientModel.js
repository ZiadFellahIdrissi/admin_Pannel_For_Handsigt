const pool = require('../config/db');

// Clients are never hard-deleted, only deactivated (`active = 0`) - a
// hard delete would cascade-destroy consultant_clients/month_submissions
// history via the existing FK constraints. There is deliberately no
// delete function in this file.

// `active` is 1, 0, or undefined/null (no filter - list every client).
async function list(active) {
  if (active === 1 || active === 0) {
    const [rows] = await pool.query(
      'SELECT * FROM clients WHERE active = ? ORDER BY name ASC',
      [active]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM clients ORDER BY name ASC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ name }) {
  const [result] = await pool.query(
    'INSERT INTO clients (name, active) VALUES (?, 1)',
    [name]
  );
  return result.insertId;
}

async function update(id, { name }) {
  await pool.query('UPDATE clients SET name = ? WHERE id = ?', [name, id]);
}

async function setActive(id, active) {
  await pool.query('UPDATE clients SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

module.exports = { list, findById, create, update, setActive };

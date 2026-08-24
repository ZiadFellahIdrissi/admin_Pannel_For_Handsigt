const pool = require('../config/db');

// Suppliers are normally only deactivated (`active = 0`), never deleted -
// a hard delete would silently orphan any invoice that references them.
// remove() below is only ever called after the controller has confirmed,
// via hasAnyInvoices, that nothing points at this supplier.

// `active` is 1, 0, or undefined/null (no filter - list every supplier).
async function list(active) {
  if (active === 1 || active === 0) {
    const [rows] = await pool.query(
      'SELECT * FROM suppliers WHERE active = ? ORDER BY legal_name ASC',
      [active]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY legal_name ASC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ legalName, ice, tp, ifNumber, rc, siege }) {
  const [result] = await pool.query(
    `INSERT INTO suppliers (legal_name, active, ice, tp, if_number, rc, siege)
     VALUES (?, 1, ?, ?, ?, ?, ?)`,
    [legalName, ice || null, tp || null, ifNumber || null, rc || null, siege || null]
  );
  return result.insertId;
}

async function update(id, { legalName, ice, tp, ifNumber, rc, siege }) {
  await pool.query(
    `UPDATE suppliers SET legal_name = ?, ice = ?, tp = ?, if_number = ?, rc = ?, siege = ? WHERE id = ?`,
    [legalName, ice || null, tp || null, ifNumber || null, rc || null, siege || null, id]
  );
}

async function setActive(id, active) {
  await pool.query('UPDATE suppliers SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

async function hasAnyInvoices(id) {
  const [rows] = await pool.query('SELECT id FROM invoices WHERE supplier_id = ? LIMIT 1', [id]);
  return rows.length > 0;
}

// Only safe to call once the controller has verified there's nothing to
// orphan (see hasAnyInvoices above).
async function remove(id) {
  await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
}

module.exports = { list, findById, create, update, setActive, hasAnyInvoices, remove };

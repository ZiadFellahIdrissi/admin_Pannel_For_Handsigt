const pool = require('../config/db');

// Optional categoryId filter, same URL-query-filter convention as
// clientModel.list(active) - most recent charge first.
async function list({ categoryId } = {}) {
  const conditions = [];
  const params = [];
  if (categoryId) {
    conditions.push('c.category_id = ?');
    params.push(categoryId);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT c.*, cc.name AS category_name
       FROM charges c
       JOIN charge_categories cc ON cc.id = c.category_id
       ${whereClause}
      ORDER BY c.charge_date DESC, c.created_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT c.*, cc.name AS category_name
       FROM charges c
       JOIN charge_categories cc ON cc.id = c.category_id
      WHERE c.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ categoryId, label, amountHt, amountTva, amountTtc, chargeDate, invoicePath, invoiceOriginalName }) {
  const [result] = await pool.query(
    `INSERT INTO charges (category_id, label, amount_ht, amount_tva, amount_ttc, charge_date, invoice_path, invoice_original_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [categoryId, label || null, amountHt, amountTva, amountTtc, chargeDate, invoicePath || null, invoiceOriginalName || null]
  );
  return result.insertId;
}

async function update(id, { categoryId, label, amountHt, amountTva, amountTtc, chargeDate }) {
  await pool.query(
    'UPDATE charges SET category_id = ?, label = ?, amount_ht = ?, amount_tva = ?, amount_ttc = ?, charge_date = ? WHERE id = ?',
    [categoryId, label || null, amountHt, amountTva, amountTtc, chargeDate, id]
  );
}

async function updateInvoice(id, { invoicePath, invoiceOriginalName }) {
  await pool.query(
    'UPDATE charges SET invoice_path = ?, invoice_original_name = ? WHERE id = ?',
    [invoicePath, invoiceOriginalName, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM charges WHERE id = ?', [id]);
}

module.exports = { list, findById, create, update, updateInvoice, remove };

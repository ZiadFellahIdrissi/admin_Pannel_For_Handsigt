const pool = require('../config/db');

// Optional from/to month-range filter, most recent first - same
// query-filter convention as invoiceModel.listByType.
async function list({ from, to } = {}) {
  const conditions = [];
  const params = [];
  if (from) {
    conditions.push('month >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('month <= ?');
    params.push(to);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT * FROM bank_statements ${whereClause} ORDER BY month DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM bank_statements WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByMonth(month) {
  const [rows] = await pool.query('SELECT * FROM bank_statements WHERE month = ? LIMIT 1', [month]);
  return rows[0] || null;
}

// For the "combine into one PDF" action - always chronological
// regardless of the order the admin checked the boxes in.
async function findByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const [rows] = await pool.query(
    'SELECT * FROM bank_statements WHERE id IN (?) ORDER BY month ASC',
    [ids]
  );
  return rows;
}

// Create-or-replace for one month - the caller (controller) is
// responsible for deleting the old file from disk first when replacing,
// same "swap the file" pattern as invoicesController.handleUploadReal.
async function upsert({ month, filePath, fileOriginalName }) {
  const existing = await findByMonth(month);
  if (existing) {
    await pool.query(
      'UPDATE bank_statements SET file_path = ?, file_original_name = ? WHERE id = ?',
      [filePath, fileOriginalName || null, existing.id]
    );
    return { id: existing.id, previousFilePath: existing.file_path, replaced: true };
  }

  const [result] = await pool.query(
    'INSERT INTO bank_statements (month, file_path, file_original_name) VALUES (?, ?, ?)',
    [month, filePath, fileOriginalName || null]
  );
  return { id: result.insertId, previousFilePath: null, replaced: false };
}

async function remove(id) {
  await pool.query('DELETE FROM bank_statements WHERE id = ?', [id]);
}

module.exports = { list, findById, findByMonth, findByIds, upsert, remove };

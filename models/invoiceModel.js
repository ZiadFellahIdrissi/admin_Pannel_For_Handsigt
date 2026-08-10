const pool = require('../config/db');

const TYPE_PREFIX = { client: 'C', supplier: 'F' };

// 'HS-C-2026-08-001' - NNN is the highest existing counter for this
// exact type+year+month prefix, +1, zero-padded. The invoices table's
// UNIQUE constraint on invoice_number is the safety net if two get
// generated at the same instant.
async function nextInvoiceNumber(type) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `HS-${TYPE_PREFIX[type]}-${yyyy}-${mm}-`;

  const [rows] = await pool.query(
    'SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1',
    [`${prefix}%`]
  );

  const lastSeq = rows.length ? parseInt(rows[0].invoice_number.slice(-3), 10) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
}

// Both client and supplier invoice IDs for a submission, if generated -
// used by History to link directly to them instead of the button, and by
// invoice generation itself to know which of the two (if either) still
// need generating.
async function findIdsForSubmission(submissionId) {
  const [rows] = await pool.query(
    'SELECT id, type FROM invoices WHERE submission_id = ?',
    [submissionId]
  );
  const result = { clientInvoiceId: null, supplierInvoiceId: null };
  rows.forEach((r) => {
    if (r.type === 'client') result.clientInvoiceId = r.id;
    if (r.type === 'supplier') result.supplierInvoiceId = r.id;
  });
  return result;
}

async function create({
  invoiceNumber, type, submissionId, clientId, consultantId, month,
  totalDays, rate, totalHt, totalTva, totalTtc, label, pdfPath
}) {
  const [result] = await pool.query(
    `INSERT INTO invoices
       (invoice_number, type, submission_id, client_id, consultant_id, month,
        total_days, rate, total_ht, total_tva, total_ttc, label, pdf_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoiceNumber, type, submissionId, clientId, consultantId, month,
      totalDays, rate, totalHt, totalTva, totalTtc, label, pdfPath]
  );
  return result.insertId;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT i.*, CONCAT(u.first_name, ' ', u.last_name) AS consultant_name, COALESCE(c.legal_name, c.name) AS client_name
       FROM invoices i
       JOIN users u ON u.id = i.consultant_id
       JOIN clients c ON c.id = i.client_id
      WHERE i.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listByType(type) {
  const [rows] = await pool.query(
    `SELECT i.*, CONCAT(u.first_name, ' ', u.last_name) AS consultant_name, COALESCE(c.legal_name, c.name) AS client_name
       FROM invoices i
       JOIN users u ON u.id = i.consultant_id
       JOIN clients c ON c.id = i.client_id
      WHERE i.type = ?
      ORDER BY i.created_at DESC`,
    [type]
  );
  return rows;
}

module.exports = {
  nextInvoiceNumber,
  findIdsForSubmission,
  create,
  findById,
  listByType
};

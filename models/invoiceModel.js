const pool = require('../config/db');

// Client invoices are Handsight's own, so they carry no type letter -
// 'HS-2026-08-001'. Supplier invoices keep the 'F' since they're
// generated as a placeholder for a document a third party (the
// supplier) is meant to issue - 'HS-F-2026-08-001'.
function invoiceNumberPrefix(type, yyyy, mm) {
  return type === 'supplier' ? `HS-F-${yyyy}-${mm}-` : `HS-${yyyy}-${mm}-`;
}

// NNN is the highest existing counter for this exact type+year+month
// prefix, +1, zero-padded. The invoices table's UNIQUE constraint on
// invoice_number is the safety net if two get generated at the same instant.
async function nextInvoiceNumber(type) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = invoiceNumberPrefix(type, yyyy, mm);

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
// need generating. A submission invoiced as part of a combined supplier
// invoice has its submission_id on the line item, not the parent
// `invoices` row - the UNION covers both shapes.
async function findIdsForSubmission(submissionId) {
  const [rows] = await pool.query(
    `SELECT id, type FROM invoices WHERE submission_id = ?
     UNION
     SELECT ili.invoice_id AS id, i.type
       FROM invoice_line_items ili
       JOIN invoices i ON i.id = ili.invoice_id
      WHERE ili.submission_id = ?`,
    [submissionId, submissionId]
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
  totalDays, rate, totalHt, totalTva, totalTtc, label, pdfPath, isSimulation
}) {
  const [result] = await pool.query(
    `INSERT INTO invoices
       (invoice_number, type, submission_id, client_id, consultant_id, month,
        total_days, rate, total_ht, total_tva, total_ttc, label, pdf_path, is_simulation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoiceNumber, type, submissionId, clientId, consultantId, month,
      totalDays, rate, totalHt, totalTva, totalTtc, label, pdfPath, isSimulation ? 1 : 0]
  );
  return result.insertId;
}

// Combined supplier invoice: one parent `invoices` row with the seven
// per-submission columns left NULL (there's no single value for any of
// them across N consultants), plus one invoice_line_items row per
// consultant holding the actual breakdown. totalHt/totalTva/totalTtc are
// the sums across lineItems, computed by the caller.
async function createCombined({ invoiceNumber, totalHt, totalTva, totalTtc, pdfPath, isSimulation, lineItems }) {
  const [result] = await pool.query(
    `INSERT INTO invoices
       (invoice_number, type, submission_id, client_id, consultant_id, month,
        total_days, rate, total_ht, total_tva, total_ttc, label, pdf_path, is_simulation)
     VALUES (?, 'supplier', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?)`,
    [invoiceNumber, totalHt, totalTva, totalTtc, pdfPath, isSimulation ? 1 : 0]
  );
  const invoiceId = result.insertId;

  for (const item of lineItems) {
    await pool.query(
      `INSERT INTO invoice_line_items
         (invoice_id, submission_id, consultant_id, client_id, month, label, total_days, rate, total_ht)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, item.submissionId, item.consultantId, item.clientId, item.month, item.label, item.totalDays, item.rate, item.totalHt]
    );
  }

  return invoiceId;
}

// Per-consultant breakdown for a combined supplier invoice - empty for
// every other invoice (client, or a classic single-submission supplier
// invoice), which don't have any invoice_line_items rows.
async function findLineItems(invoiceId) {
  const [rows] = await pool.query(
    `SELECT ili.*, CONCAT(u.first_name, ' ', u.last_name) AS consultant_name, COALESCE(c.legal_name, c.name) AS client_name
       FROM invoice_line_items ili
       JOIN users u ON u.id = ili.consultant_id
       JOIN clients c ON c.id = ili.client_id
      WHERE ili.invoice_id = ?
      ORDER BY ili.id ASC`,
    [invoiceId]
  );
  return rows;
}

// Swaps in the real PDF the admin received from the supplier, replacing
// whatever's on file (simulated or a previous real upload) and clearing
// the simulation flag - the caller is responsible for deleting the old
// file from disk first. invoiceNumber is editable at the same time since
// the real document carries the supplier's own numbering, not ours - the
// UNIQUE constraint on invoice_number surfaces as an ER_DUP_ENTRY error
// if it collides with an existing invoice, left for the caller to handle.
async function replacePdf(id, { pdfPath, isSimulation, invoiceNumber }) {
  await pool.query(
    'UPDATE invoices SET pdf_path = ?, is_simulation = ?, invoice_number = ? WHERE id = ?',
    [pdfPath, isSimulation ? 1 : 0, invoiceNumber, id]
  );
}

// LEFT JOIN (not INNER) - a combined supplier invoice has consultant_id/
// client_id NULL on the parent row, so an inner join would silently
// return zero rows for it. The COALESCE fallbacks cover that case.
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT i.*,
            COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Multiple consultants') AS consultant_name,
            COALESCE(c.legal_name, c.name, 'Multiple clients') AS client_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.consultant_id
       LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listByType(type) {
  const [rows] = await pool.query(
    `SELECT i.*,
            COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Multiple consultants') AS consultant_name,
            COALESCE(c.legal_name, c.name, 'Multiple clients') AS client_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.consultant_id
       LEFT JOIN clients c ON c.id = i.client_id
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
  createCombined,
  findLineItems,
  replacePdf,
  findById,
  listByType
};

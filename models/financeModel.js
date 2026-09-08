const pool = require('../config/db');

function sumBy(rows, key) {
  return rows.reduce((sum, r) => sum + Number(r[key] || 0), 0);
}

function groupSumByMonth(rows, key) {
  const map = {};
  rows.forEach((r) => {
    if (!r.month) return;
    map[r.month] = (map[r.month] || 0) + Number(r[key] || 0);
  });
  return map;
}

function groupSumById(rows, idKey, valueKey) {
  const map = {};
  rows.forEach((r) => {
    const id = r[idKey];
    if (!id) return;
    map[id] = (map[id] || 0) + Number(r[valueKey] || 0);
  });
  return map;
}

// Every calendar month from fromMonth to toMonth inclusive, e.g.
// ('2026-01', '2026-03') -> ['2026-01', '2026-02', '2026-03'].
function buildMonthRange(fromMonth, toMonth) {
  const months = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [toY, toM] = toMonth.split('-').map(Number);
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

// Cash-basis, deliberately: only invoices actually marked paid
// (invoicesController.handleTogglePaid) count as revenue/cost/TVA here.
// Two reasons, not just one: "how much did we gain" means cash actually
// received, not merely billed - and Moroccan TVA on services is due on
// encaissement (payment received), not on invoicing, so an unpaid
// invoice's TVA isn't collectible/deductible yet either. An invoiced-but-
// unpaid amount lives on the Receivables/Payables pages instead, not here.
//
// Client invoices are never combined (unlike supplier ones - see
// invoicesController.js's comment on handleGenerateCombinedSupplier), so
// a plain query against `invoices` already gives one row per real unit
// of revenue - no UNION needed the way the supplier ledger below needs one.
async function getClientLedger(fromMonth, toMonth) {
  const [rows] = await pool.query(
    `SELECT id AS invoice_id, invoice_number, client_id, consultant_id, month, total_ht, total_tva, total_ttc
       FROM invoices
      WHERE type = 'client' AND paid_at IS NOT NULL AND month >= ? AND month <= ?`,
    [fromMonth, toMonth]
  );
  return rows;
}

// One row per actual unit of supplier cost, paid ones only (see the
// cash-basis comment above getClientLedger). A single-submission
// supplier invoice contributes its own row directly, gated on its own
// paid_at; a combined (consolidated) supplier invoice's parent row has
// no single client_id/consultant_id/month to attribute the cost to (see
// invoiceModel.createCombined), so it contributes one row per
// invoice_line_items row instead - each already carrying its own
// client_id/consultant_id/month/total_ht, gated on the *parent* row's
// paid_at (payment is recorded once per combined invoice, never per
// line item - there's no invoice_line_items.paid_at to read).
// total_tva/total_ttc are recomputed as total_ht * 0.2 / * 1.2 rather
// than read from a stored column, because invoice_line_items only ever
// stores total_ht - but that recomputation is exact, not an estimate:
// every supplier invoice in this app (single or combined) is built from
// that same fixed 20% formula (see
// invoicesController.computeSupplierAmounts and handleGenerateCombinedSupplier).
// UNION ALL, not UNION: the two halves can never produce an identical
// row (different id/month/amount pairings), and there's nothing to
// de-duplicate.
async function getSupplierLedger(fromMonth, toMonth) {
  const [rows] = await pool.query(
    `SELECT i.id AS invoice_id, i.invoice_number, i.client_id, i.consultant_id, i.month,
            i.total_ht, i.total_tva, i.total_ttc
       FROM invoices i
      WHERE i.type = 'supplier' AND i.submission_id IS NOT NULL AND i.paid_at IS NOT NULL
        AND i.month >= ? AND i.month <= ?
     UNION ALL
     SELECT i.id AS invoice_id, i.invoice_number, ili.client_id, ili.consultant_id, ili.month,
            ili.total_ht, ROUND(ili.total_ht * 0.2, 2) AS total_tva, ROUND(ili.total_ht * 1.2, 2) AS total_ttc
       FROM invoice_line_items ili
       JOIN invoices i ON i.id = ili.invoice_id
      WHERE i.type = 'supplier' AND i.paid_at IS NOT NULL AND ili.month >= ? AND ili.month <= ?`,
    [fromMonth, toMonth, fromMonth, toMonth]
  );
  return rows;
}

async function getChargesInRange(fromMonth, toMonth) {
  const [rows] = await pool.query(
    `SELECT ch.id, ch.label, ch.charge_date, DATE_FORMAT(ch.charge_date, '%Y-%m') AS month,
            ch.amount_ht, ch.amount_tva, ch.amount_ttc, cc.name AS category_name
       FROM charges ch
       JOIN charge_categories cc ON cc.id = ch.category_id
      WHERE DATE_FORMAT(ch.charge_date, '%Y-%m') >= ? AND DATE_FORMAT(ch.charge_date, '%Y-%m') <= ?
      ORDER BY ch.charge_date ASC`,
    [fromMonth, toMonth]
  );
  return rows;
}

async function getSalariesInRange(fromMonth, toMonth) {
  const [rows] = await pool.query(
    'SELECT id, employee_id, month, net_salary, gross_salary FROM salary_payments WHERE month >= ? AND month <= ?',
    [fromMonth, toMonth]
  );
  return rows;
}

// TVA nette = TVA collectée (client invoices) - TVA déductible (supplier
// invoices + charges) - the same formula Moroccan TVA declarations use,
// whether the admin's actual filing cadence is monthly (fromMonth ===
// toMonth) or quarterly (a 3-month span).
async function getTvaReport(fromMonth, toMonth) {
  const [clientLedger, supplierLedger, charges] = await Promise.all([
    getClientLedger(fromMonth, toMonth),
    getSupplierLedger(fromMonth, toMonth),
    getChargesInRange(fromMonth, toMonth)
  ]);

  const collected = sumBy(clientLedger, 'total_tva');
  const deductibleSuppliers = sumBy(supplierLedger, 'total_tva');
  const deductibleCharges = sumBy(charges, 'amount_tva');
  const deductible = deductibleSuppliers + deductibleCharges;

  return {
    collected,
    deductibleSuppliers,
    deductibleCharges,
    deductible,
    net: collected - deductible,
    clientLedger,
    supplierLedger,
    charges
  };
}

// Compte de résultat simplifié: Revenue (client invoices HT) - Supplier
// cost (HT) = gross margin, minus salaries (gross - the actual cost to
// the business) and charges (HT) = net result. monthlyBreakdown gives
// the same figures per calendar month across the range, for a trend view.
async function getProfitLoss(fromMonth, toMonth) {
  const [clientLedger, supplierLedger, charges, salaries] = await Promise.all([
    getClientLedger(fromMonth, toMonth),
    getSupplierLedger(fromMonth, toMonth),
    getChargesInRange(fromMonth, toMonth),
    getSalariesInRange(fromMonth, toMonth)
  ]);

  const revenueHt = sumBy(clientLedger, 'total_ht');
  const supplierCostHt = sumBy(supplierLedger, 'total_ht');
  const grossMargin = revenueHt - supplierCostHt;
  const salariesGross = sumBy(salaries, 'gross_salary');
  const chargesHt = sumBy(charges, 'amount_ht');
  const netResult = grossMargin - salariesGross - chargesHt;

  const revenueByMonth = groupSumByMonth(clientLedger, 'total_ht');
  const supplierCostByMonth = groupSumByMonth(supplierLedger, 'total_ht');
  const salariesByMonth = groupSumByMonth(salaries, 'gross_salary');
  const chargesByMonth = groupSumByMonth(charges, 'amount_ht');

  const monthlyBreakdown = buildMonthRange(fromMonth, toMonth).map((month) => {
    const revenue = revenueByMonth[month] || 0;
    const supplierCost = supplierCostByMonth[month] || 0;
    const salariesM = salariesByMonth[month] || 0;
    const chargesM = chargesByMonth[month] || 0;
    return {
      month,
      revenueHt: revenue,
      supplierCostHt: supplierCost,
      grossMargin: revenue - supplierCost,
      salariesGross: salariesM,
      chargesHt: chargesM,
      netResult: revenue - supplierCost - salariesM - chargesM
    };
  });

  return { revenueHt, supplierCostHt, grossMargin, salariesGross, chargesHt, netResult, monthlyBreakdown };
}

// Revenue vs. supplier cost attributed to each client - possible because
// a client invoice and the supplier invoice(s) covering the same work
// share the same client_id (directly, or via invoice_line_items for a
// combined supplier invoice). marginPct is null (not 0) when revenueHt
// is 0, so the view can render "—" instead of a misleading 0%.
async function getClientMargins(fromMonth, toMonth) {
  const [clientLedger, supplierLedger] = await Promise.all([
    getClientLedger(fromMonth, toMonth),
    getSupplierLedger(fromMonth, toMonth)
  ]);

  const revenueByClient = groupSumById(clientLedger, 'client_id', 'total_ht');
  const costByClient = groupSumById(supplierLedger, 'client_id', 'total_ht');
  const clientIds = [...new Set([...Object.keys(revenueByClient), ...Object.keys(costByClient)])].map(Number);
  if (clientIds.length === 0) return [];

  const [nameRows] = await pool.query(
    'SELECT id, COALESCE(legal_name, name) AS name FROM clients WHERE id IN (?)',
    [clientIds]
  );
  const nameById = Object.fromEntries(nameRows.map((r) => [r.id, r.name]));

  return clientIds
    .map((id) => {
      const revenueHt = revenueByClient[id] || 0;
      const costHt = costByClient[id] || 0;
      const marginHt = revenueHt - costHt;
      return {
        clientId: id,
        clientName: nameById[id] || `Client #${id}`,
        revenueHt,
        costHt,
        marginHt,
        marginPct: revenueHt > 0 ? (marginHt / revenueHt) * 100 : null
      };
    })
    .sort((a, b) => b.marginHt - a.marginHt);
}

// Same idea as getClientMargins, grouped by consultant instead - "which
// consultants generate the most margin," independent of which client
// they're placed at.
async function getConsultantMargins(fromMonth, toMonth) {
  const [clientLedger, supplierLedger] = await Promise.all([
    getClientLedger(fromMonth, toMonth),
    getSupplierLedger(fromMonth, toMonth)
  ]);

  const revenueByConsultant = groupSumById(clientLedger, 'consultant_id', 'total_ht');
  const costByConsultant = groupSumById(supplierLedger, 'consultant_id', 'total_ht');
  const consultantIds = [...new Set([...Object.keys(revenueByConsultant), ...Object.keys(costByConsultant)])].map(Number);
  if (consultantIds.length === 0) return [];

  const [nameRows] = await pool.query(
    "SELECT id, CONCAT(first_name, ' ', last_name) AS name FROM users WHERE id IN (?)",
    [consultantIds]
  );
  const nameById = Object.fromEntries(nameRows.map((r) => [r.id, r.name]));

  return consultantIds
    .map((id) => {
      const revenueHt = revenueByConsultant[id] || 0;
      const costHt = costByConsultant[id] || 0;
      const marginHt = revenueHt - costHt;
      return {
        consultantId: id,
        consultantName: nameById[id] || `Consultant #${id}`,
        revenueHt,
        costHt,
        marginHt,
        marginPct: revenueHt > 0 ? (marginHt / revenueHt) * 100 : null
      };
    })
    .sort((a, b) => b.marginHt - a.marginHt);
}

// Accounts Receivable - client invoices with nothing paid yet
// (invoicesController.handleTogglePaid). Not month-scoped: this is a
// snapshot of what's currently owed, regardless of when it was billed.
async function getReceivables() {
  const [rows] = await pool.query(
    `SELECT i.*,
            COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Multiple consultants') AS consultant_name,
            COALESCE(c.legal_name, c.name, 'Multiple clients') AS client_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.consultant_id
       LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.type = 'client' AND i.paid_at IS NULL
      ORDER BY i.created_at ASC`
  );
  return { rows, total: sumBy(rows, 'total_ttc') };
}

// Accounts Payable - supplier invoices with a real document on file
// (is_simulation = 0) that haven't been marked paid yet. Still-simulated
// invoices are surfaced separately (pendingRows) since they're not a
// confirmed debt yet - nothing real has been billed by the supplier -
// but are still useful for cash-flow planning.
async function getPayables() {
  const [rows] = await pool.query(
    `SELECT i.*,
            COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Multiple consultants') AS consultant_name,
            COALESCE(s.legal_name, 'No supplier linked') AS supplier_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.consultant_id
       LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.type = 'supplier' AND i.is_simulation = 0 AND i.paid_at IS NULL
      ORDER BY i.created_at ASC`
  );

  const [pendingRows] = await pool.query(
    `SELECT i.*, COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Multiple consultants') AS consultant_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.consultant_id
      WHERE i.type = 'supplier' AND i.is_simulation = 1
      ORDER BY i.created_at ASC`
  );

  return {
    rows,
    total: sumBy(rows, 'total_ttc'),
    pendingRows,
    pendingTotal: sumBy(pendingRows, 'total_ttc')
  };
}

module.exports = {
  getClientLedger,
  getSupplierLedger,
  getTvaReport,
  getProfitLoss,
  getClientMargins,
  getConsultantMargins,
  getReceivables,
  getPayables
};

const ExcelJS = require('exceljs');
const financeModel = require('../models/financeModel');
const { currentMonthKey, monthLabel } = require('../utils/format');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Shared from/to month-range resolution for every Finance page except
// Receivables/Payables (those are a live snapshot, not period-scoped).
// Swaps the ends if entered backwards rather than erroring, since that's
// an easy mistake to make typing two separate <input type="month">
// fields or building a preset.
//
// Persisted in the session (req.session.financeRange) so the range
// "sticks" across the whole Finance section - picking a quarter on the
// TVA page and then clicking into P&L via the nav tabs, the sidebar, or
// a fresh tab all land on the same range, not a reset to "this month".
// A valid ?from=&to= in the URL always wins and becomes the new stored
// range (this is how the filter form, the quick presets, and the nav
// tabs - which carry the current range forward, see financeNav.ejs -
// all actually change it); with neither valid, fall back to the stored
// range, and only default to the current month when nothing has been
// picked yet this session.
function monthRangeLocals(req) {
  const fromParam = (req.query.from || '').trim();
  const toParam = (req.query.to || '').trim();

  let from;
  let to;
  if (MONTH_RE.test(fromParam) && MONTH_RE.test(toParam)) {
    from = fromParam;
    to = toParam;
  } else if (req.session.financeRange) {
    ({ from, to } = req.session.financeRange);
  } else {
    from = currentMonthKey();
    to = currentMonthKey();
  }

  if (from > to) {
    [from, to] = [to, from];
  }

  req.session.financeRange = { from, to };
  return { from, to };
}

// undatedInvoices (financeModel.getUndatedSupplierInvoices) feeds the
// warning every period-scoped page below shows while any paid invoice
// still has no invoice date - those can't be placed in any period.
async function showDashboard(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [pnl, tva, receivables, payables, undatedInvoices] = await Promise.all([
    financeModel.getProfitLoss(from, to),
    financeModel.getTvaReport(from, to),
    financeModel.getReceivables(),
    financeModel.getPayables(),
    financeModel.getUndatedSupplierInvoices()
  ]);
  res.render('finance/dashboard', { from, to, pnl, tva, receivables, payables, undatedInvoices });
}

async function showTva(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [tva, undatedInvoices] = await Promise.all([
    financeModel.getTvaReport(from, to),
    financeModel.getUndatedSupplierInvoices()
  ]);
  res.render('finance/tva', { from, to, tva, undatedInvoices });
}

async function exportTvaExcel(req, res) {
  const { from, to } = monthRangeLocals(req);
  const tva = await financeModel.getTvaReport(from, to);

  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ header: '', key: 'label', width: 28 }, { header: '', key: 'value', width: 18 }];
  summary.addRows([
    { label: 'Period', value: from === to ? monthLabel(from) : `${monthLabel(from)} - ${monthLabel(to)}` },
    { label: 'Basis', value: 'Paid invoices only, each in the month of its invoice date' },
    { label: 'TVA Collectée', value: Number(tva.collected.toFixed(2)) },
    { label: 'TVA Déductible (Suppliers)', value: Number(tva.deductibleSuppliers.toFixed(2)) },
    { label: 'TVA Déductible (Charges)', value: Number(tva.deductibleCharges.toFixed(2)) },
    { label: 'TVA Déductible (Total)', value: Number(tva.deductible.toFixed(2)) },
    { label: 'TVA Nette', value: Number(tva.net.toFixed(2)) }
  ]);
  // Row 1 is the (blank) header row, so data starts at row 2 - "TVA
  // Nette" is the 7th data row added above, landing on row 8.
  summary.getRow(8).font = { bold: true };

  const clientSheet = workbook.addWorksheet('Client Invoices (Collectée)');
  clientSheet.columns = [
    { header: 'Invoice', key: 'invoice_number', width: 20 },
    { header: 'Invoice Date', key: 'invoice_date', width: 12 },
    { header: 'Total HT', key: 'total_ht', width: 14 },
    { header: 'Total TVA', key: 'total_tva', width: 14 },
    { header: 'Total TTC', key: 'total_ttc', width: 14 }
  ];
  clientSheet.getRow(1).font = { bold: true };
  // mysql2 returns DECIMAL columns as strings - convert so Excel treats
  // these as real numeric cells (summable, right-aligned) rather than text.
  clientSheet.addRows(tva.clientLedger.map((r) => ({
    ...r, total_ht: Number(r.total_ht), total_tva: Number(r.total_tva), total_ttc: Number(r.total_ttc)
  })));

  const supplierSheet = workbook.addWorksheet('Supplier Invoices (Déductible)');
  supplierSheet.columns = [
    { header: 'Invoice', key: 'invoice_number', width: 20 },
    { header: 'Invoice Date', key: 'invoice_date', width: 12 },
    { header: 'Total HT', key: 'total_ht', width: 14 },
    { header: 'Total TVA', key: 'total_tva', width: 14 },
    { header: 'Total TTC', key: 'total_ttc', width: 14 }
  ];
  supplierSheet.getRow(1).font = { bold: true };
  supplierSheet.addRows(tva.supplierLedger.map((r) => ({
    ...r, total_ht: Number(r.total_ht), total_tva: Number(r.total_tva), total_ttc: Number(r.total_ttc)
  })));

  const chargesSheet = workbook.addWorksheet('Charges (Déductible)');
  chargesSheet.columns = [
    { header: 'Category', key: 'category_name', width: 24 },
    { header: 'Label', key: 'label', width: 24 },
    { header: 'Date', key: 'charge_date', width: 12 },
    { header: 'Amount HT', key: 'amount_ht', width: 14 },
    { header: 'Amount TVA', key: 'amount_tva', width: 14 },
    { header: 'Amount TTC', key: 'amount_ttc', width: 14 }
  ];
  chargesSheet.getRow(1).font = { bold: true };
  chargesSheet.addRows(tva.charges.map((r) => ({
    ...r, amount_ht: Number(r.amount_ht), amount_tva: Number(r.amount_tva), amount_ttc: Number(r.amount_ttc)
  })));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="tva-${from}_${to}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

async function showPnl(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [pnl, undatedInvoices] = await Promise.all([
    financeModel.getProfitLoss(from, to),
    financeModel.getUndatedSupplierInvoices()
  ]);
  res.render('finance/pnl', { from, to, pnl, undatedInvoices });
}

async function showMargins(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [clientMargins, consultantMargins, undatedInvoices] = await Promise.all([
    financeModel.getClientMargins(from, to),
    financeModel.getConsultantMargins(from, to),
    financeModel.getUndatedSupplierInvoices()
  ]);
  res.render('finance/margins', { from, to, clientMargins, consultantMargins, undatedInvoices });
}

async function showReceivables(req, res) {
  const receivables = await financeModel.getReceivables();
  res.render('finance/receivables', { receivables });
}

async function showPayables(req, res) {
  const payables = await financeModel.getPayables();
  res.render('finance/payables', { payables });
}

module.exports = {
  showDashboard,
  showTva,
  exportTvaExcel,
  showPnl,
  showMargins,
  showReceivables,
  showPayables
};

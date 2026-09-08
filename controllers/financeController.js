const ExcelJS = require('exceljs');
const financeModel = require('../models/financeModel');
const { currentMonthKey, monthLabel } = require('../utils/format');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Shared from/to month-range resolution for every Finance page except
// Receivables/Payables (those are a live snapshot, not period-scoped).
// Defaults both ends to the current month; swaps them if entered
// backwards rather than erroring, since that's an easy mistake to make
// typing two separate <input type="month"> fields.
function monthRangeLocals(req) {
  const fromParam = (req.query.from || '').trim();
  const toParam = (req.query.to || '').trim();
  let from = MONTH_RE.test(fromParam) ? fromParam : currentMonthKey();
  let to = MONTH_RE.test(toParam) ? toParam : currentMonthKey();
  if (from > to) {
    [from, to] = [to, from];
  }
  return { from, to };
}

async function showDashboard(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [pnl, tva, receivables, payables] = await Promise.all([
    financeModel.getProfitLoss(from, to),
    financeModel.getTvaReport(from, to),
    financeModel.getReceivables(),
    financeModel.getPayables()
  ]);
  res.render('finance/dashboard', { from, to, pnl, tva, receivables, payables });
}

async function showTva(req, res) {
  const { from, to } = monthRangeLocals(req);
  const tva = await financeModel.getTvaReport(from, to);
  res.render('finance/tva', { from, to, tva });
}

async function exportTvaExcel(req, res) {
  const { from, to } = monthRangeLocals(req);
  const tva = await financeModel.getTvaReport(from, to);

  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ header: '', key: 'label', width: 28 }, { header: '', key: 'value', width: 18 }];
  summary.addRows([
    { label: 'Period', value: from === to ? monthLabel(from) : `${monthLabel(from)} - ${monthLabel(to)}` },
    { label: 'Basis', value: 'Cash (paid invoices only - TVA sur encaissements)' },
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
    { header: 'Month', key: 'month', width: 10 },
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
    { header: 'Month', key: 'month', width: 10 },
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
  const pnl = await financeModel.getProfitLoss(from, to);
  res.render('finance/pnl', { from, to, pnl });
}

async function showMargins(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [clientMargins, consultantMargins] = await Promise.all([
    financeModel.getClientMargins(from, to),
    financeModel.getConsultantMargins(from, to)
  ]);
  res.render('finance/margins', { from, to, clientMargins, consultantMargins });
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

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const archiver = require('archiver');
const financeModel = require('../models/financeModel');
const bankStatementModel = require('../models/bankStatementModel');
const { currentMonthKey, monthLabel, shiftMonth } = require('../utils/format');
const { INVOICE_DIR, CHARGE_INVOICE_DIR, BANK_STATEMENT_DIR } = require('../config/uploadPaths');

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

// The TVA report as a workbook - a Summary sheet plus one sheet per
// ledger. Shared by the standalone Excel export and the documents ZIP,
// which bundles it as the index of the documents next to it.
function buildTvaWorkbook(from, to, tva) {
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

  return workbook;
}

async function exportTvaExcel(req, res) {
  const { from, to } = monthRangeLocals(req);
  const tva = await financeModel.getTvaReport(from, to);
  const workbook = buildTvaWorkbook(from, to, tva);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="tva-${from}_${to}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

const ZIP_FOLDER_CLIENT = '1 - Client Invoices (TVA Collectee)';
const ZIP_FOLDER_SUPPLIER = '2 - Supplier Invoices (TVA Deductible)';
const ZIP_FOLDER_CHARGES = '3 - Charges (TVA Deductible)';
const ZIP_FOLDER_BANK = '4 - Bank Statements';

// Safe as a file name inside a ZIP on any OS: accents stripped (Windows'
// built-in unzip garbles non-ASCII names), the characters Windows
// forbids replaced - a real supplier invoice number like "FA/2026/012"
// is common - and capped to a sane length.
function safeFileName(value) {
  const name = String(value)
    .normalize('NFD') // 'é' -> 'e' + a separate accent mark, which the next line drops
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return name || 'document';
}

// Every document behind a TVA report's figures, as ZIP entries - client
// invoices (collectée), supplier invoices and charge receipts
// (déductible) - plus the bank statements covering the same months, the
// proof the money actually moved. Anything that should be there but
// can't be (a charge recorded without its receipt, a month's statement
// never uploaded, a file gone from disk) is listed in `missing` instead,
// so the ZIP never looks complete when it isn't.
function collectTvaDocuments(tva, bankStatements, from, to) {
  const documents = [];
  const missing = [];
  const usedNames = new Set();

  function add(folder, baseName, filePath, description) {
    if (!filePath) {
      missing.push(`${description} - no document uploaded`);
      return;
    }
    if (!fs.existsSync(filePath)) {
      missing.push(`${description} - file not found on the server`);
      return;
    }
    let name = `${folder}/${baseName}.pdf`;
    for (let n = 2; usedNames.has(name); n += 1) {
      name = `${folder}/${baseName} (${n}).pdf`;
    }
    usedNames.add(name);
    documents.push({ filePath, name });
  }

  tva.clientLedger.forEach((r) => {
    add(
      ZIP_FOLDER_CLIENT,
      safeFileName(`${r.invoice_date}_${r.invoice_number}`),
      r.pdf_path && path.join(INVOICE_DIR, r.pdf_path),
      `Client invoice ${r.invoice_number} (${r.invoice_date})`
    );
  });

  // A combined supplier invoice appears once per line item in the
  // ledger (see financeModel.getSupplierLedger) but is one document.
  const seenSupplierInvoices = new Set();
  tva.supplierLedger.forEach((r) => {
    if (seenSupplierInvoices.has(r.invoice_id)) return;
    seenSupplierInvoices.add(r.invoice_id);
    add(
      ZIP_FOLDER_SUPPLIER,
      safeFileName(`${r.invoice_date}_${r.invoice_number}`),
      r.pdf_path && path.join(INVOICE_DIR, r.pdf_path),
      `Supplier invoice ${r.invoice_number} (${r.invoice_date})`
    );
  });

  tva.charges.forEach((r) => {
    const label = r.label ? `${r.category_name} - ${r.label}` : r.category_name;
    add(
      ZIP_FOLDER_CHARGES,
      safeFileName(`${r.charge_date}_${label}`),
      r.invoice_path && path.join(CHARGE_INVOICE_DIR, r.invoice_path),
      `Charge "${label}" (${r.charge_date})`
    );
  });

  // One statement per month (see bankStatementModel), so every month of
  // the period is expected - except one that isn't over yet, whose
  // statement can't exist yet (the bank only issues it once the month ends).
  const statementByMonth = new Map(bankStatements.map((s) => [s.month, s]));
  const currentMonth = currentMonthKey();
  for (let month = from; month <= to; month = shiftMonth(month, 1)) {
    const statement = statementByMonth.get(month);
    if (!statement && month >= currentMonth) continue;
    add(
      ZIP_FOLDER_BANK,
      `bank-statement-${month}`,
      statement && path.join(BANK_STATEMENT_DIR, statement.file_path),
      `Bank statement ${monthLabel(month)}`
    );
  }

  return { documents, missing };
}

// One download with everything needed to justify a TVA declaration for
// the selected period: the same Excel workbook as exportTvaExcel, plus
// every invoice/receipt PDF counted in it, one folder per section of the
// report, and the period's bank statements. Built from getTvaReport's
// own rows, so the documents always match the figures exactly. Streamed
// straight from disk rather than assembled in memory - a quarter's worth
// of PDFs can add up.
async function exportTvaDocuments(req, res) {
  const { from, to } = monthRangeLocals(req);
  const [tva, bankStatements] = await Promise.all([
    financeModel.getTvaReport(from, to),
    bankStatementModel.list({ from, to })
  ]);
  const summaryBuffer = await buildTvaWorkbook(from, to, tva).xlsx.writeBuffer();
  const { documents, missing } = collectTvaDocuments(tva, bankStatements, from, to);

  const archive = archiver('zip');
  archive.on('warning', (err) => console.error('[tva documents zip]', err));
  // Headers are already sent once the archive starts streaming, so a
  // failure past that point can't become an error page anymore - abort
  // the half-sent download instead, so it shows as failed rather than
  // as a silently truncated ZIP.
  archive.on('error', () => res.destroy());
  // Stop reading files if the browser cancels the download midway.
  res.on('close', () => {
    if (!res.writableFinished) archive.abort();
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="tva-documents-${from}_${to}.zip"`);
  archive.pipe(res);

  archive.append(Buffer.from(summaryBuffer), { name: `tva-${from}_${to}.xlsx` });
  documents.forEach((doc) => archive.file(doc.filePath, { name: doc.name }));
  if (missing.length > 0) {
    const periodLabel = from === to ? monthLabel(from) : `${monthLabel(from)} - ${monthLabel(to)}`;
    const lines = [
      `Documents missing from this ZIP (TVA period: ${periodLabel})`,
      '',
      ...missing.map((m) => `- ${m}`)
    ];
    archive.append(lines.join('\r\n'), { name: 'MISSING DOCUMENTS.txt' });
  }

  await archive.finalize();
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
  exportTvaDocuments,
  showPnl,
  showMargins,
  showReceivables,
  showPayables
};

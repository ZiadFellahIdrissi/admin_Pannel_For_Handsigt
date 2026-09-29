const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const bankStatementModel = require('../models/bankStatementModel');
const { monthLabel } = require('../utils/format');
const { BANK_STATEMENT_DIR } = require('../config/uploadPaths');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function list(req, res) {
  const from = MONTH_RE.test(req.query.from || '') ? req.query.from : '';
  const to = MONTH_RE.test(req.query.to || '') ? req.query.to : '';
  const statements = await bankStatementModel.list({ from: from || undefined, to: to || undefined });
  res.render('bankStatements/list', { statements, from, to });
}

// One statement per month - re-uploading for a month that's already
// archived replaces the file (bankStatementModel.upsert), same "swap the
// file, delete the old one" pattern as every other document upload here.
async function handleUpload(req, res) {
  const month = (req.body.month || '').trim();

  if (!MONTH_RE.test(month)) {
    if (req.file) fs.unlink(path.join(BANK_STATEMENT_DIR, req.file.filename), () => {});
    req.flash('error', 'Choose a valid month.');
    return res.redirect('/bank-statements');
  }
  if (!req.file) {
    req.flash('error', 'Choose a PDF file to upload.');
    return res.redirect('/bank-statements');
  }

  const { previousFilePath, replaced } = await bankStatementModel.upsert({
    month,
    filePath: req.file.filename,
    fileOriginalName: req.file.originalname
  });

  if (previousFilePath) {
    fs.unlink(path.join(BANK_STATEMENT_DIR, previousFilePath), () => {});
  }

  req.flash('success', `Statement for ${monthLabel(month)} ${replaced ? 'replaced' : 'archived'}.`);
  res.redirect('/bank-statements');
}

async function handleDelete(req, res) {
  const statement = await bankStatementModel.findById(req.params.id);
  if (!statement) {
    return res.status(404).render('error', { message: 'Statement not found.' });
  }

  fs.unlink(path.join(BANK_STATEMENT_DIR, statement.file_path), () => {});
  await bankStatementModel.remove(statement.id);

  req.flash('success', `Statement for ${monthLabel(statement.month)} deleted.`);
  res.redirect('/bank-statements');
}

// Private/authenticated only - same reasoning as every other financial
// document served by this app.
async function serveStatement(req, res) {
  const statement = await bankStatementModel.findById(req.params.id);
  if (!statement) {
    return res.status(404).render('error', { message: 'Statement not found.' });
  }

  const filePath = path.join(BANK_STATEMENT_DIR, statement.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', { message: 'Statement file is missing on disk.' });
  }

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${statement.file_original_name || `${statement.month}.pdf`}"`);
  }
  res.type('application/pdf');
  res.sendFile(filePath);
}

// Merges the selected months' statement PDFs into one, in chronological
// order (bankStatementModel.findByIds), and streams it straight back as
// a download - nothing about the combined file is ever written to disk
// or stored, only the originals it's built from.
async function handleCombine(req, res) {
  const rawIds = req.body.statementIds;
  const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) {
    req.flash('error', 'Choose at least one statement to combine.');
    return res.redirect('/bank-statements');
  }

  const statements = await bankStatementModel.findByIds(ids);
  if (statements.length === 0) {
    req.flash('error', 'None of the selected statements could be found.');
    return res.redirect('/bank-statements');
  }

  const combined = await PDFDocument.create();
  for (const statement of statements) {
    const filePath = path.join(BANK_STATEMENT_DIR, statement.file_path);
    if (!fs.existsSync(filePath)) continue;
    const bytes = fs.readFileSync(filePath);
    const source = await PDFDocument.load(bytes);
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }

  const combinedBytes = await combined.save();
  const firstMonth = statements[0].month;
  const lastMonth = statements[statements.length - 1].month;
  const filename = firstMonth === lastMonth
    ? `bank-statement-${firstMonth}.pdf`
    : `bank-statements-${firstMonth}-to-${lastMonth}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(combinedBytes));
}

module.exports = { list, handleUpload, handleDelete, serveStatement, handleCombine };

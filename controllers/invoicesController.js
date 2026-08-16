const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const invoiceModel = require('../models/invoiceModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');
const consultantClientModel = require('../models/consultantClientModel');
const clientModel = require('../models/clientModel');
const userModel = require('../models/userModel');
const companyInfoModel = require('../models/companyInfoModel');
const { generateInvoicePdf, monthLabelFr } = require('../utils/invoicePdf');
const { INVOICE_DIR } = require('../config/uploadPaths');

// 'Ziad' + 'Fellah' -> 'ZIFE' - first 2 letters of each name, uppercased.
// Falls back to whatever's there if a name is shorter than 2 characters.
function consultantInitials(firstName, lastName) {
  return `${(firstName || '').slice(0, 2)}${(lastName || '').slice(0, 2)}`.toUpperCase();
}

function buildLineLabel(pairing, consultant) {
  const roleTitle = (pairing && pairing.role_title) || 'Consultant';
  const initials = consultantInitials(consultant.first_name, consultant.last_name);
  return `Prestation de services – Consultant ${roleTitle} (Réf. ${initials})`;
}

// Supplier-side fee math - consultant_tjm is treated as already
// TVA-inclusive by default (the extra_fee_percent = 0 case simplifies to
// consultant_tjm / 1.2). Shared by the single-submission generation path
// and the combined-invoice path below so the formula only lives once.
function computeSupplierAmounts(submission) {
  const totalDays = Number(submission.total_days);
  const consultantTjm = Number(submission.consultant_tjm || 0);
  const extraFeePercent = Number(submission.extra_fee_percent || 0);
  const feeDenominator = 1 - extraFeePercent / 100;
  const rate = feeDenominator !== 0 ? (consultantTjm / feeDenominator) / 1.2 : 0;
  const totalHt = rate * totalDays;
  return { totalDays, rate, totalHt };
}

// req.body.invoiceType is 'both' | 'client' | 'supplier' - which type(s)
// the admin picked in the History page's Generate popup. Whichever of the
// two already exists for this submission is always skipped (never
// regenerated), so an accidental 'both' submit on an already-partially-
// invoiced row just fills in what's missing instead of erroring.
async function handleGenerate(req, res) {
  const submissionId = Number(req.params.submissionId);
  const requestedType = ['both', 'client', 'supplier'].includes(req.body.invoiceType)
    ? req.body.invoiceType
    : 'both';
  const submission = await monthSubmissionModel.findByIdWithTotals(submissionId);

  if (!submission) {
    return res.status(404).render('error', { message: 'Submission not found.' });
  }
  if (submission.status !== 'approved') {
    req.flash('error', 'Only approved submissions can be invoiced.');
    return res.redirect('/history');
  }

  const existing = await invoiceModel.findIdsForSubmission(submissionId);
  const wantClient = (requestedType === 'both' || requestedType === 'client') && !existing.clientInvoiceId;
  const wantSupplier = (requestedType === 'both' || requestedType === 'supplier') && !existing.supplierInvoiceId;

  if (!wantClient && !wantSupplier) {
    req.flash('error', 'That invoice has already been generated for this submission.');
    return res.redirect('/history');
  }

  const [consultant, client, pairing, company] = await Promise.all([
    userModel.findById(submission.user_id),
    clientModel.findById(submission.client_id),
    consultantClientModel.find(submission.user_id, submission.client_id),
    companyInfoModel.get()
  ]);

  const totalDays = Number(submission.total_days);
  const clientTjm = Number(submission.client_tjm || 0);
  const label = buildLineLabel(pairing, consultant);
  const dateLabel = new Date().toLocaleDateString('fr-FR');
  const monthLbl = monthLabelFr(submission.month);

  const clientRate = clientTjm;
  const clientHt = clientRate * totalDays;
  const clientTva = clientHt * 0.2;
  const clientTtc = clientHt + clientTva;

  const supplierAmounts = computeSupplierAmounts(submission);
  const supplierRate = supplierAmounts.rate;
  const supplierHt = supplierAmounts.totalHt;
  const supplierTva = supplierHt * 0.2;
  const supplierTtc = supplierHt + supplierTva;

  const generatedNumbers = [];

  if (wantClient) {
    const clientInvoiceNumber = await invoiceModel.nextInvoiceNumber('client');
    const clientPdfFilename = `${crypto.randomUUID()}.pdf`;
    const clientParty = {
      name: client.legal_name || client.name,
      address: client.billing_address || client.registered_address,
      ice: client.ice,
      rc: client.rc,
      email: client.company_email || client.contact_email,
      phone: client.company_phone || client.contact_phone
    };

    await generateInvoicePdf({
      type: 'client',
      invoiceNumber: clientInvoiceNumber,
      dateLabel,
      monthLabel: monthLbl,
      company,
      party: clientParty,
      lineItems: [{ label, totalDays, rate: clientRate, totalHt: clientHt }],
      totalHt: clientHt,
      totalTva: clientTva,
      totalTtc: clientTtc
    }, path.join(INVOICE_DIR, clientPdfFilename));

    await invoiceModel.create({
      invoiceNumber: clientInvoiceNumber,
      type: 'client',
      submissionId,
      clientId: submission.client_id,
      consultantId: submission.user_id,
      month: submission.month,
      totalDays,
      rate: clientRate,
      totalHt: clientHt,
      totalTva: clientTva,
      totalTtc: clientTtc,
      label,
      pdfPath: clientPdfFilename
    });

    generatedNumbers.push(`${clientInvoiceNumber} (Client)`);
  }

  if (wantSupplier) {
    const supplierInvoiceNumber = await invoiceModel.nextInvoiceNumber('supplier');
    const supplierPdfFilename = `${crypto.randomUUID()}.pdf`;

    await generateInvoicePdf({
      type: 'supplier',
      invoiceNumber: supplierInvoiceNumber,
      dateLabel,
      monthLabel: monthLbl,
      company,
      party: { name: `${consultant.first_name} ${consultant.last_name}` },
      lineItems: [{ label, totalDays: supplierAmounts.totalDays, rate: supplierRate, totalHt: supplierHt }],
      totalHt: supplierHt,
      totalTva: supplierTva,
      totalTtc: supplierTtc
    }, path.join(INVOICE_DIR, supplierPdfFilename));

    await invoiceModel.create({
      invoiceNumber: supplierInvoiceNumber,
      type: 'supplier',
      submissionId,
      clientId: submission.client_id,
      consultantId: submission.user_id,
      month: submission.month,
      totalDays,
      rate: supplierRate,
      totalHt: supplierHt,
      totalTva: supplierTva,
      totalTtc: supplierTtc,
      label,
      pdfPath: supplierPdfFilename,
      isSimulation: true
    });

    generatedNumbers.push(`${supplierInvoiceNumber} (Supplier)`);
  }

  req.flash('success', `Invoice(s) generated: ${generatedNumbers.join(' / ')}.`);
  res.redirect('/history');
}

// Some suppliers are agencies that send ONE real invoice covering several
// consultants at once, even across different Handsight clients - client
// invoices are unaffected, always generated individually as above. This
// builds one supplier invoice (invoiceModel.createCombined) with one
// invoice_line_items row per selected submission, instead of one
// `invoices` row per submission.
async function handleGenerateCombinedSupplier(req, res) {
  const rawIds = req.body.submissionIds;
  const submissionIds = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (submissionIds.length === 0) {
    req.flash('error', 'Choose at least one submission to combine.');
    return res.redirect('/history');
  }

  const submissions = await Promise.all(submissionIds.map((id) => monthSubmissionModel.findByIdWithTotals(id)));

  const eligible = [];
  let skippedCount = 0;
  for (const submission of submissions) {
    if (!submission || submission.status !== 'approved') {
      skippedCount += 1;
      continue;
    }
    const existing = await invoiceModel.findIdsForSubmission(submission.id);
    if (existing.supplierInvoiceId) {
      skippedCount += 1;
      continue;
    }
    eligible.push(submission);
  }

  if (eligible.length === 0) {
    req.flash('error', 'None of the selected submissions are eligible (must be approved and not already supplier-invoiced).');
    return res.redirect('/history');
  }

  const [consultants, clients, pairings, company] = await Promise.all([
    Promise.all(eligible.map((s) => userModel.findById(s.user_id))),
    Promise.all(eligible.map((s) => clientModel.findById(s.client_id))),
    Promise.all(eligible.map((s) => consultantClientModel.find(s.user_id, s.client_id))),
    companyInfoModel.get()
  ]);

  const lineItems = eligible.map((submission, i) => {
    const consultant = consultants[i];
    const client = clients[i];
    const pairing = pairings[i];
    const amounts = computeSupplierAmounts(submission);
    const clientLabel = client.legal_name || client.name;
    return {
      submissionId: submission.id,
      consultantId: submission.user_id,
      clientId: submission.client_id,
      month: submission.month,
      label: `${buildLineLabel(pairing, consultant)} – ${clientLabel}`,
      totalDays: amounts.totalDays,
      rate: amounts.rate,
      totalHt: amounts.totalHt
    };
  });

  const totalHt = lineItems.reduce((sum, item) => sum + item.totalHt, 0);
  const totalTva = totalHt * 0.2;
  const totalTtc = totalHt + totalTva;

  const consultantNames = consultants.map((c) => `${c.first_name} ${c.last_name}`);
  const partyName = consultantNames.length <= 4
    ? consultantNames.join(', ')
    : `${consultantNames.length} consultants`;

  const months = [...new Set(eligible.map((s) => s.month))];
  const monthLbl = months.length === 1 ? monthLabelFr(months[0]) : 'Plusieurs périodes';

  const invoiceNumber = await invoiceModel.nextInvoiceNumber('supplier');
  const pdfFilename = `${crypto.randomUUID()}.pdf`;

  await generateInvoicePdf({
    type: 'supplier',
    invoiceNumber,
    dateLabel: new Date().toLocaleDateString('fr-FR'),
    monthLabel: monthLbl,
    company,
    party: { name: partyName },
    lineItems: lineItems.map((item) => ({ label: item.label, totalDays: item.totalDays, rate: item.rate, totalHt: item.totalHt })),
    totalHt,
    totalTva,
    totalTtc
  }, path.join(INVOICE_DIR, pdfFilename));

  await invoiceModel.createCombined({
    invoiceNumber,
    totalHt,
    totalTva,
    totalTtc,
    pdfPath: pdfFilename,
    isSimulation: true,
    lineItems
  });

  const skipNote = skippedCount > 0 ? ` (${skippedCount} skipped - already invoiced or not approved)` : '';
  req.flash('success', `Combined supplier invoice ${invoiceNumber} generated for ${eligible.length} consultant(s)${skipNote}.`);
  res.redirect('/history');
}

async function listClients(req, res) {
  const invoices = await invoiceModel.listByType('client');
  res.render('invoices/list', { invoices, type: 'client' });
}

async function listSuppliers(req, res) {
  const invoices = await invoiceModel.listByType('supplier');
  res.render('invoices/list', { invoices, type: 'supplier' });
}

async function showClientDetail(req, res) {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice || invoice.type !== 'client') {
    return res.status(404).render('error', { message: 'Invoice not found.' });
  }
  res.render('invoices/detail', { invoice, type: 'client', lineItems: [] });
}

// lineItems is non-empty only for a combined supplier invoice (see
// invoiceModel.createCombined) - empty for a classic single-submission
// one, which the detail view renders using invoice's own flat fields
// exactly as before.
async function showSupplierDetail(req, res) {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice || invoice.type !== 'supplier') {
    return res.status(404).render('error', { message: 'Invoice not found.' });
  }
  const lineItems = await invoiceModel.findLineItems(invoice.id);
  res.render('invoices/detail', { invoice, type: 'supplier', lineItems });
}

// Supplier invoices are generated as Handsight's own estimate (see the
// is_simulation flag set in handleGenerate above) - this swaps in the
// real PDF the admin actually received from the consultant/supplier,
// deleting the old file (simulated, or a previous real upload) so only
// one ever exists on disk at a time.
async function handleUploadReal(req, res) {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice || invoice.type !== 'supplier') {
    return res.status(404).render('error', { message: 'Invoice not found.' });
  }

  if (!req.file) {
    req.flash('error', 'Choose a PDF file to upload.');
    return res.redirect(`/invoices/suppliers/${invoice.id}`);
  }

  const invoiceNumber = (req.body.invoiceNumber || '').trim() || invoice.invoice_number;

  try {
    await invoiceModel.replacePdf(invoice.id, { pdfPath: req.file.filename, isSimulation: false, invoiceNumber });
  } catch (err) {
    // Uploaded file was already saved to disk by multer before this ran -
    // clean it up so it isn't orphaned with no invoice row pointing at it.
    fs.unlink(path.join(INVOICE_DIR, req.file.filename), () => {});
    if (err.code === 'ER_DUP_ENTRY') {
      req.flash('error', `Invoice number "${invoiceNumber}" is already used by another invoice.`);
      return res.redirect(`/invoices/suppliers/${invoice.id}`);
    }
    throw err;
  }

  if (invoice.pdf_path) {
    fs.unlink(path.join(INVOICE_DIR, invoice.pdf_path), () => {});
  }

  req.flash('success', 'Real invoice uploaded.');
  res.redirect(`/invoices/suppliers/${invoice.id}`);
}

// Private/authenticated only - invoice PDFs are financial documents and
// must never get a public URL (unlike career-offer images/the company
// logo, which do). Same 404-if-missing pattern as candidatesController.serveCv.
async function servePdf(req, res) {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice || !invoice.pdf_path) {
    return res.status(404).render('error', { message: 'PDF not found.' });
  }

  const filePath = path.join(INVOICE_DIR, invoice.pdf_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', { message: 'PDF file is missing on disk.' });
  }

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  }
  res.type('application/pdf');
  res.sendFile(filePath);
}

// Deletes an invoice and its PDF from disk. For a combined supplier
// invoice this also drops its invoice_line_items rows (invoiceModel.remove)
// - either way, every submission it covered becomes eligible to be
// invoiced again afterwards, with no special-casing needed since History
// simply stops finding it.
async function handleDelete(req, res) {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice) {
    return res.status(404).render('error', { message: 'Invoice not found.' });
  }

  if (invoice.pdf_path) {
    fs.unlink(path.join(INVOICE_DIR, invoice.pdf_path), () => {});
  }
  await invoiceModel.remove(invoice.id);

  req.flash('success', `Invoice ${invoice.invoice_number} deleted.`);
  res.redirect(invoice.type === 'client' ? '/invoices/clients' : '/invoices/suppliers');
}

async function handleBulkDeleteSuppliers(req, res) {
  const rawIds = req.body.invoiceIds;
  const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) {
    req.flash('error', 'Choose at least one invoice to delete.');
    return res.redirect('/invoices/suppliers');
  }

  const invoices = (await Promise.all(ids.map((id) => invoiceModel.findById(id)))).filter(Boolean);
  for (const invoice of invoices) {
    if (invoice.pdf_path) {
      fs.unlink(path.join(INVOICE_DIR, invoice.pdf_path), () => {});
    }
    await invoiceModel.remove(invoice.id);
  }

  req.flash('success', `Deleted ${invoices.length} invoice(s).`);
  res.redirect('/invoices/suppliers');
}

module.exports = {
  handleGenerate,
  handleGenerateCombinedSupplier,
  listClients,
  listSuppliers,
  showClientDetail,
  showSupplierDetail,
  handleUploadReal,
  handleDelete,
  handleBulkDeleteSuppliers,
  servePdf
};

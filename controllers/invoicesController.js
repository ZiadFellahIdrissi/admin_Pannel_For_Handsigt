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
  const consultantTjm = Number(submission.consultant_tjm || 0);
  const extraFeePercent = Number(submission.extra_fee_percent || 0);
  const roleTitle = (pairing && pairing.role_title) || 'Consultant';
  const initials = consultantInitials(consultant.first_name, consultant.last_name);
  const label = `Prestation de services – Consultant ${roleTitle} (Réf. ${initials})`;
  const dateLabel = new Date().toLocaleDateString('fr-FR');
  const monthLbl = monthLabelFr(submission.month);

  const clientRate = clientTjm;
  const clientHt = clientRate * totalDays;
  const clientTva = clientHt * 0.2;
  const clientTtc = clientHt + clientTva;

  const feeDenominator = 1 - extraFeePercent / 100;
  const supplierRate = feeDenominator !== 0 ? (consultantTjm / feeDenominator) / 1.2 : 0;
  const supplierHt = supplierRate * totalDays;
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
      label,
      totalDays,
      rate: clientRate,
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
      label,
      totalDays,
      rate: supplierRate,
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
  res.render('invoices/detail', { invoice, type: 'client' });
}

async function showSupplierDetail(req, res) {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice || invoice.type !== 'supplier') {
    return res.status(404).render('error', { message: 'Invoice not found.' });
  }
  res.render('invoices/detail', { invoice, type: 'supplier' });
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

  if (invoice.pdf_path) {
    fs.unlink(path.join(INVOICE_DIR, invoice.pdf_path), () => {});
  }

  await invoiceModel.replacePdf(invoice.id, { pdfPath: req.file.filename, isSimulation: false });
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

module.exports = {
  handleGenerate,
  listClients,
  listSuppliers,
  showClientDetail,
  showSupplierDetail,
  handleUploadReal,
  servePdf
};

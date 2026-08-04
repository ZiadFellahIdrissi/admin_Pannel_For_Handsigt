const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const invoiceModel = require('../models/invoiceModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');
const consultantClientModel = require('../models/consultantClientModel');
const clientModel = require('../models/clientModel');
const userModel = require('../models/userModel');
const companyInfoModel = require('../models/companyInfoModel');
const { generateInvoicePdf } = require('../utils/invoicePdf');
const { monthLabel } = require('../utils/format');
const { INVOICE_DIR } = require('../config/uploadPaths');

// 'Ziad' + 'Fellah' -> 'ZIFE' - first 2 letters of each name, uppercased.
// Falls back to whatever's there if a name is shorter than 2 characters.
function consultantInitials(firstName, lastName) {
  return `${(firstName || '').slice(0, 2)}${(lastName || '').slice(0, 2)}`.toUpperCase();
}

async function handleGenerate(req, res) {
  const submissionId = Number(req.params.submissionId);
  const submission = await monthSubmissionModel.findByIdWithTotals(submissionId);

  if (!submission) {
    return res.status(404).render('error', { message: 'Submission not found.' });
  }
  if (submission.status !== 'approved') {
    req.flash('error', 'Only approved submissions can be invoiced.');
    return res.redirect('/history');
  }
  if (await invoiceModel.existsForSubmission(submissionId)) {
    req.flash('error', 'Invoices have already been generated for this submission.');
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
  const monthLbl = monthLabel(submission.month);

  const clientRate = clientTjm;
  const clientHt = clientRate * totalDays;
  const clientTva = clientHt * 0.2;
  const clientTtc = clientHt + clientTva;

  const feeDenominator = 1 - extraFeePercent / 100;
  const supplierRate = feeDenominator !== 0 ? (consultantTjm / feeDenominator) / 1.2 : 0;
  const supplierHt = supplierRate * totalDays;
  const supplierTva = supplierHt * 0.2;
  const supplierTtc = supplierHt + supplierTva;

  const clientInvoiceNumber = await invoiceModel.nextInvoiceNumber('client');
  const supplierInvoiceNumber = await invoiceModel.nextInvoiceNumber('supplier');

  const clientPdfFilename = `${crypto.randomUUID()}.pdf`;
  const supplierPdfFilename = `${crypto.randomUUID()}.pdf`;

  const clientParty = {
    name: client.name,
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
    pdfPath: supplierPdfFilename
  });

  req.flash('success', `Invoices generated: ${clientInvoiceNumber} (client) / ${supplierInvoiceNumber} (fournisseur).`);
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
  servePdf
};

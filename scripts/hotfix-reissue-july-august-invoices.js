require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/db');
const invoiceModel = require('../models/invoiceModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');
const consultantClientModel = require('../models/consultantClientModel');
const clientModel = require('../models/clientModel');
const userModel = require('../models/userModel');
const companyInfoModel = require('../models/companyInfoModel');
const { generateInvoicePdf, monthLabelFr } = require('../utils/invoicePdf');
const { INVOICE_DIR } = require('../config/uploadPaths');

const CONSULTANT_ID = 3;
const DRY_RUN = process.argv.includes('--dry-run');

const REISSUES = [
  { month: '2026-07', invoiceNumber: 'HS-2026-09-001', createdAt: '2026-09-03 14:16:34' },
  { month: '2026-08', invoiceNumber: 'HS-2026-09-002', createdAt: '2026-09-03 16:16:34' }
];

function formatMad(n) {
  return `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function consultantInitials(firstName, lastName) {
  return `${(firstName || '').slice(0, 2)}${(lastName || '').slice(0, 2)}`.toUpperCase();
}

// Same label format as invoicesController.js's buildLineLabel.
function buildLineLabel(pairing, consultant) {
  const roleTitle = (pairing && pairing.role_title) || 'Consultant';
  const initials = consultantInitials(consultant.first_name, consultant.last_name);
  return `Prestation de services – Consultant ${roleTitle} (Réf. ${initials})`;
}

async function reissueOne({ month, invoiceNumber, createdAt }) {
  console.log(`\n--- ${month} -> ${invoiceNumber} (dated ${createdAt}) ---`);

  // listHistory is only used to locate the submission id here - its own
  // rows don't carry client_tjm/consultant_tjm/extra_fee_percent (those
  // are only selected by findByIdWithTotals below, which is what real
  // invoice generation actually uses for the math).
  const candidates = await monthSubmissionModel.listHistory({ month, status: 'approved' });
  const matches = candidates.filter((s) => s.user_id === CONSULTANT_ID);

  if (matches.length === 0) {
    console.log(`SKIPPED: no approved submission found for consultant #${CONSULTANT_ID} in ${month}.`);
    return;
  }
  if (matches.length > 1) {
    console.log(`SKIPPED: found ${matches.length} approved submissions for consultant #${CONSULTANT_ID} in ${month} (ids: ${matches.map((s) => s.id).join(', ')}) - ambiguous, resolve by hand.`);
    return;
  }

  const submission = await monthSubmissionModel.findByIdWithTotals(matches[0].id);
  if (!submission || submission.status !== 'approved') {
    console.log('SKIPPED: submission not found or no longer approved.');
    return;
  }

  const existing = await invoiceModel.findIdsForSubmission(submission.id);
  if (existing.clientInvoiceId) {
    console.log(`SKIPPED: a client invoice already exists for this submission (id ${existing.clientInvoiceId}) - not touching it.`);
    return;
  }

  const [consultant, client, pairing, company] = await Promise.all([
    userModel.findById(submission.user_id),
    clientModel.findById(submission.client_id),
    consultantClientModel.find(submission.user_id, submission.client_id),
    companyInfoModel.get()
  ]);

  const totalDays = Number(submission.total_days);
  const clientRate = Number(submission.client_tjm || 0);
  const clientHt = clientRate * totalDays;
  const clientTva = clientHt * 0.2;
  const clientTtc = clientHt + clientTva;
  const label = buildLineLabel(pairing, consultant);

  console.log(`Consultant: ${consultant.first_name} ${consultant.last_name}`);
  console.log(`Client: ${client.legal_name || client.name} (legal_name currently: ${client.legal_name || '(none - falls back to short name)'})`);
  console.log(`${totalDays} days x ${formatMad(clientRate)} = HT ${formatMad(clientHt)} / TVA ${formatMad(clientTva)} / TTC ${formatMad(clientTtc)}`);

  if (DRY_RUN) {
    console.log('DRY RUN - nothing written.');
    return;
  }

  const clientParty = {
    name: client.legal_name || client.name,
    address: client.billing_address || client.registered_address,
    ice: client.ice,
    rc: client.rc,
    email: client.company_email || client.contact_email,
    phone: client.company_phone || client.contact_phone
  };

  const pdfFilename = `${crypto.randomUUID()}.pdf`;

  await generateInvoicePdf({
    type: 'client',
    invoiceNumber,
    dateLabel: new Date(createdAt.replace(' ', 'T')).toLocaleDateString('fr-FR'),
    monthLabel: monthLabelFr(submission.month),
    company,
    party: clientParty,
    lineItems: [{ label, totalDays, rate: clientRate, totalHt: clientHt }],
    totalHt: clientHt,
    totalTva: clientTva,
    totalTtc: clientTtc
  }, path.join(INVOICE_DIR, pdfFilename));

  const invoiceId = await invoiceModel.create({
    invoiceNumber,
    type: 'client',
    submissionId: submission.id,
    clientId: submission.client_id,
    consultantId: submission.user_id,
    month: submission.month,
    totalDays,
    rate: clientRate,
    totalHt: clientHt,
    totalTva: clientTva,
    totalTtc: clientTtc,
    label,
    pdfPath: pdfFilename
  });

  // invoiceModel.create() always stamps created_at = NOW() (the column's
  // DB default) - this is the one field this hotfix overrides, and only
  // to match the real timestamp the original (now-deleted) invoice
  // actually had, since these documents were already sent to the client
  // under that date.
  await pool.query('UPDATE invoices SET created_at = ? WHERE id = ?', [createdAt, invoiceId]);

  console.log(`OK: created invoice #${invoiceId} (${invoiceNumber}), PDF ${pdfFilename}.`);
}

async function main() {
  if (DRY_RUN) console.log('*** DRY RUN - no invoices or files will be created ***');

  for (const item of REISSUES) {
    await reissueOne(item);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('\nHOTFIX FAILED:', err);
  process.exit(1);
});

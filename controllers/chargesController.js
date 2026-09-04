const fs = require('fs');
const path = require('path');
const chargeModel = require('../models/chargeModel');
const chargeCategoryModel = require('../models/chargeCategoryModel');
const { CHARGE_INVOICE_DIR } = require('../config/uploadPaths');

// Resolves the category for a create/update submission - either the
// existing category picked from the dropdown, or a quick-added one.
// Reuses an existing category by exact name match instead of racing the
// UNIQUE constraint into an error, since re-typing an existing name is
// far more likely to be an accidental duplicate than a genuine conflict
// (unlike e.g. invoice numbers, where a collision is meant to be an
// error) - keeps the taxonomy from silently growing near-duplicates.
async function resolveCategoryId(body) {
  const categoryId = body.categoryId ? Number(body.categoryId) : null;
  if (categoryId) return categoryId;

  const newCategoryName = (body.newCategoryName || '').trim();
  if (!newCategoryName) return null;

  const existing = await chargeCategoryModel.findByName(newCategoryName);
  if (existing) return existing.id;
  return chargeCategoryModel.create(newCategoryName);
}

function extractFields(body) {
  const label = (body.label || '').trim();
  return {
    label: label || null,
    amount: body.amount ? Number(body.amount) : NaN,
    chargeDate: (body.chargeDate || '').trim()
  };
}

function validateFields(fields, errors) {
  if (!Number.isFinite(fields.amount) || fields.amount < 0) {
    errors.push('Amount must be a non-negative number.');
  }
  if (!fields.chargeDate) {
    errors.push('Date is required.');
  }
}

async function list(req, res) {
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const [charges, categories] = await Promise.all([
    chargeModel.list({ categoryId }),
    chargeCategoryModel.list()
  ]);
  res.render('charges/list', { charges, categories, categoryId: req.query.categoryId || '' });
}

async function showCreateForm(req, res) {
  const categories = await chargeCategoryModel.list();
  res.render('charges/form', { mode: 'create', chargeRow: null, categories, errors: [] });
}

async function handleCreate(req, res) {
  const fields = extractFields(req.body);
  const errors = [];
  validateFields(fields, errors);

  const categoryId = await resolveCategoryId(req.body);
  if (!categoryId) errors.push('Select a category, or quick-add one (name required).');

  if (errors.length) {
    if (req.file) fs.unlink(path.join(CHARGE_INVOICE_DIR, req.file.filename), () => {});
    const categories = await chargeCategoryModel.list();
    return res.status(400).render('charges/form', {
      mode: 'create',
      chargeRow: { categoryId, ...fields },
      categories,
      errors
    });
  }

  const id = await chargeModel.create({
    categoryId,
    label: fields.label,
    amount: fields.amount,
    chargeDate: fields.chargeDate,
    invoicePath: req.file ? req.file.filename : null,
    invoiceOriginalName: req.file ? req.file.originalname : null
  });

  req.flash('success', 'Charge recorded.');
  res.redirect(`/charges/${id}`);
}

async function showDetail(req, res) {
  const charge = await chargeModel.findById(req.params.id);
  if (!charge) {
    return res.status(404).render('error', { message: 'Charge not found.' });
  }
  res.render('charges/detail', { chargeRow: charge });
}

async function showEditForm(req, res) {
  const charge = await chargeModel.findById(req.params.id);
  if (!charge) {
    return res.status(404).render('error', { message: 'Charge not found.' });
  }
  const categories = await chargeCategoryModel.list();
  res.render('charges/form', { mode: 'edit', chargeRow: charge, categories, errors: [] });
}

async function handleUpdate(req, res) {
  const charge = await chargeModel.findById(req.params.id);
  if (!charge) {
    return res.status(404).render('error', { message: 'Charge not found.' });
  }

  const fields = extractFields(req.body);
  const errors = [];
  validateFields(fields, errors);

  const categoryId = await resolveCategoryId(req.body);
  if (!categoryId) errors.push('Select a category, or quick-add one (name required).');

  if (errors.length) {
    const categories = await chargeCategoryModel.list();
    return res.status(400).render('charges/form', {
      mode: 'edit',
      chargeRow: { ...charge, categoryId, ...fields },
      categories,
      errors
    });
  }

  await chargeModel.update(charge.id, { categoryId, label: fields.label, amount: fields.amount, chargeDate: fields.chargeDate });
  req.flash('success', 'Charge updated.');
  res.redirect(`/charges/${charge.id}`);
}

// Adds or replaces the invoice/receipt PDF on an already-recorded charge
// - same "swap the file, delete the old one" shape as
// salariesController.handleUploadPayslip.
async function handleUploadInvoice(req, res) {
  const charge = await chargeModel.findById(req.params.id);
  if (!charge) {
    return res.status(404).render('error', { message: 'Charge not found.' });
  }

  if (!req.file) {
    req.flash('error', 'Choose a PDF file to upload.');
    return res.redirect(`/charges/${charge.id}`);
  }

  await chargeModel.updateInvoice(charge.id, {
    invoicePath: req.file.filename,
    invoiceOriginalName: req.file.originalname
  });

  if (charge.invoice_path) {
    fs.unlink(path.join(CHARGE_INVOICE_DIR, charge.invoice_path), () => {});
  }

  req.flash('success', 'Invoice uploaded.');
  res.redirect(`/charges/${charge.id}`);
}

async function handleDelete(req, res) {
  const charge = await chargeModel.findById(req.params.id);
  if (!charge) {
    return res.status(404).render('error', { message: 'Charge not found.' });
  }

  if (charge.invoice_path) {
    fs.unlink(path.join(CHARGE_INVOICE_DIR, charge.invoice_path), () => {});
  }

  await chargeModel.remove(charge.id);
  req.flash('success', 'Charge deleted.');
  res.redirect('/charges');
}

// Private/authenticated only - same reasoning as
// invoicesController.servePdf/salariesController.servePayslip.
async function serveInvoice(req, res) {
  const charge = await chargeModel.findById(req.params.id);
  if (!charge || !charge.invoice_path) {
    return res.status(404).render('error', { message: 'No invoice on file for this charge.' });
  }

  const filePath = path.join(CHARGE_INVOICE_DIR, charge.invoice_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', { message: 'Invoice file is missing on disk.' });
  }

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${charge.invoice_original_name || 'invoice.pdf'}"`);
  }
  res.type('application/pdf');
  res.sendFile(filePath);
}

module.exports = {
  list,
  showCreateForm,
  handleCreate,
  showDetail,
  showEditForm,
  handleUpdate,
  handleUploadInvoice,
  handleDelete,
  serveInvoice
};

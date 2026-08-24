const supplierModel = require('../models/supplierModel');
const invoiceModel = require('../models/invoiceModel');

function parseActiveFilter(value) {
  if (value === '1') return 1;
  if (value === '0') return 0;
  return undefined;
}

// ICE/TP/IF/RC/siege are all optional free text - this just trims each
// one down to null-if-empty, same convention as
// clientsController.extractExtendedFields.
function extractFields(body) {
  const trim = (value) => {
    const v = (value || '').trim();
    return v || null;
  };

  return {
    ice: trim(body.ice),
    tp: trim(body.tp),
    ifNumber: trim(body.ifNumber),
    rc: trim(body.rc),
    siege: trim(body.siege)
  };
}

async function list(req, res) {
  const activeFilter = parseActiveFilter(req.query.active);
  const suppliers = await supplierModel.list(activeFilter);
  res.render('suppliers/list', { suppliers, activeFilter: req.query.active || 'all' });
}

function showCreateForm(req, res) {
  res.render('suppliers/form', { mode: 'create', supplierRow: null, errors: [] });
}

async function handleCreate(req, res) {
  const legalName = (req.body.legalName || '').trim();
  const fields = extractFields(req.body);

  const errors = [];
  if (!legalName) errors.push('Legal name (Raison Sociale) is required.');

  if (errors.length) {
    return res.status(400).render('suppliers/form', { mode: 'create', supplierRow: { legalName, ...fields }, errors });
  }

  const id = await supplierModel.create({ legalName, ...fields });
  req.flash('success', `Supplier "${legalName}" created.`);
  res.redirect('/suppliers');
}

async function showDetail(req, res) {
  const supplier = await supplierModel.findById(req.params.id);
  if (!supplier) {
    return res.status(404).render('error', { message: 'Supplier not found.' });
  }
  const invoices = await invoiceModel.listBySupplier(supplier.id);
  res.render('suppliers/detail', { supplierRow: supplier, invoices });
}

async function showEditForm(req, res) {
  const supplier = await supplierModel.findById(req.params.id);
  if (!supplier) {
    return res.status(404).render('error', { message: 'Supplier not found.' });
  }
  res.render('suppliers/form', { mode: 'edit', supplierRow: supplier, errors: [] });
}

async function handleUpdate(req, res) {
  const supplier = await supplierModel.findById(req.params.id);
  if (!supplier) {
    return res.status(404).render('error', { message: 'Supplier not found.' });
  }

  const legalName = (req.body.legalName || '').trim();
  const fields = extractFields(req.body);

  const errors = [];
  if (!legalName) errors.push('Legal name (Raison Sociale) is required.');

  if (errors.length) {
    return res.status(400).render('suppliers/form', {
      mode: 'edit',
      supplierRow: { ...supplier, legalName, ...fields },
      errors
    });
  }

  await supplierModel.update(supplier.id, { legalName, ...fields });
  req.flash('success', 'Supplier updated.');
  res.redirect('/suppliers');
}

async function handleToggleActive(req, res) {
  const supplier = await supplierModel.findById(req.params.id);
  if (!supplier) {
    return res.status(404).render('error', { message: 'Supplier not found.' });
  }
  await supplierModel.setActive(supplier.id, !supplier.active);
  req.flash('success', supplier.active ? 'Supplier deactivated.' : 'Supplier activated.');
  res.redirect('/suppliers');
}

async function handleDelete(req, res) {
  const supplier = await supplierModel.findById(req.params.id);
  if (!supplier) {
    return res.status(404).render('error', { message: 'Supplier not found.' });
  }

  const hasInvoices = await supplierModel.hasAnyInvoices(supplier.id);
  if (hasInvoices) {
    req.flash('error', `"${supplier.legal_name}" can't be deleted - it's linked to at least one invoice. Deactivate it instead.`);
    return res.redirect('/suppliers');
  }

  await supplierModel.remove(supplier.id);
  req.flash('success', `Supplier "${supplier.legal_name}" deleted.`);
  res.redirect('/suppliers');
}

module.exports = { list, showCreateForm, handleCreate, showDetail, showEditForm, handleUpdate, handleToggleActive, handleDelete };

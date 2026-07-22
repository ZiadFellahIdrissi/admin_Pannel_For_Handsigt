const clientModel = require('../models/clientModel');

function parseActiveFilter(value) {
  if (value === '1') return 1;
  if (value === '0') return 0;
  return undefined;
}

// All the enterprise/contact/bank/general fields are optional free text -
// this just trims each one down to null-if-empty, and validates the one
// field (registeredCapital) that isn't a plain string.
function extractExtendedFields(body) {
  const trim = (value) => {
    const v = (value || '').trim();
    return v || null;
  };

  return {
    ice: trim(body.ice),
    rc: trim(body.rc),
    rcCity: trim(body.rcCity),
    patente: trim(body.patente),
    taxIdentifier: trim(body.taxIdentifier),
    cnssNumber: trim(body.cnssNumber),
    legalForm: trim(body.legalForm),
    registeredCapital: body.registeredCapital ? Number(body.registeredCapital) : null,
    registeredAddress: trim(body.registeredAddress),
    contactName: trim(body.contactName),
    contactTitle: trim(body.contactTitle),
    contactPhone: trim(body.contactPhone),
    contactEmail: trim(body.contactEmail),
    bankName: trim(body.bankName),
    bankRib: trim(body.bankRib),
    bankIban: trim(body.bankIban),
    bankSwift: trim(body.bankSwift),
    companyPhone: trim(body.companyPhone),
    companyEmail: trim(body.companyEmail),
    website: trim(body.website),
    billingAddress: trim(body.billingAddress),
    paymentTerms: trim(body.paymentTerms),
    notes: trim(body.notes)
  };
}

async function list(req, res) {
  const activeFilter = parseActiveFilter(req.query.active);
  const clients = await clientModel.list(activeFilter);
  res.render('clients/list', { clients, activeFilter: req.query.active || 'all' });
}

function showCreateForm(req, res) {
  res.render('clients/form', { mode: 'create', clientRow: null, errors: [] });
}

async function handleCreate(req, res) {
  const name = (req.body.name || '').trim();
  const extended = extractExtendedFields(req.body);

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (req.body.registeredCapital && (!Number.isFinite(extended.registeredCapital) || extended.registeredCapital < 0)) {
    errors.push('Registered capital must be a non-negative number.');
  }

  if (errors.length) {
    return res.status(400).render('clients/form', { mode: 'create', clientRow: { name, ...extended }, errors });
  }

  const id = await clientModel.create({ name, ...extended });
  req.flash('success', `Client "${name}" created.`);
  res.redirect('/clients');
}

async function showEditForm(req, res) {
  const client = await clientModel.findById(req.params.id);
  if (!client) {
    return res.status(404).render('error', { message: 'Client not found.' });
  }
  res.render('clients/form', { mode: 'edit', clientRow: client, errors: [] });
}

async function handleUpdate(req, res) {
  const client = await clientModel.findById(req.params.id);
  if (!client) {
    return res.status(404).render('error', { message: 'Client not found.' });
  }

  const name = (req.body.name || '').trim();
  const extended = extractExtendedFields(req.body);

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (req.body.registeredCapital && (!Number.isFinite(extended.registeredCapital) || extended.registeredCapital < 0)) {
    errors.push('Registered capital must be a non-negative number.');
  }

  if (errors.length) {
    return res.status(400).render('clients/form', { mode: 'edit', clientRow: { ...client, name, ...extended }, errors });
  }

  await clientModel.update(client.id, { name, ...extended });
  req.flash('success', 'Client updated.');
  res.redirect('/clients');
}

async function handleToggleActive(req, res) {
  const client = await clientModel.findById(req.params.id);
  if (!client) {
    return res.status(404).render('error', { message: 'Client not found.' });
  }
  await clientModel.setActive(client.id, !client.active);
  req.flash('success', client.active ? 'Client deactivated.' : 'Client activated.');
  res.redirect('/clients');
}

async function handleDelete(req, res) {
  const client = await clientModel.findById(req.params.id);
  if (!client) {
    return res.status(404).render('error', { message: 'Client not found.' });
  }

  const [hasAttachments, hasSubmissions] = await Promise.all([
    clientModel.hasAnyAttachments(client.id),
    clientModel.hasAnySubmissions(client.id)
  ]);

  if (hasAttachments || hasSubmissions) {
    req.flash('error', `"${client.name}" can't be deleted - it's attached to at least one consultant or has submission history. Deactivate it instead.`);
    return res.redirect('/clients');
  }

  await clientModel.remove(client.id);
  req.flash('success', `Client "${client.name}" deleted.`);
  res.redirect('/clients');
}

module.exports = { list, showCreateForm, handleCreate, showEditForm, handleUpdate, handleToggleActive, handleDelete };

const clientModel = require('../models/clientModel');

function parseActiveFilter(value) {
  if (value === '1') return 1;
  if (value === '0') return 0;
  return undefined;
}

async function list(req, res) {
  const activeFilter = parseActiveFilter(req.query.active);
  const clients = await clientModel.list(activeFilter);
  res.render('clients/list', { clients, activeFilter: req.query.active || 'all' });
}

function showCreateForm(req, res) {
  res.render('clients/form', { mode: 'create', client: null, errors: [] });
}

async function handleCreate(req, res) {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).render('clients/form', { mode: 'create', client: { name }, errors: ['Name is required.'] });
  }
  const id = await clientModel.create({ name });
  req.flash('success', `Client "${name}" created.`);
  res.redirect('/clients');
}

async function showEditForm(req, res) {
  const client = await clientModel.findById(req.params.id);
  if (!client) {
    return res.status(404).render('error', { message: 'Client not found.' });
  }
  res.render('clients/form', { mode: 'edit', client, errors: [] });
}

async function handleUpdate(req, res) {
  const client = await clientModel.findById(req.params.id);
  if (!client) {
    return res.status(404).render('error', { message: 'Client not found.' });
  }
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).render('clients/form', { mode: 'edit', client: { ...client, name }, errors: ['Name is required.'] });
  }
  await clientModel.update(client.id, { name });
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

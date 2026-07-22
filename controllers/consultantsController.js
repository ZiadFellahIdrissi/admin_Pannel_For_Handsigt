const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const consultantClientModel = require('../models/consultantClientModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');

const BCRYPT_ROUNDS = 12;
const VALID_LANGUAGES = ['en', 'fr'];

function parseActiveFilter(value) {
  if (value === '1') return 1;
  if (value === '0') return 0;
  return undefined; // 'all' or anything else - no filter
}

async function list(req, res) {
  const activeFilter = parseActiveFilter(req.query.active);
  const consultants = await userModel.list(activeFilter);
  res.render('consultants/list', {
    consultants,
    activeFilter: req.query.active || 'all'
  });
}

function showCreateForm(req, res) {
  res.render('consultants/form', { mode: 'create', consultant: null, errors: [] });
}

async function handleCreate(req, res) {
  const firstName = (req.body.firstName || '').trim();
  const lastName = (req.body.lastName || '').trim();
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim();
  const dailyRate = Number(req.body.dailyRate);
  const tempPassword = req.body.tempPassword || '';
  const preferredLanguage = VALID_LANGUAGES.includes(req.body.preferredLanguage) ? req.body.preferredLanguage : 'en';

  const errors = [];
  if (!username) errors.push('Username is required.');
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (!email) errors.push('Email is required.');
  if (!Number.isFinite(dailyRate) || dailyRate < 0) errors.push('Daily rate must be a non-negative number.');
  if (!tempPassword || tempPassword.length < 8) errors.push('Temporary password must be at least 8 characters.');

  if (username && !errors.length) {
    const existing = await userModel.findByUsername(username);
    if (existing) errors.push('That username is already taken.');
  }

  if (errors.length) {
    return res.status(400).render('consultants/form', {
      mode: 'create',
      consultant: { username, first_name: firstName, last_name: lastName, email, daily_rate: dailyRate, preferred_language: preferredLanguage },
      errors
    });
  }

  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
  const id = await userModel.create({ username, firstName, lastName, email, dailyRate, passwordHash, preferredLanguage });

  req.flash('success', `Consultant "${firstName} ${lastName}" created.`);
  res.redirect(`/consultants/${id}`);
}

async function showDetail(req, res) {
  const consultant = await userModel.findById(req.params.id);
  if (!consultant) {
    return res.status(404).render('error', { message: 'Consultant not found.' });
  }
  const attachedClients = await consultantClientModel.listForConsultant(consultant.id);
  const unattachedClients = await consultantClientModel.listUnattachedForConsultant(consultant.id);
  const submissions = await monthSubmissionModel.listForConsultant(consultant.id);

  res.render('consultants/detail', { consultant, attachedClients, unattachedClients, submissions });
}

async function showEditForm(req, res) {
  const consultant = await userModel.findById(req.params.id);
  if (!consultant) {
    return res.status(404).render('error', { message: 'Consultant not found.' });
  }
  res.render('consultants/form', { mode: 'edit', consultant, errors: [] });
}

async function handleUpdate(req, res) {
  const consultant = await userModel.findById(req.params.id);
  if (!consultant) {
    return res.status(404).render('error', { message: 'Consultant not found.' });
  }

  const firstName = (req.body.firstName || '').trim();
  const lastName = (req.body.lastName || '').trim();
  const email = (req.body.email || '').trim();
  const dailyRate = Number(req.body.dailyRate);
  const active = req.body.active === 'on' || req.body.active === '1';

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (!email) errors.push('Email is required.');
  if (!Number.isFinite(dailyRate) || dailyRate < 0) errors.push('Daily rate must be a non-negative number.');

  if (errors.length) {
    return res.status(400).render('consultants/form', {
      mode: 'edit',
      consultant: { ...consultant, first_name: firstName, last_name: lastName, email, daily_rate: dailyRate, active: active ? 1 : 0 },
      errors
    });
  }

  if (!active && consultant.active) {
    const hasPending = await userModel.hasPendingSubmissions(consultant.id);
    if (hasPending) {
      req.flash('error', 'Note: this consultant has pending submission(s) - deactivating does not cancel or hide them.');
    }
  }

  await userModel.update(consultant.id, { firstName, lastName, email, dailyRate, active });

  req.flash('success', 'Consultant updated.');
  res.redirect(`/consultants/${consultant.id}`);
}

async function handleResetPassword(req, res) {
  const consultant = await userModel.findById(req.params.id);
  if (!consultant) {
    return res.status(404).render('error', { message: 'Consultant not found.' });
  }

  const tempPassword = req.body.tempPassword || '';
  if (!tempPassword || tempPassword.length < 8) {
    req.flash('error', 'Temporary password must be at least 8 characters.');
    return res.redirect(`/consultants/${consultant.id}/edit`);
  }

  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
  await userModel.resetPassword(consultant.id, passwordHash);

  req.flash('success', 'Password reset. The consultant will be asked to choose a new one on next login.');
  res.redirect(`/consultants/${consultant.id}/edit`);
}

async function handleAttachClients(req, res) {
  const userId = Number(req.params.id);
  // Checkbox multi-select: a single checked box arrives as a plain string,
  // several as an array - normalize to an array either way.
  const rawClientIds = req.body.clientIds;
  const clientIds = (Array.isArray(rawClientIds) ? rawClientIds : rawClientIds ? [rawClientIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (clientIds.length === 0) {
    req.flash('error', 'Choose at least one client to attach.');
    return res.redirect(`/consultants/${userId}`);
  }

  const { attachedCount, skippedCount } = await consultantClientModel.attachMany(userId, clientIds);

  if (attachedCount === 0) {
    req.flash('error', 'Those client(s) were already attached to this consultant.');
  } else {
    const suffix = skippedCount > 0 ? ` (${skippedCount} already attached, skipped)` : '';
    req.flash('success', `Attached ${attachedCount} client${attachedCount === 1 ? '' : 's'}${suffix}.`);
  }
  res.redirect(`/consultants/${userId}`);
}

async function handleDetachClient(req, res) {
  const userId = Number(req.params.id);
  const clientId = Number(req.params.clientId);

  await consultantClientModel.detach(userId, clientId);
  req.flash('success', 'Client detached.');
  res.redirect(`/consultants/${userId}`);
}

module.exports = {
  list,
  showCreateForm,
  handleCreate,
  showDetail,
  showEditForm,
  handleUpdate,
  handleResetPassword,
  handleAttachClients,
  handleDetachClient
};

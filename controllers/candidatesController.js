const fs = require('fs');
const path = require('path');
const candidateModel = require('../models/candidateModel');
const { ageFromBirthDate } = require('../utils/format');
const { CANDIDATE_CV_DIR } = require('../config/uploadPaths');

// All fields besides firstName/lastName are optional free text/numbers -
// this just trims strings to null-if-empty and validates the handful of
// fields that aren't plain strings, same convention as
// clientsController.extractExtendedFields.
function extractFields(body) {
  const trim = (value) => {
    const v = (value || '').trim();
    return v || null;
  };

  return {
    email: trim(body.email),
    phone: trim(body.phone),
    whatsapp: trim(body.whatsapp),
    birthDate: trim(body.birthDate),
    address: trim(body.address),
    city: trim(body.city),
    country: trim(body.country),
    experienceYears: body.experienceYears ? Number(body.experienceYears) : null,
    possibleRoles: trim(body.possibleRoles),
    currentPosition: trim(body.currentPosition),
    currentCompany: trim(body.currentCompany),
    education: trim(body.education),
    skills: trim(body.skills),
    languages: trim(body.languages),
    linkedinUrl: trim(body.linkedinUrl),
    portfolioUrl: trim(body.portfolioUrl),
    expectedSalary: body.expectedSalary ? Number(body.expectedSalary) : null,
    availability: trim(body.availability),
    source: trim(body.source),
    status: candidateModel.STATUSES.includes(body.status) ? body.status : 'new',
    rating: body.rating ? Number(body.rating) : null,
    notes: trim(body.notes)
  };
}

async function list(req, res) {
  const status = req.query.status || '';
  const q = req.query.q || '';
  const minExperience = req.query.minExperience || '';
  const position = req.query.position || '';
  const city = req.query.city || '';
  const candidates = await candidateModel.list({ status, q, minExperience, position, city });
  res.render('candidates/list', {
    candidates,
    status,
    q,
    minExperience,
    position,
    city,
    statuses: candidateModel.STATUSES,
    statusLabels: candidateModel.STATUS_LABELS,
    statusBadgeClass: candidateModel.STATUS_BADGE_CLASS
  });
}

function showCreateForm(req, res) {
  res.render('candidates/form', {
    mode: 'create',
    candidateRow: null,
    errors: [],
    statuses: candidateModel.STATUSES,
    statusLabels: candidateModel.STATUS_LABELS
  });
}

async function handleCreate(req, res) {
  const firstName = (req.body.firstName || '').trim();
  const lastName = (req.body.lastName || '').trim();
  const fields = extractFields(req.body);

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (fields.experienceYears !== null && (!Number.isFinite(fields.experienceYears) || fields.experienceYears < 0)) {
    errors.push('Years of experience must be a non-negative number.');
  }
  if (fields.expectedSalary !== null && (!Number.isFinite(fields.expectedSalary) || fields.expectedSalary < 0)) {
    errors.push('Expected salary must be a non-negative number.');
  }
  if (fields.rating !== null && (!Number.isInteger(fields.rating) || fields.rating < 1 || fields.rating > 5)) {
    errors.push('Rating must be a whole number between 1 and 5.');
  }

  if (errors.length) {
    // A file may have already been saved to disk by multer before
    // validation ran - clean it up so it isn't orphaned with no
    // candidate row to belong to.
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).render('candidates/form', {
      mode: 'create',
      candidateRow: { firstName, lastName, ...fields },
      errors,
      statuses: candidateModel.STATUSES,
      statusLabels: candidateModel.STATUS_LABELS
    });
  }

  const id = await candidateModel.create({ firstName, lastName, ...fields });

  if (req.file) {
    await candidateModel.updateCv(id, { cvFilename: req.file.filename, cvOriginalName: req.file.originalname });
  }

  req.flash('success', `Candidate "${firstName} ${lastName}" created.`);
  res.redirect(`/candidates/${id}`);
}

async function showDetail(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate) {
    return res.status(404).render('error', { message: 'Candidate not found.' });
  }
  res.render('candidates/detail', {
    candidateRow: candidate,
    age: ageFromBirthDate(candidate.birth_date),
    statusLabels: candidateModel.STATUS_LABELS,
    statusBadgeClass: candidateModel.STATUS_BADGE_CLASS
  });
}

async function showEditForm(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate) {
    return res.status(404).render('error', { message: 'Candidate not found.' });
  }
  res.render('candidates/form', {
    mode: 'edit',
    candidateRow: candidate,
    errors: [],
    statuses: candidateModel.STATUSES,
    statusLabels: candidateModel.STATUS_LABELS
  });
}

async function handleUpdate(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate) {
    return res.status(404).render('error', { message: 'Candidate not found.' });
  }

  const firstName = (req.body.firstName || '').trim();
  const lastName = (req.body.lastName || '').trim();
  const fields = extractFields(req.body);

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (fields.experienceYears !== null && (!Number.isFinite(fields.experienceYears) || fields.experienceYears < 0)) {
    errors.push('Years of experience must be a non-negative number.');
  }
  if (fields.expectedSalary !== null && (!Number.isFinite(fields.expectedSalary) || fields.expectedSalary < 0)) {
    errors.push('Expected salary must be a non-negative number.');
  }
  if (fields.rating !== null && (!Number.isInteger(fields.rating) || fields.rating < 1 || fields.rating > 5)) {
    errors.push('Rating must be a whole number between 1 and 5.');
  }

  if (errors.length) {
    return res.status(400).render('candidates/form', {
      mode: 'edit',
      candidateRow: { ...candidate, first_name: firstName, last_name: lastName, ...fields },
      errors,
      statuses: candidateModel.STATUSES,
      statusLabels: candidateModel.STATUS_LABELS
    });
  }

  await candidateModel.update(candidate.id, { firstName, lastName, ...fields });
  req.flash('success', 'Candidate updated.');
  res.redirect(`/candidates/${candidate.id}`);
}

async function handleReuploadCv(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate) {
    return res.status(404).render('error', { message: 'Candidate not found.' });
  }

  if (!req.file) {
    req.flash('error', 'Choose a PDF file to upload.');
    return res.redirect(`/candidates/${candidate.id}`);
  }

  if (candidate.cv_filename) {
    fs.unlink(path.join(CANDIDATE_CV_DIR, candidate.cv_filename), () => {});
  }

  await candidateModel.updateCv(candidate.id, { cvFilename: req.file.filename, cvOriginalName: req.file.originalname });
  req.flash('success', 'CV uploaded.');
  res.redirect(`/candidates/${candidate.id}`);
}

async function serveCv(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate || !candidate.cv_filename) {
    return res.status(404).render('error', { message: 'No CV on file for this candidate.' });
  }

  const filePath = path.join(CANDIDATE_CV_DIR, candidate.cv_filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', { message: 'CV file is missing on disk.' });
  }

  res.type('application/pdf');
  res.sendFile(filePath);
}

async function handleDelete(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate) {
    return res.status(404).render('error', { message: 'Candidate not found.' });
  }

  if (candidate.cv_filename) {
    fs.unlink(path.join(CANDIDATE_CV_DIR, candidate.cv_filename), () => {});
  }

  await candidateModel.remove(candidate.id);
  req.flash('success', `Candidate "${candidate.first_name} ${candidate.last_name}" deleted.`);
  res.redirect('/candidates');
}

module.exports = {
  list,
  showCreateForm,
  handleCreate,
  showDetail,
  showEditForm,
  handleUpdate,
  handleReuploadCv,
  serveCv,
  handleDelete
};

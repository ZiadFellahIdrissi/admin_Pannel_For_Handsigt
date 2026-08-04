const fs = require('fs');
const path = require('path');
const candidateModel = require('../models/candidateModel');
const { yearsSince, toTitleCase } = require('../utils/format');
const { CANDIDATE_CV_DIR } = require('../config/uploadPaths');

const MAX_SKILLS = 50;

// 'SQL; Power BI ; Excel' -> ['SQL', 'Power BI', 'Excel'] - shown/edited
// as tags rather than a free paragraph, and semicolon-separated (not
// comma) since a skill phrase can itself contain a comma.
function parseSkills(value) {
  return (value || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

// All fields besides firstName/lastName are optional free text/numbers -
// this just trims strings to null-if-empty and validates the handful of
// fields that aren't plain strings, same convention as
// clientsController.extractExtendedFields. skillsCount isn't a DB column
// (candidateModel's FIELDS list doesn't include it) - it just rides
// along on the returned object so handleCreate/handleUpdate can validate
// the 50-max without re-parsing the raw input themselves.
function extractFields(body) {
  const trim = (value) => {
    const v = (value || '').trim();
    return v || null;
  };
  const skillsList = parseSkills(body.skills);

  const email = trim(body.email);

  return {
    email: email ? email.toLowerCase() : null,
    phone: trim(body.phone),
    whatsapp: trim(body.whatsapp),
    gender: candidateModel.GENDERS.includes(body.gender) ? body.gender : null,
    city: trim(body.city),
    country: trim(body.country),
    firstExperienceDate: trim(body.firstExperienceDate),
    graduationDate: trim(body.graduationDate),
    possibleRoles: trim(body.possibleRoles),
    educationLevel: candidateModel.EDUCATION_LEVELS.includes(body.educationLevel) ? body.educationLevel : null,
    specialty: trim(body.specialty),
    skills: skillsList.length ? skillsList.join('; ') : null,
    skillsCount: skillsList.length,
    languages: trim(body.languages),
    linkedinUrl: trim(body.linkedinUrl),
    portfolioUrl: trim(body.portfolioUrl),
    expectedSalary: body.expectedSalary ? Number(body.expectedSalary) : null,
    expectedTjm: body.expectedTjm ? Number(body.expectedTjm) : null,
    availability: trim(body.availability),
    source: trim(body.source),
    openToCdd: body.openToCdd === 'on',
    openToCdi: body.openToCdi === 'on',
    openToFreelance: body.openToFreelance === 'on',
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
  const skills = req.query.skills || '';
  const city = req.query.city || '';
  const candidates = await candidateModel.list({ status, q, minExperience, position, skills, city });
  res.render('candidates/list', {
    candidates,
    status,
    q,
    minExperience,
    position,
    skills,
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
    statusLabels: candidateModel.STATUS_LABELS,
    educationLevels: candidateModel.EDUCATION_LEVELS,
    genders: candidateModel.GENDERS
  });
}

async function handleCreate(req, res) {
  const firstName = toTitleCase((req.body.firstName || '').trim());
  const lastName = toTitleCase((req.body.lastName || '').trim());
  const fields = extractFields(req.body);

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (fields.expectedSalary !== null && (!Number.isFinite(fields.expectedSalary) || fields.expectedSalary < 0)) {
    errors.push('Expected salary must be a non-negative number.');
  }
  if (fields.expectedTjm !== null && (!Number.isFinite(fields.expectedTjm) || fields.expectedTjm < 0)) {
    errors.push('Expected TJM must be a non-negative number.');
  }
  if (fields.rating !== null && (!Number.isInteger(fields.rating) || fields.rating < 1 || fields.rating > 5)) {
    errors.push('Rating must be a whole number between 1 and 5.');
  }
  if (fields.skillsCount > MAX_SKILLS) {
    errors.push(`Maximum ${MAX_SKILLS} skills allowed (found ${fields.skillsCount}).`);
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
      statusLabels: candidateModel.STATUS_LABELS,
      educationLevels: candidateModel.EDUCATION_LEVELS,
      genders: candidateModel.GENDERS
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
    yearsOfExperience: yearsSince(candidate.first_experience_date),
    yearsSinceGraduation: yearsSince(candidate.graduation_date),
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
    statusLabels: candidateModel.STATUS_LABELS,
    educationLevels: candidateModel.EDUCATION_LEVELS,
    genders: candidateModel.GENDERS
  });
}

async function handleUpdate(req, res) {
  const candidate = await candidateModel.findById(req.params.id);
  if (!candidate) {
    return res.status(404).render('error', { message: 'Candidate not found.' });
  }

  const firstName = toTitleCase((req.body.firstName || '').trim());
  const lastName = toTitleCase((req.body.lastName || '').trim());
  const fields = extractFields(req.body);

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (fields.expectedSalary !== null && (!Number.isFinite(fields.expectedSalary) || fields.expectedSalary < 0)) {
    errors.push('Expected salary must be a non-negative number.');
  }
  if (fields.expectedTjm !== null && (!Number.isFinite(fields.expectedTjm) || fields.expectedTjm < 0)) {
    errors.push('Expected TJM must be a non-negative number.');
  }
  if (fields.rating !== null && (!Number.isInteger(fields.rating) || fields.rating < 1 || fields.rating > 5)) {
    errors.push('Rating must be a whole number between 1 and 5.');
  }
  if (fields.skillsCount > MAX_SKILLS) {
    errors.push(`Maximum ${MAX_SKILLS} skills allowed (found ${fields.skillsCount}).`);
  }

  if (errors.length) {
    return res.status(400).render('candidates/form', {
      mode: 'edit',
      candidateRow: { ...candidate, first_name: firstName, last_name: lastName, ...fields },
      errors,
      statuses: candidateModel.STATUSES,
      statusLabels: candidateModel.STATUS_LABELS,
      educationLevels: candidateModel.EDUCATION_LEVELS,
      genders: candidateModel.GENDERS
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

async function handleBulkDelete(req, res) {
  // Checkbox multi-select: a single checked box arrives as a plain
  // string, several as an array - normalize to an array either way (same
  // convention as consultantsController.handleAttachClients).
  const rawIds = req.body.candidateIds;
  const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) {
    req.flash('error', 'Choose at least one candidate to delete.');
    return res.redirect('/candidates');
  }

  const candidates = await candidateModel.findByIds(ids);
  candidates.forEach((c) => {
    if (c.cv_filename) fs.unlink(path.join(CANDIDATE_CV_DIR, c.cv_filename), () => {});
  });

  await candidateModel.bulkDelete(ids);
  req.flash('success', `Deleted ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}.`);
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
  handleDelete,
  handleBulkDelete
};

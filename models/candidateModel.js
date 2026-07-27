const pool = require('../config/db');

// Pipeline stages - plain VARCHAR + app-level validation (not an ENUM),
// matching how status columns elsewhere in this app are done. Exported
// so the controller (validation) and views (filter dropdown, badges)
// share one source of truth.
const STATUSES = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected', 'on_hold'];

const STATUS_LABELS = {
  new: 'New', screening: 'Screening', interview: 'Interview', offer: 'Offer',
  hired: 'Hired', rejected: 'Rejected', on_hold: 'On Hold'
};

// Reuses the 4 badge styles that already exist in input.css (no new CSS
// needed) - mapped onto the 7 pipeline stages by closest visual meaning.
const STATUS_BADGE_CLASS = {
  new: 'badge-draft', screening: 'badge-pending', interview: 'badge-pending',
  offer: 'badge-pending', hired: 'badge-approved', rejected: 'badge-rejected', on_hold: 'badge-draft'
};

const FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'whatsapp', 'birthDate',
  'address', 'city', 'country', 'experienceYears', 'possibleRoles',
  'currentPosition', 'currentCompany', 'education', 'skills', 'languages',
  'linkedinUrl', 'portfolioUrl', 'expectedSalary', 'availability', 'source',
  'status', 'rating', 'notes'
];

const COLUMN_BY_FIELD = {
  firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone',
  whatsapp: 'whatsapp', birthDate: 'birth_date', address: 'address', city: 'city',
  country: 'country', experienceYears: 'experience_years', possibleRoles: 'possible_roles',
  currentPosition: 'current_position', currentCompany: 'current_company', education: 'education',
  skills: 'skills', languages: 'languages', linkedinUrl: 'linkedin_url', portfolioUrl: 'portfolio_url',
  expectedSalary: 'expected_salary', availability: 'availability', source: 'source',
  status: 'status', rating: 'rating', notes: 'notes'
};

// Optional status/experience/position/city filters + a simple name/email
// search - the same URL-query-filter convention as clientModel.list(active).
async function list({ status, q, minExperience, position, city } = {}) {
  const conditions = [];
  const params = [];

  if (status && STATUSES.includes(status)) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (q && q.trim()) {
    conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }
  if (minExperience !== undefined && minExperience !== null && minExperience !== '' && Number.isFinite(Number(minExperience))) {
    conditions.push('experience_years >= ?');
    params.push(Number(minExperience));
  }
  if (position && position.trim()) {
    conditions.push('(possible_roles LIKE ? OR current_position LIKE ?)');
    const like = `%${position.trim()}%`;
    params.push(like, like);
  }
  if (city && city.trim()) {
    conditions.push('city LIKE ?');
    params.push(`%${city.trim()}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM candidates ${whereClause} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM candidates WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create(data) {
  const columns = FIELDS.map((f) => COLUMN_BY_FIELD[f]);
  const values = FIELDS.map((f) => data[f] ?? null);
  const placeholders = FIELDS.map(() => '?').join(', ');

  const [result] = await pool.query(
    `INSERT INTO candidates (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return result.insertId;
}

// Text fields only - never touches cv_* columns (see updateCv/removeCv).
async function update(id, data) {
  const assignments = FIELDS.map((f) => `${COLUMN_BY_FIELD[f]} = ?`).join(', ');
  const values = FIELDS.map((f) => data[f] ?? null);

  await pool.query(
    `UPDATE candidates SET ${assignments} WHERE id = ?`,
    [...values, id]
  );
}

async function updateCv(id, { cvFilename, cvOriginalName }) {
  await pool.query(
    'UPDATE candidates SET cv_filename = ?, cv_original_name = ?, cv_uploaded_at = NOW() WHERE id = ?',
    [cvFilename, cvOriginalName, id]
  );
}

async function removeCv(id) {
  await pool.query(
    'UPDATE candidates SET cv_filename = NULL, cv_original_name = NULL, cv_uploaded_at = NULL WHERE id = ?',
    [id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM candidates WHERE id = ?', [id]);
}

module.exports = { STATUSES, STATUS_LABELS, STATUS_BADGE_CLASS, list, findById, create, update, updateCv, removeCv, remove };

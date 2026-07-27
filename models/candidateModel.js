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

  // Set once, right away, if a candidate is created already marked
  // 'hired' (e.g. via Excel import) - same rule as update() below.
  const hiredAt = data.status === 'hired' ? new Date() : null;

  const [result] = await pool.query(
    `INSERT INTO candidates (${columns.join(', ')}, hired_at) VALUES (${placeholders}, ?)`,
    [...values, hiredAt]
  );
  return result.insertId;
}

// Text fields only - never touches cv_* columns (see updateCv/removeCv).
//
// hired_at is set exactly once, the first time status flips to 'hired',
// and never cleared automatically after (even if status later changes
// again) - it's a "when did this happen" record, not a live mirror of
// status. Its CASE has to come before `${assignments}` in the SET list:
// MySQL evaluates SET assignments left-to-right, so referencing `status`
// here (before assignments' own `status = ?` runs later in the same
// statement) reads the PRE-update value, which is exactly the comparison
// this needs ("was it not already hired, and is the incoming value
// hired?").
async function update(id, data) {
  const assignments = FIELDS.map((f) => `${COLUMN_BY_FIELD[f]} = ?`).join(', ');
  const values = FIELDS.map((f) => data[f] ?? null);

  await pool.query(
    `UPDATE candidates SET
       hired_at = CASE WHEN status != 'hired' AND ? = 'hired' THEN NOW() ELSE hired_at END,
       ${assignments}
     WHERE id = ?`,
    [data.status, ...values, id]
  );
}

async function findByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const [rows] = await pool.query('SELECT * FROM candidates WHERE id IN (?)', [ids]);
  return rows;
}

async function bulkDelete(ids) {
  if (!ids || ids.length === 0) return;
  await pool.query('DELETE FROM candidates WHERE id IN (?)', [ids]);
}

async function countTotal() {
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM candidates');
  return rows[0].count;
}

async function countAddedThisMonth() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS count FROM candidates WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')"
  );
  return rows[0].count;
}

async function countHiredThisMonth() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS count FROM candidates WHERE DATE_FORMAT(hired_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')"
  );
  return rows[0].count;
}

// One row per pipeline stage, in STATUSES order - callers fill in 0 for
// any status with no candidates (GROUP BY only returns stages actually
// present).
async function countByStatus() {
  const [rows] = await pool.query('SELECT status, COUNT(*) AS count FROM candidates GROUP BY status');
  const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  return STATUSES.map((s) => ({ status: s, count: counts[s] || 0 }));
}

async function countBySource() {
  const [rows] = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(source), ''), 'Unspecified') AS source, COUNT(*) AS count
       FROM candidates
      GROUP BY COALESCE(NULLIF(TRIM(source), ''), 'Unspecified')
      ORDER BY count DESC`
  );
  return rows;
}

// Last `monthsBack` months of hires, most recent first - the controller
// reverses this to chronological order for the trend line, same as
// monthSubmissionModel.approvedMonthlyTrend.
async function hiresPerMonth(monthsBack = 12) {
  const safeMonthsBack = Number.isInteger(monthsBack) && monthsBack > 0 ? monthsBack : 12;
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(hired_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM candidates
      WHERE hired_at IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?`,
    [safeMonthsBack]
  );
  return rows;
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

module.exports = {
  STATUSES,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  list,
  findById,
  findByIds,
  create,
  update,
  updateCv,
  removeCv,
  remove,
  bulkDelete,
  countTotal,
  countAddedThisMonth,
  countHiredThisMonth,
  countByStatus,
  countBySource,
  hiresPerMonth
};

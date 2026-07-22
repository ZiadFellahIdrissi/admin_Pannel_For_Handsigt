const pool = require('../config/db');

// Read-only: the Admin Panel never edits individual days - editing is the
// consultant's job via "reopen to draft" (see monthSubmissionModel). This
// model exists only so the approval queue can show a day-by-day breakdown
// before the admin decides.

// One query for every pending submission's entries at once, grouped by
// submission_id, to avoid an N+1 query per row in the queue.
async function listForSubmissions(submissionIds) {
  if (!submissionIds || submissionIds.length === 0) return new Map();

  const [rows] = await pool.query(
    `SELECT submission_id, work_date, value
       FROM daily_entries
      WHERE submission_id IN (?)
      ORDER BY submission_id ASC, work_date ASC`,
    [submissionIds]
  );

  const bySubmission = new Map();
  rows.forEach((row) => {
    if (!bySubmission.has(row.submission_id)) {
      bySubmission.set(row.submission_id, []);
    }
    bySubmission.get(row.submission_id).push(row);
  });
  return bySubmission;
}

module.exports = { listForSubmissions };

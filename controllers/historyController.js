const monthSubmissionModel = require('../models/monthSubmissionModel');
const clientModel = require('../models/clientModel');
const dailyEntryModel = require('../models/dailyEntryModel');
const { buildCalendar } = require('../utils/calendar');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VALID_STATUSES = ['draft', 'pending', 'approved', 'rejected'];

async function list(req, res) {
  const monthRaw = (req.query.month || '').trim();
  const month = MONTH_RE.test(monthRaw) ? monthRaw : null;
  if (monthRaw && !month) {
    req.flash('error', 'Ignored invalid month filter.');
  }

  const clientId = req.query.clientId ? Number(req.query.clientId) : null;
  const status = VALID_STATUSES.includes(req.query.status) ? req.query.status : null;

  const submissions = await monthSubmissionModel.listHistory({ month, clientId, status });
  const clients = await clientModel.list();

  // Same read-only "View Details" calendar as the Approval Queue - built
  // once here for every listed row rather than per-row, same
  // avoid-N+1-queries reasoning as approvalsController.list.
  const entriesBySubmission = await dailyEntryModel.listForSubmissions(submissions.map((s) => s.id));
  const calendarBySubmission = new Map();
  submissions.forEach((s) => {
    calendarBySubmission.set(s.id, buildCalendar(s.month, entriesBySubmission.get(s.id) || []));
  });

  res.render('history/list', {
    submissions,
    clients,
    calendarBySubmission,
    filters: {
      month: monthRaw,
      clientId: req.query.clientId || '',
      status: req.query.status || ''
    }
  });
}

module.exports = { list };

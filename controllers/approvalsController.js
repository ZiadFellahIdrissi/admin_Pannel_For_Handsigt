const monthSubmissionModel = require('../models/monthSubmissionModel');
const dailyEntryModel = require('../models/dailyEntryModel');
const dateHelpers = require('../utils/dateHelpers');

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Builds the same day/weekday/value grid shape the Consultant Dashboard's
// own calendar.ejs uses, from this submission's daily_entries rows, so
// the admin's read-only preview looks like the actual calendar that was
// filled in - not just a plain list of dates.
function buildCalendar(month, entries) {
  const valueByDate = {};
  entries.forEach((entry) => {
    valueByDate[entry.work_date] = entry.value;
  });

  const totalDays = dateHelpers.daysInMonth(month);
  const days = [];
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    days.push({
      day,
      weekday: dateHelpers.weekdayShort(month, day, WEEKDAY_NAMES),
      value: valueByDate[dateStr] !== undefined ? valueByDate[dateStr] : ''
    });
  }

  return {
    weekdayNames: WEEKDAY_NAMES,
    leadingBlanks: Array(dateHelpers.firstWeekdayIndex(month)).fill(null),
    days
  };
}

async function list(req, res) {
  const pending = await monthSubmissionModel.listPending();
  const entriesBySubmission = await dailyEntryModel.listForSubmissions(pending.map((p) => p.id));

  const calendarBySubmission = new Map();
  pending.forEach((p) => {
    calendarBySubmission.set(p.id, buildCalendar(p.month, entriesBySubmission.get(p.id) || []));
  });

  res.render('approvals/list', { pending, calendarBySubmission });
}

async function handleApprove(req, res) {
  const ok = await monthSubmissionModel.approve(req.params.id);
  req.flash(ok ? 'success' : 'error', ok ? 'Submission approved.' : 'This submission was already handled.');
  res.redirect('/approvals');
}

async function handleReject(req, res) {
  const comment = (req.body.comment || '').trim() || null;
  const ok = await monthSubmissionModel.reject(req.params.id, comment);
  req.flash(ok ? 'success' : 'error', ok ? 'Submission rejected.' : 'This submission was already handled.');
  res.redirect('/approvals');
}

async function handleReopen(req, res) {
  await monthSubmissionModel.reopenToDraft(req.params.id);
  req.flash('success', 'Submission reopened to draft.');
  // Reopen is reachable from the approvals queue, history, and consultant
  // detail pages - each form sets returnTo so the admin lands back where
  // they started. Only a same-site relative path is honored.
  const returnTo = req.body.returnTo || '';
  const isSafeRelativePath = returnTo.startsWith('/') && !returnTo.startsWith('//');
  res.redirect(isSafeRelativePath ? returnTo : '/approvals');
}

module.exports = { list, handleApprove, handleReject, handleReopen };

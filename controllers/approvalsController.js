const monthSubmissionModel = require('../models/monthSubmissionModel');
const dailyEntryModel = require('../models/dailyEntryModel');

async function list(req, res) {
  const pending = await monthSubmissionModel.listPending();
  const entriesBySubmission = await dailyEntryModel.listForSubmissions(pending.map((p) => p.id));
  res.render('approvals/list', { pending, entriesBySubmission });
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

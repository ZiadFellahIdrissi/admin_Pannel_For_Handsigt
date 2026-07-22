const monthSubmissionModel = require('../models/monthSubmissionModel');
const clientModel = require('../models/clientModel');

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

  res.render('history/list', {
    submissions,
    clients,
    filters: {
      month: monthRaw,
      clientId: req.query.clientId || '',
      status: req.query.status || ''
    }
  });
}

module.exports = { list };

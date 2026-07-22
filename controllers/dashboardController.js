const userModel = require('../models/userModel');
const clientModel = require('../models/clientModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function show(req, res) {
  const month = currentMonth();
  const [activeConsultants, activeClients, approvedThisMonth, recentActivity] = await Promise.all([
    userModel.list(1),
    clientModel.list(1),
    monthSubmissionModel.listHistory({ month, status: 'approved' }),
    monthSubmissionModel.listRecentActivity(8)
  ]);

  const approvedEarningsThisMonth = approvedThisMonth.reduce((sum, s) => sum + Number(s.total_earnings), 0);

  res.render('dashboard', {
    activeConsultantsCount: activeConsultants.length,
    activeClientsCount: activeClients.length,
    // res.locals.notificationCount is already computed by the pending-
    // submissions middleware in server.js on every request - reuse it
    // instead of running the same query twice.
    pendingCount: res.locals.notificationCount,
    approvedEarningsThisMonth,
    currentMonth: month,
    recentActivity
  });
}

module.exports = { show };

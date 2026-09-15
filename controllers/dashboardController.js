const userModel = require('../models/userModel');
const clientModel = require('../models/clientModel');
const supplierModel = require('../models/supplierModel');
const employeeModel = require('../models/employeeModel');
const candidateModel = require('../models/candidateModel');
const careerOfferModel = require('../models/careerOfferModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');
const salaryPaymentModel = require('../models/salaryPaymentModel');
const financeModel = require('../models/financeModel');
const { currentMonthKey } = require('../utils/format');

// One landing page pulling a headline number from every module built
// this far - deliberately all read-only aggregate queries (list/count),
// nothing here mutates anything. Finance figures reuse financeModel's
// existing cash-basis logic (see financeModel.js) for a single month
// (today's), same rule as the full Finance section: only invoices
// actually marked paid count as revenue/cost/TVA.
async function show(req, res) {
  const month = currentMonthKey();

  const [
    activeConsultants, activeClients, activeSuppliers, activeEmployees,
    approvedThisMonth, recentActivity,
    candidatesTotal, candidatesAddedThisMonth, candidatesHiredThisMonth,
    publishedOffers,
    salaryRowsThisMonth,
    pnl, tva, receivables, payables
  ] = await Promise.all([
    userModel.list(1),
    clientModel.list(1),
    supplierModel.list(1),
    employeeModel.list(1),
    monthSubmissionModel.listHistory({ month, status: 'approved' }),
    monthSubmissionModel.listRecentActivity(8),
    candidateModel.countTotal(),
    candidateModel.countAddedThisMonth(),
    candidateModel.countHiredThisMonth(),
    careerOfferModel.list({ status: 'published' }),
    salaryPaymentModel.listForMonth(month),
    financeModel.getProfitLoss(month, month),
    financeModel.getTvaReport(month, month),
    financeModel.getReceivables(),
    financeModel.getPayables()
  ]);

  const approvedPayoutThisMonth = approvedThisMonth.reduce((sum, s) => sum + Number(s.total_payout), 0);
  const employeesPaidThisMonth = salaryRowsThisMonth.filter((r) => r.payment_id).length;

  res.render('dashboard', {
    month,
    activeConsultantsCount: activeConsultants.length,
    activeClientsCount: activeClients.length,
    activeSuppliersCount: activeSuppliers.length,
    activeEmployeesCount: activeEmployees.length,
    // res.locals.notificationCount is already computed by the pending-
    // submissions middleware in server.js on every request - reuse it
    // instead of running the same query twice.
    pendingCount: res.locals.notificationCount,
    approvedPayoutThisMonth,
    recentActivity,
    candidatesTotal,
    candidatesAddedThisMonth,
    candidatesHiredThisMonth,
    publishedOffersCount: publishedOffers.length,
    employeesPaidThisMonth,
    employeesNotPaidThisMonth: activeEmployees.length - employeesPaidThisMonth,
    pnl,
    tva,
    receivables,
    payables
  });
}

module.exports = { show };

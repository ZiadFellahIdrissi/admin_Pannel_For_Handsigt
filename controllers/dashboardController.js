const userModel = require('../models/userModel');
const clientModel = require('../models/clientModel');
const supplierModel = require('../models/supplierModel');
const employeeModel = require('../models/employeeModel');
const candidateModel = require('../models/candidateModel');
const careerOfferModel = require('../models/careerOfferModel');
const monthSubmissionModel = require('../models/monthSubmissionModel');
const salaryPaymentModel = require('../models/salaryPaymentModel');
const financeModel = require('../models/financeModel');
const { currentMonthKey, shiftMonth, currentQuarterRange, monthLabel } = require('../utils/format');

// One landing page pulling a headline number from every module built
// this far - deliberately all read-only aggregate queries (list/count),
// nothing here mutates anything.
async function show(req, res) {
  const month = currentMonthKey();

  // Salaries are paid at the END of the month they cover, so mid-month
  // (or even on the last day) the current month's payment round simply
  // hasn't happened yet - checking "is everyone paid for September" on
  // September 15th would always show a wall of false positives. The
  // meaningful question is always about the most recently *completed*
  // month, i.e. last month.
  const payrollMonth = shiftMonth(month, -1);

  // The finance snapshot uses the current quarter rather than
  // month-to-date - a steadier, more typical accounting window than
  // "so far this month," which is misleadingly small right after a
  // month/quarter starts. Same cash-basis rule as the full Finance
  // section either way (see financeModel.js): only invoices actually
  // marked paid count as revenue/cost/TVA.
  const quarter = currentQuarterRange();

  const [
    activeConsultants, activeClients, activeSuppliers, activeEmployees,
    approvedThisMonth, recentActivity,
    candidatesTotal, candidatesAddedThisMonth, candidatesHiredThisMonth,
    publishedOffers,
    salaryRowsForPayrollMonth,
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
    salaryPaymentModel.listForMonth(payrollMonth),
    financeModel.getProfitLoss(quarter.from, quarter.to),
    financeModel.getTvaReport(quarter.from, quarter.to),
    financeModel.getReceivables(),
    financeModel.getPayables()
  ]);

  const approvedPayoutThisMonth = approvedThisMonth.reduce((sum, s) => sum + Number(s.total_payout), 0);
  const employeesPaidForPayrollMonth = salaryRowsForPayrollMonth.filter((r) => r.payment_id).length;

  res.render('dashboard', {
    month,
    payrollMonth,
    payrollMonthLabel: monthLabel(payrollMonth),
    quarterLabel: quarter.label,
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
    employeesPaidForPayrollMonth,
    employeesNotPaidForPayrollMonth: activeEmployees.length - employeesPaidForPayrollMonth,
    pnl,
    tva,
    receivables,
    payables
  });
}

module.exports = { show };

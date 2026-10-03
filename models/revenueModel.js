const pool = require('../config/db');
const { dateKey } = require('../utils/format');

// Revenue here is the chiffre d'affaires: everything invoiced to clients,
// excl. VAT (total_ht), paid or not - deliberately unlike the rest of
// Finance (financeModel.js), which is cash-basis. CA measures sales, and
// counting invoiced amounts keeps a year-over-year comparison fair: last
// year's invoices have all been paid by now while this year's latest
// ones haven't yet, so a paid-only comparison would always flatter last
// year. What's still unpaid is reported alongside instead (`unpaid` in
// getYearSummary, and the Receivables page). Placed in time by
// invoice_date, like the rest of Finance. Every invoice Handsight has
// issued was generated in this app, so its client invoices are the
// complete history - there's nothing to add from anywhere else.

// The same calendar day in another year - 29 Feb falls back to 28 Feb.
function sameDayInYear(date, year) {
  const lastDayOfMonth = new Date(year, date.getMonth() + 1, 0).getDate();
  return new Date(year, date.getMonth(), Math.min(date.getDate(), lastDayOfMonth));
}

// Revenue invoiced between two dates, inclusive ('YYYY-MM-DD').
async function getRevenueBetween(fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(total_ht), 0) AS total
       FROM invoices
      WHERE type = 'client' AND invoice_date >= ? AND invoice_date <= ?`,
    [fromDate, toDate]
  );
  return Number(rows[0].total);
}

// The part of that revenue not marked paid yet.
async function getUnpaidBetween(fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(total_ht), 0) AS total
       FROM invoices
      WHERE type = 'client' AND paid_at IS NULL AND invoice_date >= ? AND invoice_date <= ?`,
    [fromDate, toDate]
  );
  return Number(rows[0].total);
}

// Headline figures for one year vs the year before. The current year is
// compared to date - 1 Jan to today vs the same period last year - since
// a year in progress against a finished one would always read as a
// drop; any other year is compared as a whole. changePct/progressPct are
// null (not 0) when last year has nothing to compare with, so the views
// can say so instead of showing a meaningless +100%.
async function getYearSummary(year) {
  const today = new Date();
  const isToDate = year === today.getFullYear();
  const end = isToDate ? dateKey(today) : `${year}-12-31`;
  const previousEnd = isToDate ? dateKey(sameDayInYear(today, year - 1)) : `${year - 1}-12-31`;

  const [total, unpaid, previousComparable, previousTotal] = await Promise.all([
    getRevenueBetween(`${year}-01-01`, end),
    getUnpaidBetween(`${year}-01-01`, end),
    getRevenueBetween(`${year - 1}-01-01`, previousEnd),
    getRevenueBetween(`${year - 1}-01-01`, `${year - 1}-12-31`)
  ]);

  return {
    year,
    isToDate,
    total,
    unpaid,
    previousComparable,
    previousTotal,
    changePct: previousComparable > 0 ? ((total - previousComparable) / previousComparable) * 100 : null,
    progressPct: isToDate && previousTotal > 0 ? (total / previousTotal) * 100 : null
  };
}

// One calendar year month by month, as { 'YYYY-MM': total } - only
// months with any revenue are present.
async function getMonthlyRevenue(year) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(invoice_date, '%Y-%m') AS month, SUM(total_ht) AS total
       FROM invoices
      WHERE type = 'client' AND invoice_date >= ? AND invoice_date <= ?
      GROUP BY DATE_FORMAT(invoice_date, '%Y-%m')`,
    [`${year}-01-01`, `${year}-12-31`]
  );
  return Object.fromEntries(rows.map((r) => [r.month, Number(r.total)]));
}

module.exports = { getYearSummary, getMonthlyRevenue };

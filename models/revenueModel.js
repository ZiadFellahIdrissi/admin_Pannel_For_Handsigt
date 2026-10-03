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
// invoice_date, like the rest of Finance.
//
// On top of the app's own client invoices, external_revenue holds one
// manually entered amount per month for revenue invoiced outside this
// app - mainly the months before invoicing moved into it - so this year
// can be compared with last year straight away.

// The same calendar day in another year - 29 Feb falls back to 28 Feb.
function sameDayInYear(date, year) {
  const lastDayOfMonth = new Date(year, date.getMonth() + 1, 0).getDate();
  return new Date(year, date.getMonth(), Math.min(date.getDate(), lastDayOfMonth));
}

// Revenue invoiced between two dates, inclusive ('YYYY-MM-DD'). An
// external_revenue amount has no date finer than its month, so it only
// counts once its whole month is inside the range - "the same period
// last year" never includes a month that period hadn't finished yet.
async function getRevenueBetween(fromDate, toDate) {
  const [[invoiceRows], [externalRows]] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(total_ht), 0) AS total
         FROM invoices
        WHERE type = 'client' AND invoice_date >= ? AND invoice_date <= ?`,
      [fromDate, toDate]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount_ht), 0) AS total
         FROM external_revenue
        WHERE CONCAT(month, '-01') >= ? AND LAST_DAY(CONCAT(month, '-01')) <= ?`,
      [fromDate, toDate]
    )
  ]);
  return Number(invoiceRows[0].total) + Number(externalRows[0].total);
}

// The part of the app's client invoices in that range not marked paid
// yet (manually entered revenue has no paid status to check).
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

// One calendar year month by month, as { 'YYYY-MM': { app, external } } -
// the app's own client invoices and manually entered revenue kept apart,
// so the Revenue page can show where each month's figure comes from.
// Only months with any revenue are present.
async function getMonthlyRevenue(year) {
  const [[invoiceRows], [externalRows]] = await Promise.all([
    pool.query(
      `SELECT DATE_FORMAT(invoice_date, '%Y-%m') AS month, SUM(total_ht) AS total
         FROM invoices
        WHERE type = 'client' AND invoice_date >= ? AND invoice_date <= ?
        GROUP BY DATE_FORMAT(invoice_date, '%Y-%m')`,
      [`${year}-01-01`, `${year}-12-31`]
    ),
    pool.query(
      'SELECT month, amount_ht FROM external_revenue WHERE month >= ? AND month <= ?',
      [`${year}-01`, `${year}-12`]
    )
  ]);

  const byMonth = {};
  function monthEntry(month) {
    if (!byMonth[month]) byMonth[month] = { app: 0, external: 0 };
    return byMonth[month];
  }
  invoiceRows.forEach((r) => { monthEntry(r.month).app += Number(r.total); });
  externalRows.forEach((r) => { monthEntry(r.month).external += Number(r.amount_ht); });
  return byMonth;
}

async function listExternal(fromMonth, toMonth) {
  const [rows] = await pool.query(
    'SELECT * FROM external_revenue WHERE month >= ? AND month <= ? ORDER BY month ASC',
    [fromMonth, toMonth]
  );
  return rows;
}

async function findExternalById(id) {
  const [rows] = await pool.query('SELECT * FROM external_revenue WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// Create-or-replace for one month - same pattern as bankStatementModel.upsert.
async function upsertExternal({ month, amountHt, note }) {
  const [existing] = await pool.query('SELECT id FROM external_revenue WHERE month = ? LIMIT 1', [month]);
  if (existing.length) {
    await pool.query(
      'UPDATE external_revenue SET amount_ht = ?, note = ? WHERE id = ?',
      [amountHt, note, existing[0].id]
    );
    return { replaced: true };
  }
  await pool.query(
    'INSERT INTO external_revenue (month, amount_ht, note) VALUES (?, ?, ?)',
    [month, amountHt, note]
  );
  return { replaced: false };
}

async function removeExternal(id) {
  await pool.query('DELETE FROM external_revenue WHERE id = ?', [id]);
}

module.exports = {
  getYearSummary,
  getMonthlyRevenue,
  listExternal,
  findExternalById,
  upsertExternal,
  removeExternal
};

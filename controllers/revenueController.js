const revenueModel = require('../models/revenueModel');
const { monthLabel, currentMonthKey } = require('../utils/format');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ?year=YYYY (or a form's hidden `year` field), defaulting to the current year.
function resolveYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
}

function percentChange(value, previous) {
  return previous > 0 ? ((value - previous) / previous) * 100 : null;
}

// Revenue (chiffre d'affaires) for one year against the year before -
// headline figures (revenueModel.getYearSummary), a cumulative chart of
// how the year builds up against last year's curve, and a month-by-month
// table. Also where revenue invoiced outside this app is entered (see
// the external_revenue table).
async function show(req, res) {
  const year = resolveYear(req.query.year);
  const today = new Date();
  const currentYear = today.getFullYear();
  const isCurrentYear = year === currentYear;

  const [summary, monthly, previousMonthly, externalEntries] = await Promise.all([
    revenueModel.getYearSummary(year),
    revenueModel.getMonthlyRevenue(year),
    revenueModel.getMonthlyRevenue(year - 1),
    revenueModel.listExternal(`${year - 1}-01`, `${year}-12`)
  ]);

  let cumulative = 0;
  let previousCumulative = 0;
  const rows = MONTH_NAMES.map((name, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const current = monthly[`${year}-${mm}`] || { app: 0, external: 0 };
    const previous = previousMonthly[`${year - 1}-${mm}`] || { app: 0, external: 0 };
    const value = current.app + current.external;
    const previousValue = previous.app + previous.external;
    cumulative += value;
    previousCumulative += previousValue;
    // Months still ahead have nothing to show yet; the month in progress
    // is shown but not compared - part of a month against a whole one
    // would always read as a drop.
    const isFuture = year > currentYear || (isCurrentYear && i > today.getMonth());
    const isInProgress = isCurrentYear && i === today.getMonth();
    return {
      month: `${year}-${mm}`,
      previousMonth: `${year - 1}-${mm}`,
      name,
      value,
      external: current.external,
      previousValue,
      previousExternal: previous.external,
      cumulative,
      previousCumulative,
      isFuture,
      isInProgress,
      changePct: isFuture || isInProgress ? null : percentChange(value, previousValue)
    };
  });

  // Cumulative chart geometry - same viewBox/padding conventions as the
  // Summary page's trend chart. Cumulative totals only ever grow, so each
  // year's final total is its line's highest point. This year's line
  // stops at the current month instead of running flat to December.
  const chartWidth = 600;
  const chartHeight = 160;
  const paddingX = 30;
  const paddingY = 20;
  const maxCumulative = Math.max(1, cumulative, previousCumulative);
  const stepX = (chartWidth - paddingX * 2) / 11;
  function point(value, i) {
    return {
      x: Number((paddingX + stepX * i).toFixed(1)),
      y: Number((chartHeight - paddingY - (value / maxCumulative) * (chartHeight - paddingY * 2)).toFixed(1))
    };
  }
  function toPath(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }
  const yearPoints = rows
    .map((r, i) => (r.isFuture ? null : { ...point(r.cumulative, i), month: r.month, value: r.cumulative }))
    .filter(Boolean);
  const previousYearPoints = rows.map((r, i) => ({ ...point(r.previousCumulative, i), month: r.previousMonth, value: r.previousCumulative }));

  res.render('finance/revenue', {
    year,
    currentYear,
    summary,
    rows,
    yearTotal: cumulative,
    previousYearTotal: previousCumulative,
    externalEntries,
    chartWidth,
    chartHeight,
    axisLabels: rows.map((r, i) => ({ x: point(0, i).x, label: r.name.slice(0, 3) })),
    yearPoints,
    yearLinePath: toPath(yearPoints),
    previousYearPoints,
    previousYearLinePath: toPath(previousYearPoints)
  });
}

// Create-or-replace one month's manually entered revenue. The hidden
// `year` field is only where to send the admin back to - the year they
// were viewing, not necessarily the entry's own (last year's months are
// typically entered while viewing this year).
async function handleSaveExternal(req, res) {
  const redirectPath = `/finance/revenue?year=${resolveYear(req.body.year)}`;
  const month = (req.body.month || '').trim();
  const amountRaw = (req.body.amountHt || '').trim();
  const amountHt = Number(amountRaw);
  const note = (req.body.note || '').trim().slice(0, 255) || null;

  if (!MONTH_RE.test(month)) {
    req.flash('error', 'Choose a month.');
    return res.redirect(redirectPath);
  }
  if (month > currentMonthKey()) {
    req.flash('error', "Revenue can't be entered for a month that hasn't started yet.");
    return res.redirect(redirectPath);
  }
  if (!amountRaw || !Number.isFinite(amountHt) || amountHt < 0 || amountHt >= 1e10) {
    req.flash('error', 'Amount must be a non-negative number.');
    return res.redirect(redirectPath);
  }

  const { replaced } = await revenueModel.upsertExternal({ month, amountHt: Math.round(amountHt * 100) / 100, note });
  req.flash('success', `Revenue for ${monthLabel(month)} ${replaced ? 'updated' : 'saved'}.`);
  res.redirect(redirectPath);
}

async function handleDeleteExternal(req, res) {
  const redirectPath = `/finance/revenue?year=${resolveYear(req.body.year)}`;
  const entry = await revenueModel.findExternalById(req.params.id);
  if (!entry) {
    req.flash('error', 'That entry no longer exists.');
    return res.redirect(redirectPath);
  }

  await revenueModel.removeExternal(entry.id);
  req.flash('success', `Manually entered revenue for ${monthLabel(entry.month)} deleted.`);
  res.redirect(redirectPath);
}

module.exports = { show, handleSaveExternal, handleDeleteExternal };

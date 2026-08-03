function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// 'YYYY-MM' -> 'July 2026'
function monthLabel(month) {
  if (!month) return '';
  const [year, m] = month.split('-');
  const name = MONTH_NAMES[Number(m) - 1] || m;
  return `${name} ${year}`;
}

// Computed on render, not stored - a raw stored number would silently go
// stale, a date never does. Generic (not just "age"): used for both
// "years of experience" (from a candidate's first-experience date) and
// "years since graduation" (from their graduation date).
function yearsSince(date) {
  if (!date) return null;
  const then = new Date(date);
  const today = new Date();
  let years = today.getFullYear() - then.getFullYear();
  const hasPassedAnniversaryThisYear =
    today.getMonth() > then.getMonth() ||
    (today.getMonth() === then.getMonth() && today.getDate() >= then.getDate());
  if (!hasPassedAnniversaryThisYear) years -= 1;
  return years;
}

module.exports = { formatCurrency, monthLabel, yearsSince };

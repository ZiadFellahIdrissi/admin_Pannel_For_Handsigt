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
// "years since graduation" (from their graduation date). One-decimal
// fractional precision (e.g. 0.5 for a 6-month mark) rather than whole
// years, so a recent start doesn't just read as "0 yrs".
function yearsSince(date) {
  if (!date) return null;
  const then = new Date(date);
  const today = new Date();
  const totalMonths = (today.getFullYear() - then.getFullYear()) * 12
    + (today.getMonth() - then.getMonth())
    - (today.getDate() < then.getDate() ? 1 : 0);
  const years = Math.max(0, totalMonths) / 12;
  return Math.round(years * 10) / 10;
}

// 'YYYY-MM' for the current calendar month - the default anchor for
// month-navigator UIs (Summary, Invoices) when no month is selected yet.
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' + a +/-1 delta -> the adjacent month's 'YYYY-MM' - powers the
// prev/next arrows next to a month-navigator's <input type="month">.
function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// 'jean-pierre o'brien' -> "Jean-Pierre O'Brien" - capitalizes the first
// letter after the start of the string and after any space/hyphen/
// apostrophe. Used to normalize first/last names on save (form and Excel
// import alike) regardless of how the admin typed them.
function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (match, sep, letter) => sep + letter.toUpperCase());
}

module.exports = { formatCurrency, monthLabel, yearsSince, toTitleCase, currentMonthKey, shiftMonth };

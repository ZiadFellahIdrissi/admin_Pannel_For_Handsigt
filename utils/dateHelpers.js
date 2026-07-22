// Pure date-grid helpers for rendering a 'YYYY-MM' month as a 7-column
// calendar - mirrors the Consultant Dashboard's own utils/dateHelpers.js
// (same math, so the admin's read-only preview lines up with what the
// consultant actually filled in).

function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

// getDay() of the 1st of the month (0=Sun..6=Sat) - how many blank cells
// to pad before day 1 in the grid.
function firstWeekdayIndex(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).getDay();
}

function weekdayShort(monthKey, day, weekdayNames) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return weekdayNames[date.getDay()];
}

module.exports = { daysInMonth, firstWeekdayIndex, weekdayShort };

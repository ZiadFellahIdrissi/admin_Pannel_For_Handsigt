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

module.exports = { formatCurrency, monthLabel };

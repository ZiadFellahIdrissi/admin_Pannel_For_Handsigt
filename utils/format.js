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

// Computed on render, not stored - a raw "age" number would silently go
// stale, birth_date never does.
function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

module.exports = { formatCurrency, monthLabel, ageFromBirthDate };

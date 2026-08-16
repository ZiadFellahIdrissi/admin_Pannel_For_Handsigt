const dateHelpers = require('./dateHelpers');

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Builds the same day/weekday/value grid shape the Consultant Dashboard's
// own calendar.ejs uses, from a submission's daily_entries rows, so a
// read-only "View Details" preview looks like the actual calendar that
// was filled in - not just a plain list of dates. Shared by the Approval
// Queue and History's own View Details dialogs.
function buildCalendar(month, entries) {
  const valueByDate = {};
  entries.forEach((entry) => {
    valueByDate[entry.work_date] = entry.value;
  });

  const totalDays = dateHelpers.daysInMonth(month);
  const days = [];
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    days.push({
      day,
      weekday: dateHelpers.weekdayShort(month, day, WEEKDAY_NAMES),
      value: valueByDate[dateStr] !== undefined ? valueByDate[dateStr] : ''
    });
  }

  return {
    weekdayNames: WEEKDAY_NAMES,
    leadingBlanks: Array(dateHelpers.firstWeekdayIndex(month)).fill(null),
    days
  };
}

module.exports = { buildCalendar };

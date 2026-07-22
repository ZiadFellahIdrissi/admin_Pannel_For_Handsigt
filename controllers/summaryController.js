const monthSubmissionModel = require('../models/monthSubmissionModel');
const { monthLabel } = require('../utils/format');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Builds an SVG <path> "d" string for one pie slice, given the running
// start angle (radians, 0 = 3 o'clock) and the slice's share of the circle.
function pieSlicePath(cx, cy, r, startAngle, sliceAngle) {
  const endAngle = startAngle + sliceAngle;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = sliceAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

async function show(req, res) {
  const monthParam = (req.query.month || '').trim();
  const month = MONTH_RE.test(monthParam) ? monthParam : currentMonthKey();

  const [summaryRows, trendRaw, byClientRaw] = await Promise.all([
    monthSubmissionModel.approvedSummaryForMonth(month),
    monthSubmissionModel.approvedMonthlyTrend(12),
    monthSubmissionModel.approvedByClientForMonth(month)
  ]);

  const trend = trendRaw.slice().reverse(); // oldest -> newest, for the line chart

  const totalConsultants = summaryRows.length;
  const totalDays = summaryRows.reduce((sum, r) => sum + Number(r.total_days), 0);
  const totalPayout = summaryRows.reduce((sum, r) => sum + Number(r.total_payout), 0);

  // Bar chart: each row's width as a percentage of the largest payout.
  const maxPayout = Math.max(1, ...summaryRows.map((r) => Number(r.total_payout)));
  const bars = summaryRows.map((r) => ({
    consultantName: r.consultant_name,
    clientNames: r.client_names,
    totalDays: Number(r.total_days),
    totalPayout: Number(r.total_payout),
    percent: (Number(r.total_payout) / maxPayout) * 100
  }));

  // Line chart geometry (12-month payout trend).
  const chartWidth = 600;
  const chartHeight = 160;
  const paddingX = 30;
  const paddingY = 20;
  const maxTrendPayout = Math.max(1, ...trend.map((t) => Number(t.total_payout)));
  const stepX = trend.length > 1 ? (chartWidth - paddingX * 2) / (trend.length - 1) : 0;
  const linePoints = trend.map((t, i) => {
    const value = Number(t.total_payout);
    const x = paddingX + stepX * i;
    const y = chartHeight - paddingY - (value / maxTrendPayout) * (chartHeight - paddingY * 2);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), month: t.month, value };
  });
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Pie chart: days by client for the month, capped at the palette's
  // all-pairs-safe 3 real slots - the rest fold into a single neutral
  // "Other" slice (see input.css's .viz-root comment for why 3, not more).
  const TOP_N = 3;
  const topClients = byClientRaw.slice(0, TOP_N);
  const otherTotal = byClientRaw.slice(TOP_N).reduce((sum, c) => sum + Number(c.total_days), 0);
  const pieSlicesData = topClients.map((c) => ({ label: c.client_name, value: Number(c.total_days) }));
  if (otherTotal > 0) {
    pieSlicesData.push({ label: 'Other', value: otherTotal });
  }
  const pieTotal = pieSlicesData.reduce((sum, s) => sum + s.value, 0);
  const pieColors = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-other)'];
  let angleCursor = -Math.PI / 2; // start at 12 o'clock
  const pieSlices = pieSlicesData.map((s, i) => {
    const sliceAngle = pieTotal > 0 ? (s.value / pieTotal) * Math.PI * 2 : 0;
    const path = pieSlicePath(60, 60, 55, angleCursor, sliceAngle);
    angleCursor += sliceAngle;
    return {
      label: s.label,
      value: s.value,
      percent: pieTotal > 0 ? (s.value / pieTotal) * 100 : 0,
      color: pieColors[i] || pieColors[pieColors.length - 1],
      path
    };
  });

  res.render('summary', {
    month,
    monthLabelText: monthLabel(month),
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    bars,
    totalConsultants,
    totalDays,
    totalPayout,
    linePoints,
    linePath,
    chartWidth,
    chartHeight,
    pieSlices
  });
}

module.exports = { show };

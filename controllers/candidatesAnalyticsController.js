const candidateModel = require('../models/candidateModel');
const { pieSlicePath } = require('../utils/charts');

async function show(req, res) {
  const [totalCandidates, addedThisMonth, hiredThisMonth, statusCounts, sourceCounts, hiresTrendRaw] = await Promise.all([
    candidateModel.countTotal(),
    candidateModel.countAddedThisMonth(),
    candidateModel.countHiredThisMonth(),
    candidateModel.countByStatus(),
    candidateModel.countBySource(),
    candidateModel.hiresPerMonth(12)
  ]);

  // Funnel bar chart: one bar per pipeline stage, in STATUSES order (an
  // "adjacent" form per the dataviz skill, since stages are sequential).
  const maxStatusCount = Math.max(1, ...statusCounts.map((s) => s.count));
  const funnelBars = statusCounts.map((s) => ({
    label: candidateModel.STATUS_LABELS[s.status],
    count: s.count,
    percent: (s.count / maxStatusCount) * 100
  }));

  // By-source pie chart: capped at the palette's all-pairs-safe 3 real
  // slots, the rest fold into a single neutral "Other" slice - same
  // convention as summaryController.js's "Days by Client" pie.
  const TOP_N = 3;
  const topSources = sourceCounts.slice(0, TOP_N);
  const otherTotal = sourceCounts.slice(TOP_N).reduce((sum, s) => sum + Number(s.count), 0);
  const pieSlicesData = topSources.map((s) => ({ label: s.source, value: Number(s.count) }));
  if (otherTotal > 0) {
    pieSlicesData.push({ label: 'Other', value: otherTotal });
  }
  const pieTotal = pieSlicesData.reduce((sum, s) => sum + s.value, 0);
  const pieColors = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-other)'];
  let angleCursor = -Math.PI / 2;
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

  // Line chart: hires trend, last 12 months, oldest -> newest.
  const hiresTrend = hiresTrendRaw.slice().reverse();
  const chartWidth = 600;
  const chartHeight = 160;
  const paddingX = 30;
  const paddingY = 20;
  const maxHires = Math.max(1, ...hiresTrend.map((t) => Number(t.count)));
  const stepX = hiresTrend.length > 1 ? (chartWidth - paddingX * 2) / (hiresTrend.length - 1) : 0;
  const linePoints = hiresTrend.map((t, i) => {
    const value = Number(t.count);
    const x = paddingX + stepX * i;
    const y = chartHeight - paddingY - (value / maxHires) * (chartHeight - paddingY * 2);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), month: t.month, value };
  });
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  res.render('candidates/analytics', {
    totalCandidates,
    addedThisMonth,
    hiredThisMonth,
    funnelBars,
    pieSlices,
    linePoints,
    linePath,
    chartWidth,
    chartHeight
  });
}

module.exports = { show };

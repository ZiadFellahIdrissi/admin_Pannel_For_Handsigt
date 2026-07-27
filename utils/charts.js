// Builds an SVG <path> "d" string for one pie slice, given the running
// start angle (radians, 0 = 3 o'clock) and the slice's share of the circle.
// Shared by any controller building a hand-rolled pie chart (see the
// `dataviz` skill for the rest of the conventions these charts follow).
function pieSlicePath(cx, cy, r, startAngle, sliceAngle) {
  const endAngle = startAngle + sliceAngle;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = sliceAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

module.exports = { pieSlicePath };

// Just a static hub page linking into this section's pages - the pending
// count badge is already computed by the notification middleware and
// available on res.locals for every view, so no model calls needed here.
function showHub(req, res) {
  res.render('consultants-management/hub');
}

module.exports = { showHub };

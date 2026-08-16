// Makes a whole row toggle its own checkbox on click, instead of
// requiring a small dedicated button - e.g. History's "select these
// submissions for one consolidated invoice" rows. A click that lands on
// an actual interactive element inside the row (a link, button, form
// field) is left alone so those keep working normally; only clicks on
// the row's own empty space toggle selection. Rows with no checkbox
// inside them (e.g. not eligible for the action) simply do nothing.
(function () {
  document.querySelectorAll('[data-row-select]').forEach(function (row) {
    row.addEventListener('click', function (event) {
      if (event.target.closest('a, button, input, label, form')) return;
      var checkbox = row.querySelector('[data-bulk-select-item]');
      if (!checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
})();

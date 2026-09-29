// Generic checkbox-count-and-bar-toggle script, data-attribute driven
// (same convention as client-search.js/confirm-submit.js). Reused by the
// candidates list, the import/export picker, and the career offers list.
// Purely a progressive enhancement - the forms it lives in still
// validate server-side regardless (e.g. "choose at least one").
//
// Looks checkboxes up document-wide by group name (data-bulk-select-item
// carries the group name as its value) rather than scoping to a
// containing <form> - a checkbox doesn't have to be a DOM descendant of
// the form it submits into (HTML's own `form="someId"` attribute on the
// <input> handles that association instead), which matters wherever a
// row also has its own independent per-row forms (Edit/Delete/etc.) that
// can't be nested inside the bulk-select form.
//
// Optional: any button with data-bulk-select-all="<group name>" toggles
// the whole group - checks everything, or unchecks everything if all are
// already checked. Its [data-bulk-select-all-label] child is kept in sync
// ("Select all" / "Unselect all") however the selection changes.
(function () {
  document.querySelectorAll('[data-bulk-select-bar]').forEach(function (bar) {
    var groupName = bar.getAttribute('data-bulk-select-bar');
    var checkboxes = document.querySelectorAll('[data-bulk-select-item="' + groupName + '"]');
    var countEl = bar.querySelector('[data-bulk-select-count]');
    var toggles = document.querySelectorAll('[data-bulk-select-all="' + groupName + '"]');

    function update() {
      var checked = Array.prototype.filter.call(checkboxes, function (cb) { return cb.checked; }).length;
      if (countEl) countEl.textContent = checked;
      bar.style.display = checked > 0 ? '' : 'none';

      var allChecked = checkboxes.length > 0 && checked === checkboxes.length;
      toggles.forEach(function (toggle) {
        var label = toggle.querySelector('[data-bulk-select-all-label]');
        if (label) label.textContent = allChecked ? 'Unselect all' : 'Select all';
      });
    }

    checkboxes.forEach(function (cb) {
      cb.addEventListener('change', update);
    });

    toggles.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var target = !Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
        checkboxes.forEach(function (cb) {
          if (cb.checked === target) return;
          cb.checked = target;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });

    update();
  });
})();

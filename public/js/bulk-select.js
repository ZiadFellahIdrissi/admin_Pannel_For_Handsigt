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
(function () {
  document.querySelectorAll('[data-bulk-select-bar]').forEach(function (bar) {
    var groupName = bar.getAttribute('data-bulk-select-bar');
    var checkboxes = document.querySelectorAll('[data-bulk-select-item="' + groupName + '"]');
    var countEl = bar.querySelector('[data-bulk-select-count]');

    function update() {
      var checked = Array.prototype.filter.call(checkboxes, function (cb) { return cb.checked; }).length;
      if (countEl) countEl.textContent = checked;
      bar.style.display = checked > 0 ? '' : 'none';
    }

    checkboxes.forEach(function (cb) {
      cb.addEventListener('change', update);
    });
    update();
  });
})();

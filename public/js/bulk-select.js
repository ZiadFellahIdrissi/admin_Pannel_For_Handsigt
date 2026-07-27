// Generic checkbox-count-and-bar-toggle script, data-attribute driven
// (same convention as client-search.js/confirm-submit.js). Reused by the
// candidates list page (bulk delete) and the import/export picker (bulk
// export). Purely a progressive enhancement - the forms it lives in
// still validate server-side regardless (e.g. "choose at least one").
(function () {
  document.querySelectorAll('[data-bulk-select-bar]').forEach(function (bar) {
    var groupName = bar.getAttribute('data-bulk-select-bar');
    var form = document.querySelector('form[data-bulk-select-form="' + groupName + '"]');
    if (!form) return;
    var checkboxes = form.querySelectorAll('input[type="checkbox"][data-bulk-select-item]');
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

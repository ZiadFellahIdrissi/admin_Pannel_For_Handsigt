(function () {
  document.querySelectorAll('[data-client-search-input]').forEach(function (input) {
    var container = document.getElementById(input.getAttribute('data-client-search-input'));
    if (!container) return;
    var items = container.querySelectorAll('[data-client-search-item]');

    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();

      // Nothing typed yet - keep the whole list collapsed rather than
      // dumping every unattached client on the page at once.
      if (!query) {
        container.style.display = 'none';
        return;
      }

      container.style.display = '';
      items.forEach(function (item) {
        var matches = item.textContent.trim().toLowerCase().indexOf(query) !== -1;
        item.style.display = matches ? '' : 'none';
      });
    });
  });
})();

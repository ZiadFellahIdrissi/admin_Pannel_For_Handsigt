(function () {
  var stored = localStorage.getItem('handsight-admin-theme');
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.setAttribute('data-theme', stored);
  }
})();

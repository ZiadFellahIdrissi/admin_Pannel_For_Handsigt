(function () {
  var button = document.getElementById('sidebar-toggle-btn');
  var panel = document.getElementById('sidebar-panel');
  var backdrop = document.getElementById('sidebar-backdrop');
  if (!button || !panel || !backdrop) return;

  function open() {
    panel.classList.add('sidebar-open');
    backdrop.classList.add('sidebar-open');
  }

  function close() {
    panel.classList.remove('sidebar-open');
    backdrop.classList.remove('sidebar-open');
  }

  button.addEventListener('click', function () {
    if (panel.classList.contains('sidebar-open')) {
      close();
    } else {
      open();
    }
  });

  backdrop.addEventListener('click', close);
})();

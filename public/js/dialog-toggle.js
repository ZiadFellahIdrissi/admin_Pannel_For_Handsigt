(function () {
  document.querySelectorAll('[data-dialog-open]').forEach(function (button) {
    var dialog = document.getElementById(button.getAttribute('data-dialog-open'));
    if (!dialog) return;
    button.addEventListener('click', function () {
      dialog.showModal();
    });
  });

  document.querySelectorAll('[data-dialog-close]').forEach(function (button) {
    var dialog = button.closest('dialog');
    if (!dialog) return;
    button.addEventListener('click', function () {
      dialog.close();
    });
  });

  // Clicking the backdrop (outside the panel content) closes the dialog too.
  document.querySelectorAll('dialog').forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });
})();

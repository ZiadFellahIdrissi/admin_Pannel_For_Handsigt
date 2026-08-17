// Disables a form's submit button the instant it's submitted, so a slow
// response (or an impatient extra click/tap) can't fire the same POST
// twice. Opt-in via data-prevent-double-submit - used on the 2FA
// activate/deactivate/regenerate and login-verify forms, where a
// duplicate submission could otherwise race a same-code check server-side.
(function () {
  document.querySelectorAll('form[data-prevent-double-submit]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var button = form.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.classList.add('opacity-60', 'cursor-not-allowed');
      }
    });
  });
})();

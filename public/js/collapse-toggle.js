// Generic show/hide toggle for a collapsible section, opt-in via
// data-collapse-toggle="<target id>" on the button. Used for the
// Candidates page's "Advanced filters" disclosure.
(function () {
  document.querySelectorAll('[data-collapse-toggle]').forEach(function (button) {
    var target = document.getElementById(button.getAttribute('data-collapse-toggle'));
    if (!target) return;

    button.addEventListener('click', function () {
      var isHidden = target.classList.toggle('hidden');
      button.setAttribute('aria-expanded', String(!isHidden));
      var icon = button.querySelector('[data-collapse-icon]');
      if (icon) icon.classList.toggle('rotate-180', !isHidden);
    });
  });
})();

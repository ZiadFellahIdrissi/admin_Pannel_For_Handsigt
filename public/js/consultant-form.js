(function () {
  // Auto-fill the username from first/last name (create mode only - the
  // edit form's username input has no id, so this simply no-ops there).
  // Stops as soon as the admin types into the username field themselves,
  // so it never clobbers a deliberate manual choice.
  var firstNameInput = document.getElementById('firstName');
  var lastNameInput = document.getElementById('lastName');
  var usernameInput = document.getElementById('username');

  if (firstNameInput && lastNameInput && usernameInput) {
    var usernameEdited = false;
    usernameInput.addEventListener('input', function () {
      usernameEdited = true;
    });

    // Matches the combining diacritical marks block (U+0300-U+036F) that
    // .normalize('NFD') splits accented letters into - built from char
    // codes rather than a literal range so the source file can't get
    // mangled by an encoding round-trip.
    var COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

    var slugify = function (value) {
      return value
        .normalize('NFD').replace(COMBINING_MARKS, '') // strip accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
    };

    var updateUsername = function () {
      if (usernameEdited) return;
      var first = slugify(firstNameInput.value);
      var last = slugify(lastNameInput.value);
      if (first && last) {
        usernameInput.value = first + '.' + last;
      }
    };

    firstNameInput.addEventListener('input', updateUsername);
    lastNameInput.addEventListener('input', updateUsername);
  }

  // Random temporary password generator.
  var generateButton = document.getElementById('generate-password-btn');
  var passwordInput = document.getElementById('tempPassword');

  if (generateButton && passwordInput) {
    var randomInt = function (maxExclusive) {
      var arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return arr[0] % maxExclusive;
    };

    var randomChar = function (charset) {
      return charset[randomInt(charset.length)];
    };

    var generatePassword = function () {
      var upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O - easy to misread
      var lower = 'abcdefghijkmnpqrstuvwxyz';
      var digits = '23456789';
      var symbols = '!@#$%*?';
      var all = upper + lower + digits + symbols;
      var length = 12;

      var chars = [
        randomChar(upper),
        randomChar(lower),
        randomChar(digits),
        randomChar(symbols)
      ];
      for (var i = chars.length; i < length; i++) {
        chars.push(randomChar(all));
      }

      // Fisher-Yates shuffle so the fixed-category characters above
      // aren't always in the same first four positions.
      for (var j = chars.length - 1; j > 0; j--) {
        var k = randomInt(j + 1);
        var tmp = chars[j];
        chars[j] = chars[k];
        chars[k] = tmp;
      }

      return chars.join('');
    };

    generateButton.addEventListener('click', function () {
      passwordInput.value = generatePassword();
      passwordInput.type = 'text';
    });
  }
})();

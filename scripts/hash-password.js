#!/usr/bin/env node
// One-off CLI helper - NOT part of the running app. Generates a bcrypt
// hash for a chosen password so it can be pasted into a phpMyAdmin
// INSERT statement for the `admins` table (see sql/schema.sql). MySQL
// has no built-in bcrypt function, so hashing has to happen outside the
// database. Admin accounts are created/reset exclusively this way - the
// app itself has no signup or password-change UI.
//
// Usage: npm run hash-password -- "SomeTemporaryPassword123"

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash-password -- "YourPassword123"');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Choose a password of at least 8 characters.');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log('\nBcrypt hash (paste this into the SQL statement):\n');
  console.log(hash);
  console.log('');
});

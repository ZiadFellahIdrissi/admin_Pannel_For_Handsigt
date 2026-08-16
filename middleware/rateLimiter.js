const rateLimit = require('express-rate-limit');

// IP-based limiter on the admin login route. There's no separate
// username+IP lockout table for the Admin Panel (unlike the Consultant
// Dashboard's login_attempts-backed lockout) - this app has exactly one
// or a handful of admin accounts, so a coarse IP rate limit is enough.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts from this network. Please try again later.'
});

// Tighter than loginLimiter - a 6-digit TOTP code has far less entropy
// than a password, so the code-entry step (POST /login/verify) needs a
// stricter cap to make brute-forcing it impractical within any one
// 30-second code window.
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many code attempts from this network. Please try again later.'
});

module.exports = { loginLimiter, twoFactorLimiter };

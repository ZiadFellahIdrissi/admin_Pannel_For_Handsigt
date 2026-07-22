const crypto = require('crypto');

// Lightweight session-bound CSRF token (synchronizer token pattern).
// Avoids depending on the deprecated `csurf` package.

function attachToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyToken(req, res, next) {
  const sentToken = (req.body && req.body._csrf) || req.get('X-CSRF-Token');
  if (!sentToken || sentToken !== req.session.csrfToken) {
    return res.status(403).render('error', {
      message: 'Invalid or expired form submission. Please go back and try again.'
    });
  }
  next();
}

module.exports = { attachToken, verifyToken };

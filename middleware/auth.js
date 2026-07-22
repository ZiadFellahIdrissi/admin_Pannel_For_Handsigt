function requireAuth(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/login');
  }
  next();
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session.admin) {
    return res.redirect('/');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuthenticated };

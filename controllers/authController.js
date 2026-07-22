const bcrypt = require('bcryptjs');
const adminModel = require('../models/adminModel');

const GENERIC_ERROR = 'Invalid username or password.';

function showLogin(req, res) {
  res.render('login', { error: null });
}

async function handleLogin(req, res) {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!username || !password) {
    return res.status(400).render('login', { error: GENERIC_ERROR });
  }

  const admin = await adminModel.findByUsername(username);

  if (!admin) {
    return res.status(401).render('login', { error: GENERIC_ERROR });
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);

  if (!passwordMatches) {
    return res.status(401).render('login', { error: GENERIC_ERROR });
  }

  // Regenerate the session on privilege change to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { message: 'Could not start session.' });
    }
    req.session.admin = {
      id: admin.id,
      username: admin.username
    };
    res.redirect('/');
  });
}

function handleLogout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('handsight.admin.sid');
    res.redirect('/login');
  });
}

module.exports = { showLogin, handleLogin, handleLogout };

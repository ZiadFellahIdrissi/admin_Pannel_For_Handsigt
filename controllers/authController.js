const bcrypt = require('bcryptjs');
const adminModel = require('../models/adminModel');
const adminLoginAttemptModel = require('../models/adminLoginAttemptModel');

const GENERIC_ERROR = 'Invalid username or password.';

function showLogin(req, res) {
  res.render('login', { error: null });
}

// Every attempt is recorded - success or failure - so the "Admin Logins"
// page (see loginAttemptsController.js) has a full audit trail, same
// spirit as the Consultant Dashboard's own login_attempts table.
async function handleLogin(req, res) {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!username || !password) {
    await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: false });
    return res.status(400).render('login', { error: GENERIC_ERROR });
  }

  const admin = await adminModel.findByUsername(username);

  if (!admin) {
    await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: false });
    return res.status(401).render('login', { error: GENERIC_ERROR });
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);

  if (!passwordMatches) {
    await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: false });
    return res.status(401).render('login', { error: GENERIC_ERROR });
  }

  await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: true });

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

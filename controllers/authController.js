const bcrypt = require('bcryptjs');
const adminModel = require('../models/adminModel');
const adminLoginAttemptModel = require('../models/adminLoginAttemptModel');
const adminBackupCodeModel = require('../models/adminBackupCodeModel');
const twoFactor = require('../utils/twoFactor');

const GENERIC_ERROR = 'Invalid username or password.';
const CODE_ERROR = 'Invalid or expired code.';

function showLogin(req, res) {
  res.render('login', { error: null });
}

// Every attempt is recorded - success or failure - so the "Admin Logins"
// page (see loginAttemptsController.js) has a full audit trail, same
// spirit as the Consultant Dashboard's own login_attempts table. With
// 2FA, "success" only gets recorded once an admin is *fully*
// authenticated (password + code) - a password match alone, when 2FA is
// on for that account, isn't a successful login yet.
async function handleLogin(req, res) {
  // Clear any stale pending-2FA state from an earlier, unrelated attempt
  // before evaluating this one.
  delete req.session.pendingTwoFactorAdminId;
  delete req.session.pendingTwoFactorUsername;

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

  if (admin.two_factor_enabled) {
    req.session.pendingTwoFactorAdminId = admin.id;
    req.session.pendingTwoFactorUsername = admin.username;
    return res.redirect('/login/verify');
  }

  await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: true });

  // Regenerate the session on privilege change to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { message: 'Could not start session.' });
    }
    req.session.admin = {
      id: admin.id,
      username: admin.username,
      twoFactorEnabled: !!admin.two_factor_enabled
    };
    res.redirect('/');
  });
}

function showTwoFactorPrompt(req, res) {
  if (!req.session.pendingTwoFactorAdminId) {
    return res.redirect('/login');
  }
  res.render('login-verify', { error: null, username: req.session.pendingTwoFactorUsername });
}

async function handleTwoFactorVerify(req, res) {
  const adminId = req.session.pendingTwoFactorAdminId;
  const username = req.session.pendingTwoFactorUsername;
  if (!adminId) {
    return res.redirect('/login');
  }

  const admin = await adminModel.findById(adminId);
  const code = (req.body.code || '').trim();

  const isValid = !!admin && !!code && (
    twoFactor.verifyToken(code, admin.two_factor_secret)
    || await adminBackupCodeModel.verifyAndConsume(adminId, code)
  );

  if (!isValid) {
    await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: false });
    return res.status(401).render('login-verify', { error: CODE_ERROR, username });
  }

  await adminLoginAttemptModel.record({ username, ipAddress: req.ip, success: true });

  delete req.session.pendingTwoFactorAdminId;
  delete req.session.pendingTwoFactorUsername;

  // Regenerate the session on privilege change to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { message: 'Could not start session.' });
    }
    req.session.admin = {
      id: admin.id,
      username: admin.username,
      twoFactorEnabled: true
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

module.exports = { showLogin, handleLogin, showTwoFactorPrompt, handleTwoFactorVerify, handleLogout };

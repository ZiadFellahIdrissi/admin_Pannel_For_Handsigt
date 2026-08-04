const loginAttemptModel = require('../models/loginAttemptModel');
const adminLoginAttemptModel = require('../models/adminLoginAttemptModel');

// Consultant Dashboard's own login attempts - read-only, shared table
// (see models/loginAttemptModel.js).
async function listConsultants(req, res) {
  const onlyFailures = req.query.onlyFailures === '1';
  const attempts = await loginAttemptModel.listRecent({ limit: 100, onlyFailures });
  res.render('login-attempts/consultants', { attempts, onlyFailures });
}

// This Admin Panel's own login attempts (see models/adminLoginAttemptModel.js
// and authController.js's handleLogin, which writes to it).
async function listAdmin(req, res) {
  const onlyFailures = req.query.onlyFailures === '1';
  const attempts = await adminLoginAttemptModel.listRecent({ limit: 100, onlyFailures });
  res.render('login-attempts/admin', { attempts, onlyFailures });
}

module.exports = { listConsultants, listAdmin };

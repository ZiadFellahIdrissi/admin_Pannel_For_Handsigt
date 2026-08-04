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

// Small combined stats page - success/failure counts for both tables,
// plus the top few IPs behind failed attempts (the one thing worth
// flagging: repeated failures from one IP is the classic brute-force
// signal). Nothing fancier than that on purpose - this is meant to stay
// a quick-glance page, not a full analytics dashboard.
async function showAnalysis(req, res) {
  const [consultantStats, consultantTopIps, adminStats, adminTopIps] = await Promise.all([
    loginAttemptModel.getStats(),
    loginAttemptModel.topFailingIps(5),
    adminLoginAttemptModel.getStats(),
    adminLoginAttemptModel.topFailingIps(5)
  ]);

  res.render('login-attempts/analysis', {
    consultantStats,
    consultantTopIps,
    adminStats,
    adminTopIps
  });
}

module.exports = { listConsultants, listAdmin, showAnalysis };

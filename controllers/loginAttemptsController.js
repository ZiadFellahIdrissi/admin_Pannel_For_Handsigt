const loginAttemptModel = require('../models/loginAttemptModel');

async function list(req, res) {
  const onlyFailures = req.query.onlyFailures === '1';
  const attempts = await loginAttemptModel.listRecent({ limit: 100, onlyFailures });
  res.render('login-attempts/list', { attempts, onlyFailures });
}

module.exports = { list };

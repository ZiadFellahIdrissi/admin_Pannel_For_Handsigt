const adminModel = require('../models/adminModel');
const adminBackupCodeModel = require('../models/adminBackupCodeModel');
const twoFactor = require('../utils/twoFactor');

// A code counts as "current" for re-auth purposes (deactivate, backup
// code regeneration) whether it's a live TOTP code or one of the
// remaining backup codes - same check the login step itself uses.
async function verifyCurrentCode(admin, code) {
  if (!code) return false;
  if (twoFactor.verifyToken(code, admin.two_factor_secret)) return true;
  return adminBackupCodeModel.verifyAndConsume(admin.id, code);
}

// Always reads the admin fresh from the DB rather than trusting
// req.session.admin, so this page's state (enabled/disabled, secret) is
// never stale relative to what's actually stored.
async function showSetup(req, res) {
  const admin = await adminModel.findById(req.session.admin.id);

  if (admin.two_factor_enabled) {
    const unusedCount = await adminBackupCodeModel.countUnused(admin.id);
    return res.render('settings/security', { enabled: true, unusedCount, qrDataUrl: null, secretFormatted: null });
  }

  // Reuses a secret already pending from an earlier, unconfirmed setup
  // attempt instead of generating a new one on every page load - so
  // re-opening this page mid-setup shows the same QR code, not a
  // different one that would invalidate an app the admin already scanned.
  let secret = admin.two_factor_secret;
  if (!secret) {
    secret = twoFactor.generateSecret();
    await adminModel.setPendingTwoFactorSecret(admin.id, secret);
  }

  const keyUri = twoFactor.buildKeyUri(admin.username, secret);
  const qrDataUrl = await twoFactor.buildQrDataUrl(keyUri);

  res.render('settings/security', {
    enabled: false,
    unusedCount: null,
    qrDataUrl,
    secretFormatted: secret.match(/.{1,4}/g).join(' ')
  });
}

async function handleActivate(req, res) {
  const admin = await adminModel.findById(req.session.admin.id);
  const code = (req.body.code || '').trim();

  if (admin.two_factor_enabled) {
    return res.redirect('/settings/security');
  }

  if (!twoFactor.verifyToken(code, admin.two_factor_secret)) {
    req.flash('error', "That code didn't match. Scan the QR code again and try the current 6-digit code.");
    return res.redirect('/settings/security');
  }

  await adminModel.enableTwoFactor(admin.id);
  const codes = await adminBackupCodeModel.replaceAll(admin.id);

  // Reflect the change in the session immediately - otherwise the nag
  // banner (views/partials/topbar.ejs) would keep showing until the next
  // login, since it reads req.session.admin.twoFactorEnabled, not a
  // fresh DB lookup on every page.
  req.session.admin.twoFactorEnabled = true;

  res.render('settings/security-codes-revealed', { codes });
}

async function handleDeactivate(req, res) {
  const admin = await adminModel.findById(req.session.admin.id);
  const code = (req.body.code || '').trim();

  if (!admin.two_factor_enabled) {
    return res.redirect('/settings/security');
  }

  if (!(await verifyCurrentCode(admin, code))) {
    req.flash('error', 'Invalid or expired code - two-factor authentication was not disabled.');
    return res.redirect('/settings/security');
  }

  await adminModel.disableTwoFactor(admin.id);
  await adminBackupCodeModel.removeAll(admin.id);
  req.session.admin.twoFactorEnabled = false;

  req.flash('success', 'Two-factor authentication has been disabled.');
  res.redirect('/settings/security');
}

async function handleRegenerateBackupCodes(req, res) {
  const admin = await adminModel.findById(req.session.admin.id);
  const code = (req.body.code || '').trim();

  if (!admin.two_factor_enabled) {
    return res.redirect('/settings/security');
  }

  if (!(await verifyCurrentCode(admin, code))) {
    req.flash('error', 'Invalid or expired code - backup codes were not regenerated.');
    return res.redirect('/settings/security');
  }

  const codes = await adminBackupCodeModel.replaceAll(admin.id);
  res.render('settings/security-codes-revealed', { codes });
}

module.exports = { showSetup, handleActivate, handleDeactivate, handleRegenerateBackupCodes };

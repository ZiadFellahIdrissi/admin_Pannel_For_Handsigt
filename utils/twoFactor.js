const { authenticator } = require('otplib');
const QRCode = require('qrcode');

// otplib defaults: 6-digit codes, 30s step, +/-1 step window (tolerates
// small clock drift between the server and the admin's phone without
// opening a wide brute-force window). Not overridden - the defaults are
// exactly Google Authenticator's own expectations.

const ISSUER = 'Handsight Admin Panel';

function generateSecret() {
  return authenticator.generateSecret();
}

// 'otpauth://totp/Handsight Admin Panel:username?secret=...&issuer=...' -
// what the QR code / manual-entry key both encode. This is what Google
// Authenticator actually reads when scanning.
function buildKeyUri(username, secret) {
  return authenticator.keyuri(username, ISSUER, secret);
}

// PNG data URI - embeds directly in the page (CSP already allows
// img-src data:, see server.js) with no external request to a
// QR-rendering service, so the secret never leaves the server.
async function buildQrDataUrl(keyUri) {
  return QRCode.toDataURL(keyUri);
}

function verifyToken(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.verify({ token: String(token).trim(), secret });
  } catch {
    return false;
  }
}

module.exports = { generateSecret, buildKeyUri, buildQrDataUrl, verifyToken };

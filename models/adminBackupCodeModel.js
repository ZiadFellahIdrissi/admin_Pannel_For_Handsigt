const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Codes are hashed the same way passwords are (bcryptjs, never stored in
// plaintext) - the plaintext only ever exists in memory for the one
// response that reveals them, right after generation.

// 'A1B2C-3D4E5' - 10 hex chars (40 bits of entropy), grouped for
// readability. Comparisons normalize away the dash/case so however the
// admin retypes it (with or without the dash, any case) still matches.
function generateCode() {
  const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function normalize(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Wipes any existing codes for this admin and generates a fresh 10 -
// used for both first activation and "regenerate backup codes". Returns
// the plaintext codes so the caller can show them exactly once; nothing
// after this call ever has access to them again.
//
// Delete + inserts run in one transaction so a second, near-simultaneous
// call (e.g. a double-clicked "Regenerate" button) can't interleave with
// this one and leave a corrupted mix of two code sets - InnoDB's row
// locking makes the second transaction's DELETE wait for this one to
// commit rather than racing it. Hashing happens before the transaction
// opens (and in parallel) so the transaction itself - and any lock it
// holds - stays open as briefly as possible.
async function replaceAll(adminId) {
  const codes = Array.from({ length: 10 }, () => generateCode());
  const hashes = await Promise.all(codes.map((code) => bcrypt.hash(normalize(code), 12)));

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM admin_backup_codes WHERE admin_id = ?', [adminId]);
    for (const hash of hashes) {
      await connection.query(
        'INSERT INTO admin_backup_codes (admin_id, code_hash) VALUES (?, ?)',
        [adminId, hash]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return codes;
}

// Used when 2FA is turned off entirely - unlike replaceAll, this doesn't
// generate anything new, there's simply nothing to recover into anymore.
async function removeAll(adminId) {
  await pool.query('DELETE FROM admin_backup_codes WHERE admin_id = ?', [adminId]);
}

async function countUnused(adminId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM admin_backup_codes WHERE admin_id = ? AND used_at IS NULL',
    [adminId]
  );
  return rows[0].count;
}

// Checks a submitted code against this admin's unused codes (at most 10,
// so a linear bcrypt.compare scan is trivial) and marks the match spent
// so it can never be reused. Returns true/false.
async function verifyAndConsume(adminId, rawCode) {
  const normalized = normalize(rawCode);
  if (!normalized) return false;

  const [rows] = await pool.query(
    'SELECT id, code_hash FROM admin_backup_codes WHERE admin_id = ? AND used_at IS NULL',
    [adminId]
  );

  for (const row of rows) {
    if (await bcrypt.compare(normalized, row.code_hash)) {
      await pool.query('UPDATE admin_backup_codes SET used_at = NOW() WHERE id = ?', [row.id]);
      return true;
    }
  }

  return false;
}

module.exports = { replaceAll, removeAll, countUnused, verifyAndConsume };

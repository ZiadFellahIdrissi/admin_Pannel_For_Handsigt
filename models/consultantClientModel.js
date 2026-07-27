const pool = require('../config/db');

// Many-to-many manager for consultant_clients.

async function listForConsultant(userId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.active, cc.consultant_tjm, cc.client_tjm, cc.role_title, cc.fees_applied
       FROM clients c
       JOIN consultant_clients cc ON cc.client_id = c.id
      WHERE cc.user_id = ?
      ORDER BY c.name ASC`,
    [userId]
  );
  return rows;
}

// Consultants currently attached to this client - the reverse of
// listForConsultant. Includes inactive consultants too (same reasoning as
// listForConsultant showing inactive clients: history/context matters
// even after someone's deactivated).
async function listConsultantsForClient(clientId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.active,
            cc.consultant_tjm, cc.client_tjm, cc.role_title, cc.fees_applied
       FROM users u
       JOIN consultant_clients cc ON cc.user_id = u.id
      WHERE cc.client_id = ?
      ORDER BY u.last_name ASC, u.first_name ASC`,
    [clientId]
  );
  return rows;
}

// Active clients not yet attached to this consultant - populates the
// "attach a client" dropdown.
async function listUnattachedForConsultant(userId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name
       FROM clients c
      WHERE c.active = 1
        AND c.id NOT IN (
          SELECT client_id FROM consultant_clients WHERE user_id = ?
        )
      ORDER BY c.name ASC`,
    [userId]
  );
  return rows;
}

async function exists(userId, clientId) {
  const [rows] = await pool.query(
    'SELECT id FROM consultant_clients WHERE user_id = ? AND client_id = ? LIMIT 1',
    [userId, clientId]
  );
  return rows.length > 0;
}

async function attach(userId, clientId) {
  await pool.query(
    'INSERT INTO consultant_clients (user_id, client_id) VALUES (?, ?)',
    [userId, clientId]
  );
}

// Sets/updates the current rates, role, and fee setting for this pairing -
// used both the first time they're set and later when a client
// renegotiates or the consultant's role there changes. Does NOT touch any
// month_submissions already created against this pairing; those keep
// their own frozen rate/fee snapshot (see sql/schema.sql) - role_title
// has no per-submission snapshot, it's read live since knowing the
// current role isn't a financial record the way a rate/fee is.
async function updateAttachment(userId, clientId, { consultantTjm, clientTjm, roleTitle, feesApplied }) {
  await pool.query(
    'UPDATE consultant_clients SET consultant_tjm = ?, client_tjm = ?, role_title = ?, fees_applied = ? WHERE user_id = ? AND client_id = ?',
    [consultantTjm, clientTjm, roleTitle, feesApplied ? 1 : 0, userId, clientId]
  );
}

async function detach(userId, clientId) {
  await pool.query(
    'DELETE FROM consultant_clients WHERE user_id = ? AND client_id = ?',
    [userId, clientId]
  );
}

// Attaches several clients in one action (checkbox multi-select in the
// UI). Reuses the same exists()-before-insert pre-check as attach() so a
// client already attached is silently skipped instead of erroring, and
// the caller gets a clean count for a single flash message.
async function attachMany(userId, clientIds) {
  let attachedCount = 0;
  let skippedCount = 0;

  for (const clientId of clientIds) {
    const alreadyAttached = await exists(userId, clientId);
    if (alreadyAttached) {
      skippedCount += 1;
    } else {
      await attach(userId, clientId);
      attachedCount += 1;
    }
  }

  return { attachedCount, skippedCount };
}

module.exports = { listForConsultant, listConsultantsForClient, listUnattachedForConsultant, exists, attach, attachMany, updateAttachment, detach };

const pool = require('../config/db');

// Many-to-many manager for consultant_clients.

async function listForConsultant(userId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.active
       FROM clients c
       JOIN consultant_clients cc ON cc.client_id = c.id
      WHERE cc.user_id = ?
      ORDER BY c.name ASC`,
    [userId]
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

module.exports = { listForConsultant, listUnattachedForConsultant, exists, attach, attachMany, detach };

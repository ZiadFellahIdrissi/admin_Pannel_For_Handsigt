const pool = require('../config/db');

const STATUSES = ['draft', 'published'];

// Optional status filter - ordered for the public landing page's own
// display order first, most-recently-created next.
async function list({ status } = {}) {
  if (status && STATUSES.includes(status)) {
    const [rows] = await pool.query(
      'SELECT * FROM career_offers WHERE status = ? ORDER BY display_order ASC, created_at DESC',
      [status]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM career_offers ORDER BY display_order ASC, created_at DESC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM career_offers WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const [rows] = await pool.query('SELECT * FROM career_offers WHERE id IN (?)', [ids]);
  return rows;
}

// The column already has a UNIQUE constraint - this is just so the
// controller can show a friendly validation error instead of a raw
// duplicate-key SQL crash.
async function slugExists(slug, excludeId) {
  const params = excludeId ? [slug, excludeId] : [slug];
  const query = excludeId
    ? 'SELECT id FROM career_offers WHERE slug = ? AND id != ? LIMIT 1'
    : 'SELECT id FROM career_offers WHERE slug = ? LIMIT 1';
  const [rows] = await pool.query(query, params);
  return rows.length > 0;
}

async function create({ slug, title, tags, intro, skills, applyEmail, status, displayOrder }) {
  const [result] = await pool.query(
    `INSERT INTO career_offers (slug, title, tags, intro, skills, apply_email, status, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [slug, title, tags, intro, JSON.stringify(skills || []), applyEmail, status, displayOrder]
  );
  return result.insertId;
}

async function update(id, { slug, title, tags, intro, skills, applyEmail, status, displayOrder }) {
  await pool.query(
    `UPDATE career_offers SET
       slug = ?, title = ?, tags = ?, intro = ?, skills = ?, apply_email = ?, status = ?, display_order = ?
     WHERE id = ?`,
    [slug, title, tags, intro, JSON.stringify(skills || []), applyEmail, status, displayOrder, id]
  );
}

async function updateImage(id, imagePath) {
  await pool.query('UPDATE career_offers SET image_path = ? WHERE id = ?', [imagePath, id]);
}

async function setStatus(id, status) {
  await pool.query('UPDATE career_offers SET status = ? WHERE id = ?', [status, id]);
}

async function bulkDelete(ids) {
  if (!ids || ids.length === 0) return;
  await pool.query('DELETE FROM career_offers WHERE id IN (?)', [ids]);
}

async function remove(id) {
  await pool.query('DELETE FROM career_offers WHERE id = ?', [id]);
}

module.exports = {
  STATUSES,
  list,
  findById,
  findByIds,
  slugExists,
  create,
  update,
  updateImage,
  setStatus,
  bulkDelete,
  remove
};

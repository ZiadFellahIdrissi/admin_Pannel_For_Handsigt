// 'Experienced Data Analyst (M/F)' -> 'experienced-data-analyst-m-f'
// Used to auto-generate a career_offers.slug from its title when the
// admin leaves the slug field blank.
function slugify(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = slugify;

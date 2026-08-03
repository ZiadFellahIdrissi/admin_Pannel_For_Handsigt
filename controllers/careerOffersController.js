const fs = require('fs');
const path = require('path');
const careerOfferModel = require('../models/careerOfferModel');
const slugify = require('../utils/slugify');
const { CAREER_IMAGE_DIR, CAREER_IMAGE_PUBLIC_BASE_URL } = require('../config/uploadPaths');

// image_path stores a full public URL (see config/uploadPaths.js) - the
// on-disk file itself is just its last path segment, inside
// CAREER_IMAGE_DIR. Used whenever an old image needs deleting.
function unlinkImage(imagePath) {
  if (!imagePath) return;
  const filename = imagePath.split('/').pop();
  fs.unlink(path.join(CAREER_IMAGE_DIR, filename), () => {});
}

// tags/intro are optional free text; skills is a textarea (one skill per
// line) turned into the array the JSON column expects, blank lines
// dropped.
function extractFields(body) {
  const trim = (v) => {
    const s = (v || '').trim();
    return s || null;
  };
  const skills = (body.skills || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    tags: trim(body.tags),
    intro: trim(body.intro),
    skills,
    applyEmail: trim(body.applyEmail) || 'candidature@handsight-solutions.com',
    status: careerOfferModel.STATUSES.includes(body.status) ? body.status : 'draft',
    displayOrder: body.displayOrder ? Number(body.displayOrder) : 0
  };
}

async function list(req, res) {
  const status = req.query.status || '';
  const offers = await careerOfferModel.list({ status });
  res.render('career-offers/list', { offers, status });
}

function showCreateForm(req, res) {
  res.render('career-offers/form', {
    mode: 'create',
    offerRow: null,
    errors: [],
    statuses: careerOfferModel.STATUSES
  });
}

async function handleCreate(req, res) {
  const title = (req.body.title || '').trim();
  const fields = extractFields(req.body);
  const slug = slugify((req.body.slug || '').trim() || title);

  const errors = [];
  if (!title) errors.push('Title is required.');
  if (!slug) errors.push('Slug could not be generated - check the title.');
  if (!Number.isFinite(fields.displayOrder)) errors.push('Display order must be a number.');

  if (!errors.length && (await careerOfferModel.slugExists(slug))) {
    errors.push(`Slug "${slug}" is already in use - choose a different one.`);
  }

  if (errors.length) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).render('career-offers/form', {
      mode: 'create',
      offerRow: { title, slug, ...fields },
      errors,
      statuses: careerOfferModel.STATUSES
    });
  }

  const id = await careerOfferModel.create({ slug, title, ...fields });

  if (req.file) {
    await careerOfferModel.updateImage(id, `${CAREER_IMAGE_PUBLIC_BASE_URL}/${req.file.filename}`);
  }

  req.flash('success', `Offer "${title}" created.`);
  res.redirect('/career-offers');
}

async function showDetail(req, res) {
  const offer = await careerOfferModel.findById(req.params.id);
  if (!offer) {
    return res.status(404).render('error', { message: 'Offer not found.' });
  }
  res.render('career-offers/detail', { offerRow: offer });
}

async function showEditForm(req, res) {
  const offer = await careerOfferModel.findById(req.params.id);
  if (!offer) {
    return res.status(404).render('error', { message: 'Offer not found.' });
  }
  res.render('career-offers/form', {
    mode: 'edit',
    offerRow: offer,
    errors: [],
    statuses: careerOfferModel.STATUSES
  });
}

async function handleUpdate(req, res) {
  const offer = await careerOfferModel.findById(req.params.id);
  if (!offer) {
    return res.status(404).render('error', { message: 'Offer not found.' });
  }

  const title = (req.body.title || '').trim();
  const fields = extractFields(req.body);
  const slug = slugify((req.body.slug || '').trim() || title);

  const errors = [];
  if (!title) errors.push('Title is required.');
  if (!slug) errors.push('Slug could not be generated - check the title.');
  if (!Number.isFinite(fields.displayOrder)) errors.push('Display order must be a number.');

  if (!errors.length && (await careerOfferModel.slugExists(slug, offer.id))) {
    errors.push(`Slug "${slug}" is already in use - choose a different one.`);
  }

  if (errors.length) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).render('career-offers/form', {
      mode: 'edit',
      offerRow: { ...offer, title, slug, ...fields },
      errors,
      statuses: careerOfferModel.STATUSES
    });
  }

  await careerOfferModel.update(offer.id, { slug, title, ...fields });

  if (req.file) {
    unlinkImage(offer.image_path);
    await careerOfferModel.updateImage(offer.id, `${CAREER_IMAGE_PUBLIC_BASE_URL}/${req.file.filename}`);
  }

  req.flash('success', 'Offer updated.');
  res.redirect('/career-offers');
}

async function handleToggleStatus(req, res) {
  const offer = await careerOfferModel.findById(req.params.id);
  if (!offer) {
    return res.status(404).render('error', { message: 'Offer not found.' });
  }
  const newStatus = offer.status === 'published' ? 'draft' : 'published';
  await careerOfferModel.setStatus(offer.id, newStatus);
  req.flash('success', newStatus === 'published' ? 'Offer published.' : 'Offer set back to draft.');
  res.redirect('/career-offers');
}

async function handleDelete(req, res) {
  const offer = await careerOfferModel.findById(req.params.id);
  if (!offer) {
    return res.status(404).render('error', { message: 'Offer not found.' });
  }
  unlinkImage(offer.image_path);
  await careerOfferModel.remove(offer.id);
  req.flash('success', `Offer "${offer.title}" deleted.`);
  res.redirect('/career-offers');
}

async function handleBulkDelete(req, res) {
  const rawIds = req.body.offerIds;
  const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) {
    req.flash('error', 'Choose at least one offer to delete.');
    return res.redirect('/career-offers');
  }

  const offers = await careerOfferModel.findByIds(ids);
  offers.forEach((o) => unlinkImage(o.image_path));

  await careerOfferModel.bulkDelete(ids);
  req.flash('success', `Deleted ${offers.length} offer${offers.length === 1 ? '' : 's'}.`);
  res.redirect('/career-offers');
}

module.exports = {
  list,
  showCreateForm,
  handleCreate,
  showDetail,
  showEditForm,
  handleUpdate,
  handleToggleStatus,
  handleDelete,
  handleBulkDelete
};

const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Purely local storage, unlike CVs/career-offer images (which live on
// the shared cross-site Hostinger Uploads folder - see
// config/uploadPaths.js). The invoice logo is only ever used by this
// Admin Panel itself, so it just lives under this app's own public/
// folder and is served by the existing express.static(public)
// middleware in server.js - no new serving route needed, and no
// sensitivity concerns (it's a logo, not PII) that would call for
// gating it behind auth the way CVs are.
const COMPANY_LOGO_DIR = path.join(__dirname, '..', 'public', 'uploads', 'company');
fs.mkdirSync(COMPANY_LOGO_DIR, { recursive: true });

const EXTENSION_BY_MIMETYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/svg+xml': '.svg'
};

const storage = multer.diskStorage({
  destination: COMPANY_LOGO_DIR,
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXTENSION_BY_MIMETYPE[file.mimetype]}`);
  }
});

function fileFilter(req, file, cb) {
  if (!EXTENSION_BY_MIMETYPE[file.mimetype]) {
    return cb(new Error('Only JPEG, PNG, WebP, or SVG images are accepted.'));
  }
  cb(null, true);
}

const companyLogoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = companyLogoUpload;

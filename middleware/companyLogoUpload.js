const multer = require('multer');
const crypto = require('crypto');
const { COMPANY_LOGO_DIR } = require('../config/uploadPaths');

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

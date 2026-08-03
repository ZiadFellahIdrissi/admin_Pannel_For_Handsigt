const multer = require('multer');
const crypto = require('crypto');
const { CAREER_IMAGE_DIR } = require('../config/uploadPaths');

const EXTENSION_BY_MIMETYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: CAREER_IMAGE_DIR,
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXTENSION_BY_MIMETYPE[file.mimetype]}`);
  }
});

function fileFilter(req, file, cb) {
  if (!EXTENSION_BY_MIMETYPE[file.mimetype]) {
    return cb(new Error('Only JPEG, PNG, or WebP images are accepted.'));
  }
  cb(null, true);
}

const careerImageUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = careerImageUpload;

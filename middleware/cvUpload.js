const multer = require('multer');
const crypto = require('crypto');
const { CANDIDATE_CV_DIR } = require('../config/uploadPaths');

const storage = multer.diskStorage({
  destination: CANDIDATE_CV_DIR,
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.pdf`);
  }
});

// PDF only - keeps the detail page's inline <iframe> preview simple and
// avoids arbitrary file-type uploads. Checked by mimetype, not just the
// extension the browser reports.
function fileFilter(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are accepted.'));
  }
  cb(null, true);
}

const cvUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = cvUpload;

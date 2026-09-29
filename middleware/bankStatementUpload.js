const multer = require('multer');
const crypto = require('crypto');
const { BANK_STATEMENT_DIR } = require('../config/uploadPaths');

const storage = multer.diskStorage({
  destination: BANK_STATEMENT_DIR,
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.pdf`);
  }
});

// PDF only - same reasoning as every other upload middleware in this app.
function fileFilter(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are accepted.'));
  }
  cb(null, true);
}

const bankStatementUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = bankStatementUpload;

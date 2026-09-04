const multer = require('multer');
const crypto = require('crypto');
const { PAYSLIP_DIR } = require('../config/uploadPaths');

const storage = multer.diskStorage({
  destination: PAYSLIP_DIR,
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.pdf`);
  }
});

// PDF only - same reasoning as middleware/cvUpload.js and invoiceUpload.js.
function fileFilter(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are accepted.'));
  }
  cb(null, true);
}

const payslipUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = payslipUpload;

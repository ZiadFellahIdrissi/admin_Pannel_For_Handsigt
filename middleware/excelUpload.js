const multer = require('multer');

// Memory storage, not disk - the workbook is parsed once (see
// candidatesBulkController.handleImport) and discarded; it never needs
// to persist anywhere, unlike CV uploads (see middleware/cvUpload.js).
const XLSX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fileFilter(req, file, cb) {
  if (file.mimetype !== XLSX_MIMETYPE) {
    return cb(new Error('Only .xlsx Excel files are accepted.'));
  }
  cb(null, true);
}

const excelUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = excelUpload;

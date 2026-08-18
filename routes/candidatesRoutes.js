const express = require('express');
const router = express.Router();
const candidatesController = require('../controllers/candidatesController');
const candidatesAnalyticsController = require('../controllers/candidatesAnalyticsController');
const candidatesBulkController = require('../controllers/candidatesBulkController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const cvUpload = require('../middleware/cvUpload');
const excelUpload = require('../middleware/excelUpload');

router.use(requireAuth);

// Wraps cvUpload.single('cv') so a rejected file (wrong type / too large)
// becomes a flash message + redirect instead of a raw error page. Runs
// before verifyToken because req.body._csrf only exists once multer has
// parsed the multipart body - express.urlencoded (global, in server.js)
// doesn't handle multipart/form-data.
function handleCv(redirectPath) {
  return (req, res, next) => {
    cvUpload.single('cv')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect(redirectPath(req));
      }
      next();
    });
  };
}

// Same wrapper pattern as handleCv, for the Excel import file.
function handleExcel(redirectPath) {
  return (req, res, next) => {
    excelUpload.single('excelFile')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect(redirectPath(req));
      }
      next();
    });
  };
}

router.get('/candidates', asyncHandler(candidatesController.list));
router.post('/candidates/ai-search', verifyToken, asyncHandler(candidatesController.handleAiSearch));
router.get('/candidates/new', candidatesController.showCreateForm);
router.post(
  '/candidates',
  handleCv(() => '/candidates/new'),
  verifyToken,
  asyncHandler(candidatesController.handleCreate)
);

// All fixed-name routes below must stay ABOVE the `:id`-parameterized
// routes further down this file - Express matches `/candidates/:id`
// against any single path segment, so e.g. `/candidates/analytics` would
// otherwise be swallowed by that wildcard (as if id = "analytics").
router.get('/candidates/analytics', asyncHandler(candidatesAnalyticsController.show));
router.get('/candidates/import-export', asyncHandler(candidatesBulkController.showImportExportPage));
router.get('/candidates/export/template', asyncHandler(candidatesBulkController.downloadTemplate));
router.post('/candidates/export/selected', verifyToken, asyncHandler(candidatesBulkController.downloadSelected));
router.post(
  '/candidates/import',
  handleExcel(() => '/candidates/import-export'),
  verifyToken,
  asyncHandler(candidatesBulkController.handleImport)
);
router.post('/candidates/bulk-delete', verifyToken, asyncHandler(candidatesController.handleBulkDelete));

router.get('/candidates/:id', asyncHandler(candidatesController.showDetail));
router.get('/candidates/:id/cv', asyncHandler(candidatesController.serveCv));
router.get('/candidates/:id/edit', asyncHandler(candidatesController.showEditForm));
router.post('/candidates/:id', verifyToken, asyncHandler(candidatesController.handleUpdate));
router.post(
  '/candidates/:id/cv',
  handleCv((req) => `/candidates/${req.params.id}`),
  verifyToken,
  asyncHandler(candidatesController.handleReuploadCv)
);
router.post('/candidates/:id/delete', verifyToken, asyncHandler(candidatesController.handleDelete));

module.exports = router;

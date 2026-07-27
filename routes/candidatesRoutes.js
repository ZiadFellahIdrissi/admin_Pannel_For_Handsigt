const express = require('express');
const router = express.Router();
const candidatesController = require('../controllers/candidatesController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const cvUpload = require('../middleware/cvUpload');

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

router.get('/candidates', asyncHandler(candidatesController.list));
router.get('/candidates/new', candidatesController.showCreateForm);
router.post(
  '/candidates',
  handleCv(() => '/candidates/new'),
  verifyToken,
  asyncHandler(candidatesController.handleCreate)
);
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

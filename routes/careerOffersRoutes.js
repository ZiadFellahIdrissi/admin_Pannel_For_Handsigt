const express = require('express');
const router = express.Router();
const careerOffersController = require('../controllers/careerOffersController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const careerImageUpload = require('../middleware/careerImageUpload');

router.use(requireAuth);

// Wraps careerImageUpload.single('image') so a rejected file (wrong
// type / too large) becomes a flash message + redirect instead of a raw
// error page. Runs before verifyToken because req.body._csrf only
// exists once multer has parsed the multipart body - express.urlencoded
// (global, in server.js) doesn't handle multipart/form-data. Unlike the
// Candidates form, both create AND edit submit as multipart here (edit
// can also replace the image), so both routes need this wrapper.
function handleImage(redirectPath) {
  return (req, res, next) => {
    careerImageUpload.single('image')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect(redirectPath(req));
      }
      next();
    });
  };
}

router.get('/career-offers', asyncHandler(careerOffersController.list));
router.get('/career-offers/new', careerOffersController.showCreateForm);
router.post(
  '/career-offers',
  handleImage(() => '/career-offers/new'),
  verifyToken,
  asyncHandler(careerOffersController.handleCreate)
);

// Must sit above the `:id` routes below - Express matches `:id` against
// any single path segment, so `/career-offers/bulk-delete` would
// otherwise be swallowed by that wildcard.
router.post('/career-offers/bulk-delete', verifyToken, asyncHandler(careerOffersController.handleBulkDelete));

router.get('/career-offers/:id', asyncHandler(careerOffersController.showDetail));
router.get('/career-offers/:id/edit', asyncHandler(careerOffersController.showEditForm));
router.post(
  '/career-offers/:id',
  handleImage((req) => `/career-offers/${req.params.id}/edit`),
  verifyToken,
  asyncHandler(careerOffersController.handleUpdate)
);
router.post('/career-offers/:id/toggle-status', verifyToken, asyncHandler(careerOffersController.handleToggleStatus));
router.post('/career-offers/:id/delete', verifyToken, asyncHandler(careerOffersController.handleDelete));

module.exports = router;

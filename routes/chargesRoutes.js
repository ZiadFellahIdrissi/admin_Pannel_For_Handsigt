const express = require('express');
const router = express.Router();
const chargesController = require('../controllers/chargesController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const chargeInvoiceUpload = require('../middleware/chargeInvoiceUpload');

router.use(requireAuth);

// Wraps chargeInvoiceUpload.single('invoice') so a rejected file (wrong
// type/too large) becomes a flash message + redirect instead of a raw
// error page - same pattern as invoicesRoutes.js/salariesRoutes.js.
function handleInvoiceUpload(redirectPath) {
  return (req, res, next) => {
    chargeInvoiceUpload.single('invoice')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect(redirectPath(req));
      }
      next();
    });
  };
}

router.get('/charges', asyncHandler(chargesController.list));
router.get('/charges/new', asyncHandler(chargesController.showCreateForm));
router.post(
  '/charges',
  handleInvoiceUpload(() => '/charges/new'),
  verifyToken,
  asyncHandler(chargesController.handleCreate)
);
router.get('/charges/:id', asyncHandler(chargesController.showDetail));
router.get('/charges/:id/pdf', asyncHandler(chargesController.serveInvoice));
router.get('/charges/:id/edit', asyncHandler(chargesController.showEditForm));
router.post('/charges/:id', verifyToken, asyncHandler(chargesController.handleUpdate));
router.post(
  '/charges/:id/upload-invoice',
  handleInvoiceUpload((req) => `/charges/${req.params.id}`),
  verifyToken,
  asyncHandler(chargesController.handleUploadInvoice)
);
router.post('/charges/:id/delete', verifyToken, asyncHandler(chargesController.handleDelete));

module.exports = router;

const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoicesController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const invoiceUpload = require('../middleware/invoiceUpload');

router.use(requireAuth);

// Wraps invoiceUpload.single('realInvoice') so a rejected file (wrong
// type/too large) becomes a flash message + redirect instead of a raw
// error page. Runs before verifyToken because req.body._csrf only exists
// once multer has parsed the multipart body - same ordering as
// candidatesRoutes.js's handleCv.
function handleRealInvoiceUpload(redirectPath) {
  return (req, res, next) => {
    invoiceUpload.single('realInvoice')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect(redirectPath(req));
      }
      next();
    });
  };
}

router.get('/invoices/clients', asyncHandler(invoicesController.listClients));
router.get('/invoices/clients/:id', asyncHandler(invoicesController.showClientDetail));
router.get('/invoices/suppliers', asyncHandler(invoicesController.listSuppliers));
router.get('/invoices/suppliers/:id', asyncHandler(invoicesController.showSupplierDetail));
router.get('/invoices/:id/pdf', asyncHandler(invoicesController.servePdf));
router.post('/invoices/generate/:submissionId', verifyToken, asyncHandler(invoicesController.handleGenerate));
router.post(
  '/invoices/:id/upload-real',
  handleRealInvoiceUpload((req) => `/invoices/suppliers/${req.params.id}`),
  verifyToken,
  asyncHandler(invoicesController.handleUploadReal)
);

module.exports = router;

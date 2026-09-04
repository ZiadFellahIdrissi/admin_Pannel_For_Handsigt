const express = require('express');
const router = express.Router();
const salariesController = require('../controllers/salariesController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const payslipUpload = require('../middleware/payslipUpload');

router.use(requireAuth);

// Wraps payslipUpload.single('payslip') so a rejected file (wrong
// type/too large) becomes a flash message + redirect instead of a raw
// error page - same pattern as invoicesRoutes.js's handleRealInvoiceUpload.
function handlePayslipUpload(redirectPath) {
  return (req, res, next) => {
    payslipUpload.single('payslip')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect(redirectPath(req));
      }
      next();
    });
  };
}

router.get('/salaries', asyncHandler(salariesController.list));
router.post(
  '/salaries/record',
  handlePayslipUpload((req) => `/salaries?month=${req.body.month || ''}`),
  verifyToken,
  asyncHandler(salariesController.handleRecordPayment)
);
router.get('/salaries/payment/:id', asyncHandler(salariesController.showPaymentDetail));
router.get('/salaries/payment/:id/pdf', asyncHandler(salariesController.servePayslip));
router.post(
  '/salaries/payment/:id/upload-payslip',
  handlePayslipUpload((req) => `/salaries/payment/${req.params.id}`),
  verifyToken,
  asyncHandler(salariesController.handleUploadPayslip)
);
router.post('/salaries/payment/:id/delete', verifyToken, asyncHandler(salariesController.handleDeletePayment));

module.exports = router;

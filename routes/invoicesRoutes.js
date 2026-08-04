const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoicesController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

router.get('/invoices/clients', asyncHandler(invoicesController.listClients));
router.get('/invoices/clients/:id', asyncHandler(invoicesController.showClientDetail));
router.get('/invoices/suppliers', asyncHandler(invoicesController.listSuppliers));
router.get('/invoices/suppliers/:id', asyncHandler(invoicesController.showSupplierDetail));
router.get('/invoices/:id/pdf', asyncHandler(invoicesController.servePdf));
router.post('/invoices/generate/:submissionId', verifyToken, asyncHandler(invoicesController.handleGenerate));

module.exports = router;

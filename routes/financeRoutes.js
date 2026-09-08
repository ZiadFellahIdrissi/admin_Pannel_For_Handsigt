const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

// Read-only reporting throughout - no CSRF-protected mutations live under
// /finance, so unlike every other routes file here there's no verifyToken.
router.get('/finance', asyncHandler(financeController.showDashboard));
router.get('/finance/tva', asyncHandler(financeController.showTva));
router.get('/finance/tva/export', asyncHandler(financeController.exportTvaExcel));
router.get('/finance/pnl', asyncHandler(financeController.showPnl));
router.get('/finance/margins', asyncHandler(financeController.showMargins));
router.get('/finance/receivables', asyncHandler(financeController.showReceivables));
router.get('/finance/payables', asyncHandler(financeController.showPayables));

module.exports = router;

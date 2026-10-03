const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const revenueController = require('../controllers/revenueController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

// Read-only reporting throughout, except the Revenue page's manually
// entered revenue (months invoiced outside this app) - those two POSTs
// are CSRF-protected like every other mutation in the app.
router.get('/finance', asyncHandler(financeController.showDashboard));
router.get('/finance/revenue', asyncHandler(revenueController.show));
router.post('/finance/revenue/external', verifyToken, asyncHandler(revenueController.handleSaveExternal));
router.post('/finance/revenue/external/:id/delete', verifyToken, asyncHandler(revenueController.handleDeleteExternal));
router.get('/finance/tva', asyncHandler(financeController.showTva));
router.get('/finance/tva/export', asyncHandler(financeController.exportTvaExcel));
router.get('/finance/tva/documents', asyncHandler(financeController.exportTvaDocuments));
router.get('/finance/pnl', asyncHandler(financeController.showPnl));
router.get('/finance/margins', asyncHandler(financeController.showMargins));
router.get('/finance/receivables', asyncHandler(financeController.showReceivables));
router.get('/finance/payables', asyncHandler(financeController.showPayables));

module.exports = router;

const express = require('express');
const router = express.Router();
const approvalsController = require('../controllers/approvalsController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

router.get('/approvals', asyncHandler(approvalsController.list));
router.post('/approvals/:id/approve', verifyToken, asyncHandler(approvalsController.handleApprove));
router.post('/approvals/:id/reject', verifyToken, asyncHandler(approvalsController.handleReject));
router.post('/approvals/:id/reopen', verifyToken, asyncHandler(approvalsController.handleReopen));

module.exports = router;

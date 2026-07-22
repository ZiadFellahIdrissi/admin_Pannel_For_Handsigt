const express = require('express');
const router = express.Router();
const consultantsController = require('../controllers/consultantsController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

router.get('/consultants', asyncHandler(consultantsController.list));
router.get('/consultants/new', consultantsController.showCreateForm);
router.post('/consultants', verifyToken, asyncHandler(consultantsController.handleCreate));
router.get('/consultants/:id', asyncHandler(consultantsController.showDetail));
router.get('/consultants/:id/edit', asyncHandler(consultantsController.showEditForm));
router.post('/consultants/:id', verifyToken, asyncHandler(consultantsController.handleUpdate));
router.post('/consultants/:id/reset-password', verifyToken, asyncHandler(consultantsController.handleResetPassword));
router.post('/consultants/:id/clients', verifyToken, asyncHandler(consultantsController.handleAttachClient));
router.post('/consultants/:id/clients/:clientId/detach', verifyToken, asyncHandler(consultantsController.handleDetachClient));

module.exports = router;

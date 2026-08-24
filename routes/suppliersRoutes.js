const express = require('express');
const router = express.Router();
const suppliersController = require('../controllers/suppliersController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

router.get('/suppliers', asyncHandler(suppliersController.list));
router.get('/suppliers/new', suppliersController.showCreateForm);
router.post('/suppliers', verifyToken, asyncHandler(suppliersController.handleCreate));
router.get('/suppliers/:id', asyncHandler(suppliersController.showDetail));
router.get('/suppliers/:id/edit', asyncHandler(suppliersController.showEditForm));
router.post('/suppliers/:id', verifyToken, asyncHandler(suppliersController.handleUpdate));
router.post('/suppliers/:id/toggle-active', verifyToken, asyncHandler(suppliersController.handleToggleActive));
router.post('/suppliers/:id/delete', verifyToken, asyncHandler(suppliersController.handleDelete));

module.exports = router;

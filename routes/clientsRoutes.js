const express = require('express');
const router = express.Router();
const clientsController = require('../controllers/clientsController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

router.get('/clients', asyncHandler(clientsController.list));
router.get('/clients/new', clientsController.showCreateForm);
router.post('/clients', verifyToken, asyncHandler(clientsController.handleCreate));
router.get('/clients/:id/edit', asyncHandler(clientsController.showEditForm));
router.post('/clients/:id', verifyToken, asyncHandler(clientsController.handleUpdate));
router.post('/clients/:id/toggle-active', verifyToken, asyncHandler(clientsController.handleToggleActive));
router.post('/clients/:id/delete', verifyToken, asyncHandler(clientsController.handleDelete));

module.exports = router;

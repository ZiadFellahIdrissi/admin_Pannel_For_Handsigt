const express = require('express');
const router = express.Router();
const employeesController = require('../controllers/employeesController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.use(requireAuth);

router.get('/employees', asyncHandler(employeesController.list));
router.get('/employees/new', employeesController.showCreateForm);
router.post('/employees', verifyToken, asyncHandler(employeesController.handleCreate));
router.get('/employees/:id', asyncHandler(employeesController.showDetail));
router.get('/employees/:id/edit', asyncHandler(employeesController.showEditForm));
router.post('/employees/:id', verifyToken, asyncHandler(employeesController.handleUpdate));
router.post('/employees/:id/toggle-active', verifyToken, asyncHandler(employeesController.handleToggleActive));
router.post('/employees/:id/delete', verifyToken, asyncHandler(employeesController.handleDelete));

module.exports = router;

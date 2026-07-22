const express = require('express');
const router = express.Router();
const consultantsManagementController = require('../controllers/consultantsManagementController');
const { requireAuth } = require('../middleware/auth');

router.get('/consultants-management', requireAuth, consultantsManagementController.showHub);

module.exports = router;

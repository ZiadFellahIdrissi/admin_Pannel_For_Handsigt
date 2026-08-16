const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfAuthenticated, requireAuth } = require('../middleware/auth');
const { loginLimiter, twoFactorLimiter } = require('../middleware/rateLimiter');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');

router.get('/login', redirectIfAuthenticated, authController.showLogin);
router.post('/login', redirectIfAuthenticated, loginLimiter, verifyToken, asyncHandler(authController.handleLogin));
router.get('/login/verify', redirectIfAuthenticated, authController.showTwoFactorPrompt);
router.post('/login/verify', redirectIfAuthenticated, twoFactorLimiter, verifyToken, asyncHandler(authController.handleTwoFactorVerify));
router.post('/logout', requireAuth, verifyToken, authController.handleLogout);

module.exports = router;

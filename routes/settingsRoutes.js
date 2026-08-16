const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const twoFactorController = require('../controllers/twoFactorController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const companyLogoUpload = require('../middleware/companyLogoUpload');

router.use(requireAuth);

// Wraps companyLogoUpload.single('logo') so a rejected file (wrong type
// / too large) becomes a flash message + redirect instead of a raw
// error page. Runs before verifyToken because req.body._csrf only
// exists once multer has parsed the multipart body - express.urlencoded
// (global, in server.js) doesn't handle multipart/form-data.
function handleLogo(req, res, next) {
  companyLogoUpload.single('logo')(req, res, (err) => {
    if (err) {
      req.flash('error', err.message || 'Upload failed.');
      return res.redirect('/settings/administrative-information');
    }
    next();
  });
}

router.get('/settings', asyncHandler(settingsController.showHub));
router.get('/settings/administrative-information', asyncHandler(settingsController.showAdministrativeInfo));
router.post(
  '/settings/administrative-information',
  handleLogo,
  verifyToken,
  asyncHandler(settingsController.handleUpdateAdministrativeInfo)
);

router.get('/settings/security', asyncHandler(twoFactorController.showSetup));
router.post('/settings/security/activate', verifyToken, asyncHandler(twoFactorController.handleActivate));
router.post('/settings/security/deactivate', verifyToken, asyncHandler(twoFactorController.handleDeactivate));
router.post('/settings/security/regenerate-backup-codes', verifyToken, asyncHandler(twoFactorController.handleRegenerateBackupCodes));

module.exports = router;

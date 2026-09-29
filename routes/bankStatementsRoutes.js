const express = require('express');
const router = express.Router();
const bankStatementsController = require('../controllers/bankStatementsController');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const asyncHandler = require('../utils/asyncHandler');
const bankStatementUpload = require('../middleware/bankStatementUpload');

router.use(requireAuth);

// Wraps bankStatementUpload.single('statement') so a rejected file (wrong
// type/too large) becomes a flash message + redirect instead of a raw
// error page - same pattern as every other upload route in this app.
function handleStatementUpload(req, res, next) {
  bankStatementUpload.single('statement')(req, res, (err) => {
    if (err) {
      req.flash('error', err.message || 'Upload failed.');
      return res.redirect('/bank-statements');
    }
    next();
  });
}

router.get('/bank-statements', asyncHandler(bankStatementsController.list));
router.post('/bank-statements/upload', handleStatementUpload, verifyToken, asyncHandler(bankStatementsController.handleUpload));
router.post('/bank-statements/combine', verifyToken, asyncHandler(bankStatementsController.handleCombine));
router.get('/bank-statements/:id/pdf', asyncHandler(bankStatementsController.serveStatement));
router.post('/bank-statements/:id/delete', verifyToken, asyncHandler(bankStatementsController.handleDelete));

module.exports = router;

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');

const sessionMiddleware = require('./config/session');
const { attachToken } = require('./middleware/csrf');
const { requireAuth } = require('./middleware/auth');
const { formatCurrency, monthLabel } = require('./utils/format');
const authRoutes = require('./routes/authRoutes');
const consultantsRoutes = require('./routes/consultantsRoutes');
const clientsRoutes = require('./routes/clientsRoutes');
const approvalsRoutes = require('./routes/approvalsRoutes');
const historyRoutes = require('./routes/historyRoutes');
const loginAttemptsRoutes = require('./routes/loginAttemptsRoutes');

const app = express();

app.set('trust proxy', 1); // Hostinger sits behind a reverse proxy; needed for correct req.ip and secure cookies
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cache-busting query string for static assets, based on output.css's own
// last-modified time. Browsers/CDNs otherwise cache /css/output.css by its
// unchanging filename, so a rebuilt stylesheet can silently keep serving
// the old one until this changes the URL.
try {
  app.locals.assetVersion = fs.statSync(path.join(__dirname, 'public', 'css', 'output.css')).mtimeMs;
} catch {
  app.locals.assetVersion = Date.now();
}

app.locals.formatCurrency = formatCurrency;
app.locals.monthLabel = monthLabel;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'cdnjs.cloudflare.com'],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", 'data:']
    }
  }
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Safe fallback locals, set before anything that can fail (session store,
// etc). If a later middleware throws, the error page can still render
// correctly instead of crashing a second time on missing locals.
app.use((req, res, next) => {
  res.locals.currentUser = null;
  res.locals.csrfToken = '';
  res.locals.currentPath = req.path;
  res.locals.successMessages = [];
  res.locals.errorMessages = [];
  next();
});

app.use(sessionMiddleware);
app.use(flash());
app.use(attachToken);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.admin || null;
  res.locals.successMessages = req.flash('success');
  res.locals.errorMessages = req.flash('error');
  res.locals.currentPath = req.path;
  next();
});

app.get('/', requireAuth, (req, res) => res.redirect('/approvals'));

app.use('/', authRoutes);
app.use('/', consultantsRoutes);
app.use('/', clientsRoutes);
app.use('/', approvalsRoutes);
app.use('/', historyRoutes);
app.use('/', loginAttemptsRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);

  // A response may already have been sent for this request (e.g. the
  // session store failed to persist asynchronously after the page itself
  // was already rendered) - per Express's own docs, delegate to its
  // built-in handler instead of trying to send a second response, which
  // would throw ERR_HTTP_HEADERS_SENT and crash the whole process.
  if (res.headersSent) {
    return next(err);
  }

  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again.'
    : err.message;

  res.status(500).render('error', { message }, (renderErr, html) => {
    if (renderErr) {
      // Rendering the error page itself failed (e.g. the failure happened
      // before locals/session were set up) - fall back to plain text so
      // the user never sees a bare, unstyled platform error page.
      console.error('[error view] failed to render:', renderErr);
      return res.type('text/plain').send(message);
    }
    res.send(html);
  });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Handsight Admin Panel running on port ${port}`);
});

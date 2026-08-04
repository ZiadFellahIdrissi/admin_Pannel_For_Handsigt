const path = require('path');
const fs = require('fs');

// The shared Hostinger "/upload" folder (used by 2 other websites too) -
// this app only ever reads/writes its own subfolder underneath it, never
// the shared root itself. Falls back to a local folder if the real path
// hasn't been set yet in .env, so the app still boots and works locally.
// Resolved to an absolute path (res.sendFile requires one, and a relative
// UPLOAD_ROOT_PATH would otherwise be resolved against whatever the
// process's cwd happens to be at launch, not reliably this project root).
const UPLOAD_ROOT = path.resolve(__dirname, '..', process.env.UPLOAD_ROOT_PATH || 'uploads');

const CANDIDATE_CV_DIR = path.join(UPLOAD_ROOT, 'admin-panel', 'candidates', 'cvs');

// Sits directly under the shared Uploads root (not nested under
// admin-panel/ like CVs) - these images must be readable by the public
// landing page too, a different site from this Admin Panel, which
// already expects this exact folder name.
const CAREER_IMAGE_DIR = path.join(UPLOAD_ROOT, 'carrers');

// Full public URL prefix the landing page uses to reach CAREER_IMAGE_DIR
// - see .env.example for the "confirm once live" caveat.
const CAREER_IMAGE_PUBLIC_BASE_URL = process.env.CAREER_IMAGE_PUBLIC_BASE_URL || 'https://handsight-solutions.com/uploads/carrers';

// Company/invoice logo (settings) - shared, not local-only (unlike the
// first draft of this): nested under admin-panel/ since it's this app's
// own setting, but still in the shared Uploads root so it's reachable by
// URL the same way career-offer images are, in case anything outside
// this Admin Panel ever needs it too.
const COMPANY_LOGO_DIR = path.join(UPLOAD_ROOT, 'admin-panel', 'company');
const COMPANY_LOGO_PUBLIC_BASE_URL = process.env.COMPANY_LOGO_PUBLIC_BASE_URL || 'https://handsight-solutions.com/uploads/admin-panel/company';

fs.mkdirSync(CANDIDATE_CV_DIR, { recursive: true });
fs.mkdirSync(CAREER_IMAGE_DIR, { recursive: true });
fs.mkdirSync(COMPANY_LOGO_DIR, { recursive: true });

module.exports = {
  UPLOAD_ROOT,
  CANDIDATE_CV_DIR,
  CAREER_IMAGE_DIR,
  CAREER_IMAGE_PUBLIC_BASE_URL,
  COMPANY_LOGO_DIR,
  COMPANY_LOGO_PUBLIC_BASE_URL
};

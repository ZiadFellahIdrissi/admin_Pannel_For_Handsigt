# Handsight Admin Panel

Admin UI for Handsight Solutions, replacing manual phpMyAdmin steps for the
**Consultants Management** module: consultant accounts, clients, client
attachments, and the month-submission approval queue. It's a separate
deployment from the Consultant Dashboard, sharing the same MySQL database
with its own dedicated DB user and its own session store.

Later phases (facturation, treasury, earnings/spending dashboards) are out
of scope for this build.

## Stack
Node.js + Express, MySQL, EJS views, Tailwind CSS, Font Awesome (CDN). No
i18n - English only, since this app is only ever used by admins.

## How it works

- **Navigation**: a left sidebar with a top-level **Dashboard** link and an
  expandable **Consultants Management** group (auto-expands when you're
  inside it). Future modules (facturation, treasury, etc.) become new
  sibling groups later without redesigning anything.
- **Dashboard**: landing page - active consultants/clients counts, pending
  submissions count, this month's approved earnings, and a recent-activity
  feed across all consultants.
- **Notification bell** (topbar): live badge showing the count of `pending`
  `month_submissions` - i.e. a consultant just submitted a month and it's
  awaiting your decision. No separate "mark as read": an item IS the
  notification, and it clears itself once you approve/reject it. Also
  mirrored as a badge next to "Approval Queue" in the sidebar.
- **Consultants Management hub** (`/consultants-management`): overview
  cards linking into each of the five pages below.
- **Consultants**: create accounts (temp password, forces a password change
  on next login), edit details, deactivate, reset passwords, view attached
  clients and full submission history.
- **Clients**: create, edit name, activate/deactivate. Clients are never
  hard-deleted - deactivating hides them from the Consultant Dashboard's
  client picker while preserving all history.
- **Approval Queue**: the main workflow. Lists every `pending`
  `month_submissions` row with consultant/client/month/total days/total
  earnings, with one-click approve or reject-with-comment.
- **History**: every submission across every consultant, filterable by
  month/client/status, with a reopen-to-draft action on any decided row.
- **Login Attempts**: read-only view of `login_attempts` (written by the
  Consultant Dashboard's own login flow) - never written to from here.

There is **no admin signup or self-service password change**. The admin's
own account (in the `admins` table) is created and reset exclusively by
hand in phpMyAdmin - see below.

## 1. Local / server setup

```bash
npm install
cp .env.example .env    # then fill in real values
npm run build:css       # compiles public/css/output.css from public/css/input.css
```

Run the schema once, in phpMyAdmin's SQL tab:

```
sql/schema.sql
```

This adds exactly two new tables - `admins` and `admin_sessions` - to the
**same database** the Consultant Dashboard already uses. It does **not**
recreate `users`, `clients`, `consultant_clients`, `month_submissions`,
`daily_entries`, or `login_attempts`; those already exist and are owned by
the Consultant Dashboard's own schema.

Create your admin login:

```bash
npm run hash-password -- "SomeStrongPassword123!"
```

Paste the resulting hash into:

```sql
INSERT INTO admins (username, password_hash) VALUES ('your-username', '$2a$12$...');
```

Start the app:

```bash
npm start          # production
npm run dev        # local dev, auto-restarts on file changes
```

If you edit any `.ejs` file's classes, re-run `npm run build:css` (or
`npm run watch:css` while developing) to regenerate the stylesheet.

## 2. Deploying on Hostinger

1. In hPanel, create a **new** Node.js app instance pointed at this
   project (own subdomain, e.g. `admin.handsight-solutions.com`), with
   `server.js` as the entry point - this is a fully separate deployment
   from the Consultant Dashboard, not a route added to it.
2. Create a **new, dedicated MySQL user** for this app - do not reuse the
   Consultant Dashboard's DB user. It needs SELECT/INSERT/UPDATE/DELETE on
   `admins`, `admin_sessions`, `users`, `clients`, `consultant_clients`,
   `month_submissions`, `daily_entries`, and SELECT-only on
   `login_attempts` (this app's own model layer never writes to that
   table). Never grant DROP/ALTER/GRANT.
3. Quote any env var value containing special characters (especially `#`,
   which `dotenv` otherwise treats as a comment and silently truncates the
   value at).
4. Set `DB_HOST` to whatever hPanel's connection details show (not
   necessarily `localhost`), and check hPanel's **Remote MySQL** settings
   if you hit "Access denied" despite correct credentials.
5. Point the subdomain at the Node.js app, enable free SSL.
6. `npm install`, `npm run build:css`, then start the app.
7. **Restart the app after any environment variable change.**
8. Consider IP-restricting the admin subdomain at the Hostinger/hPanel or
   `.htaccess` level - this app should only ever be reachable by admins.

## 3. Security measures implemented

- **Passwords**: bcrypt-hashed (cost factor 12), matching the Consultant
  Dashboard's own hashing so consultant password resets verify correctly
  on their login.
- **Sessions**: server-side (own MySQL-backed store, `admin_sessions`
  table - never shared with the Consultant Dashboard's `sessions` table),
  `httpOnly` + `secure` + `sameSite=strict` cookies, session ID
  regenerated on login, sliding 8-hour idle timeout, destroyed
  server-side on logout.
- **CSRF**: session-bound token required on every state-changing form.
- **SQL injection**: 100% parameterized queries via `mysql2`.
- **XSS**: EJS auto-escapes all interpolated output by default; a strict
  Content-Security-Policy is set via `helmet` (no inline scripts).
- **Rate limiting**: the login route is IP rate-limited.
- **Least privilege**: the app's DB user should never have
  DROP/ALTER/GRANT, and should ideally be limited to SELECT on
  `login_attempts` at the grant level too.
- **Notifications**: this app sends no email at all - the Consultant
  Dashboard's own background poller detects status changes on
  `month_submissions` and emails the consultant; this app only ever
  updates `status`/`admin_comment`/`reviewed_at`, never
  `notification_sent`.

## 4. Project structure

```
config/       DB pool, session store
middleware/   auth guards, CSRF, rate limiting
models/       parameterized queries (admins, users, clients, consultant_clients, month_submissions, login_attempts)
utils/        currency/month formatting, async route wrapper
controllers/  route handlers
routes/       Express routers
views/        EJS templates (+ partials for head/sidebar/topbar/flash/foot)
public/       Tailwind input/output CSS, theme + sidebar toggle JS, logo
sql/          schema.sql (run once)
scripts/      hash-password.js CLI helper for the admin account
```

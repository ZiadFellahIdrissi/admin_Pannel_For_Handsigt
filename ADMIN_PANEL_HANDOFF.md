# Handsight Admin Panel — Handoff Brief

This document is to builds the
**Admin Panel**. It's a separate project/app from an existing application named Consultants Dashboard, but shares the
same MySQL database. 

## 1. What already exists

The **Consultant Dashboard** is a Node.js + Express + EJS +
Tailwind app where consultants log in, declare a month of worked days
against a client, and submit it for approval. It has **no admin UI at
all** — every admin action (creating accounts, attaching clients,
approving/rejecting months) is currently done by hand in phpMyAdmin.

The Admin Panel's job is to replace those manual SQL steps with a real UI,
for the same underlying database. It does not need to duplicate any
consultant-facing feature (calendar filling, submission, etc.) — only the
admin side of the workflow.

**The two apps must stay in sync on one thing**: password hashes. See
§5.

## 2. Hosting context

- Both apps run on Hostinger, sharing one MySQL/MariaDB database.
- The Consultant Dashboard lives at `consultants.handsight-solutions.com`.
- The Admin Panel should get its own subdomain (e.g.
  `admin.handsight-solutions.com`) and its own Node.js app instance in
  hPanel — it is a fully separate deployment, not a route added to this
  app.
- **Give the Admin Panel its own MySQL user**, not the Consultant
  Dashboard's. It will need broader privileges (INSERT/UPDATE/DELETE
  across every table below), but still never DROP/ALTER/GRANT.


## 3. Database schema 

### `users` — consultants (the Admin Panel manages these)
| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `username` | VARCHAR(50) UNIQUE | login handle, admin-assigned |
| `password_hash` | VARCHAR(255) | bcrypt hash — see §5 |
| `first_name` | VARCHAR(60) | |
| `last_name` | VARCHAR(60) | |
| `email` | VARCHAR(150) | used for notification emails |
| `phone` | VARCHAR(30) NULL | consultant-editable, optional |
| `address` | VARCHAR(255) NULL | consultant-editable, optional |
| `avatar_path` | VARCHAR(255) NULL | e.g. `/uploads/avatars/3-a1b2c3d4e5f6.jpg` — see §7 |
| `daily_rate` | DECIMAL(10,2) DEFAULT 0.00 | **TJM**, in MAD. The consultant sees this and their computed earnings — do not treat it as admin-only-secret data. |
| `preferred_language` | VARCHAR(5) DEFAULT 'en' | `'en'` or `'fr'` |
| `must_change_password` | TINYINT(1) DEFAULT 1 | set to `1` whenever you (re)set a password by hand, so the consultant is forced to pick their own on next login |
| `active` | TINYINT(1) DEFAULT 1 | soft-disable a consultant without deleting their history |
| `created_at` | TIMESTAMP | |

### `clients` — reference table, fully admin-managed
| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `name` | VARCHAR(150) | |
| `active` | TINYINT(1) DEFAULT 1 | deactivating hides it from consultants' client picker but keeps history |
| `created_at` | TIMESTAMP | |

### `consultant_clients` — which client(s) each consultant may declare against
| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `user_id` | INT, FK → `users.id` (CASCADE) | |
| `client_id` | INT, FK → `clients.id` (CASCADE) | |

Unique on `(user_id, client_id)` — a consultant can be attached to a
client at most once. A consultant with **zero** rows here sees "no client
attached" on their dashboard and can't declare anything.

### `month_submissions` — the core approval unit
| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `user_id` | INT, FK → `users.id` (CASCADE) | |
| `client_id` | INT, FK → `clients.id` (CASCADE) | |
| `month` | CHAR(7) | **format `'YYYY-MM'`**, e.g. `'2026-07'` |
| `status` | ENUM('draft','pending','approved','rejected') | see lifecycle in §4 |
| `admin_comment` | VARCHAR(500) NULL | shown to the consultant, typically used on rejection |
| `notification_sent` | TINYINT(1) DEFAULT 0 | **don't touch this — see §6** |
| `created_at` | TIMESTAMP | |
| `submitted_at` | TIMESTAMP NULL | set when consultant submits |
| `reviewed_at` | TIMESTAMP NULL | set when admin approves/rejects |

Unique on `(user_id, month, client_id)` — one submission per
consultant+month+client combination, ever. This is why "reopening" a
month means resetting the existing row's status back to `draft`, not
creating a new row.

### `daily_entries` — the filled-in calendar values
| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `submission_id` | INT, FK → `month_submissions.id` (CASCADE) | |
| `work_date` | DATE | |
| `value` | DECIMAL(2,1) | **CHECK constrained to exactly `0.5`, `1.0`, `1.5`, or `2.0`** — half day / full day / late day / holiday double-day |

Unique on `(submission_id, work_date)`. Deleting a `month_submissions` row
cascades and deletes all its `daily_entries` automatically.

### `login_attempts` — read-only for the Admin Panel, informational
| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `username` | VARCHAR(50) | |
| `ip_address` | VARCHAR(45) | |
| `success` | TINYINT(1) | |
| `attempted_at` | TIMESTAMP | |

Written by the Consultant Dashboard's own login flow. A "recent failed
logins" view here could be a nice addition to the Admin Panel, but it's
not required — never write to this table from the Admin Panel.

### `sessions` — do not touch
Used internally by the Consultant Dashboard's `express-mysql-session`
store. The Admin Panel should have its own, completely separate session
mechanism (its own table if it also uses `express-mysql-session`, or
whatever session approach fits its stack) — never read, write, or share
rows in this table.

## 4. `month_submissions.status` lifecycle

```
draft ──(consultant clicks Submit)──> pending ──(admin approves)──> approved
  ^                                      │
  │                                      └──(admin rejects)──> rejected
  │
  └── admin can reset any of pending/approved/rejected back to draft
      to let the consultant edit and resubmit
```

- **draft**: editable by the consultant in their calendar UI. Either
  freshly started, or reset by an admin for corrections.
- **pending**: locked from consultant edits, awaiting your decision. This
  is the Admin Panel's main queue.
- **approved** / **rejected**: locked, decision made. `admin_comment` is
  shown to the consultant (most useful on rejection, to explain why).

**Approving/rejecting** is just:
```sql
UPDATE month_submissions SET status = 'approved', reviewed_at = NOW() WHERE id = ?;
UPDATE month_submissions SET status = 'rejected', admin_comment = ?, reviewed_at = NOW() WHERE id = ?;
```

**Reopening** a locked month:
```sql
UPDATE month_submissions
   SET status = 'draft', submitted_at = NULL, reviewed_at = NULL, admin_comment = NULL
 WHERE id = ?;
```

## 5. Password hashing — must stay bcrypt-compatible

The Consultant Dashboard hashes passwords with **`bcryptjs`** (pure-JS
bcrypt, cost factor 12) — see `controllers/authController.js` and
`scripts/hash-password.js`. Whatever the Admin Panel uses to create/reset
consultant passwords **must produce a standard bcrypt hash** (`$2a$` or
`$2b$` prefix) at the same or higher cost factor, since the Consultant
Dashboard is what actually verifies it on login.

- If the Admin Panel is also Node.js: use `bcryptjs` (or native `bcrypt`)
  directly, cost 12, and everything just works.
- If it's a different stack: use that language's standard bcrypt library.
  Do **not** invent a different hashing scheme — the Consultant Dashboard
  has no way to verify anything but bcrypt.
- Whenever the Admin Panel sets a password (new account or reset), also
  set `must_change_password = 1` so the consultant is forced to pick
  their own on next login — this is a deliberate security property of the
  existing app, not incidental.

## 6. Notifications — you don't need to send any email yourself

The Consultant Dashboard runs a background job (`node-cron`, every 5
minutes, in `services/notificationPoller.js`) that:
1. Finds `month_submissions` where `status IN ('approved','rejected')` AND
   `notification_sent = 0`.
2. Emails the consultant the decision (+ `admin_comment` if rejected).
3. Sets `notification_sent = 1`.

**This means the Admin Panel does not need to send any emails at all** —
just update `status`/`admin_comment`/`reviewed_at` as shown above, and
leave `notification_sent` alone (it defaults to `0`, which is correct).
The existing poller picks up the change automatically, **as long as the
Consultant Dashboard's Node process keeps running** (it's the same
process serving consultant traffic, so this is already guaranteed
whenever that app is up).

There's a mirror-image job for new submissions: when a consultant
submits, the Consultant Dashboard itself emails you (`ADMIN_NOTIFICATION_EMAIL`
env var) immediately — no polling involved there, so nothing for the
Admin Panel to do on that side either.

## 7. Avatars — shared static files, not shared code

Consultant avatars are uploaded through the Consultant Dashboard's own
profile page (`multer`, validated to JPEG/PNG/WebP, 2MB max) and stored at
`public/uploads/avatars/<userId>-<random>.<ext>` **within that app's own
filesystem**, served statically at
`https://consultants.handsight-solutions.com/uploads/avatars/...`.

`users.avatar_path` stores the path (e.g.
`/uploads/avatars/3-a1b2c3d4e5f6.jpg`), **relative to the Consultant
Dashboard's own domain**, not the Admin Panel's. If the Admin Panel wants
to display a consultant's avatar, either:
- Prefix it with the Consultant Dashboard's full origin
  (`https://consultants.handsight-solutions.com` + `avatar_path`), or
- Don't bother — showing initials-based avatars (first + last name
  initial) in the Admin Panel is a perfectly reasonable simplification,
  and is exactly what the Consultant Dashboard itself falls back to when
  `avatar_path` is `NULL`.

The Admin Panel should **not** attempt to write to that same uploads
folder (different app, different filesystem on Hostinger) — if it needs
its own file uploads for something, use its own separate directory.

## 8. What the Admin Panel actually needs to build

Minimum functional scope, currently
covers by hand:

- **Auth for you (the admin)** — its own login, completely independent of
  the Consultant Dashboard's session/auth. This is a new concern the
  Admin Panel owns entirely; nothing to reuse here except "hash passwords
  with bcrypt" (§5).
- **Consultants**
  - List, with active/inactive filter
  - Create (username, first/last name, email, daily rate, temp password →
    forces `must_change_password = 1`)
  - Edit (name, email, daily rate, active flag, force password reset)
  - View a consultant's attached clients and submission history
- **Clients**
  - List, create, edit name, toggle active
- **Consultant ↔ Client attachments**
  - Attach/detach clients per consultant (simple many-to-many manager)
- **Approval queue** (the main workflow)
  - List `month_submissions` where `status = 'pending'`, with consultant
    name, client, month, and `SUM(daily_entries.value)` /
    `SUM(value) * users.daily_rate` for total days/earnings (see query
    below)
  - Approve / reject (with optional comment) from this list
  - Reopen an already-decided month back to `draft`
- **History / reporting** (nice-to-have, not blocking)
  - All submissions across all consultants, filterable by
    month/client/status
  - Recent `login_attempts`, especially failures

Suggested query for the approval queue
```sql
SELECT ms.id, CONCAT(u.first_name, ' ', u.last_name) AS consultant,
       c.name AS client, ms.month, ms.status,
       COALESCE(SUM(de.value), 0) AS total_days,
       COALESCE(SUM(de.value), 0) * u.daily_rate AS total_earnings_mad,
       ms.submitted_at
  FROM month_submissions ms
  JOIN users u ON u.id = ms.user_id
  JOIN clients c ON c.id = ms.client_id
  LEFT JOIN daily_entries de ON de.submission_id = ms.id
 WHERE ms.status = 'pending'
 GROUP BY ms.id
 ORDER BY ms.submitted_at ASC;
```

## 9. Validation rules to enforce at the app level too

The database enforces some of this, but the Admin Panel's UI/forms should
validate before hitting the DB, for a decent error experience:

- `month` must match `YYYY-MM`.
- A `daily_entries.value` (if the Admin Panel ever edits individual days,
  which isn't required — editing is really the consultant's job via
  "reopen to draft") must be one of `0.5`, `1`, `1.5`, `2` — enforced by a
  CHECK constraint, but a raw DB error is an ugly thing to surface to a
  user.
- `daily_rate` should be a non-negative decimal.
- Username: whatever uniqueness/format rules you want — the DB only
  enforces uniqueness, not format.
- Don't allow attaching the same client to the same consultant twice
  (`consultant_clients` unique constraint will reject it, but again,
  check first for a clean error message).

## 10. Security expectations for the Admin Panel itself

This app has **more** access and **more** blast radius than the
Consultant Dashboard (it can create accounts, set anyone's password,
approve payouts-worth-of-days). Treat it accordingly — at minimum:

- Bcrypt-hashed admin password(s), same standard as §5.
- Server-side sessions, `httpOnly` + `secure` + `sameSite` cookies.
- CSRF protection on every state-changing form.
- Parameterized queries everywhere — no string-built SQL.
- Rate-limit / lock out the admin login itself.
- Consider IP-restricting access to the Admin Panel's subdomain
  altogether (Hostinger hPanel or `.htaccess`-level, outside the app),
  since this one truly should only ever be used by you.
- If it's Node/Express, `helmet` with a strict CSP (no `unsafe-inline`,
  no wildcard `object-src`) — the Consultant Dashboard's `server.js` is a
  working reference for this exact setup.

Finnaly : 

all what is mention appove is just one section of all the application . wish will be called consultants managmenet.

the admin pannel will later do other things like facturation, tresore de societe, dashboard of earning and spending and etc. 

But please for the moment focus on Consultants Managmenet.

if you want to see the application of consultants dashboard here is the repo : C:\Users\admin\Desktop\HANDSIGHT\'Consultant Dashboard'
# Handoff: per-(consultant, client) TJM, and the removal of `users.daily_rate`

This is for whoever (or whichever Claude Code session) next works on the
**Consultant Dashboard** repo (`Consultant Dashboard/`, not this one).

**Update / escalation:** this started as an additive change (new TJM
columns, `users.daily_rate` kept as a fallback). The user has since decided
to **drop `users.daily_rate` from the database entirely** — it will stop
existing, not just stop being the primary source. The Admin Panel side has
already been fully updated to not reference it anywhere. **This repo (the
Consultant Dashboard) has NOT been updated yet, and it still reads
`users.daily_rate` directly in several places — once that column is
dropped, this app WILL throw SQL errors ("Unknown column 'daily_rate'")
wherever it does.** This is no longer a "nice to have later" — it needs to
happen before (or in lockstep with) the column actually being dropped.
Confirm with the user whether the column has already been dropped or not
before you start; if it has, expect broken pages until this is fixed.

## What changed, and why

`users.daily_rate` used to be the single flat rate for a consultant,
applied everywhere. That was wrong: Handsight sits between the client and
the consultant, so a consultant can be paid a different rate per client —
and there are actually **two** rates per (consultant, client) pairing:
what Handsight pays the consultant (cost) and what Handsight bills the
client (revenue). The gap is Handsight's margin.

Two new nullable columns exist now (migration already run against the
shared database — nothing for this repo to do schema-wise):

- **`consultant_clients.consultant_tjm`** / **`consultant_clients.client_tjm`**
  — the *current* rates for a pairing. The Admin Panel has a UI (on a
  consultant's detail page) where the admin sets/updates these.
- **`month_submissions.consultant_tjm`** / **`month_submissions.client_tjm`**
  — a **frozen snapshot** of both rates, meant to be set once, at the
  moment a submission is created, and never touched again. This is so a
  rate renegotiated later doesn't silently rewrite a past month's
  payout/billing figures — important for anything that feeds invoices or
  payroll.

## Required changes in this repo

### 1. Populate the snapshot when a submission is created

Wherever this app creates a new `month_submissions` row — currently
`models/monthSubmissionModel.js`:

```js
async function create({ userId, clientId, month }) {
  const [result] = await pool.query(
    `INSERT INTO month_submissions (user_id, client_id, month, status)
     VALUES (?, ?, ?, 'draft')`,
    [userId, clientId, month]
  );
  return result.insertId;
}
```

— it needs to look up the current `consultant_clients.consultant_tjm` /
`client_tjm` for that `(userId, clientId)` pair and copy them into the
new row at creation time:

```js
async function create({ userId, clientId, month }) {
  const [[rates]] = await pool.query(
    'SELECT consultant_tjm, client_tjm FROM consultant_clients WHERE user_id = ? AND client_id = ?',
    [userId, clientId]
  );

  const [result] = await pool.query(
    `INSERT INTO month_submissions (user_id, client_id, month, status, consultant_tjm, client_tjm)
     VALUES (?, ?, ?, 'draft', ?, ?)`,
    [userId, clientId, month, rates ? rates.consultant_tjm : null, rates ? rates.client_tjm : null]
  );
  return result.insertId;
}
```

If the admin hasn't set rates yet for that pairing, both snapshot columns
just land `NULL` — treat that as "unknown," not an error (same convention
the Admin Panel uses: `COALESCE(consultant_tjm, 0)`).

### 2. Remove every remaining read of `users.daily_rate`

Once the column is dropped, any query selecting or referencing
`daily_rate` on `users` will error. Search this repo for `daily_rate` and
`dailyRate` and fix each site to use the submission's own `consultant_tjm`
instead (falling back to `0`/"not set" if it's `NULL`, not to
`users.daily_rate` — that column won't exist to fall back to). Known
locations as of this handoff (grep to confirm you got all of them, this
list may not be exhaustive):
- `views/calendar.ejs` — the live "estimated earnings" total while filling
  in a month.
- Dashboard stats / yearly summary controllers/views that compute
  earnings from `dailyRate`.
- `models/userModel.js` and any controller that reads/writes
  `users.daily_rate` directly (account creation/edit, if this app has its
  own admin-ish paths — check `controllers/authController.js` and
  wherever a user's own profile is rendered).

### 3. Schema

No migration needed on this side — the Admin Panel owns `sql/schema.sql`
and already added the TJM columns. The actual `DROP COLUMN daily_rate`
statement is commented out there, to be run manually once both apps no
longer reference it. Coordinate with whoever runs that.

That's the full scope. Once both changes above are in, this repo has no
remaining dependency on `users.daily_rate` and the column can be safely
dropped.

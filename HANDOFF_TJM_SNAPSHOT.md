# Handoff: per-(consultant, client) TJM, and the removal of `users.daily_rate`

This is for whoever (or whichever Claude Code session) next works on the
**Consultant Dashboard** repo (`Consultant Dashboard/`, not this one).

**Bottom line up front: `users.daily_rate` is being deleted from the
database, full stop — do not design around keeping it, even temporarily.**
(For context only, in case you see an older version of this doc or old
commit messages: the very first draft of this plan proposed keeping
`daily_rate` around as a permanent fallback. That plan was abandoned before
any of this shipped — ignore it if you encounter it anywhere. The only
correct target state is: `daily_rate` gone, `consultant_tjm` used
everywhere instead.)

The Admin Panel side has already been fully updated to not reference
`daily_rate` anywhere. **This repo (the Consultant Dashboard) has NOT been
updated yet, and it still reads `users.daily_rate` directly in several
places — once that column is dropped, this app WILL throw SQL errors
("Unknown column 'daily_rate'") wherever it does.** This needs to happen
before (or in lockstep with) the column actually being dropped. Confirm
with the user whether the column has already been dropped before you
start; if it has, expect broken pages until this is fixed.

## Critical: the consultant must never see `client_tjm`

`client_tjm` is what Handsight bills the **client** — it is not the
consultant's business, and showing it (directly, in a total, or in any
derived number the consultant could reverse-engineer) would reveal
Handsight's margin to them. This app is **consultant-facing only**, so:

- Never `SELECT client_tjm` (or `consultant_clients.client_tjm`) into any
  query that backs a page or API response this app renders for the
  logged-in consultant.
- Never compute anything from `client_tjm` (billed total, margin, etc.) on
  the consultant's side, not even server-side-only if there's any chance
  it leaks into a template, log, or response the consultant's browser
  receives.
- Every earnings/payout figure this app shows the consultant — the live
  calendar total, dashboard stats, yearly summary — must be computed from
  **`consultant_tjm` only**. That's the consultant's own pay rate; it's
  the only one of the two rates this app has any business touching.
- `client_tjm` is exclusively an Admin Panel concern (it's the one that
  shows billed/margin figures, and only to the admin).

If you're ever unsure whether a piece of code in this repo needs
`client_tjm` for anything: it doesn't. Delete it if you find it.

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
  / **`consultant_clients.extra_fee_percent`**
  — the *current* rates (and optional extra fee percentage — a cost
  Handsight itself pays out on top of `consultant_tjm`, not something
  charged to the client or consultant) for a pairing. The Admin Panel has
  a UI (on a consultant's detail page) where the admin sets/updates these.
- **`month_submissions.consultant_tjm`** / **`month_submissions.client_tjm`**
  / **`month_submissions.extra_fee_percent`**
  — a **frozen snapshot** of all three, meant to be set once, at the
  moment a submission is created, and never touched again. This is so a
  rate (or fee percentage) changed later doesn't silently rewrite a past
  month's payout/billing/margin figures — important for anything that
  feeds invoices or payroll.

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
`client_tjm` / `extra_fee_percent` for that `(userId, clientId)` pair and
copy them into the new row at creation time:

```js
async function create({ userId, clientId, month }) {
  const [[rates]] = await pool.query(
    'SELECT consultant_tjm, client_tjm, extra_fee_percent FROM consultant_clients WHERE user_id = ? AND client_id = ?',
    [userId, clientId]
  );

  const [result] = await pool.query(
    `INSERT INTO month_submissions (user_id, client_id, month, status, consultant_tjm, client_tjm, extra_fee_percent)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
    [userId, clientId, month, rates ? rates.consultant_tjm : null, rates ? rates.client_tjm : null, rates ? rates.extra_fee_percent : 0]
  );
  return result.insertId;
}
```

If the admin hasn't set rates yet for that pairing, both snapshot rate
columns just land `NULL` — treat that as "unknown," not an error (same
convention the Admin Panel uses: `COALESCE(consultant_tjm, 0)`).
`extra_fee_percent` defaults to `0` (no extra fee) the same way.

Note this is the one place in this repo that's expected to touch
`client_tjm` at all — it's a pure storage operation (copying it onto the
row so the *Admin Panel* can read it later), not something rendered back
to the consultant. Don't extend this pattern anywhere else; see the
critical note above. `extra_fee_percent` is a newer, separate column
(added after this doc was first written) — it's a cost Handsight itself
absorbs (paid out to the consultant on top of `consultant_tjm`), not
something charged to the client or consultant, and it's not as sensitive
as `client_tjm` on its own (it's just a percentage, not a rate). But it
exists purely to feed the Admin Panel's margin math, so the same rule
applies: copy it into the snapshot on create(), never read or display it
anywhere in this app's own consultant-facing pages.

### 2. Remove every remaining read of `users.daily_rate`

`daily_rate` is being fully removed, not just deprioritized — the column
is going away. Search this repo for `daily_rate` and `dailyRate` and
replace every one of them with the submission's own **`consultant_tjm`**
— never `client_tjm` (see the critical note above) — falling back to
`0`/"not set" if it's `NULL`, not to `users.daily_rate` (that column won't
exist to fall back to). Known
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

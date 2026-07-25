# Handoff: per-(consultant, client) TJM snapshot for the Consultant Dashboard

This is for whoever (or whichever Claude Code session) next works on the
**Consultant Dashboard** repo (`Consultant Dashboard/`, not this one). The
Admin Panel side of this change is already done; this document is the only
thing left to make the whole system consistent.

## What changed, and why

`users.daily_rate` used to be the single flat rate for a consultant,
applied everywhere. That was wrong: Handsight sits between the client and
the consultant, so a consultant can be paid a different rate per client —
and there are actually **two** rates per (consultant, client) pairing:
what Handsight pays the consultant (cost) and what Handsight bills the
client (revenue). The gap is Handsight's margin.

Two new nullable columns were added (migration already run against the
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

`users.daily_rate` still exists and is untouched — it's the fallback the
Admin Panel's queries use (`COALESCE(ms.consultant_tjm, u.daily_rate)`)
for any submission that doesn't have its own snapshot yet, which right
now is *every* submission this app creates, since it doesn't populate
these columns.

## The one required change

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
new row at creation time. Something like:

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

If `consultant_clients` doesn't have rates set yet for that pairing (the
admin hasn't gotten to it), both snapshot columns just land `NULL` — that's
fine, the Admin Panel's queries already fall back to `users.daily_rate` for
`consultant_tjm` when it's null, and treat `client_tjm` as unbilled (0)
until it's set.

That's the only required change. Everything else keeps working exactly as
it does today.

## Recommended follow-up (not required immediately)

This app's own earnings-estimate displays currently read `users.daily_rate`
directly:
- `views/calendar.ejs` (the live "estimated earnings" total while filling
  in a month)
- Dashboard stats / yearly summary (wherever `dailyRate` is passed in from
  `utils/dateHelpers.js`-adjacent controller code)

Once the `create()` change above ships, new submissions will have a real
`consultant_tjm` snapshot. It'd be worth switching those displays to read
the relevant submission's `consultant_tjm` (falling back to
`users.daily_rate` for older submissions that predate this change, same
pattern as the Admin Panel), so a consultant's own earnings estimate
matches what the Admin Panel shows for the exact same submission. Not
urgent — the flat-rate estimate just becomes slightly less accurate for
consultants who work multiple clients at different rates until this is
done.

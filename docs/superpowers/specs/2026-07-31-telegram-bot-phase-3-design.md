# Phase 3 Implementation Design: It Comes To You

**Date:** 2026-07-31
**Status:** Approved, not implemented.
**Covers:** [SPEC.md](../../../SPEC.md) §10 Phase 3: FR-21, FR-22, FR-23, FR-24, and the two
carry-forwards both earlier designs assign here.
**Does not cover:** Phase 4. Section 9 below lists exactly what is deferred.

SPEC.md is the source of truth for *what* and *why*. This document is *how*, and it records the
decisions SPEC.md leaves open. Where the two disagree, SPEC.md wins and this document is wrong.

It continues [the Phase 1 design](2026-07-30-telegram-bot-phase-1-design.md) and
[the Phase 2 design](2026-07-31-telegram-bot-phase-2-design.md), whose architecture, stack and
conventions carry over unchanged and are not restated. Code comments cite this document as
"phase 3 design N.N", to distinguish it from the Phase 1 document (cited as "design 4.x") and the
Phase 2 document (cited as "phase 2 design N.N").

---

## 1. Scope

In: a daily reminder at each user's chosen hour, sent only to people who have not logged that day;
an auto-stop after five consecutive ignores followed by exactly one message asking whether to
continue; 403 handling; and a `/remind` command that turns reminders off and back on and changes
the hour.

Also in, because both earlier designs assign them to this phase:

- `reminder_asked`, so that "never asked" and "asked and declined" stop being the same stored value.
- The "change it any time with /remind" sentence Phase 1 deliberately cut from the registration
  copy, because the command it named did not exist yet.

Requirements covered: FR-21, FR-22, FR-23, FR-24, and the completion of FR-4.

The acceptance target is SPEC.md §10's own: **a reminder arrives at the chosen hour, does not
arrive after logging, and stops after five ignores.**

### 1.1 The precondition this phase still does not satisfy

SPEC.md §10 says not to start a phase before the previous one works end to end. Neither the Phase 1
smoke run (two people, two phones) nor the Phase 2 smoke run (a live test group) has happened.
Phase 2 was authorised against the same gap, knowingly, and Phase 3 is authorised the same way
after confirming the checklist cannot be automated: `docs/SMOKE.md` requires two real Telegram
accounts tapping inline buttons, and two of its steps require an overnight wait. A bot cannot tap
its own buttons, and driving the flow would need an MTProto *user* client logged in with a real
phone number, which is a new test harness rather than a Phase 3 task.

The consequence is sharper here than in Phase 2. Phase 2's failure mode was wrong numbers in front
of several hundred people, which is recoverable. **This phase's failure mode is not: SPEC.md §3.2
records that a user who blocks the bot is permanently unreachable, so a reminder defect converts
into permanent lost reach, per user, with no path back.** The smoke runs remain the gate on real
use of any phase.

---

## 2. Data

Migration `003`. `ignored_streak` and `blocked` already exist in `001_initial.sql`, declared in
Phase 1 against SPEC.md §6 and never written by anything, so this phase adds two columns rather
than four.

```sql
ALTER TABLE users
  ADD COLUMN reminder_asked   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN last_reminded_at TIMESTAMPTZ;

UPDATE users SET reminder_asked = TRUE WHERE reminder_hour IS NOT NULL;
```

### 2.1 The backfill is deliberately narrow

Anyone holding an hour demonstrably answered the question, so they are marked asked. A NULL hour is
still ambiguous: it is both "declined" and "never got that far". Those users are left unasked and
will see the question once more, which is exactly what the code does today rather than a
regression. The alternative, marking everyone asked, would silently convert "never asked" into
"declined" for anyone the ambiguity actually applies to, which is the failure FR-4 forbids.

### 2.2 `last_reminded_at` is a timestamp because it does two jobs

- **Once per day.** `(last_reminded_at AT TIME ZONE 'Europe/Helsinki')::date < today` is the gate
  that stops a 60-second tick from sending the same reminder sixty times inside one hour. It is the
  per-user analogue of `chats.last_monday_week`, and like it, it is a database column rather than
  process memory so that a restart mid-hour cannot re-send (NFR-5).
- **Did they answer.** `days.logged_at > last_reminded_at` is "did this person write anything since
  the last time we pinged them", which is the definition of "no response" FR-22 needs. A NULL
  `last_reminded_at` means nothing has been sent yet, so `responded` is false and `ignored_streak`
  is 0: the two agree, and the first send takes the ordinary path.

A `DATE` column would serve the first job and not the second. Two columns would serve both and
would then need keeping consistent with each other for no gain.

The conversion to a local date happens in SQL, in `Europe/Helsinki`, per design 4.2. Nothing about
this column is computed with JavaScript date arithmetic.

### 2.3 No index, on purpose

The due query scans `users` once a minute. The table is a few hundred rows for the whole
competition, so the scan is microseconds and a partial index on `reminder_hour` would add write
maintenance and a schema object to justify later. Recorded because "add an index to the column the
scheduler filters on" is the reflex, and at this size it is wrong.

---

## 3. The rules

Split deliberately: the SQL decides **who is a candidate**, and a pure function decides **what to
send them**. The split is not stylistic. FR-22's five-consecutive-ignores rule is the one rule in
this project that cannot be verified in a smoke session, because verifying it takes five days, so
it must not live in a file that `docs/SMOKE.md` is the only acceptance basis for.

### 3.1 Who is a candidate (SQL, `db/reminders.ts`)

A user is due when all of these hold:

| Condition | Requirement |
|---|---|
| `reminder_hour IS NOT NULL` | FR-4, FR-24. NULL is off, and off means off |
| `NOT blocked` | FR-23 |
| `ignored_streak <= 5` | FR-22. 6 means the follow-up has been sent and the user is paused |
| No `days` row for today | FR-21. "only to users who have not yet recorded that day" |
| `last_reminded_at` is NULL, or its local date is before today | 2.2. At most one send per user per day |
| local hour is in `[reminder_hour, reminder_hour + 2)` | 4.1, the grace window |

Ordered `last_reminded_at NULLS FIRST, telegram_id`, and limited (4.2). The ordering puts
longest-waiting first and carries the unique tiebreaker every ranking query in this project
requires; without one, Postgres may return a different page across calls, which under a `LIMIT`
means a user can be starved rather than merely reordered.

The window cannot wrap past midnight by construction. `localHour` is 0 to 23, so `reminder_hour`
23 yields a window of `{23}` and 22 yields `{22, 23}`. `REMINDER_HOURS` only offers 17, 18, 20 and
21 today, but the column and the callback decoder both accept 0 to 23, so the property is stated
here rather than assumed from the keyboard.

### 3.2 What to send (pure, `domain/reminders.ts`)

Given `ignoredStreak` and `responded`, where `effective = responded ? 0 : ignoredStreak`:

| effective | action | new `ignored_streak` |
|---|---|---|
| 0 to 4 | the daily check-in message | effective + 1 |
| 5 | the follow-up, once | 6 |
| 6 | not reachable: 3.1 excludes it | unchanged |

Five reminders sent and ignored leaves the streak at 5. The next due moment therefore sends the
follow-up instead of a sixth daily, and moves to 6, which 3.1 excludes forever after. That is
FR-22's acceptance test read literally: *the sixth consecutive daily reminder is never sent, and
exactly one follow-up is sent.*

### 3.3 Ruling: a paused user does not resume by logging

`responded` clears the streak only while the follow-up has not yet been sent. Once `ignored_streak`
is 6, only an explicit action clears it: tapping "Keep them" on the follow-up, or `/remind`.

FR-22 says an ignored follow-up leaves reminders paused. Logging is engagement with the
competition, not consent to be messaged, and the two are different questions: the follow-up asked
the second one and got no answer. Resuming on a log would re-message someone who was asked and did
not say yes, which is the exact path SPEC.md §11 rates High severity because it ends in a block and
a permanently unreachable user.

This is why 3.1 excludes `ignored_streak > 5` in SQL rather than letting the pure function see a 6
and return "none": the paused state is an absence of candidacy, not an action.

### 3.4 Ruling: choosing an hour that has already passed does not fire minutes later

Someone who picks 20:00 at 21:00, whether at registration or through `/remind`, is inside that
hour's grace window and would otherwise receive a check-in message seconds after asking for one at
20:00. `setReminderHour` therefore stamps `last_reminded_at = now()` when the chosen hour is at or
before the current local hour, so the first reminder arrives the following day.

The comparison is made in the same statement, in `Europe/Helsinki`, so no caller has to supply a
clock. Picking 20:00 at 10:00 is unaffected and still fires the same evening.

**`setReminderHour` also resets `ignored_streak` to 0, on both branches.** Setting an hour is the
explicit consent 3.3 requires, so it is what lifts a pause; without the reset, a paused user who
used `/remind` to ask for reminders back would be excluded by 3.1 and would silently receive
nothing. Turning reminders off resets it too, so that switching them back on later starts a fresh
count rather than resuming three ignores into an old one.

### 3.5 Ruling: `blocked` clears when the user comes back

FR-23 says a 403 must permanently stop sends and that a blocked user is never retried. Taken
literally that is a one-way door, and Telegram makes the door two-way: a user who unblocks can
message the bot, and **an incoming update is proof that Telegram is no longer refusing us**, since
a blocked user physically cannot produce one.

So `blocked` is cleared by any private-chat update from that user. FR-23's intent holds exactly: no
send is ever retried *into* a block. What is avoided is a single transient 403 removing someone
from the competition's only re-engagement mechanism for the rest of the season, in a system whose
entire risk register says reachability is the scarce resource.

`blocked` gates **unsolicited sends only**: the daily reminder and the follow-up. It does not gate
a reply to a message the user just sent, which cannot 403 anyway because sending it required them
to be unblocked. And it continues to gate nothing in scoring: the invariant that no `NOT u.blocked`
clause exists in `standings.ts` becomes load-bearing for the first time in this phase, because this
is the phase that first writes the column (see 7.2).

---

## 4. Decisions SPEC.md leaves open

### 4.1 A missed reminder catches up for two hours, then is dropped

The ticker can miss a user's hour: a deploy, a short outage, a slow tick. Three options were
considered.

- **Exact hour only.** A ten-minute deploy at 20:05 silently costs every 20:00 user their day.
- **Late rather than never, any time the same day.** This is what the Monday post does (phase 2
  design 4.4), and it is wrong here. A 17:00 user pinged at 23:50 is the annoyance case that ends
  in a block.
- **Chosen: a two-hour grace window.** A 20:00 reminder missed at 20:00 still goes out up to 21:59,
  and after that the day is skipped in silence. Survives a deploy or a short outage; the worst
  arrival for the latest offered hour (21:00) is 22:59.

The Monday post and the daily reminder resolve the same tension in opposite directions on purpose.
A guild chat missing its weekly post loses a scheduled event that a whole guild notices; one person
missing one evening's nudge loses one day of one habit. The costs of arriving late are not
comparable either: nobody blocks a group chat.

### 4.2 Burst control is a per-tick cap, not a throttler

SPEC.md §3.6 puts the default broadcast limit at 30 messages per second. A popular hour could make
the pass send several hundred messages at once.

Chosen: **at most 25 users per tick**, with the rest rolling to the next minute. Inside the
two-hour grace window that is 3,000 sends of capacity against a few hundred users, and it paces at
25 per *minute*, two orders of magnitude under the limit.

Rejected: `@grammyjs/transformer-throttler`. It is a dependency and a queue with its own lifecycle
for a problem the existing 60-second loop already solves by doing less each time it runs. Rejected:
a `sleep` between sends, which holds the tick open across the interval and interacts badly with the
`running` guard in `startTicker`.

The cap is a constant beside the tick interval, not configuration. Nothing about it needs to differ
between machines.

### 4.3 The reminder is the check-in message, rendered once

FR-21 says the reminder MUST send the check-in message, not a message resembling it. Today
`sendCheckIn` builds the text and keyboard inline and replies through a `ctx`, which the reminder
pass does not have: it has `bot.api` and a chat id.

`checkin.ts` therefore exports a pure `checkInMessage(today, yesterday)` returning the text and the
keyboard, and both callers render through it. The extraction is small and it is what makes FR-21's
"the same message" a structural fact rather than two copies that agree today.

The pass computes the calendar once per tick and passes the dates in, rather than each user's
render issuing its own `calendar()` query.

### 4.4 `/remind` gets its own callback kind

The registration flow's `hour` callback confirms with copy that carries the 150 minute target and
the privacy notice, because that is the moment SPEC.md §6 requires the notice. `/remind` must not
repeat either. Reusing the same callback kind would mean one handler guessing which message it is
editing, which it cannot know.

So: `{ kind: "remind"; hour: number | null }` for setting the hour or turning reminders off, and
`{ kind: "keep" }` for the follow-up's resume button. The existing `hour` kind is untouched and
stays owned by `registration.ts`. Longest new payload is `remind:20` at 9 bytes, well inside
Telegram's 64.

### 4.5 The pass rides the existing ticker

Phase 2 design 4.1 already rejected a second interval, and the reasoning is unchanged: one loop has
one lifecycle to stop cleanly and one place the calendar is read. The reminder pass is a third
question asked by the same tick.

**Placement inside `tick()` is load-bearing, and gets it wrong in two different ways.** It goes
after the `if (!inWindow && !previousWeekInCompetition(...)) return` gate, and *outside* the
`if (refreshPins)` branch:

- Nested under `refreshPins`, reminders would only ever be considered every 15 minutes, so a
  reminder would land on a quarter-hour lattice and a user whose grace window opened at 20:01 could
  wait until 20:15.
- Hoisted above the window gate, reminders would keep arriving for a week after the competition
  ended, asking people to log days that FR-26 refuses to store.

### 4.6 `reminder_asked` replaces a Phase 1 workaround

`registration.ts` currently re-offers the reminder keyboard to anyone whose `reminder_hour` is
NULL, with a comment in two places saying Phase 3 should add a column and delete the hack. This
phase deletes it. `reminder_asked` is set on either answer, and the keyboard is offered when
`reminder_asked` is false rather than when the hour is unset, so a decliner is not asked again on
every `/start`.

---

## 5. Architecture delta

```
config.ts -> domain/ (pure) -> db/ (SQL) -> bot/handlers -> bot/render.ts (pure)
```

Unchanged. Three new files, one per layer:

| File | Layer | Tested |
|---|---|---|
| `src/domain/reminders.ts` | pure: the 3.2 action table, the 4.1 grace window | unit |
| `src/db/reminders.ts` | SQL: `dueReminders`, `recordReminder`, `resumeReminders`, `setBlocked`, `clearBlocked` | DB |
| `src/bot/reminders.ts` | Telegram: `/remind`, its callbacks, `sendDueReminders` | `docs/SMOKE.md` |

Changed files:

- `src/db/migrations/003_reminders.sql`: new.
- `src/db/users.ts`: `reminderAsked` on `UserRow`; `setReminderHour` gains the 3.4 stamp, the
  `ignored_streak` reset, and sets `reminder_asked`.
- `src/bot/registration.ts`: `reminderKeyboardIfUnset` becomes a `reminder_asked` test (4.6).
- `src/bot/checkin.ts`: extract `checkInMessage` (4.3).
- `src/bot/callbacks.ts`: two new kinds (4.4).
- `src/bot/ticker.ts`: about six lines calling `sendDueReminders` (4.5).
- `src/bot/index.ts`: install the `/remind` handlers, and the `blocked`-clearing middleware (3.5).
- `src/strings.ts`: the new copy, and the restored sentence.
- `src/config.ts`: `REMINDER_GRACE_HOURS`, `FOLLOWUP_AFTER_IGNORES`, `MAX_REMINDERS_PER_TICK`.

### 5.1 Handler install order

`installReminders` registers a `callback_query:data` listener, so it joins the ordered chain in
`createBot`: group, registration, check-in, reports, reminders, then the catch-all that answers
unclaimed callbacks. It must stay before the catch-all. Its own command, `/remind`, is
private-chat only and returns without calling `next()` on any other chat type, matching `/me`.

The `blocked`-clearing middleware installs first, before any command handler, because it must see
every private-chat update regardless of which handler consumes it.

---

## 6. Failure handling

| Failure | Response |
|---|---|
| 403 from a reminder send | `blocked = TRUE` (FR-23). No further unsolicited send. Cleared per 3.5 |
| 429 from a reminder send | Stop this tick's sends. The next tick retries, still inside the grace window |
| Any other send error | Log it, skip that user, continue with the rest of the batch |
| `recordReminder` fails after a successful send | The user is re-sent on the next tick. Bounded by the grace window, and the same shape as the gap `main.ts` already documents for the Monday post. Accepted rather than solved: solving it means a transaction spanning a Telegram call |
| The bot is down at a user's hour | 4.1: caught up within two hours, dropped after |

Per-user isolation matches the per-chat isolation in the ticker: one user's failure must not
abandon the rest of the batch, and must not kill the interval.

---

## 7. Verification

### 7.1 New tests

`tests/domain/reminders.test.ts`, covering the whole of 3.2 without a database or a clock:

- five ignores produce five dailies, then exactly one follow-up, then nothing
- a response mid-chain resets, and the chain restarts from one
- a paused user (streak 6) stays paused through a log (3.3)
- the grace window includes the hour itself and the one after, and excludes the second one after
- `reminder_hour` 23 does not wrap into the next day (3.1)

`tests/db/reminders.test.ts`, covering 3.1's exclusions: logged today, blocked, already reminded
today, paused, outside the window, and the ordering and limit.

### 7.2 An existing invariant goes live

Three tests in `tests/db/standings.test.ts` guard against a `NOT u.blocked` clause and currently
pass trivially, because nothing writes `blocked`. FR-23 makes the column writable for the first
time. A test is added asserting that a user with `blocked = TRUE` still contributes minutes to
their guild's weekly and season totals, so the guard has a case that would actually fail.

### 7.3 The gap this phase cannot smoke test

**FR-22's five-day path is not reachable in a smoke session.** The unit tests in 7.1 cover the
logic. The smoke step verifies the wiring by setting `ignored_streak` to 5 directly in the database
and confirming the next due moment produces the follow-up rather than a sixth reminder.

That is an operator statement against messaging state, not a code path. NFR-4 forbids any code path
that writes points or activity data without a real user action, and this writes neither: no
`days` row, no minute, nothing that any total is derived from. No seed command, debug route or
simulation is added by this phase.

### 7.4 Smoke additions

A Phase 3 section in `docs/SMOKE.md`: a reminder arrives at the chosen hour; logging beforehand
suppresses it; `/remind` turns them off and the evening passes in silence; `/remind` turns them
back on at the previously chosen hour; blocking the bot sets `blocked` and stops sends; unblocking
and sending `/log` clears it; and the 7.3 follow-up check.

---

## 8. Size

`src/` is 1,547 effective lines. SPEC.md §5's bottom-up estimate budgets 180 for reminders, which
puts this phase at roughly 1,730 to 1,780 against the 2,000 ceiling of NFR-6.

That leaves about 220 lines for Phase 4, whose budget is 120 (tags and the nightly backup). Inside,
with no slack for anything unbudgeted. Counted with the command in `CLAUDE.md`, which runs 10 to 30
lines above the hand counts in the earlier ledgers.

---

## 9. Deferred

| Deferred | Phase | Note |
|---|---|---|
| Optional tag UI (FR-11) | 4 | `days.tag` exists, no UI |
| Nightly backup cron (NFR-3) | 4 | Manual dump and restore already ship |
| Per-user timezones | none | Rejected in design 4.1: one timezone for the whole competition |
| Free-text reminder hour | none | `REMINDER_HOURS` offers four. A typed hour is a parser and a validation message for a choice nobody has asked to make |
| Smart or personalised send times | none | SPEC.md §8's spirit: the user-chosen hour is the personalisation, and anything adaptive needs data this project does not store |

---

## 10. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| A reminder defect gets the bot blocked, which is permanent per user (SPEC.md §3.2) | 4.1's bounded grace window, 3.3's refusal to resume without consent, 3.4's no-instant-fire rule, and a visible `/remind` off switch |
| The five-ignore rule cannot be smoke tested and ships unverified | 3.2 is pure and unit tested end to end (7.1). The wiring is verified by the 7.3 operator step |
| Reminders keep arriving after the competition ends | 4.5's placement rule, inside the `inWindow` gate. Called out because the ticker's existing gate has two branches and only one is correct here |
| `NOT u.blocked` reappears in a scoring query, now that the column is finally written | 7.2 adds a test with a real failing case, replacing three that passed trivially |
| A popular hour bursts past Telegram's rate limit | 4.2's per-tick cap |
| Phases 1 and 2 remain unsmoked while a third phase lands on top | 1.1. Unchanged and now stated for the third time: the smoke runs gate real use, not code |

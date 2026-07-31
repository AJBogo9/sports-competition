# Phase 1 smoke checklist

Automated tests cover scoring, queries, callback encoding and rendering.
This is the part they cannot: two people, two phones, one real bot.

Run through it against a bot whose `COMPETITION_START` and `COMPETITION_END`
contain today. Nothing here is done until every box is ticked.

## Registration

- [ ] `t.me/<bot>?start=prodeko` on a fresh account registers to Prodeko in one
      tap and immediately asks the reminder question (FR-1, FR-4)
- [ ] The reminder question offers hours and a decline, and declining is
      accepted without nagging (FR-4)
- [ ] The message after choosing states the 150 minute target and says that
      your first name and activity are visible to others in your guild
- [ ] A bare `/start` on a second fresh account shows all nine guilds (FR-2)
- [ ] Tapping a guild in that list registers you (FR-2)
- [ ] Opening a *different* guild's link as an existing user offers Move and
      Stay, and Stay leaves the guild unchanged (FR-3)
- [ ] Move actually moves you, and your logged days come with you (FR-3)
- [ ] Double-tap a guild button quickly on a fresh account, and confirm you
      still end up able to answer the reminder question (registration is
      idempotent under a fast double-tap, not just under a slow retry)

## Check-in

- [ ] `/log` produces the check-in message at any time of day (FR-6)
- [ ] One tap logs, with no confirmation step, and the message edits in place
      into the confirmation (FR-5)
- [ ] The confirmation shows minutes this week against 150 with a bar (FR-12)
- [ ] Logging a second time the same day replaces rather than adds: log
      `15 to 30`, then `60+`, and confirm the week shows 75 more than before,
      not 97 (FR-7)
- [ ] Undo after that overwrite puts the week back exactly where it was before
      the second log (FR-9, design 4.5)
- [ ] Undo on a fresh log removes the day entirely (FR-9)
- [ ] `Not today` records a rest day, shows zero minutes added, and reads as
      permitted rather than as a failure (FR-8)
- [ ] `Log yesterday instead` writes to yesterday, and logging yesterday twice
      replaces rather than adds (FR-10, FR-7)
- [ ] Log yesterday via "Log yesterday instead", tap Undo, then tap
      "Log again", and confirm the prompt says "And yesterday?" rather than
      "Moved today?" before tapping a tier. Confirm the resulting entry lands
      on yesterday, not today
- [ ] Log a day, re-log the same day at a different tier, then tap Undo, and
      confirm the message says the entry was put back (not removed) and that
      the weekly total matches what it was before the second log
- [ ] Send `/log` on day N, leave the message untapped overnight, then on day
      N+1 tap a tier on it. Confirm the write lands on day N, the day the
      prompt named, and not on day N+1, the day you tapped. This step and the
      next pull in opposite directions on purpose: a tier button means "the
      date this prompt was for" and keeps its payload date, while "Log
      yesterday instead" means "the day before now" and must ignore its
      payload date entirely
- [ ] On that same day-old message from day N, tap "Log yesterday instead"
      and then a tier. Confirm it writes day N, which is yesterday relative to
      the tap, and not day N-1, the date baked into the button when the
      message was sent. This and the step above are the only checks here that
      require waiting a day; nothing same-session can catch a stale message
      writing to the wrong day
- [ ] Optional, costs a second day: keep a `/log` message from day N untapped
      until day N+2 and tap a tier. Its payload date is now neither today nor
      yesterday, so it must be refused with a message saying so, and nothing
      may be written. This is the only route to that refusal in normal use

## Reading

- [ ] `/me` shows weekly progress, the streak in weeks, and your guild's rank
      among guilds (FR-14)
- [ ] `/me` shows you as "you" with at most one person either side, and no
      global list of individuals appears anywhere in the bot (FR-15)
- [ ] `/standings` shows the weekly table first, then the season, both as
      minutes per member (FR-16)
- [ ] The command menu in a private chat offers `/log`, `/me` and `/standings`
- [ ] Send `/me` in a group chat that has the bot in it, and confirm the bot
      does not reply. This one protects other people's data, not just yours

## The numbers

- [ ] Hand-calculate one guild's weekly minutes from what the two test accounts
      logged, divide by that guild's member count in `src/config.ts`, and
      confirm `/standings` matches. This is SPEC.md §10's "done when" for
      Phase 1
- [ ] A guild with nobody registered still appears in the table, at zero

## The group chat (Phase 2)

`group.ts` and the Telegram calls in `ticker.ts` have no automated tests, by design: this section
is their entire acceptance basis, the same way the sections above are for the three Phase 1
handlers. Needs a bot token, a second, non-admin test account for the refusal checks, and up to
four disposable test groups. Keep `docker compose logs -f bot` open throughout: two steps below
can only be confirmed there.

- [ ] Open `t.me/<bot>?startgroup=prodeko` as an admin of a test group and pick the group.
      Telegram is expected to deliver `my_chat_member` (which posts the nine-guild picker) before
      the `/start prodeko` message (which posts the binding confirmation), so the picker may
      flash up and then be followed immediately by "This chat is now following Prodeko". This has
      never been checked against a real client: watch closely and record exactly which messages
      appeared and in what order, since the answer decides whether the picker needs suppressing
      on this path. Whichever order they arrive in, the chat must end up bound to Prodeko, naming
      the guild (FR-18)
- [ ] Add the bot to a second test group from the group's own Add Member screen, with no deep
      link. It offers the nine-guild picker instead (FR-18)
- [ ] Tap a guild in that picker as a **non-admin**. It must refuse, as a toast popup rather than
      a chat message, and change nothing: no binding is created. Then tap as an admin and confirm
      it binds. This protects every number the chat will ever show, so it is worth the second
      account
- [ ] Add the bot to a third test group with no deep link so the picker appears again, but bind
      the chat with `/start@<bot> athene` as an admin instead of tapping it. The picker message
      is now stale. Tap it and confirm the bot answers with a message naming Athene as the guild
      the chat currently follows and telling the admin to use Athene's link to change it, and
      that the binding is still Athene afterward, whichever guild the stale button named. A
      picker left over from the first step's race would sit in exactly this state, so this is the
      control for it
- [ ] Send `/start@<bot> inkubio` in the first group, still bound to Prodeko, as a non-admin. It
      must refuse, this time as a chat message rather than a toast, since a command is not a
      callback. As an admin it must rebind: the proof is the confirmation reply that comes back
      immediately, naming Inkubio ("This chat is now following Inkubio"). The pinned standings
      are **not** evidence either way: they render the same competition-wide nine-guild table in
      every chat, bound or not, to whichever guild, because the table is computed once per tick,
      not once per chat, and the renderer takes no guild at all. Do not wait for the pin to change
      after a rebind; it will not, and on a refresh where nothing else changed either, no Telegram
      call happens at all. The only other guild-specific proof anywhere in this phase is the
      following Monday post (below), which will name Inkubio, not Prodeko, as this chat's own
      guild. This is now the only rebinding path, so if it broke, every already-bound chat would
      be stranded
- [ ] Open question, not a pass or fail: have an admin turn on "Remain anonymous" in a test group,
      so their messages show as sent by GroupAnonymousBot, then try both binding paths while
      posting anonymously: an unclaimed `/start@<bot> <slug>` and a tap on a guild picker. Record
      what actually happens. Nothing in the code special-cases GroupAnonymousBot: the admin check
      calls `getChatMember` on whichever user sent the update, and on the picker-tap path that
      call happens before the callback is acknowledged, so if it throws, the expected failure
      mode is the tap spinning with no toast and no bind, not a clean refusal
- [ ] The command menu in the group offers `/standings` but not `/log` (FR-17)
- [ ] Within 15 minutes a standings message appears and is pinned. Confirm pinning it produced
      **no notification** for other members (FR-19)
- [ ] Log something from a phone, wait for the next refresh, and confirm the pinned message's
      number changes **without** the chat showing as unread or producing a notification. This is
      FR-19's actual acceptance test
- [ ] Remove the bot's pin permission, then add it to a fourth group. The first standings message
      appears within 15 minutes, but it will **not** carry the "make me admin" line yet, even
      though the pin attempt right after sending it already fails: the line is rendered from
      `pinFailed` as it stood *before* that attempt, which for a brand new chat starts out false.
      Confirm the line only appears on the refresh after that, up to 30 minutes after the bot
      joined, not 15. Then promote the bot: by the same mechanism, confirm the pin itself is
      restored within 15 minutes of promoting, and the line clears within 30 (two refreshes), not
      one
- [ ] Delete the bot's pinned standings message by hand (delete it, not unpin it), then log an
      activity from a test account so the rendered text actually changes. A refresh with nothing
      new to say is a no-op that never calls Telegram and so never discovers the message is gone,
      which is why the text needs to change first. The next refresh should discover the edit
      target is missing and forget it, and the refresh after that should send and pin a fresh
      message: confirm this completes within 30 minutes and that the log never repeats the same
      error on every refresh after
- [ ] Remove the bot from a group. Confirm it stops posting there, and that the other groups are
      unaffected
- [ ] `docker compose restart bot`, then confirm the pinned message still updates in place rather
      than a second message appearing (NFR-5)
- [ ] Across the whole session above, check the bot's logs for the line `tick skipped: previous
      tick is still running`. It must not appear. Its presence would mean a tick is routinely
      taking longer than 60 seconds, which the re-entrancy guard would otherwise hide completely

### The Monday post

The Monday post cannot be observed without waiting for a Monday. To test it now, bind a chat and
move its ledger back one week by hand:

```sql
UPDATE chats SET last_monday_week = last_monday_week - INTERVAL '7 days';
```

- [ ] Within a minute the bot posts a new message (not an edit) that notifies, names last week's
      winning guild with its minutes per member, gives this chat's own guild its placement and
      participation percentage, and says the week starts at zero (FR-20)
- [ ] Run the same `UPDATE` again and confirm exactly one further post appears, not two. Then
      restart the bot mid-week and confirm no post appears at all, which is the exactly-once
      ledger doing its job
- [ ] Confirm no Monday post fires for a chat bound this week, and none fires for the
      competition's first week

### The closing post

Phase 2 design 4.8. `COMPETITION_END` is a Sunday, so the final week's result falls due on the
Monday *after* the window closes. The pin refresh stops at the window and the Monday post runs one
week past it, which means the two gates have to be checked separately: a single relaxed gate would
pass the first step below and destroy the pinned standings while doing it.

This needs the competition window moved rather than the ledger, so it is its own short run.

**Three things about this setup will otherwise waste your time.**

1. **It is a rebuild, not a restart.** The Dockerfile does `COPY src ./src` and nothing bind-mounts
   `src` into the container, so `docker compose restart bot` runs the *old* dates. Every config
   change here needs `docker compose up -d --build`. A restart would show no change at all and
   read as the feature not working.
2. **`bun test` will go red while the dates are moved**, and that is expected.
   `tests/domain/scoring.test.ts` asserts that today falls inside the configured window (design
   4.6), which is exactly what you are about to make false. Do not try to fix it. It goes green
   again when you restore the real dates.
3. **The figures in the post will probably be zeros, and that is not a failure.** The post reports
   the week *before* the current one, and nothing you can log during a smoke session lands there:
   backdating stops at yesterday (FR-10) and nothing may write activity data without a real user
   action (NFR-4). Run this on a **Monday or Tuesday**, after a smoke session that logged during
   the previous week, and you get real numbers. On any other day you get a winner at 0.0, and the
   step still does its job: what is under test here is the copy and the pin, not the arithmetic.

Setup: edit `COMPETITION_END` in `src/config.ts` to **last Sunday** and `COMPETITION_START` to
eight weeks before that, `docker compose up -d --build`, then put the ledger a week back with the
same `UPDATE` as above. Log a few activities from a test account and let one pin refresh land
*before* editing the dates, so the frozen table holds non-zero numbers and an all-zero overwrite is
obvious at a glance.

- [ ] Screenshot the pinned message before the rebuild, so you have the frozen table to compare
      against. Note its numbers
- [ ] Within a minute a Monday post appears, naming a winner and this chat's own placement in the
      same shape an ordinary Monday post uses
- [ ] That post opens **"That's the competition."** and closes **"Thanks for moving."** It must
      not contain "New week", "back to zero", "Nothing carries over" or "This week is open": the
      competition is over and there is no week for anyone to act on
- [ ] **The pinned message is byte-identical to the screenshot**, immediately and again after
      waiting a further 20 minutes so at least one pin-refresh interval has certainly elapsed.
      This is the step the whole section exists for. If the pin has changed to a table of zeroes,
      the two gates have been collapsed into one, and the frozen final standings of a real
      competition would have been overwritten in every guild chat
- [ ] Now prove the bound is one week wide and not an open-ended licence to keep posting. Move
      `COMPETITION_END` back to **two Sundays ago** (and `COMPETITION_START` eight weeks before
      that), `docker compose up -d --build`, and run the ledger `UPDATE` again. **No post may
      appear at all**, and the log stays quiet. Watch for at least two minutes.
      Do *not* test this by re-running the `UPDATE` on the previous step's window: that nudge
      makes the chat owed a post again by definition, so a second post appearing there is the
      ledger doing its job, not the bound failing. Only moving the window past the wrap-up week
      exercises the bound
- [ ] Restore the real `COMPETITION_START` and `COMPETITION_END` in `src/config.ts`,
      `docker compose up -d --build`, and confirm the pinned message returns to live numbers and
      `bun test` is green again

## Survival

- [ ] `docker compose restart bot` mid-session, then tap a button on a message
      sent *before* the restart. It must still work (NFR-5)
- [ ] `scripts/dump.sh` writes a dump, `docker compose down -v` destroys the
      volume, `docker compose up -d` plus `scripts/restore.sh` brings the same
      standings back

## Reminders (Phase 3)

`src/bot/reminders.ts` and the reminder call inside `ticker.ts` have no
automated tests by design, so this section is their entire acceptance basis.
The decision logic underneath them is tested: `tests/domain/reminders.test.ts`
covers the FR-22 state machine and `tests/db/reminders.test.ts` covers who is
due. What is unverified until these boxes are ticked is the wiring.

Run against a bot whose competition window contains today, on an account
registered to a guild.

### The daily send

- [ ] `/remind`, pick an hour still to come today, and confirm a check-in
      message arrives at that hour and is identical to the one `/log` produces
      (FR-21, FR-6)
- [ ] Tapping a tier on the reminder logs normally, edits in place into the
      confirmation, and the progress bar is right (FR-5, FR-12)
- [ ] On another day, log before the chosen hour, and confirm **nothing**
      arrives at that hour (FR-21). This is the requirement's own acceptance
      test and the one most worth waiting for
- [ ] Log a rest day (`Not today`) before the hour, and confirm nothing arrives
      either: a rest is a record (FR-8)
- [ ] Pick an hour that has already passed today, and confirm no reminder fires
      within the next few minutes (phase 3 design 3.4). It should arrive
      tomorrow instead

### Control (FR-24)

- [ ] `/remind` appears in the private command menu, without needing help text
- [ ] `/remind` shows the current hour when reminders are on, and shows they
      are off when they are off
- [ ] Turn reminders off at least an hour before a reminder is due, and confirm
      nothing arrives at the hour. FR-24's own acceptance test is "a user who
      turns reminders off at 19:00 receives nothing at 20:00"
- [ ] Turn them back on and confirm the hour you pick is stored and shown
- [ ] `/remind` in a group chat does nothing at all (it is private-chat only)

### The follow-up (FR-22)

Five consecutive ignored reminders take five days, so the count is set
directly. That is a database statement against messaging state, not a code
path: it writes no `days` row and no minute, so NFR-4 is untouched. There is
still no seed command, debug route or simulation anywhere in the build.

- [ ] With reminders on and nothing logged today, run
      `UPDATE users SET ignored_streak = 5, last_reminded_at = NULL WHERE telegram_id = <you>;`
      and confirm the next due hour produces the **follow-up**, not a sixth
      check-in message
- [ ] The follow-up names the way back to reminders in its own text, so an
      ignored one still leaves a route (FR-22)
- [ ] Tap `Keep them` and confirm it says reminders are back on **at the hour
      you already had**, without asking you to choose again (FR-22)
- [ ] Repeat the setup, tap `Turn them off` instead, and confirm `/remind`
      then reports reminders as off
- [ ] Repeat the setup, ignore the follow-up entirely, and confirm no further
      reminder arrives the next day (FR-22: reminders stay paused)
- [ ] Still paused, log a day with `/log`, and confirm reminders do **not**
      resume the following day (phase 3 design 3.3). Then `/remind`, pick an
      hour, and confirm they do

### Blocking (FR-23)

- [ ] Block the bot in Telegram, wait for a reminder to be due, and confirm the
      log records the block and `users.blocked` is true
- [ ] Confirm no further reminder is attempted while blocked
- [ ] Unblock, send `/log`, and confirm `users.blocked` returns to false and
      the reply arrives normally (phase 3 design 3.5)
- [ ] Confirm the blocked user's minutes never left the standings at any point
      in the above. This is the invariant with the largest blast radius in the
      project: blocking gates messaging and never scoring

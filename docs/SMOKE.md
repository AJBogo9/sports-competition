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
- [ ] **On a Monday**, log something during the previous week (or run this on a
      Monday after a session that did), then use `Log yesterday instead` to log
      Sunday. The progress block must be headed **`Last week`**, not `This week`,
      and must not offer a forward-looking nudge ("83 minutes to go", "One more
      session does it") for a week that is over. Sunday belongs to the week that
      just ended, so the total that comes back is last week's, and calling it
      "This week" contradicts the Monday post that told the guild chat everyone
      was back to zero a few hours earlier (FR-20). Confirm the same backdate on
      any other weekday still reads `This week`, since yesterday and today share
      a week then. This is the only check here that needs a specific weekday: the
      week boundary comes from the SQL clock and cannot be faked from the client
- [ ] Log yesterday via "Log yesterday instead", tap Undo, then tap
      "Log again", and confirm the prompt says "And yesterday?" rather than
      "Moved today?" before tapping a tier. Confirm the resulting entry lands
      on yesterday, not today
- [ ] Log a day, re-log the same day at a different tier, then tap Undo, and
      confirm the message says the entry was put back (not removed) and that
      the weekly total matches what it was before the second log
- [ ] Send `/log` twice so there are two check-in messages for today. Log
      `15 to 30` on the first, then `60+` on the second, so both are now
      confirmations for the same day carrying their own Undo. Scroll back and
      tap Undo on the **first**. It must refuse, saying the day has been logged
      again and that nothing was changed, and `/me` must still show the 75
      minutes from the second log. Applying that stale payload would delete the
      day outright, which is the entry the user actually meant to keep. The date
      on a callback has always been rechecked against the live calendar; this is
      the same check on the tier
- [ ] Then tap Undo on the **second** confirmation, the current one, and confirm
      it still works normally and puts the day back to `15 to 30`. The guard must
      refuse only the superseded button, not every button after a re-log
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
- [ ] `/standings` shows the weekly table first, then the season, both as whole-number counts of
      active days with no decimal anywhere (FR-16, phase 5 design 12.2), the footer says the
      ranking is per member of the whole roster, and the weekly header reads **`Week N of M`**
      with the right N for today and M for the configured window (phase 5 design 11.1). Never
      `Week 0 of M`. Log one `15 to 30` day and one `60+` day on two accounts in the same guild
      and confirm the guild's count rises by exactly 2; log `Not today` and confirm it does not
      move
- [ ] The command menu in a private chat offers `/log`, `/me`, `/standings`, `/remind` and
      `/target`
- [ ] Send `/me` in a group chat that has the bot in it, and confirm the bot
      does not reply. This one protects other people's data, not just yours

## The numbers

- [ ] Count the non-rest days the two test accounts logged this week in one guild and confirm
      `/standings` shows exactly that count on the guild's row; then confirm a smaller guild with
      the same count sits above a larger one, which is the per-member ranking working. This is
      SPEC.md §10's "done when" for Phase 1, restated for active days (SPEC.md §4.3)
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

- [ ] Within a minute the bot posts a new message (not an edit) that notifies, opens
      **`Week N of M. Everyone back to zero.`** (phase 5 design 11.1), names last week's
      winning guild with no figure, gives this chat's own guild its placement, its count of
      active days and how many of its members logged at least once, as counts with no percent
      sign and no decimal anywhere (phase 5 design 5.4 and 12.2), and says the week starts at
      zero (FR-20)
- [ ] The same post names exactly one adjacent guild and a day count, `FK, one place up, was
      26 active days away.` (phase 5 design 11.2, 12.2). Check the arithmetic once by hand: the
      gap between the two guilds' active days per member times this guild's roster, rounded up.
      In a chat whose guild won the week, the sentence names the guild one place **down**. Ask
      two people from a low-placed guild how it reads; if it reads as pressure, the sentence is
      one edit in `render.ts`
- [ ] The same post ends `Nothing carries over. This week is open. The mark to beat: N active
      days.` where N is this guild's own count from the sentence above (phase 5 design 12.3). In
      a guild with 0 active days last week there is no mark sentence
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
- [ ] That post opens **"That's the competition."** followed on the same line by **"<guild> wins
      the season, with <this guild> Nth of 9."** (phase 5 design 10.1, 12.2: no figure), then
      the ordinary "Last week ... took it" sentence, and closes **"Thanks for moving. The standings
      stop here. 150 minutes a week is yours to keep."** (phase 5 design 5.5). It must not contain
      "New week", "back to zero", "Nothing carries over" or "This week is open": the competition is
      over and there is no week for anyone to act on
- [ ] The season winner and placing in that post match the frozen pinned message's **Season** table
      exactly; the "Last week" sentence matches its **This week** table. If they disagree, the two
      ranges have drifted (ticker.ts fetches the season over `COMPETITION_START` to the last
      week's end)
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

## The fun pass (Phase 5)

`checkin.ts` is untested by design, and the celebration in it relies on a Telegram behaviour that
is documented nowhere: a bot reacting to a message it sent itself in a private chat. This section
is the only place that can be proven. Keep `docker compose logs -f bot` open: the failure case is a
log line, not a message.

### The celebration (FR-28)

- [ ] On a week below 150, log `60+`, then `30 to 60`, then `30 to 60` on three days (75, 120,
      165: the third log crosses). Only the third confirmation may carry a 🎉 reaction under it,
      and the reaction should play its big animation as it lands. Record whether the animation
      played or only the static reaction appeared: the design accepts either but wants to know
      which (phase 5 design 5.1)
- [ ] Log once more on the same week, now above 150. **No** reaction on that confirmation: only the
      crossing is celebrated, never a tier, a day or a rank
- [ ] Tap Undo on the crossing confirmation. The reaction must disappear along with the log
- [ ] Cross the target on an account whose previous week genuinely reached 150. Backdating stops
      at yesterday (FR-10), so a prior week cannot be manufactured from a Monday; this step is
      checkable only in the second week of a smoke run. The reaction is 🔥 rather than 🎉, and the
      tail reads `Target hit. 2 weeks in a row.`
- [ ] Watch the log for `reaction for <id> failed` on crossings and `reaction clear for <id>
      failed` on every Undo (the clear runs on every applied undo, not only on crossings). If either
      appears every time, Telegram refuses a bot's reaction on its own message, the celebration is
      silently absent, and the effect-message fallback in phase 5 design 5.1 is the next step.
      Record the error description verbatim

### The copy

- [ ] Log `15 to 30`, `30 to 60` and `60+` on three days and confirm the heads read `22 min.
      Counts.`, `45 min. Good.` and `75 min. Big one.` A rest day still reads `Noted. Rest days
      don't break anything.` (phase 5 design 5.3)
- [ ] Ask both testers whether the three heads read warm rather than mocking. Copy lives in
      `src/strings.ts` and is one edit if not
- [ ] Reach 150 on a first target week and confirm the tail reads `Target hit.` with no week count.
      One week is not yet a streak (phase 5 design 5.2)
- [ ] Below 150, confirm no confirmation mentions weeks in a row, whatever `/me`'s streak line says
- [ ] Trigger the Monday post with the ledger `UPDATE` above and confirm it reads `with N of you
      logging at least once` and contains no percent sign (phase 5 design 5.4)
- [ ] Trigger the closing post per the closing-post setup above and confirm its last line is
      `Thanks for moving. The standings stop here. 150 minutes a week is yours to keep.` (phase 5
      design 5.5) and its first line names the season winner (phase 5 design 10.1)
- [ ] Register a fresh account and confirm the welcome reads `It's easy to forget by week three
      unless something asks, so: should I?` and never "Most people forget"; then confirm the reply
      to either reminder answer contains `is ranked on active days per member`, `everyone on the
      roster counts`, and `Send them the link: https://t.me/<bot>?start=<slug>` with this bot's
      real username and the account's guild slug; tap the link from a second account and confirm
      it registers into that guild (phase 5 design 10.2, 12.2, 12.4)
- [ ] Every confirmation for `15 to 30`, `30 to 60` or `60+` carries `A day for <guild>.` on its
      head line, and a `Not today` confirmation does not (FR-30, phase 5 design 12.3)
- [ ] With that fresh account, before it or anyone alphabetically adjacent in its guild has logged
      this week, `/me` shows no **Around you** block; after one neighbour logs, it does (phase 5
      design 10.2). On a Monday morning in a quiet guild, expect the block to be absent for everyone
- [ ] Send `/target` in a private chat: it shows your current target (150 for a fresh account),
      the WHO sentence, and four buttons `150 min` `225 min` / `300 min` `450 min`. Tap `300 min`:
      the toast says `Target set to 300`, the message edits to `Target set to 300 minutes a week`
      and states that a day counts as one active day for the guild whatever its length (phase 5
      design 11.3, 12)
- [ ] Log a `60+` day: the confirmation's bar now reads `75 / 300 min` and "225 minutes to go";
      `/me` reads against 300 too; `/standings` is byte-identical to before the change (FR-29).
      A week already at 165 minutes no longer says "Target hit" and its streak line disappears,
      because the streak is counted against the new target
- [ ] Send `/target` in a group chat and confirm no reply

## Finish (FR-31, phase 5 design 13)

The small things two critics found on 2026-09-08. Each is a first- or second-contact moment.

- [ ] Open the bot's profile before tapping Start: the line under the name reads `Aalto guild
      activity competition. One tap a day.` and the "What can this bot do?" panel names active
      days per member and the visibility of your name and activity (set at boot, no BotFather)
- [ ] Type `hello` in the private chat, then `/nonsense`: both get `I only understand taps and
      commands. /log to check in, /me for your week, /standings for the guilds.` Type the same in
      a group with the bot: no reply
- [ ] With `COMPETITION_START` set to a future date, `/log` replies `The competition starts on
      <day month year>. Nothing to log until then; I'll be here.` with no buttons; with the end in
      the past, `The competition ended on <date>. Thanks for moving.`; a registration in that
      state ends on that sentence rather than on a refused tap
- [ ] Send `/start` as a registered user: `You're already counted for <guild>.` followed by the
      rules paragraph (target, tap values, the scoring rule, the guild link, the privacy line),
      and the reminder question only if it was never answered, with the hour buttons under it
- [ ] Log `30 to 60 min`, then send `/log` again: the prompt reads `Moved today?` and under it
      `Logged already: 30 to 60 min. A tap replaces it.`; tap `60+ min` and confirm the
      confirmation shows 75, not 120, and that Undo says `Put back`
- [ ] Tap `Log yesterday instead`, then `Today instead`: back to today's prompt
- [ ] In a guild with exactly one active day last week, the Monday post reads `with 1 active day`
      and `The mark to beat: 1 active day.`; in a week where two guilds tie on days per member
      and minutes per member, it reads `Last week X and Y shared it.`; in a week nobody logged,
      `Last week nobody logged a day.` and no mark
- [ ] Rank check: log one `60+` day in Prodeko and one `15 to 30` day in AS (same roster size)
      in the same week; `/standings` ranks Prodeko 1 and AS 2, never joint 1st, and the Monday
      post to AS reads `Prodeko took it` with `AS finished 2nd` and `Prodeko finished level with
      you on days.`
- [ ] Trigger a failure (stop the database for a minute, tap a tier): the toast reads `Something
      went wrong on my side. Try again in a minute.` and the log carries the update id
- [ ] `/remind` while reminders are off shows the four hours and no `Turn them off` button; the
      five-ignore follow-up reads `Want them back?`
- [ ] `/target` marks the current option with a check mark; its text offers the way back to 150;
      the toast reads `Target set to 300 min`; the reply never mentions a celebration
- [ ] Bind a chat and read the reply: it says standings appear within 15 minutes and asks for pin
      permission up front
- [ ] After `COMPETITION_END`, `/standings` and `/me` show the final week under **Final week**,
      matching the frozen pin; before `COMPETITION_START`, `/standings` reads **This week** with
      zeros, never `Week 0 of N`
- [ ] A neighbour with a 20-character first name is cut to ten characters in `Around you` and the
      minutes column stays aligned
- [ ] `docker compose logs bot` on a normal day shows the window at boot, `standings posted in
      chat <id> and pinned` once per chat, `monday post sent to chat <id> for week <date>` on
      Monday, and `SIGTERM: stopping` on `docker compose stop`

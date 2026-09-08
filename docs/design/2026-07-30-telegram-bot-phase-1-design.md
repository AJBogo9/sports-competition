# Phase 1 Implementation Design: Bot, Check-in, Standings

**Date:** 2026-07-30
**Status:** Approved, not implemented.
**Covers:** [SPEC.md](../../SPEC.md) §10 Phase 1, plus the deployment work needed to self-host it.
**Does not cover:** Phases 2 to 4. Section 9 below lists exactly what is deferred.

SPEC.md is the source of truth for *what* and *why*. This document is *how*, and it records the
decisions SPEC.md leaves open. Where the two disagree, SPEC.md wins and this document is wrong.

---

## 1. Scope

In: config file, three tables, deep-link registration, `/log` with backdating and undo,
`/standings`, `/me`, and a two-container deployment that runs on a home server today and moves to
guild hosting later.

The acceptance target is SPEC.md §10's own: **two people on real phones register to different
guilds, log for several days including backdated entries, and see standings that match
hand-calculated numbers.**

Requirements covered: FR-1 to FR-10, FR-12 to FR-16, FR-25, FR-26, FR-27, and NFR-1, NFR-2, NFR-4,
NFR-5.

Three decisions in section 4 pull work forward from later phases (4.3, 4.4, 4.5), and section 6
adds one script pair beyond the phase. Each is justified where it appears.

---

## 2. Stack

Bun, grammY, PostgreSQL, and `postgres.js` as the driver.

| Choice | Reason |
|---|---|
| Bun | TypeScript with no build step, built-in test runner, built-in `.env`. Fewer support files means fewer lines against the NFR-6 budget. Already used in the predecessor |
| grammY | Long polling per NFR-1, no webhook, no inbound port |
| `postgres.js` | Preferred over Bun's newer built-in SQL client, to keep the one layer that touches persisted data boring |
| PostgreSQL | Fixed by SPEC.md §6 and NFR-2 |

Both runtimes containerise identically, so the move to guild hosting is unaffected by this choice.
It was made on ergonomics.

---

## 3. Architecture

Dependencies point one way, so the scoring logic is never tested through Telegram:

```
config.ts ──> domain/ (pure) ──> db/queries.ts ──> bot/handlers ──> bot/render.ts
```

| File | Effective lines | Covers |
|---|---|---|
| `src/config.ts` | 70 | Guilds, window, tiers, target, timezone (FR-25) |
| `src/strings.ts` | 110 | All user-facing English (FR-27) |
| `src/domain/scoring.ts` | 90 | Tier minutes, progress bar, streak reduction, window membership |
| `src/db/client.ts`, `src/db/migrate.ts` | 105 | Pool, numbered migrations |
| `src/db/queries.ts` | 170 | Users, days, standings, neighbours |
| `src/bot/index.ts` | 120 | Polling, shutdown, command scopes, callback router |
| `src/bot/registration.ts` | 100 | FR-1 to FR-4 |
| `src/bot/checkin.ts` | 140 | FR-5 to FR-10 |
| `src/bot/render.ts` | 160 | FR-12 to FR-16 |

Roughly 1,065 effective lines, against the 900 SPEC.md §7 budgets for Phase 1. The difference is the
two pulled-forward requirements and the deployment scripts.

**The load-bearing invariant is SPEC.md §4.4: no total is ever stored.** `days.tier` is the only
ground truth. `tier_minutes` is a config-backed `VALUES` list injected into each standings query
rather than a table, which is what makes FR-25's acceptance test (change a tier value, restart,
history recomputes) true without a migration.

---

## 4. Decisions SPEC.md leaves open

### 4.1 One competition-wide timezone: `Europe/Helsinki`

SPEC.md never names a timezone, and `days.date` is a bare `DATE`. On a UTC container a 01:00
Helsinki log lands on the previous day, breaking FR-7, FR-10's "yesterday", and the Monday reset.

`logged_at` stays `TIMESTAMPTZ` and is already unambiguous. Only the date bucketing needs the rule.
Per-user timezones were rejected: more stored state for a population that is all in Espoo.

### 4.2 The calendar lives in Postgres, not in the application

An 8-week autumn window straddles the clock change on 25 October 2026. Any week boundary computed
by adding 7 times 24 hours drifts an hour across it.

So "today", "yesterday", and Monday boundaries come from SQL, using
`(now() AT TIME ZONE 'Europe/Helsinki')::date` and `date_trunc('week', ...)`, which is already ISO
Monday-based, against Postgres's tzdata. `domain/` keeps only the genuinely pure parts: tier
minutes, the bar, the streak reduction, window membership.

The part most likely to be silently wrong is thereby handled by something with a real timezone
database, rather than by hand-rolled arithmetic.

### 4.3 The weekly streak (FR-13) moves into Phase 1

SPEC.md §10 assigns FR-13 to Phase 4, but Phase 1 includes `/me` and FR-14 says `/me` MUST show the
streak. The streak derives from `days` with no stored state, so it is roughly 15 lines. Cheaper to
include than to ship a `/me` that fails its own acceptance test.

### 4.4 The FR-4 reminder question ships now, the sending does not

Registration is Phase 1 and FR-4 puts the ask immediately after it. The question is asked and
`reminder_hour` is stored from day one, so the registration copy is written once. Nothing is sent
until Phase 3.

**Recorded cost:** a tester who picks 20:00 receives nothing during the testing period.

### 4.5 FR-9 contradicts its own acceptance test, and the fix is taken now

FR-9 says undo "removes the day's record entirely". Its acceptance test says undo "restores the
exact weekly total from before the log". These disagree whenever the log overwrote an earlier entry
for that day, because deleting the row also loses the earlier tier's minutes.

SPEC.md §10 files "undo edge cases" under Phase 4, but the fix costs about six lines and no stored
state, so it is taken here: the undo button's callback data carries the tier it displaced
(`undo:2026-07-30:short`, well inside the 64-byte limit). Undo restores that tier, or deletes the
row when there was nothing to displace. Both readings become true.

### 4.6 The competition window is a placeholder that must contain the present

Q1 is open. FR-26 excludes anything outside the window, so a placeholder not spanning the present
would silently make every test log count for nothing.

Rule: **8 weeks beginning the Monday on or before first deployment**, carried in config with a
comment naming Q1 as the blocker. Replaced with real dates when Q1 resolves. Guild member counts
come over from SPEC.md §1 carrying the "re-verify before use" warning, since they are the
per-capita denominator.

### 4.7 Ambiguities resolved from the mockup rather than by choice

`prototype/bot-flows.html` settles two readings of FR-14 that SPEC.md leaves genuinely ambiguous:

- "the user's guild rank this week" means **the rank of the user's guild among guilds**
  ("Prodeko, 2nd of 9 this week"), not the user's rank among guildmates.
- Neighbours are a separate "Around you" block, which is the FR-15 `MAY` taken up.

---

## 5. Flows

### 5.1 Registration (FR-1 to FR-4)

`/start prodeko` on a fresh user writes the row and replies in one message (the second sentence
was reworded by the Phase 5 design §10.2 to "It's easy to forget by week three": the original was
a descriptive norm about lapsing, and the reply that follows now also states how guilds are scored):

```
Hi Andreas. You're in, for Prodeko.

One tap a day, that's it. Most people forget by week three
unless something asks, so: should I?

  [ 17:00 ]  [ 18:00 ]
  [ 20:00 ]  [ 21:00 ]
  [ No, I'll remember ]
```

This departs from the mockup deliberately. The mockup's "When should I ask?" reads as a step to skip
past, which FR-4 explicitly forbids; the wording above names both outcomes.

The follow-up carries the target and the privacy notice SPEC.md §6 requires, which the mockup
omits: `Set for 20:00. Change it any time with /remind.`, then the 150 minute line, then
`Your first name and how much you move are visible to others in Prodeko.`

| Case | Behaviour | Requirement |
|---|---|---|
| Known slug, new user | Register, welcome, reminder question | FR-1 |
| Bare `/start` or unknown payload | 3x3 guild keyboard | FR-2 |
| Known user, own guild's link | Straight to check-in | FR-3 |
| Known user, different guild's link | Explicit `Move to TiK` / `Stay in Prodeko`, never silent | FR-3 |

### 5.2 Check-in (FR-5 to FR-10)

`/log` sends `Moved today?` with the four tiers stacked one per row. One tap commits, with no
confirmation step (FR-5), through `INSERT ... ON CONFLICT (telegram_id, date) DO UPDATE`. **FR-7 is
enforced by the primary key rather than by logic**, which is what avoids SPEC.md §2 defect 5.

The message then edits in place into the confirmation, with the progress block FR-12 requires,
reusing the mockup's 10-slot bar exactly:

```
45 min. Good.

This week   112 / 150 min
            ███████░░░
One more session does it.

  [ Undo ]  [ My week ]  [ Standings ]
```

`Not today` gets the same treatment, with the copy the mockup uses
(`Noted. Rest days don't break anything.`). The mockup omits `Undo` there; this design keeps it, so
that FR-9's "the confirmation MUST offer an undo" holds for all four tiers without exception. A
mis-tapped rest day is as much a misclick as any other.

Backdating (FR-10) is a second keyboard row, `Log yesterday instead`, which re-renders the same four
tiers bound to yesterday's date. Today stays one tap, a backdate costs two, and FR-7 applies to
both. Anything outside the window is refused with a message rather than written (FR-26).

### 5.3 Read-only renderers (FR-12 to FR-16)

`/me` follows the mockup, with the guild rank reading of 4.7:

```
This week    112 / 150 min
             ███████░░░
Streak       3 weeks at target
Guild        Prodeko, 2nd of 9 this week

Around you
  Sanna      134 min
  you        112 min
  Otto        98 min
```

`/standings` renders the weekly table first, then the season, both as minutes per member over the
full roster, closing with `Everyone in the guild counts, logging or not.` (FR-16).

Neither writes to the database (FR-14). Nothing anywhere returns a global list of individuals
(FR-15). All tables sit inside `<pre>` with HTML parse mode, so columns hold on a narrow phone.

---

## 6. Deployment

Two containers, as NFR-2 specifies. `bot` and `db`, a named volume for the data,
`restart: unless-stopped`.

Neither service publishes a port: the bot is outbound-only by NFR-1, and Postgres is reachable only
on the compose network, with a commented line for binding `127.0.0.1:5432` when inspection is
wanted. Image is `oven/bun:1-alpine`, running as a non-root user. `.env` carries `BOT_TOKEN` and
`DATABASE_URL` and is already gitignored.

Migrations are numbered SQL files applied at startup, each in a transaction, recorded in a
`migrations` table. Re-running is a no-op, so restarts are free (NFR-5). Config changes need no
migration at all, which is what makes FR-25 work.

**One addition beyond Phase 1:** `scripts/dump.sh` and `scripts/restore.sh`, about 10 lines each.
NFR-3 files backups under Phase 4, but the move from home server to guild hosting *is* a dump and a
restore, so the path is needed now. The nightly cron and off-machine shipping stay in Phase 4.

---

## 7. Failure handling

**No session middleware anywhere.** Every callback carries its own meaning (`log:2026-07-30:medium`,
`undo:2026-07-30:short`), so a tap on a message from before a restart still works and the process
holds no state worth losing. This is what makes NFR-5 free rather than engineered.

| Failure | Handling |
|---|---|
| Postgres not yet accepting connections at boot | Compose healthcheck plus a bounded startup retry in the bot |
| Telegram API error | `bot.catch` logs and swallows, rather than killing the process |
| Callback spinner | Every callback is answered, always |
| Double tap | Absorbed by `ON CONFLICT` |
| Log outside the competition window | Refused with a message, never written (FR-26) |

FR-23's 403 handling belongs to Phase 3. Phase 1 never messages anyone first, so it cannot yet be
blocked.

NFR-4 is a standing constraint: no code path may write activity data without a real user action, in
any build. See SPEC.md §2 defect 3.

---

## 8. Verification

Tests run with `bun test`, written before the code they cover.

**Pure, no database:** tier minutes; bar rounding; streak counted in weeks with rest days
interleaved (FR-8's acceptance test); window membership (FR-26).

**Against a real ephemeral Postgres:**

- standings arithmetic against hand-calculated numbers, which is §10's Phase 1 "done when"
- a per-member denominator that includes members who never logged (§4.3 of SPEC.md)
- `short` then `long` on one day giving 75 and not 97 (FR-7)
- undo restoring a displaced tier, and deleting when there is nothing to displace (4.5 above)
- neighbour ordering
- a week boundary either side of 25 October 2026, so 4.2 is exercised rather than merely reasoned
  about

**Evidence to produce at the end:** migrations applying to an empty database, the test run with its
output, and both containers building and coming up healthy.

**Explicitly not verifiable here:** a real person tapping a real button. Phase 1 therefore ends with
a short manual smoke checklist for the two-phones test §10 requires, and the flows are not claimed
to work until that checklist has been run.

---

## 9. Deferred

Named so that their absence is a decision rather than an oversight.

| Deferred | Phase | Note |
|---|---|---|
| Group chat entirely: FR-18, FR-19, FR-20 | 2 | `?startgroup=`, `my_chat_member`, pinned edit, Monday post |
| Command scopes for groups (FR-17) | 2 | Phase 1 sets private-chat scope only |
| Guild-to-chat mapping column | 2 | Added by migration `002`, not anticipated in `001` |
| Reminder sending: FR-21, FR-22, FR-23 | 3 | The question is asked now, see 4.4 |
| Reminder on/off command `/remind` (FR-24) | 3 | Referenced in registration copy, so it must land with Phase 3 |
| Optional tag UI (FR-11) | 4 | `days.tag` column exists, no UI |
| Nightly backup cron and off-machine shipping (NFR-3) | 4 | Manual dump and restore ship now, see section 6 |

---

## 10. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| Registration copy promises `/remind`, which does not exist until Phase 3 | Phase 3 must not slip past the start of real use. If it does, cut the `/remind` sentence from the copy |
| Placeholder window silently voids all test logs | Rule in 4.6 forces it to contain the present. A query test asserts today is inside the configured window |
| Member counts are stale, distorting every comparison | Carried with the warning attached. Verification is a launch task, not a code task |
| Testing-period data is unbacked until Phase 4 | Accepted. Test data is not worth protecting, and the dump script exists for the host move |

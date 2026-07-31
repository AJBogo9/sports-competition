# Phase 2 Implementation Design: The Guild Group Chat

**Date:** 2026-07-31
**Status:** Approved, not implemented.
**Covers:** [SPEC.md](../../../SPEC.md) §10 Phase 2: FR-17 group scopes, FR-18, FR-19, FR-20.
**Does not cover:** Phases 3 and 4. Section 9 below lists exactly what is deferred.

SPEC.md is the source of truth for *what* and *why*. This document is *how*, and it records the
decisions SPEC.md leaves open. Where the two disagree, SPEC.md wins and this document is wrong.

It continues [the Phase 1 design](2026-07-30-telegram-bot-phase-1-design.md), whose architecture,
stack and conventions carry over unchanged and are not restated. Code comments cite this document
as "phase 2 design N.N" (for example "phase 2 design 4.5"), to distinguish it from the
Phase 1 document, which its own code comments cite as "design 4.x".

---

## 1. Scope

In: a `chats` table, binding a group chat to a guild by link with a picker fallback, a standings
message that is pinned once and thereafter edited on a timer, a Monday post, and group command
scopes.

The acceptance target is SPEC.md §10's own: **the bot is in a test group, the pinned message
updates without notifying, and a Monday post fires on schedule.**

Requirements covered: FR-17 (the group half), FR-18, FR-19, FR-20.

### 1.1 A precondition this phase does not satisfy

SPEC.md §10 says not to start a phase before the previous one works end to end, and Phase 1's own
"done when" is the two-phones smoke run, which has not happened. This phase was authorised anyway,
knowingly. The consequence is concrete rather than theoretical: FR-19 and FR-20 both render through
`standings()`, so a defect in that query surfaces here as wrong numbers in front of several hundred
people rather than in front of one tester. **The Phase 1 smoke run remains the gate on real use of
either phase.**

---

## 2. Data

Migration `002`, the first since `001_initial.sql`.

```sql
CREATE TABLE chats (
  chat_id           BIGINT PRIMARY KEY,
  guild_slug        TEXT NOT NULL REFERENCES guilds(slug),
  pinned_message_id BIGINT,
  pinned_text       TEXT,
  pin_failed        BOOLEAN NOT NULL DEFAULT FALSE,
  last_monday_week  DATE NOT NULL,
  bound_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.1 A table, not a column on `guilds`

SPEC.md §6 offers either: "a mapping of guild to group chat, which may be a column on `guilds` if
one chat per guild is sufficient." Taking the table:

- `pinned_message_id`, `pinned_text`, `pin_failed` and `last_monday_week` are facts about a chat,
  not about a guild. On `guilds` they would sit beside `member_count`, which is competition
  configuration, and the two have nothing to do with each other.
- A guild plausibly has more than one relevant chat: a board chat and a general chat. Many chats to
  one guild costs nothing here and cannot be retrofitted onto a column without a migration.
- Unbinding a chat the bot was removed from must not touch the guild row, which is config-derived
  and rewritten by `syncGuilds` on every boot.

### 2.2 Every BIGINT and DATE is selected `::text`

`chat_id`, `pinned_message_id` and `last_monday_week` follow the existing invariant. The
TypeScript type is `string` end to end and nothing converts to a number anywhere: supergroup ids
are large and negative (`-1001234567890`), and the point of the invariant is that no call site has
to reason about whether a particular id is small enough to survive a numeric round trip. Telegram
accepts a string `chat_id`, so the string travels all the way to the API call unconverted.

### 2.3 `pinned_text` exists to avoid an error rather than to swallow one

The ticker compares the freshly rendered text against `pinned_text` and skips the edit when they
match. Telegram answers an unchanged `editMessageText` with a 400 "message is not modified", which
Phase 1 already downgrades to a warning in `bot.catch`. Relying on that here would generate the
error nine times per refresh overnight, when nobody is logging and the standings never change. The
comparison removes the call instead.

### 2.4 `last_monday_week` is initialised to the current week, not to NULL

A chat bound on a Thursday has no Monday post for the current week. With `NULL` the ticker would
read that as "owed a post" and fire "New week. Everyone back to zero." three days into the week.
Initialising to the current week start means the first post a chat receives is the next real
Monday. The column is `NOT NULL` so the mistake cannot be made later.

---

## 3. Flows

### 3.1 Binding a chat to a guild (FR-18)

`src/bot/group.ts`. Three entry points, one binding function.

**Primary: the link.** A board opens `https://t.me/<bot>?startgroup=<slug>`. Telegram's client then
invokes `messages.startBot` against the group with that parameter, which reaches the bot as
`/start <slug>` in the group chat. Privacy mode does not interfere: bots receive messages beginning
with a slash regardless. The bot binds and confirms in the chat.

This is client behaviour, not a server guarantee. The MTProto documentation says the client
*should* invoke `messages.startBot` after adding the bot; it does not promise every client does.
Hence the fallback.

**Fallback: the picker.** A `my_chat_member` update moving the bot to `member` or `administrator`
in a chat with no binding posts a nine-guild inline keyboard. This covers a client that skips the
`startBot` call and the common case of someone adding the bot from the group's own Add Member
screen, where no deep link is involved at all.

**Only chat administrators may bind, on either path.** Both the `/start <slug>` handler and the
picker callback check `getChatMember` for `administrator` or `creator`, and a non-admin gets a
refusal with no state change. The check cannot live on the picker alone: `/start@bot <slug>` is
just a message, so any member of a several-hundred-person chat could type it and re-point the chat
at a rival guild, and the binding is what every subsequent number in that chat is computed from.
Adding a bot to a group does not require being an admin in every group configuration, so a
non-admin who opens the link is told an admin has to confirm, and the picker stays up for one.

**Rebinding is allowed** and is the same operation: an admin binding an already-bound chat updates
`guild_slug` in place. The pinned message is kept rather than re-sent, since its identity does not
depend on the guild, and the next refresh re-renders it with the new guild's line highlighted.
`last_monday_week` is not reset, so rebinding cannot be used to trigger a second Monday post.

**Rebinding goes through the link only. The picker binds an unbound chat and nothing else.**
Telegram delivers `my_chat_member` before the `/start <slug>` message, so on the primary path the
bot posts the picker and then binds a moment later, leaving a live nine-guild keyboard sitting in a
correctly bound chat. Inline keyboards do not expire, and the process holds no state that could
retract one (NFR-5), so that message is a permanent control that re-points the chat on one tap,
months later, from an admin who has forgotten what it was. A picker whose callback refuses to act
on an already-bound chat is inert instead, and the link remains a complete rebinding path. The
refusal names the current guild, so an admin who genuinely wants to change it learns how.

**Unbinding.** `my_chat_member` moving to `left` or `kicked` deletes the row. So does a `403` or a
"chat not found" while editing a pin, which self-heals a chat the bot was removed from while the
process was down, since that `my_chat_member` update expires from Telegram's 24-hour retention.

`/start` in a group currently falls through: [registration.ts](../../../src/bot/registration.ts)
returns early on non-private chats. The group branch is an addition to `group.ts`, not a change to
registration, and the private path is untouched.

### 3.2 The pinned standings (FR-19)

One message per bound chat, sent once and thereafter only edited. Edits do not notify, which is the
requirement's own acceptance criterion and the reason the message can be refreshed often.

Content is the same two tables `/standings` renders, through the same renderer, so the two can
never disagree. The prototype shows the weekly table in full and the season table in two columns
beneath it.

**When the bot cannot pin.** Pinning needs administrator rights with `can_pin_messages`. If
`pinChatMessage` is refused, the message is kept and kept updating, `pin_failed` is set, and the
render gains one line saying it will pin itself once it is an admin. The live number is the
valuable part and it works perfectly well unpinned. Each subsequent refresh retries the pin and
clears the flag when it succeeds, so the board's fix takes effect without anyone restarting
anything.

### 3.3 The Monday post (FR-20)

A new message, so it notifies. That is the point of it, and the contrast with 3.2 is deliberate:
the pin is ambient and silent, the Monday post is the one interruption per week.

Contents, per the prototype and the ruling recorded in section 4.3:

- last week's winning guild and its minutes per member
- the percentage of *this chat's own guild* that logged at least once last week
- this guild's own placement and number
- an explicit statement that nothing carries over

Framed as a fresh start rather than a report card. The guilds at the bottom get an opening instead
of a fourth consecutive notice that they are losing, which is SPEC.md §11's top-rated risk.

---

## 4. Decisions SPEC.md leaves open

### 4.1 One in-process ticker, with Postgres as the ledger

A single `setInterval` at 60 seconds, started in `main.ts` and cleared on `SIGINT`/`SIGTERM`
alongside `bot.stop()`.

Rejected: a third container or a host cron entry. NFR-1 and NFR-2 hold the deployment to two
containers and one process, and an external scheduler would need its own path to both the Bot API
and the database to do work this process is already positioned to do.

Rejected: two intervals, one per feature. One loop asking two questions has one lifecycle to stop
cleanly on shutdown and one place where the calendar is read.

All state that must survive a restart is on the `chats` row. The only in-memory state is the
timestamp of the last pin refresh, and losing it costs one extra render that 2.3's comparison turns
into a no-op.

### 4.2 The pin refreshes every 15 minutes; the Monday post is checked every minute

Two cadences from one 60-second tick. The Monday post needs minute granularity to land close to its
hour; the pin does not, and nine chats every 15 minutes is at most nine silent edits per quarter
hour, orders of magnitude inside Telegram's limits.

Fifteen minutes is chosen so that someone who logs at 18:00 sees the pin move before they put their
phone down. Overnight, when nothing changes, 2.3 means the refresh performs no API calls at all.

The interval is elapsed time since the last refresh, not a wall-clock alignment to :00, :15, :30
and :45. Nothing depends on the refresh landing at a particular minute, and elapsed time needs no
state beyond a single in-memory timestamp.

### 4.3 The Monday post ships without "closest gap in four weeks"

The prototype's post carries a line comparing this week's gap to previous weeks. It needs a query
over every completed week and a comparison across them, and FR-20 does not ask for it. Everything
else in the prototype ships. Recorded here so its absence is a decision.

Participation, which does ship, is one query: distinct users in the guild with at least one `days`
row in the range, over the guild's configured `member_count`. **A rest day counts as
participation.** FR-8 makes rest an explicit record rather than an absence, and the number measures
engagement, not minutes.

### 4.4 The Monday post fires late rather than never

The condition is "this chat has no post for the current week and local time is past Monday 09:00",
not "today is Monday". A bot that was down for all of Monday posts on Tuesday when it comes back.

Over an eight-week competition, missing one post entirely is a worse outcome than a post that
arrives a day late, and the alternative fails silently in exactly the situation where something has
already gone wrong. The copy does not name the day, so a Tuesday delivery reads as slightly late
rather than as wrong.

### 4.5 No Monday post exists for the first week

No post fires when the previous week *ends* before `COMPETITION_START`, which is to say when the
day before this week's Monday is earlier than the start date. On the competition's first Monday
there is no last week to report, and the generic path would announce a winner at 0.0 minutes per
member, which is both meaningless and the first thing every guild sees.

The test is on the previous week's end rather than its start so that a competition beginning
mid-week still gets a post on its first Monday, reporting the partial week that actually happened.
`COMPETITION_START` is a Monday today, which makes the two tests agree; they diverge the moment it
is not, and the end test is the one that stays correct.

### 4.6 The scheduling decision is a pure function

The part of the ticker worth testing is *when* it acts, not how it calls the API, so that decision
moves into `src/domain/` behind:

```ts
shouldPostMonday({ weekStart, lastPosted, localTime, postHour, competitionStart }): boolean
```

The timer becomes a loop that asks that question and acts. This keeps the layering rule from
Phase 1's section 3 intact: the interesting logic is pure and testable without Telegram, and the
untestable glue holds no decisions.

### 4.7 The ticker is inert outside the competition window

No refresh and no post when today is outside `COMPETITION_START`..`COMPETITION_END`. The final tick
before the end leaves the closing numbers pinned, which is the correct resting state for a
competition that is over.

---

## 5. Architecture delta

Phase 1's one-way dependency rule is unchanged. New files, in dependency order:

| File | Contents |
|---|---|
| `src/db/migrations/002_chats.sql` | The table in section 2 |
| `src/db/chats.ts` | All chat SQL: bind, find, list, unbind, record pin, record Monday post |
| `src/domain/scheduling.ts` | `shouldPostMonday` (4.6), pure |
| `src/bot/group.ts` | FR-18: the three entry points in 3.1 |
| `src/bot/ticker.ts` | FR-19 and FR-20: the loop in 4.1 |

Modified: `src/db/standings.ts` gains `participation()`; `src/bot/render.ts` gains
`pinnedStandings()` and `mondayPost()`, both pure; `src/bot/callbacks.ts` gains a `bind` kind;
`src/bot/index.ts` installs the group handlers and the group command scope; `src/strings.ts` gains
the group copy; `src/config.ts` gains `MONDAY_POST_HOUR`; `src/main.ts` starts and stops the
ticker.

### 5.1 FR-17

`installCommands` gains a second `setMyCommands` call scoping `/standings` to `all_group_chats`,
leaving `/log` and `/me` on `all_private_chats`. That is the requirement's acceptance test
verbatim: the menu in a guild group offers `/standings` but not `/log`.

---

## 6. Failure handling

| Failure | Response |
|---|---|
| Pin refused for want of admin rights | Keep and keep editing the message, flag it in the render, retry each refresh (3.2) |
| Bot removed from the chat | Delete the row, on either the `my_chat_member` update or the next `403` (3.1) |
| Group upgraded to a supergroup | The `chat_id` changes and the old one stops resolving, which Telegram reports as a 400 naming the upgrade. Treated as removal: the row is deleted and the board re-adds via the link. Not silently migrated, because the new id arrives on a `migrate_to_chat_id` field the bot may never see if it was down when the upgrade happened |
| A tick throws | Caught inside the tick and logged. One chat's failure must not stop the other eight, and must not kill the interval |
| Two processes running at once | Out of scope: NFR-2 is one machine, one process. Noted because the ticker is the first thing here that would double-post if that stopped being true |

---

## 7. Verification

Tests run with `bun test`, written before the code they cover.

**Pure, no database:** `shouldPostMonday` across the first week (4.5), the down-all-Monday case
(4.4), a just-bound chat (2.4), the hour boundary, and a week spanning the October clock change;
both new renderers, including the pin-rights line and a guild that is last.

**Against a real ephemeral Postgres:** bind, rebind and unbind; the `::text` casts returning
supergroup ids intact (2.2); `participation` counting a rest-only user and excluding a user who
never logged, with the roster as denominator; `last_monday_week` recording and reading back.

**Explicitly not verifiable here:** `group.ts` and the ticker's API calls, consistent with the three
Phase 1 handler files. They get a new Phase 2 section in [docs/SMOKE.md](../../../docs/SMOKE.md),
covering the link path, the picker path, a non-admin tap being refused, the pin updating without a
notification, and the pin-rights message appearing and then resolving when the bot is promoted.

The Monday post cannot be smoke-tested without waiting for a Monday. The checklist says so and
gives the alternative: bind a chat, set `last_monday_week` back by one week directly in the
database, and watch the next tick.

---

## 8. Size

NFR-6 budgets Phase 2 at about 150 effective lines. The estimate here is **200 to 250**, over its
own line item, because three things in this design are beyond the bare requirement: the picker
fallback (3.1), the administrator check (3.1) and the pin-rights handling (3.2).

Total lands near 1,350 against the 2,000 ceiling, so the ceiling is not threatened and nothing from
SPEC.md §8 has crept in. Recorded rather than absorbed quietly, because NFR-6's per-phase numbers
are how that ceiling is kept honest.

---

## 9. Deferred

| Deferred | Phase | Note |
|---|---|---|
| "Closest gap in four weeks" in the Monday post | none | Cut, see 4.3 |
| Reminder sending: FR-21, FR-22, FR-23 | 3 | Unchanged by this phase |
| `/remind` on/off command (FR-24) | 3 | Registration copy still promises it |
| `reminder_asked`, to distinguish "never asked" from "declined" | 3 | Migration `003`. Phase 1 ledger item, untouched here |
| `NOT u.blocked` erasing a blocked user's history from guild totals | 3 | Cannot fire until FR-23 sets the column. Now reaches the pinned message too, so it is worth more than it was |
| Optional tag UI (FR-11) | 4 | `days.tag` exists, no UI |
| Nightly backup cron (NFR-3) | 4 | Manual dump and restore already ship |

### 9.1 One refactor this phase should do, not defer

The tier-minutes CTE is duplicated at four query sites across two files. `participation` does not
need it, but Phase 3's "who has not logged today" will, and the Phase 1 ledger already flagged
extracting it before the count reaches six. If this phase touches `standings.ts` anyway, extracting
it here is cheaper than extracting it later.

---

## 10. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| Phase 1 is unvalidated, and this phase puts its numbers in front of a whole guild | 1.1. The smoke run is still the gate on real use |
| A client does not deliver the `startgroup` payload | The picker fallback (3.1) makes the primary path optional rather than load-bearing |
| Wrong guild bound to a chat, silently poisoning every number it shows | Admin-only binding, and a confirmation naming the guild so a wrong binding is visible immediately |
| The ticker double-posts after a restart | `last_monday_week` is written in the same statement that marks the post sent, and read on every tick |
| Member counts are stale, and the pinned message publishes the distortion continuously | Unchanged from Phase 1 and still a launch task. This phase raises its visibility, not its likelihood |

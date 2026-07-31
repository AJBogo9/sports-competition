# Guild Activity Competition: Specification

**Last updated:** 2026-07-30
**Status:** Requirements agreed. Not started. Language and reminder behaviour decided; competition
dates still under discussion (section 9, Q1) and are the only thing blocking a start.
**Companion documents:** [docs/evidence.md](docs/evidence.md) for citations,
[prototype/bot-flows.html](prototype/bot-flows.html) for the interaction mockup.

---

## 0. How to read this

Sections 1 to 4 are context: what this is, what constrains it, and how scoring works. **Section 5 is
the actual requirements list** and is what to build against. Section 10 is the build order.

Two things to know before changing anything:

- **Section 8 lists rejected alternatives with reasons.** Several are things that sound obviously
  good (a Mini App, MET-based scoring per sport, an individual leaderboard, encouraging teammates).
  They were considered and rejected for specific reasons. Read that section before re-adding one.
- **Section 9 lists open questions.** Three of them need answers before implementation starts.

---

## 1. What this is

A Telegram bot running a time-boxed physical activity competition between Aalto University student
guilds. People report once a day, in one tap, roughly how much they moved. Guilds are ranked on
activity per member.

**Population:** 9 guilds, roughly 4,650 members in total.

| Guild | Members |
|---|---|
| TiK | 700 |
| Prodeko | 650 |
| AS | 650 |
| FK | 600 |
| SIK | 450 |
| Aalto Accounting | 450 |
| MK | 400 |
| Inkubio | 400 |
| Athene | 350 |

These counts are carried over from the earlier system and **must be re-verified before use**. They
are the per-capita denominator, so a stale count silently distorts every comparison.

### Goals

1. Get as many students as possible moving, measured by breadth of participation rather than total
   volume.
2. Make reporting fast enough to survive weeks of repetition.
3. Put the competition where the social pressure already is: the guild group chat.
4. Stay small enough for one person to build and maintain alone.

### Non-goals

- **Verifying that activity happened.** No available mechanism verifies effort. Integrity comes
  from social visibility among people who know each other.
- **Serving people not on Telegram.** They could be shown standings but could not report, so read
  access would not make them participants.
- **Multiple concurrent competitions, or multiple organisations.**
- **Producing lasting habit change.** Median time to automaticity is 66 days with a range of 18 to
  254, and roughly half of people never get there (Lally et al. 2010). A competition of six to
  eight weeks should not claim this.

### Success criteria

Decide these before launch so the result is not argued about afterwards.

- Proportion of the 4,650 who register at all.
- Proportion of registered users who log in week 1, and again in the final week.
- Median days logged per registered user.
- Whether the bottom-ranked guilds' participation rose or fell over the competition.

Note the base rate: in a 10,183-participant workplace step challenge, one cohort had baseline data
for only about 12% of signups. **Registration is not participation.** Expect a large gap and say so
in advance.

---

## 2. Prior art, and why this is a rewrite

An earlier system exists: [`activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot).
Roughly 4,250 lines across a grammY bot, a Bun API server and a React web app, deployed on
Kubernetes with Flux CD. It was configured for a competition running 2025-12-24 to 2026-03-31.

**This design was derived from first principles and deliberately does not inherit its structure.**
It is recorded here only so its specific failures are not repeated.

### Defects to avoid repeating

1. **Points stored as a running total.** `users.points` was mutated on every write. Deletes, edits,
   backdating and any rule change all required manual compensation, and drift was silent and
   permanent. **This is the root defect** and several others followed from it.
2. **Computed points stored without their inputs.** Activities recorded the resulting points but
   not the MET value or its source version, so history could not be recomputed even when a value
   was known to be wrong.
3. **Debug endpoints shipped live.** `POST /api/simulation/activity/add` read a `points` value
   straight from the request body and added it to a user's total, with no environment guard. Any
   authenticated user could award themselves arbitrary points.
4. **No `auth_date` check on Mini App initData**, combined with caching the raw initData string as
   an auth result, so a captured string stayed valid indefinitely.
5. **A uniqueness index stricter than its comment claimed.** It was documented as preventing
   double-submits within a minute, but had no time component, so it silently rejected a legitimate
   second identical activity on the same day.
6. **A seven-step logging wizard**, which is the friction that produces mid-competition dropoff.
7. **No group-chat presence at all**, which is the one thing a bot can do that a website cannot.

---

## 3. Platform constraints

Verified against current Telegram documentation. These are true regardless of what the design would
prefer, and several of them invalidate otherwise reasonable approaches.

### 3.1 Logging cannot happen in a group chat

A bot in a group runs in Privacy Mode by default and "only sees messages explicitly meant for them,
general commands if they were the last to message, inline messages, and replies to their messages".
Disabling it requires re-adding the bot and grants it every message in the chat.

**Therefore:** reporting happens in a private chat. The group chat is for standings only. This is
not a preference, it is the only split available without asking guild boards for read access to
their own chat.

### 3.2 The bot cannot message anyone first

Users must write to the bot before it can message them. There is no way to invite, nudge or recruit
someone who has not started it.

**Therefore:** all recruitment flows through links posted into guild chats. And **a user who blocks
the bot is permanently unreachable**, which makes an annoying reminder an unrecoverable loss rather
than a minor irritation.

### 3.3 Deep links carry a payload

- `https://t.me/<bot>?start=<payload>` delivers `/start <payload>` in a private chat.
- `https://t.me/<bot>?startgroup=<payload>` adds the bot to a group and delivers
  `/start@<bot> <payload>`.

**Therefore:** guild assignment needs no UI, and group registration needs no admin tooling.

### 3.4 Message edits are silent

`editMessageText` updates a message in place without notifying chat members. A new message notifies.

**Therefore:** one renderer produces two different engagement registers: a permanently current
pinned leaderboard that never interrupts anyone, and a weekly post that does.

### 3.5 Update delivery defaults

`allowed_updates` defaults to every type except `chat_member`, `message_reaction` and
`message_reaction_count`. **`my_chat_member` is delivered by default**, so detecting the bot being
added to a group needs no configuration.

### 3.6 Rate limits and durability

Default broadcast limit is 30 messages per second, so a full send to 700 users takes about 24
seconds. Telegram retains undelivered updates for **24 hours**, so a short outage loses nothing.

### 3.7 If a Mini App is ever reconsidered

`WebAppInitData` "is empty if the Mini App was launched from a keyboard button or from inline
mode". Only the menu button, inline buttons, direct links, the attachment menu and the profile
button carry an authenticated identity. Recorded because it is the trap in that design, not because
one is planned.

---

## 4. The scoring model

### 4.1 What a person reports

One tap, once a day.

| Button | Stored as | Counts as |
|---|---|---|
| 15 to 30 min | `short` | 22 min |
| 30 to 60 min | `medium` | 45 min |
| 60+ min | `long` | 75 min |
| Not today | `rest` | 0 min |

Three tiers because that is roughly the resolution of honest self-report. Finer buckets spend
friction on precision the scoring does not use.

The top tier is **capped at 75 minutes**. Health benefit plateaus beyond about 300 minutes per week
(WHO 2020), so unlimited volume rewards the wrong behaviour and converts a participation
competition into a training log. The cap also bounds dishonesty: an inflating user gains at most
about three times an honest one.

### 4.2 Personal target

**150 minutes per week**, taken directly from the WHO guideline for adults 18 to 64. Achievable in
four sessions. Not comparative, so it is a win available to everyone regardless of rank.

### 4.3 Guild ranking

Minutes per member across the guild's **entire roster**, including everyone who never logs
anything. This is what makes activating quiet members the winning strategy rather than recruiting
the already-active.

Two tables, always published together:

- **This week**, reset every Monday
- **The season**, cumulative

A guild ninth for the season can still win the week. Without this, bottom guilds receive nothing but
repeated failure signals in their own group chat for the length of the competition.

### 4.4 Stored versus derived

The database stores **the tier the user tapped**, which is the ground truth of what they reported.
Minutes are derived from configuration at read time. No total is ever stored anywhere.

Consequences: deleting a record makes the standings correct with no compensating write; retuning
tier values recomputes all history; backdating needs no reconciliation; there is no running total,
so no drift.

---

## 5. Functional requirements

Each requirement has a rationale and an acceptance test. `MUST` is binding; `SHOULD` is a strong
default that may be traded away with a recorded reason.

### Registration

**FR-1. Guild deep links.** Each guild MUST have a unique link of the form
`https://t.me/<bot>?start=<guild-slug>`. Opening it registers the user to that guild immediately,
with no further input.
*Accept:* tapping a fresh guild link creates a user attached to that guild and shows a welcome
message, with zero additional taps.

**FR-2. Fallback registration.** A bare `/start`, or an unrecognised payload, MUST present a guild
selection keyboard.
*Accept:* `/start` with no payload lists all active guilds; selecting one registers the user.

**FR-3. Re-registration is idempotent.** Opening a guild link when already registered MUST NOT
create a duplicate or silently change the user's guild. It SHOULD offer an explicit guild change.
*Accept:* tapping a different guild's link as an existing user does not move the user without
confirmation.

**FR-4. Reminder choice at signup.** Immediately after registering, the bot MUST ask whether the
user wants a daily reminder and at what hour. Declining MUST be permitted and MUST leave reminders
off. There MUST be no silent default in either direction.
*Accept:* a user who declines receives no reminders; a user who picks 20:00 has that hour stored.

Since this single question decides whether the feature reaches anyone, it MUST present a
recommended option rather than read as a step to be skipped past. Phrase it as a real choice
between two named outcomes, not as "set a reminder time (optional)".

### Reporting

**FR-5. One-tap check-in.** The check-in MUST present the four options in section 4.1 and MUST
record the result in a single tap, with no confirmation step.
*Accept:* one tap from the check-in message produces a stored record.

**FR-6. Pull path.** `/log` MUST produce the same check-in message on demand.
*Accept:* `/log` at any time of day yields the identical keyboard.

**FR-7. One record per person per day.** A second report for the same date MUST replace the first,
not add to it.
*Accept:* logging `short` then `long` on the same day yields 75 minutes, not 97.

**FR-8. Rest day.** "Not today" MUST record an explicit rest, MUST count as zero minutes, and MUST
NOT break any streak.
*Accept:* a week containing rest days still counts toward the weekly streak if the 150 minute
target is met.

**FR-9. Undo.** The confirmation MUST offer an undo that removes the day's record entirely.
*Accept:* undo restores the exact weekly total from before the log.

**FR-10. Backdating.** The user SHOULD be able to log for the previous day. Backdating further than
one day is out of scope.
*Accept:* a "yesterday" option writes to the previous date and is subject to FR-7.

**FR-11. Optional tag.** The user MAY label a day (for example "swimming"). The tag MUST NOT affect
scoring in any way.
*Accept:* adding or removing a tag leaves every total unchanged.

### Feedback to the individual

**FR-12. Progress on every confirmation.** Each confirmation MUST show minutes so far this week
against the 150 minute target, including a visual progress indicator.
*Accept:* after logging 45 minutes on a week already holding 67, the message reads 112 / 150 with a
bar filled to roughly three quarters.

**FR-13. Weekly streak.** The bot MUST track consecutive weeks in which the user met the target.
Streaks MUST be counted in weeks, never days.
*Accept:* a user who hits 150 minutes in three consecutive weeks shows a streak of 3, regardless of
which days they rested.

**FR-14. `/me`.** MUST show weekly progress, the streak, and the user's guild rank this week.
*Accept:* `/me` returns all three without a database write.

**FR-15. No global individual leaderboard.** The bot MUST NOT expose an overall ranking of
individuals. It MAY show the user's immediate neighbours within their guild.
*Accept:* no command or message anywhere returns a list of the top N individuals overall.

### The competition

**FR-16. Guild standings.** `/standings` MUST show minutes per member for every active guild, for
the current week and for the season, with the weekly table first.
*Accept:* both tables render in one message and the denominators are full roster sizes.

**FR-17. Command scopes.** Commands MUST be scoped so that reporting commands appear only in
private chats and standings commands appear in group chats.
*Accept:* the command menu in a guild group offers `/standings` but not `/log`.

### The group chat

**FR-18. Group registration by link.** A guild board MUST be able to add the bot using
`https://t.me/<bot>?startgroup=<guild-slug>`, and the bot MUST record the chat and its guild with
no further administration.
*Accept:* adding the bot via the link results in a stored chat-to-guild mapping with no manual step.

**FR-19. Pinned standings.** The bot MUST post standings once per guild chat and pin them, then
update that same message on a timer using an edit.
*Accept:* the pinned message content changes over time and **no notification is generated** by the
update.

**FR-20. Monday post.** The bot MUST send a new message to each registered guild chat on Monday
morning, containing the previous week's result and framed as a fresh start.
*Accept:* the message is new (it notifies), it names last week's winner, and it states that the new
week starts at zero.

### Reminders

**FR-21. Daily reminder.** At each user's chosen hour, the bot MUST send the check-in message, and
MUST send it only to users who have not yet recorded that day.
*Accept:* a user who logged at 14:00 receives nothing at 20:00.

**FR-22. Check in after repeated non-response.** After **five consecutive** reminders with no
response, the bot MUST stop sending the daily reminder and MUST send one message asking whether to
continue, offering "keep them" and "turn them off". If that message is also ignored, reminders stay
paused and the message MUST have said how to turn them back on.
*Accept:* the sixth consecutive daily reminder is never sent; exactly one follow-up is sent; a user
who taps "keep them" resumes immediately.

**Rationale for the change.** An earlier draft silently stopped reminders at five. Now that
reminders are something the user explicitly asked for (Q2, section 9), silently revoking their
choice is wrong: they might simply have been away. Asking protects against the real risk, which is
that an ignored daily message eventually gets the bot blocked, and a blocked user is permanently
unreachable (section 3.2).

**FR-23. Block handling.** A 403 response MUST be recorded and MUST permanently stop sends to that
user.
*Accept:* a blocked user is never retried.

**FR-24. User control.** Reminders MUST be switchable off and back on at any time, and the hour
MUST be changeable, through a command that is discoverable from the command menu rather than only
documented in help text. Turning them off MUST take effect immediately, including for a reminder
already scheduled for later the same day.
*Accept:* a user who turns reminders off at 19:00 receives nothing at 20:00; turning them back on
restores the previously chosen hour.

### Administration

**FR-25. Configuration in version control.** Guild names, member counts, competition start and end
dates, tier values and the weekly target MUST live in a version-controlled configuration file, with
no admin UI.
*Accept:* changing a tier value and restarting recomputes historical standings.

**FR-26. Competition window.** Reports outside the configured competition window MUST NOT count
toward standings.
*Accept:* a backdated entry before the start date is rejected or excluded.

**FR-27. English only.** All user-facing text MUST be English. There MUST NOT be a per-user
language setting, an internationalisation framework, or a translation workflow. Guild names are
used as they are written in configuration.
*Accept:* every string a user can see is English, and adding a second language would be a new
feature rather than filling in an existing table.

---

## 6. Data requirements

Three tables. One row per person per day.

```sql
CREATE TABLE guilds (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  member_count  INTEGER NOT NULL CHECK (member_count > 0)
);

CREATE TABLE users (
  telegram_id     BIGINT PRIMARY KEY,
  guild_slug      TEXT NOT NULL REFERENCES guilds(slug),
  first_name      TEXT NOT NULL,
  username        TEXT,
  reminder_hour   SMALLINT,           -- NULL means reminders off
  ignored_streak  SMALLINT NOT NULL DEFAULT 0,
  blocked         BOOLEAN NOT NULL DEFAULT FALSE,  -- gates messaging, never scoring
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE days (
  telegram_id   BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  tier          TEXT NOT NULL,        -- short | medium | long | rest
  tag           TEXT,                 -- optional, scores nothing
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_id, date)
);

CREATE INDEX ON days (date);
```

Plus a mapping of guild to group chat, which may be a column on `guilds` if one chat per guild is
sufficient.

**The composite primary key on `days` makes double-logging structurally impossible.** No
duplicate-detection logic is needed anywhere, which is the failure mode that produced defect 5 in
section 2.

Standings for any period:

```sql
SELECT g.name,
       COALESCE(SUM(t.minutes), 0)                  AS minutes,
       COALESCE(SUM(t.minutes), 0) / g.member_count AS per_member
FROM guilds g
LEFT JOIN users u ON u.guild_slug = g.slug
LEFT JOIN days d  ON d.telegram_id = u.telegram_id AND d.date BETWEEN :from AND :to
LEFT JOIN tier_minutes t ON t.tier = d.tier     -- config-backed VALUES list
GROUP BY g.slug, g.name, g.member_count
ORDER BY per_member DESC;
```

**Two corrections to the query above, both found in implementation.** It is illustrative, and it was
wrong in two ways that are worth stating rather than quietly fixing in code:

1. **The division truncates.** `SUM(t.minutes) / g.member_count` on two integers makes `142 / 650`
   into `0` in Postgres, so every guild ties at zero. The implementation casts `::numeric` before
   dividing and `::float8` after. The bug is left visible in the query above on purpose: the
   docstring on `standings()` and a test in `tests/db/standings.test.ts` both cite it by name as
   the worked example of why the cast exists, and that test asserts the corrected behaviour.
2. **`AND NOT u.blocked` has been removed**, deliberately. Blocking the bot is a decision about
   being messaged, and §4.3 scores a guild across its entire roster including members who never log
   at all, so it cannot also be a decision about being counted. The clause is worse than merely
   wrong: because no total is ever stored (§4.4), every read recomputes from `days`, so excluding a
   blocked user does not stop counting them going forward, it retroactively erases every minute
   they ever logged. The first user to block the bot would make their guild's published season
   score visibly drop. `blocked` gates outbound messaging only. See FR-23.

Also add a unique tiebreaker to the `ORDER BY` (`g.slug`): guild names are not unique in this
schema, and without one Postgres may return different orderings across calls.

### Volume

A few hundred users over six to eight weeks is on the order of 10,000 to 30,000 rows, well under
50 MB with indexes. **No cache. No snapshot tables.** The predecessor's caching layer produced
invalidation bugs to solve a performance problem that does not exist at this size.

### Privacy

Store only what is needed: Telegram ID, display name, guild, reminder hour, and daily tiers. No
location, no health data beyond self-reported duration bands. Participants MUST be told at
registration that their first name and activity are visible to other participants.

---

## 7. Non-functional requirements

**NFR-1. Single process, outbound only.** The bot MUST use long polling. No public HTTPS endpoint,
no domain, no TLS certificate, no inbound ports.

**NFR-2. Deployment.** Two containers (bot and PostgreSQL) on one machine. **1 vCPU, 2 GB RAM,
20 GB disk** is comfortable. Roughly €3.50 to €6 per month on a small VPS, or zero on an existing
home server. Recheck prices before ordering: Hetzner repriced cloud servers on 15 June 2026.

**NFR-3. Backups.** A nightly `pg_dump` MUST be shipped off the machine. This is the one
operational step that must not be skipped; a competition that loses its data mid-run is over.

**NFR-4. No debug or simulation endpoints.** Any code path that can write points or activity data
without a real user action MUST NOT exist in a production build. See defect 3 in section 2.

**NFR-5. Restart safety.** All state lives in PostgreSQL. Restarting the process mid-competition
MUST lose nothing, and Telegram's 24-hour update retention covers the gap.

**NFR-6. Size.** Expect roughly **1,300 lines of application logic** (non-blank, non-comment), or
about 1,800 raw, plus 250 to 350 lines of tests and around 120 lines of deployment configuration.

Estimated bottom-up against section 5 and calibrated against the predecessor, whose `src/`
tree measures 3,163 effective lines for a system with no reminders, no group-chat presence and no
weekly reset, but with a seven-step wizard, a four-level activity hierarchy, profile and history
menus, a caching layer and an API server.

| Area | Effective lines |
|---|---|
| Config: guilds, window, tiers, target | 70 |
| English strings | 110 |
| Schema, connection, migrations | 105 |
| Queries: users, days, standings, streak, neighbours | 170 |
| Bot core: polling, shutdown, command scopes, callback router | 150 |
| Registration (FR-1 to FR-4) | 100 |
| Check-in (FR-5 to FR-11) | 140 |
| Renderers: progress, `/me`, standings, posts (FR-12 to FR-16) | 160 |
| Group chat (FR-18 to FR-20) | 120 |
| Reminders (FR-21 to FR-24) | 180 |

**Phase 1 alone is roughly 900 effective lines**, since it carries the config, schema, bot core and
both main flows. Phases 2 to 4 add about 150, 180 and 120.

If the total passes **2,000**, something from section 8 has crept back in. An earlier draft of this
requirement said 800 to 1,000, which was a guess made before reminders with a follow-up, dual
weekly and season standings, streaks and tags were added.

---

## 8. Rejected alternatives

Read this before re-adding any of them.

| Rejected | Reason |
|---|---|
| **A Mini App or web app** | Reintroduces a public HTTPS endpoint, a domain, TLS, CORS, an auth path and a frontend build, in order to display a list that renders fine as text. Nothing in section 5 requires it. It also removes the option of running on a home server |
| **Sport taxonomy with MET values per activity** | The only mechanism that can produce a "why is my sport worth less than yours" dispute. Removing the taxonomy removes the dispute rather than arbitrating it. It also demands a two-dimensional input where one suffices |
| **Per-sport scoring at all** | Per-capita scoring rewards breadth; volume-accurate scoring rewards depth. The earlier design combined both and was internally incoherent |
| **Free-form minutes entry** | Invites false precision, removes the honesty cap, and converts one tap into typing |
| **A global individual leaderboard** | Continuous low placement accumulates failure. Cheap to omit, and the neighbour view gives the useful part |
| **Encouraging or supporting teammates** | Directly contradicted by evidence: in an RCT of 790 students the social support arm scored *below* the control arm. See [docs/evidence.md](docs/evidence.md) §1.1 |
| **Elaborate team mechanics** | The same trial found comparison worked equally well with individual or team incentives. The guild structure earns its place through identity and through providing a group chat, not through team spirit |
| **Daily streaks** | The WHO guideline is weekly. A daily streak teaches that a rest day is a failure |
| **Weekly point caps** | The tier cap already bounds a day, making a separate weekly cap redundant |
| **Distance, GPS, photo or wearable verification** | Nothing available verifies effort. Location is invasive without being convincing |
| **An admin panel** | A configuration file and a restart is sufficient for nine guilds and one organiser |
| **Caching and snapshot tables** | Solves a performance problem that does not exist at this data volume, and introduces invalidation bugs that do |
| **Kubernetes** | Large operational surface for two containers |

---

## 9. Open questions

### Still open

**Q1. Competition length and dates.** Under discussion. Affects the scoring window, the number of
weekly resets, and the guild pitch. The evidence points to **6 to 8 weeks**: workplace step
challenges typically run 2 to 6 weeks, and in a 1,779-person trial the competition effect fell from
roughly 185 extra steps per day in week 1 to about 26 by week 12. A full term is longer than the
evidence supports.

This is now the **only question blocking implementation**, and it blocks only the configuration
file. Phases 1 and 2 of section 10 can be built against a placeholder window.

### Decided

**Q2. Reminders are a user choice, not a default.** *Decided 2026-07-30.* Every user is asked at
registration and can change it at any time. There is no silent default in either direction: nobody
is opted into daily messages without agreeing, and nobody has to discover a buried setting to get
them. See FR-4, FR-22 and FR-24.

The tradeoff, recorded honestly: an explicit ask will reach fewer people than defaulting everyone
to on, and forgetting is the dominant failure mode this feature exists to address. Two things
offset it. The wording of the single registration question does most of the work, so it should
present a recommended option rather than read as a skippable step (FR-4). And the Monday guild-chat
post reaches everyone in the group regardless of their personal setting, so turning reminders off
is not total silence.

**Q3. Language is English.** *Decided 2026-07-30.* Single locale, so no internationalisation
framework, no per-user language field, and no translation workflow. Guild names are used as they
are. See FR-27.

**Q4. FR-24's restore-on-resume clause is not met.** *Decided 2026-07-31.* FR-24's acceptance text
says turning reminders back on restores the previously chosen hour. Phase 3 stores "off" as
`reminder_hour = NULL`, which discards the hour rather than remembering it, so restoring it means
picking it again from `/remind` rather than it reappearing on its own.

Kept as is rather than adding a column and a migration to hold the hour separately from the on/off
state. That is a schema change of roughly 40 to 60 lines against a ceiling (NFR-6) that had only 114
lines of headroom at the time, with Phase 4 already budgeted at 120 of those. Re-picking the hour is
two taps.

### Unresolved but not blocking

- Are the guild member counts in section 1 current? They are the per-capita denominator.
- Are all nine guilds actually willing to add a bot to their group chat? Any guild that does not
  loses the engagement loop while still being scored, which makes their number meaningless.
- What are the success criteria, agreed in advance? See section 1.

---

## 10. Build order

Each phase is independently useful and independently testable. Do not start a phase before the
previous one works end to end.

### Phase 1: it counts things

Config file, three tables, registration by deep link, `/log`, `/standings`, `/me`.

*Done when:* two people on real phones can register to different guilds, log for several days
including backdated entries, and see standings that match hand-calculated numbers.

### Phase 2: it lives in the guild chat

`?startgroup=` registration, `my_chat_member` handling, the pinned standings message with its update
timer, the Monday post, command scopes.

*Done when:* the bot is in a test group, the pinned message updates without notifying, and a Monday
post fires on schedule.

### Phase 3: it comes to you

Reminder hour selection, the daily send, the five-ignore auto-stop, 403 handling, on/off controls.

*Done when:* a reminder arrives at the chosen hour, does not arrive after logging, and stops after
five ignores.

### Phase 4: it survives contact

Weekly streak, optional tags, undo edge cases, the nightly backup, deployment.

*Done when:* the backup restores into an empty database and reproduces the standings exactly.

**Phases 1 and 2 are the minimum viable competition.** Phase 3 is what determines whether people
are still using it in week four. Phase 4 is what determines whether the results survive.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Reminders annoy people into blocking the bot, making them permanently unreachable | High | Five-ignore auto-stop, user-chosen hour, honest rest-day button, visible off switch |
| A guild sits last all season and its members disengage | High | Weekly table alongside the season table so the position is never permanent |
| Self-reported data is inflated | Medium | Coarse tiers cap the gain at about 3x; per-capita over hundreds of members dilutes any individual |
| Registration is high and participation is low | Medium | Expected. Agree success criteria in advance and measure participation, not signups |
| Guild member counts are wrong or stale | Medium | Verify before launch. Changing one mid-competition changes all historical comparisons |
| A guild refuses the bot in its chat | Medium | They keep the private-chat path but lose the engagement loop. Establish willingness before launch |
| Data loss mid-competition | Low but fatal | NFR-3, and test the restore |

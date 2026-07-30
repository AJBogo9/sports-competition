# Guild Activity Competition: Design

**Date:** 2026-07-30
**Status:** Scope agreed, prototype stage. Implementation deferred until a competition date exists.
**Supersedes:** [`AJBogo9/activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot) (complete rewrite, not a migration)

---

## 1. Context

A previous system, `activity-challenge-bot`, implemented a physical-activity competition between
Aalto University student guilds. It was configured for a "Winter 2025-2026 Activity Challenge"
running 2025-12-24 to 2026-03-31. That codebase is roughly 4,250 lines across a grammY bot, a Bun
API server, and a React/Vite web app, deployed on Kubernetes (Talos Linux) with Flux CD on Hetzner
Cloud.

The decision is to rewrite from scratch with a deliberately minimal scope, keeping the ideas that
worked and discarding the machinery that did not earn its cost.

### Carried over from the predecessor

- **MET-based scoring.** `points = MET x minutes / 60`, using values from the 2024 Compendium of
  Physical Activities. This makes a swim and a run genuinely comparable and gives a published,
  citable authority to point at when guilds dispute the weighting.
- **Per-capita guild ranking against total guild membership**, not registered members. Guilds win by
  getting more people moving, not by recruiting the already-active. Counting zero-point members in
  the denominator is the load-bearing detail.
- **Telegram-native identity.** No passwords, no email verification, no password-reset support load.

### Discarded, with reasons

| Discarded | Reason |
|---|---|
| `users.points` as a stored running total | Root defect. Deletes, edits, backdating and rule changes all require manual compensation, and drift is silent and permanent |
| Storing computed points without the MET value or compendium version | History cannot be recomputed even when a value is found to be wrong |
| Seven-step logging wizard (category, subcategory, activity, intensity, date, duration, confirm) | Primary friction source in a habit that must repeat for months |
| Four-level activity hierarchy over the full compendium, with pagination | Large navigation surface and a data pipeline, to select a number from a range that clusters tightly |
| React/Vite web app, API server, static serving, CORS, initData auth | See section 3: removing it removes the entire public-HTTPS requirement |
| Two-message manager (208 lines) | Solved for free by `answerCallbackQuery` toasts plus `editMessageText` |
| Kubernetes, Talos, Flux CD | Large operational surface for a few hundred users |
| Daily snapshot tables, five-minute in-memory cache | Premature at this data volume; the cache introduced invalidation bugs |
| Feedback wizard, profile menus, activity-history browser, calendar widget | Not load-bearing for the competition |

### Known defects in the predecessor, recorded so the rewrite does not repeat them

1. **`/api/simulation/*` endpoints shipped unguarded.** `POST /api/simulation/activity/add` read
   `body.points` from the request and passed it straight to `addPointsToUser`. Any authenticated
   user could award themselves arbitrary points.
2. **No `auth_date` freshness check** on Mini App initData, combined with caching the raw initData
   string as an auth result. A captured initData string stayed valid indefinitely.
3. **A dedup index stricter than its comment.** The comment claimed "same activity within same
   minute", but the index on `(user_id, activity_type, activity_date, duration, points)` had no time
   component, silently rejecting a legitimate second identical activity on the same day.

---

## 2. Goals and non-goals

### Goals

- Run one time-boxed activity competition between a fixed set of student guilds.
- Make logging an activity fast enough to survive months of repetition.
- Make guild standings visible where the social pressure actually lives: the guild group chat.
- Keep the system small enough that one person can hold it in their head and maintain it alone.

### Non-goals

- Verifying that activity actually happened. The Telegram API offers nothing that verifies effort,
  and location sharing is both invasive and unconvincing. Integrity comes from social visibility
  among people who know each other, not from technology.
- Serving users who are not on Telegram. They could be shown standings, but they could not log
  activities, so read-only access does not make them participants.
- Supporting multiple concurrent competitions or multiple organisations.
- Rich analytics, charts, or rank history.

---

## 3. Platform constraints

These were verified against the current Telegram documentation and drive the architecture. They are
recorded because several of them invalidate designs that look reasonable.

### Privacy mode forbids in-group logging

A bot in a group runs in Privacy Mode by default and "only sees messages explicitly meant for them,
general commands if they were the last to message, inline messages, and replies to their messages".
Disabling it requires re-adding the bot and grants it every message in the chat.

**Consequence:** logging happens in DM. The group chat is for standings only. This is not a UX
preference, it is the only split the API permits without asking guild boards for surveillance
rights over their own chat.

### Bots cannot initiate conversations

Users must message the bot first. There is no way to DM, invite, or nudge someone who has not
started it.

**Consequence:** all recruitment flows through links posted into guild chats. Once a user registers
they have messaged the bot, so weekly digests and reminders to registered users are permitted.

### Deep links carry a payload

`https://t.me/<bot>?start=<payload>` delivers `/start <payload>` to the bot in a private chat.
`https://t.me/<bot>?startgroup=<payload>` adds the bot to a group and delivers
`/start@<bot> <payload>`.

**Consequence:** guild assignment needs no UI at all. See section 6.

### Keyboard-button Mini Apps receive no identity

`WebAppInitData` "is empty if the Mini App was launched from a keyboard button or from inline mode".
Only the menu button, inline buttons, direct links, the attachment menu and the profile button carry
initData. Recorded for completeness; this design has no Mini App.

### Update delivery defaults

`allowed_updates` defaults to all types except `chat_member`, `message_reaction` and
`message_reaction_count`. `my_chat_member` is delivered by default, so detecting the bot being added
to a group needs no configuration.

### Message edits are silent

`editMessageText` updates a message in place without notifying chat members, while a new message
notifies. This gives two distinct engagement registers from one rendering function: a silent
always-current pinned leaderboard, and a weekly post that lands as an event.

### Rate limits

Default broadcast limit is 30 messages per second (raisable to 1,000/s via paid broadcasts, which is
irrelevant here). A full broadcast to 700 users takes roughly 24 seconds.

---

## 4. Architecture

One process, one database.

```
Telegram  <--long polling-->  bot process  <-->  PostgreSQL
```

**Long polling, not webhooks.** The bot connects outbound only. This is possible because there is no
web app, and it is the single decision that removes the most infrastructure: no public HTTPS
endpoint, no domain, no TLS certificate, no reverse proxy, no ingress, no Kubernetes.

**Deployment:** one container for the bot, one for PostgreSQL, via Compose or systemd on a single
small machine.

**Configuration:** guilds, membership counts, competition dates and the activity list live in one
version-controlled config file. Changing them is an edit and a restart. There is no admin panel.

---

## 5. Data model

Three tables.

```sql
CREATE TABLE guilds (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  member_count  INTEGER NOT NULL CHECK (member_count > 0)
);

CREATE TABLE users (
  telegram_id   BIGINT PRIMARY KEY,
  guild_slug    TEXT NOT NULL REFERENCES guilds(slug),
  first_name    TEXT NOT NULL,
  username      TEXT,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activities (
  id            BIGSERIAL PRIMARY KEY,
  telegram_id   BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  activity_key  TEXT NOT NULL,
  met           NUMERIC(4,2) NOT NULL,
  minutes       INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 600),
  activity_date DATE NOT NULL,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON activities (telegram_id, activity_date);
CREATE INDEX ON activities (activity_date);
```

### Points are never stored

`activities` records the **MET value in force at the time of logging**, and points are always
derived:

```sql
SUM(a.met * a.minutes / 60.0)
```

This single rule fixes the predecessor's root defect and everything downstream of it:

- Deleting an activity makes the standings correct with no compensating write.
- Correcting a wrong MET value recomputes all affected history automatically.
- Backdating needs no reconciliation.
- There is no running total, therefore no drift, therefore no reconciliation job.

At the expected volume (a few hundred users, low tens of thousands of rows over a season) the full
aggregation is sub-millisecond. There is no cache and no snapshot table, and therefore no cache
invalidation bug.

### Guild standings query

```sql
SELECT g.name,
       COALESCE(SUM(a.met * a.minutes / 60.0), 0)              AS total_points,
       COALESCE(SUM(a.met * a.minutes / 60.0), 0) / g.member_count AS avg_points,
       COUNT(DISTINCT a.telegram_id)                           AS active_members
FROM guilds g
LEFT JOIN users u      ON u.guild_slug = g.slug
LEFT JOIN activities a ON a.telegram_id = u.telegram_id
                      AND a.activity_date BETWEEN :start AND :end
GROUP BY g.slug, g.name, g.member_count
ORDER BY avg_points DESC;
```

### Notes

- `guild_slug` is a real foreign key. The predecessor used an unconstrained `VARCHAR` validated in
  application code.
- No dedup index. The predecessor's caused false rejections of legitimate repeat activities.
  Accidental double-taps are prevented in the interaction layer instead: pressing a duration button
  is the commit, and it immediately rewrites that message into the confirmation, so the duration
  keyboard no longer exists to be pressed a second time. A stale callback arriving after the rewrite
  is answered and ignored.
- Membership counts live in `guilds` and are seeded from config. They are the per-capita
  denominator, so changing one mid-competition changes every historical comparison. Changes should
  be deliberate and announced.

---

## 6. Interaction design

### Registration: one tap

Each guild gets a link: `https://t.me/<bot>?start=prodeko`. Posted in the guild chat, in a guild
newsletter, on a poster as a QR code.

Tapping it opens the bot, sends `/start prodeko`, and the user is registered to that guild
immediately. There is no guild picker screen. The predecessor spent 83 lines on one.

A bare `/start` with no payload, or an unknown payload, falls back to a guild-selection keyboard.
This is the only place guild selection UI exists, and most users never see it.

### Logging: two taps

```
/log
  -> [Run] [Walk] [Cycle] [Gym] [Swim] [Ball] [Racket] [Ski] ...
  -> [15] [30] [45] [60] [90] [Other]
  -> toast: "Logged: Run 30 min, +4.0 points"
```

- Activity buttons come from a curated list of 10 to 14 entries, each with one fixed MET value cited
  from the 2024 Compendium. Not a hierarchy, not paginated.
- Duration buttons cover almost every real entry. "Other" prompts for a number. There is no free-text
  parsing in the common path.
- Confirmation is an `answerCallbackQuery` toast, not a message. The chat stays clean with no
  message-lifecycle machinery.
- Date defaults to today, with a "yesterday" button. No calendar widget.
- "Other" activity entries map to `other (moderate)` and `other (vigorous)` so nothing is
  unloggable.

### Standings

`/standings` renders the guild table. `/me` renders personal totals plus the user's guild rank.
One rendering function is shared by every surface that displays standings.

### The group-chat loop

1. A guild board taps `https://t.me/<bot>?startgroup=prodeko`.
2. The bot is added and receives `/start@<bot> prodeko`, learning the chat ID and which guild it
   belongs to in one step. No admin panel, no manual chat-ID collection.
3. The bot posts the standings once and pins that message.
4. A timer edits the pinned message periodically. Edits are silent, so the leaderboard is always
   current and never annoying.
5. A weekly post sends the standings as a new message, which does notify, landing as an event.

Steps 4 and 5 call the same renderer as `/standings`.

### Command scopes

`setMyCommands` with `BotCommandScopeAllPrivateChats` and `BotCommandScopeAllGroupChats` so that
`/log` and `/me` appear only in DMs and `/standings` only in groups. Users see only what applies
where they are.

---

## 7. Scope

Value is scored against the ways a guild competition actually fails: nobody registers (onboarding),
people register but never log (friction), people log for a week then stop (feedback loop), guilds
dispute the scoring (legitimacy), organisers cannot fix problems mid-run (operability), and cheating
destroys trust (integrity).

### In scope

| # | Feature | Prevents | Value |
|---|---|---|---|
| 1 | Registration via `?start=<guild>` deep link | Onboarding | Critical |
| 2 | `/log` with activity and duration keyboards | Friction | Critical |
| 3 | Points derived from stored `(met, minutes)` | Legitimacy, operability | Critical |
| 4 | `/standings` guild leaderboard | It is the competition | Critical |
| 5 | Guilds, dates and activities in one config file | Operability | Critical |
| 6 | Group onboarding via `?startgroup=<guild>` and `my_chat_member` | Feedback loop | Critical |
| 7 | Weekly standings post to guild chats | Feedback loop | Critical |
| 8 | Scoped command menus | Onboarding | High |
| 9 | Pinned, silently-updated standings message | Feedback loop | High |
| 10 | Toast confirmations via `answerCallbackQuery` | Friction | High |
| 11 | `/me` personal stats | Feedback loop | High |
| 12 | Undo last entry | Trust | High |
| 13 | Daily sanity cap (reject more than four hours in one day) | Integrity | High |

### Deferred

Individual top-20 leaderboard; backdating beyond yesterday; "guild X overtook guild Y" alerts;
inline-mode stat sharing via `answerInlineQuery`; weekly digest DMs; guild board admin rights
derived from `getChatAdministrators`; reactions as cheers; polls; per-guild forum topics; rendered
image standings; rank-history charts.

### Rejected, with reasons

| Rejected | Reason |
|---|---|
| Mini App | Reintroduces public HTTPS, a domain, TLS, auth and a frontend build, in order to display a list that renders fine as text. Nothing in the Critical band requires it |
| Browser access via Login Widget | Non-Telegram users cannot log activities anyway, so read access does not make them participants |
| Weekly point caps | Per-capita scoring over total membership already divides any single outlier by several hundred. A daily sanity cap achieves nearly the same protection in one line |
| GPS or distance verification | The API offers nothing that verifies effort. Live location is invasive and still proves nothing |
| Custom admin panel | Config file plus restart is sufficient for nine guilds and one organiser |
| Telegram Stars or gifts as prizes | Costs real money and is orthogonal to the software |
| Story sharing and emoji-status badges | Genuinely appealing, but both are Mini App exclusive and therefore cost the entire rejected Mini App |

---

## 8. Expected size

Roughly 700 to 900 lines, against roughly 4,250 in the predecessor's `src/` plus its web app.
Deployment is two containers on one machine.

---

## 9. Open questions

These are genuinely undecided and are not blocking the prototype.

1. **Is there a next competition, and when?** No date is currently set. If a deadline appears, the
   line in section 7 may need to move up further for the first run. Everything in the design assumes
   a single competition period defined in config.
2. **Where exactly the line sits.** Items 14 to 18 in the deferred list, particularly the individual
   leaderboard, overtake alerts and inline sharing, are the most likely candidates for promotion.
3. **Language.** The predecessor was English-only. Whether the rewrite needs Finnish, or both, is
   undecided. It affects only the text module.
4. **Whether the Winter 2025-2026 competition actually ran**, and if so what its participation and
   dropoff looked like. Real usage data would override several of the judgements above.

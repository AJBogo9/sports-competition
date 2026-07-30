# Guild Activity Competition: Design

**Date:** 2026-07-30
**Status:** Scope agreed, prototype stage. Implementation deferred until a competition date exists.
**Relationship to prior work:** Designed from first principles. An earlier system,
[`activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot), solved a similar
problem; this design deliberately does not inherit its structure.

---

## 1. What this is

A Telegram bot that runs a time-boxed physical activity competition between Aalto student guilds.
Guilds are ranked on activity per member. People report what they did in one tap per day.

The whole system is one bot process and one PostgreSQL database. There is no web app and no Mini
App, which means no public HTTPS endpoint, no domain, no TLS certificate and no inbound
connectivity of any kind.

---

## 2. Design principles, and the evidence behind them

Every non-obvious choice below traces to something in section 3.

1. **Report the day, not the workout.** A person can reliably say whether they moved and roughly
   for how long. They cannot reliably self-assess intensity, and most sports have no distance.
2. **The week is the unit of achievement.** Weekly boundaries create repeated fresh starts, and a
   season-cumulative score makes early failure permanent.
3. **Everyone has a target they can hit alone.** Comparative feedback alone rewards the people who
   least need it and discourages the people the competition exists for.
4. **No sport taxonomy in the scoring.** A taxonomy is the only thing that can generate a
   "why is my sport worth less" dispute. Removing it removes the dispute.
5. **Competition, never encouragement.** Support framing measurably backfires in this exact context.
6. **Reminders are opt-out, user-timed, and self-silencing.** A blocked bot can never message that
   person again, so an annoying reminder is an unrecoverable loss.

---

## 3. Evidence base

Full citations, study designs, exact reported figures, transfer caveats, and a list of claims that
did **not** survive checking are in **[docs/evidence.md](../../evidence.md)**. Summary:

| Finding, as actually reported | Source | What it changed here |
|---|---|---|
| 150 to 300 min/week moderate activity for adults 18 to 64; risk reduction plateaus beyond 300 | Bull et al. 2020, *Br J Sports Med* 54(24):1451-62 | Weekly target is 150 min, cited rather than invented. Daily contribution capped, since past the plateau extra volume is not what we should pay for |
| 4-arm RCT, n=790 students, 11 weeks. Attendance 90% higher in the two comparison arms (mean 1.9, SE 0.2) than the two without (mean 1.0, SE 0.2), p=0.003. Social support scored **below control**. Effects did not depend on individual vs team incentives | Zhang et al. 2016, *Prev Med Rep* 4:453-8 | Guild-vs-guild framing kept. All encouragement features rejected. No team mechanics beyond identity and the group chat, since comparison worked equally either way |
| Team competition raised mean daily steps by 105.8 (SE 35.8, p=0.03) in 1,779 interns. Effect fell ~14.5 steps per additional week in study, **though that decay was not significant (p=0.16)** | Wang et al. 2023, *npj Digit Med* | Strongest argument for a short competition. Most of the benefit is early |
| Aspirational behaviour rises after temporal landmarks; **university gym attendance rises at the start of a new week**, month and semester | Dai, Milkman & Riis 2014, *Manage Sci* 60(10):2563-82 | Monday reset alongside the season table. The Monday post is a fresh start, not a report card |
| Gamification produces a small to moderate effect on physical activity: 16 RCTs, 2,407 participants, Hedges' g = 0.42, persisting past follow-up. No significant difference between populations | Mazeas et al. 2022, *J Med Internet Res* 24(1):e26779 | Justifies running a gamified competition at all. Note it does **not** rank individual game elements, see evidence.md §3.2 |
| 8-week national step challenge, 10,183 participants: +906 steps/day between weeks 1 and 8. Signup-to-participation conversion around 12% in one cohort | Niven et al. 2021, *IJERPH* 18(10):5140 | 6 to 8 weeks rather than a term. Expect registration to greatly exceed participation |
| Prompting increased proximal engagement; recently disengaged users needed multi-day back-off before further prompts helped | Bidargaddi et al. 2018, *JMIR Mhealth Uhealth* 6(11):e10123 | User-chosen reminder hour, and automatic stop after five consecutive non-responses |
| Median 66 days to automaticity, range 18 to 254; roughly half never reached it | Lally et al. 2010, *Eur J Soc Psychol* 40(6):998-1009 | Do not promise habit change. Design for the competition window |
| Competence, autonomy and relatedness as basic needs; purely comparative feedback serves competence only for those already winning | Ryan & Deci 2000, *Am Psychol* 55(1):68-78. **Theory, not a trial** | The non-comparative 150 min target exists to give everyone a win that does not require beating anyone |
| Leaderboard design: continuous low placement accumulates failure; combine overall with local views | Park & Kim 2021, *JMIR Serious Games* 9(2):e14746. **Education context, and a design study rather than a trial** | Neighbours instead of a global individual ranking. Present modestly, see evidence.md §3.1 |
| Streaks work by loss aversion and need forgiveness | Duolingo product reporting. **Company-sourced, not peer reviewed** | Streaks counted in weeks, so rest days stay neutral. Do not quote the percentages |

---

## 4. Scoring

### What a person reports

One tap, once a day:

| Button | Recorded as | Counts as |
|---|---|---|
| 15 to 30 min | `short` | 22 min |
| 30 to 60 min | `medium` | 45 min |
| 60+ min | `long` | 75 min |
| Not today | `rest` | 0 min |

Three tiers because that is roughly the resolution of honest self-report. Finer buckets invite
agonising over whether a session was 55 or 65 minutes, which spends friction on precision the
scoring does not need.

The `long` tier is capped at 75 minutes deliberately. Past roughly 300 minutes a week the health
benefit plateaus, and rewarding unlimited volume converts a participation competition into a
training-log competition. It also caps dishonesty: the most an inflating user can gain is about
three times an honest one, where an unbounded minutes field would allow far more.

### Personal target

**150 minutes a week**, taken directly from the WHO guideline. It is achievable in four sessions,
it is not comparative, and it comes with an external citation rather than being invented here.

### Guild ranking

Minutes per member, counting the guild's entire roster including everyone who never logs anything.
This is what makes activating inactive members the winning strategy rather than recruiting the
already-active.

Two tables are published, always together:

- **This week**, reset every Monday
- **The season**, cumulative

A guild that is ninth for the season can still win the week. This is the whole point: without it,
the bottom guilds receive nothing but repeated failure signals in their own group chat, which
suppresses exactly the population the competition exists to reach.

### Stored versus derived

`days` stores the **tier the user actually tapped**, which is the ground truth of what they
reported. Minutes are derived from config at read time, so retuning tier values recomputes history
rather than rewriting it. No total is ever stored.

---

## 5. Data model

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

Three tables. One row per person per day, so **double-logging is structurally impossible** rather
than something to detect and guard against. Undo is deleting one row. Logging again on the same day
corrects that day rather than appending to it, which matches how people think about a day.

Guild standings for a period:

```sql
SELECT g.name,
       COALESCE(SUM(t.minutes), 0)                  AS minutes,
       COALESCE(SUM(t.minutes), 0) / g.member_count AS per_member
FROM guilds g
LEFT JOIN users u ON u.guild_slug = g.slug
LEFT JOIN days d  ON d.telegram_id = u.telegram_id AND d.date BETWEEN :from AND :to
LEFT JOIN tier_minutes t ON t.tier = d.tier      -- a config-backed VALUES list
GROUP BY g.slug, g.name, g.member_count
ORDER BY per_member DESC;
```

At a few hundred users over a season this is a few thousand rows. No cache, no snapshot tables, no
invalidation.

---

## 6. Interaction design

### Registration: one tap

Each guild gets a link, `https://t.me/<bot>?start=prodeko`, posted in its own chat or printed as a
QR code. Opening it sends `/start prodeko` and registration is complete. There is no guild picker.
A bare `/start` falls back to a selection keyboard, which most users never see.

Immediately after registering, the user is asked once for a reminder time. Skipping is allowed and
leaves reminders off.

### Logging: one tap

The daily message, either pushed at the user's chosen hour or pulled with `/log`:

```
Moved today?

[ 15 to 30 min ]
[ 30 to 60 min ]
[ 60+ min ]
[ Not today ]
```

The confirmation rewrites the same message in place:

```
45 min. Good.

This week   112 / 150 min
            ███████░░░
One more session does it.

[ Undo ]        [ Say what it was ]
```

The progress line carries goal, progress and feedback together, which are the three elements with
the strongest evidence behind them, and it is non-comparative, so it is available to everyone
regardless of where they sit against anyone else.

### The optional tag

"Say what it was" records a label that **scores nothing**. It feeds colour in the weekly post
("Inkubio has done more swimming than everyone else put together"). Because it carries no points,
the list can be loose and nobody has to agree on it.

### `/me`

```
This week    112 / 150 min
Streak       3 weeks at target
Guild        Prodeko, 4th of 9 this week

Just ahead of you
  Sanna     134 min
  you       112 min
  Otto       98 min
```

Deliberately **no global individual leaderboard.** Only the immediate neighbourhood, per the
leaderboard research. Seeing yourself at 340th of 400 has no upside for anyone.

### Reminders

Sent at the user's chosen hour, only to people who have not logged that day.

- `[ Not today ]` dismisses without judgement and records a rest day, so the day is accounted for.
- After **five consecutive** unanswered reminders, they stop automatically. Someone ignoring five
  will not be won by a sixth, and continuing is how a bot gets blocked.
- A 403 from Telegram means the user blocked the bot. Record it and never try again.
- Reminders can be switched off at any time and re-enabled later.

### The guild group chat

A board member taps `https://t.me/<bot>?startgroup=prodeko`. The bot is added and receives
`/start@<bot> prodeko`, learning the chat and its guild in one step, with no admin panel and no
manual chat-ID collection.

**A pinned message**, edited on a timer. Message edits do not notify, so it is permanently current
and permanently silent. It shows the week first, the season second.

**A Monday morning post**, which does notify, framed as a fresh start rather than a report card:
last week's result, then everyone back to zero. Monday is chosen because it is the temporal landmark
where student gym attendance measurably rises.

---

## 7. Scope

| # | Feature | Why | Value |
|---|---|---|---|
| 1 | Registration via `?start=<guild>` | One tap, no picker to build | Critical |
| 2 | One-tap daily logging, three tiers | The entire input surface | Critical |
| 3 | Tier stored, minutes derived, nothing totalled | Corrections and retuning recompute for free | Critical |
| 4 | Weekly personal target of 150 min with progress | Best-evidenced motivational element, non-comparative | Critical |
| 5 | Guild standings, weekly and season | The competition, without permanent last place | Critical |
| 6 | Group onboarding via `?startgroup=<guild>` | No admin work per guild | Critical |
| 7 | Monday post, fresh-start framed | Retention, at the landmark that works | Critical |
| 8 | Daily reminder, user-timed, self-silencing | Attacks forgetting, which tap-count cannot | Critical |
| 9 | Config file for guilds, dates, tiers, target | Operability | Critical |
| 10 | Pinned live standings | Ambient, silent, reuses the renderer | High |
| 11 | Toast confirmations via `answerCallbackQuery` | No message clutter, no lifecycle to manage | High |
| 12 | Undo | Misclicks are certain when one tap commits | High |
| 13 | `/me` with weekly progress, streak, neighbours | Personal feedback without a global ranking | High |
| 14 | Weekly streak counter | Loss aversion without punishing rest | High |
| 15 | Scoped command menus | Right commands in the right chat | High |

### Deferred

Optional activity tags in the weekly post; backdating beyond yesterday; overtake alerts; inline
stat sharing; guild board self-service admin; per-guild forum topics; rendered image standings.

### Rejected, with reasons

| Rejected | Reason |
|---|---|
| Sport taxonomy and MET values | The only mechanism that can produce a fairness dispute, and per-capita scoring discards the precision it buys |
| Global individual leaderboard | Accumulates perceived failure for exactly the population the competition targets |
| Any "support your guildmates" feature | Measurably backfires: team support halved exercise versus competition, by drawing attention to the least active |
| Daily streaks | WHO recommends 150 to 300 min per week, not daily activity. A daily streak teaches that rest is failure |
| Free-form minutes entry | Invites false precision, removes the honesty cap, and turns one tap into typing |
| Mini App | Reintroduces HTTPS, a domain, TLS and a frontend build to display a list |
| Weekly point caps | The tier cap already bounds a day, so a separate weekly cap is redundant |
| Distance, GPS or photo verification | Nothing available verifies effort, and location is invasive without being convincing |

---

## 8. Architecture and deployment

```
Telegram  <--long polling-->  bot process  <-->  PostgreSQL
```

Long polling means outbound connections only: no domain, no certificate, no open ports. Telegram
retains undelivered updates for 24 hours, so a short outage costs nothing.

Two containers on one small machine. **1 vCPU, 2 GB RAM, 20 GB disk** is comfortable, roughly €3.50
to €6 a month, or zero on an existing home server. A nightly `pg_dump` shipped off the box is the
one operational thing not to skip.

Estimated size is roughly 800 to 1,000 lines.

---

## 9. Open questions

1. **Competition length and dates.** No date is set. The evidence points to **6 to 8 weeks**:
   workplace challenges usually run 2 to 6, engagement declines with novelty, and an 8-week
   programme shows a documented dip around week 7. A full term is longer than the literature
   supports, and habit formation at a median 66 days is not achievable inside any of these windows
   anyway.
2. **Language.** English, Finnish, or both. Affects only the text module.
3. **Reminder default.** Whether reminders are on by default with the five-ignore auto-stop, or
   strictly opt-in. Default-on is where the value is; opt-in is safer and will reach far fewer
   people.
4. **Whether guild membership counts are current.** They are the per-capita denominator, so a stale
   count silently distorts every comparison, and changing one mid-competition changes all history.

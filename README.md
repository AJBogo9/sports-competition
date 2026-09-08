# Sports Competition

A small Telegram bot that runs a time-boxed physical activity competition between Aalto University
student guilds. Each member taps one button a day to say roughly how much they moved. Guilds are
ranked on active days per member, across their whole roster, so the way to win is more people
moving rather than a few people training hard.

It is one long-polling process and one PostgreSQL database. There is no web app, no domain and no
inbound port. MIT licensed: do whatever you like with it.

## What a member sees

Everything happens in a private chat with the bot, except the standings, which also live in each
guild's group chat.

- **Joining.** A guild posts its own link (`https://t.me/<bot>?start=<slug>`). Opening it registers
  the member for that guild, explains the rules in one message, and asks whether they want a daily
  reminder and at what hour. Reminders are opt-in and never defaulted.
- **Logging.** `/log` (or the reminder itself) shows four buttons: *15 to 30 min*, *30 to 60 min*,
  *60+ min* and *Not today*. One tap is the whole check-in. Tapping again replaces the day, there
  is an undo, and yesterday can be logged in case of forgetting. The confirmation shows the week's
  progress bar toward the personal target and names the guild the day counted for. Crossing the
  weekly target for the first time gets a celebration reaction, and a run of weeks on target is
  named as a streak.
- **`/me`.** The week's bar, the streak, the guild's rank this week, and up to three guildmates
  ranked around the member. There is deliberately no leaderboard of individuals anywhere.
- **`/standings`.** Two tables, this week and the season, ranked on active days per member.
  What is printed is the count of active days and the rank, never an average.
- **The group chat.** A guild's board adds the bot to their group, and it keeps a pinned standings
  message up to date. Every Monday morning it posts last week's result for that guild, the number
  of people who logged at least once, and the mark to beat. The last Monday closes the season.
- **`/remind`, `/target`.** Change the reminder hour, or turn reminders off. Raise the weekly target
  above the 150-minute WHO guideline. Five unanswered reminders in a row pause them and ask once
  whether to continue; the bot never nags after that.

Every rule above has a reason, usually a trial or a review in exercise psychology, and
[docs/evidence.md](docs/evidence.md) cites it. Several obvious features (an individual leaderboard,
scoring by sport, a Mini App, posting participation as a percentage) were rejected on evidence and
are listed with their reasons in [SPEC.md](SPEC.md) section 8.

## How it works

The design fits in a few sentences:

- **One tap a day, four coarse tiers.** No sport taxonomy, so there is nothing to argue about or
  to verify. The top tier is capped, which bounds both the reward for training hard and the value
  of lying.
- **Active days per member across the whole roster.** Everyone in the guild counts, logging or not.
  A day is a day whoever logs it, so nobody can carry a guild and the competitive members become
  recruiters.
- **Nothing is ever totalled and stored.** The database holds the tier each user tapped, and every
  number a person sees is derived from that at read time. Corrections, undo and config changes
  recompute for free, and nothing can drift.
- **The message comes to you.** Forgetting is what ends these competitions, not friction, so the
  reminder lands at the hour the member chose and silences itself when ignored.
- **No session state in the process.** Every button carries its full meaning, so a tap on a
  message sent before a restart still works, and payloads that could be stale (a check-in from
  last week) are refused rather than trusted.

The code is TypeScript on [Bun](https://bun.sh) with [grammY](https://grammy.dev) and
[postgres.js](https://github.com/porsager/postgres). Dependencies point one way, so scoring is
never tested through Telegram:

```
config.ts -> domain/ (pure) -> db/ (SQL) -> bot/handlers -> bot/render.ts (pure)
```

Dates and week boundaries are computed in SQL in `Europe/Helsinki`, because the window straddles a
clock change and JavaScript date arithmetic gets that wrong.

## Repository map

| Path | What it is |
|---|---|
| `src/config.ts` | The only place guilds, member counts, competition dates, tier minutes and the target exist |
| `src/domain/` | Pure functions: scoring, streaks, ranking, the Monday-post and reminder decisions |
| `src/db/` | All SQL, including the migrations. `calendar.ts` is where every date bucket comes from |
| `src/bot/` | The grammY handlers, one file per flow, plus `render.ts` (pure formatting) and `ticker.ts` (the 60-second loop behind the pin, the Monday post and the reminders) |
| `src/strings.ts` | Every piece of copy the bot sends |
| `tests/` | The automated suite. `tests/db/` runs against a disposable Postgres |
| `SPEC.md` | The requirements, numbered FR-1 to FR-31 and NFR-1 to NFR-6. Code comments cite these |
| `docs/design/` | One design document per build phase, recording the decisions the spec leaves open |
| `docs/evidence.md` | The sources behind every design decision, and the claims that did not survive checking |
| `docs/research/` | The research briefings the fun pass and the scoring rule were built from |
| `docs/SMOKE.md` | The manual checklist for the Telegram-facing code, which has no automated tests by design |
| `docs/smoke-runs/` | Reports from running that checklist against a live bot |
| `CLAUDE.md` | The maintainer's guide: the invariants that are easy to break, and why each one matters |
| `scripts/` | Dump and restore a self-hosted database by hand |

If you want to read the project rather than the code, the order is [SPEC.md](SPEC.md) sections 1,
4 and 8, then [docs/evidence.md](docs/evidence.md), then the design documents in date order.

## Run it locally

You need [Bun](https://bun.sh) and Docker.

1. `cp .env.example .env`, then fill in `BOT_TOKEN` from [@BotFather](https://t.me/BotFather)
   (`/newbot`, then copy the token) and a `POSTGRES_PASSWORD` of your choosing. `DATABASE_URL`
   already matches `docker-compose.yml`. `.env` is gitignored.
2. `docker compose up -d --build` starts the bot and its database. `docker compose logs -f bot`
   shows the boot log, which prints the competition window and then `@<bot> polling`.
3. **Any change under `src/` needs `docker compose up -d --build`, not `docker compose restart bot`.**
   The image copies `src` in at build time, so a restart keeps running the old code.

The compose `db` service is a throwaway database in a local volume. It is the development path,
not a deployment, and nothing backs it up.

On a network that sinkholes `api.telegram.org` (some university networks do) the bot hangs before
its polling line. An untracked `docker-compose.override.yml` with
`extra_hosts: ["api.telegram.org:<real ip>"]` on the bot service gets it through.

## Test it

```bash
bun run test:db          # starts the disposable db-test container, then the full suite
bun test tests/domain    # one directory; the pure tests need no database
bunx tsc --noEmit        # typecheck; there is no linter
```

`bun test` alone fails on `tests/db/*` unless the `db-test` service is up. The Telegram-facing
handler files are covered by [docs/SMOKE.md](docs/SMOKE.md) instead, on purpose: what they do is
send messages, and the decisions behind those messages are pure functions with their own tests.

Never run the `test` compose profile on a production host. `db-test` binds a host port and uses a
throwaway password.

## Status

- **Built.** Registration, logging, `/me`, `/standings`, the group chat with its pinned standings
  and Monday post, reminders with the five-ignore pause, `/remind`, `/target`, the celebration and
  the streak. The automated suite passes and the first manual smoke run was done on 2026-09-08
  ([docs/smoke-runs/2026-09-08.md](docs/smoke-runs/2026-09-08.md)).
- **Not yet deployed.** The intended home is Tietokilta's infrastructure (below), and that change
  has not been raised. Until then there is no off-machine backup of anything.
- **Not yet smoked with real people.** The smoke run used one account and one group. The reminder
  hour, the five-ignore follow-up, a second account's registration and days passing are still
  untested against Telegram.
- **Competition dates are placeholders** in `src/config.ts` (SPEC.md section 9 Q1), and the nine
  member counts are carried over from the previous system and need re-verifying: they are the
  denominator of every ranking.

## Deploy

The bot is built to run on Tietokilta's infrastructure
([`Tietokilta/infra`](https://github.com/Tietokilta/infra)): the process as a NixOS service on
`tikpannu` beside the guild's other Telegram bots, and the database on the shared Azure PostgreSQL
flexible server. Putting the database there is what satisfies the backup requirement (SPEC.md
NFR-3): that server's databases are dumped nightly and shipped off-site, so this bot's data is
covered from the moment its database exists. What this repository provides toward it is
`tests/db/restore.test.ts`, which proves a dump restores into an empty database and reproduces
every published number, in both dump formats.

| Piece | Where | Note |
|---|---|---|
| Database | a Terraform module calling `modules/service_database` | The `db_name` is what the nightly backup discovery picks up |
| Bot package | `Tietokilta/tikbots` | The flake `modules/tikbots/default.nix` imports |
| NixOS service | `tikpannu-nixos-config/modules/tikbots/` | Follow `tikbot.nix`: a sops secret for the token and an env file owned by the service user |
| Secrets | `tikpannu-nixos-config/modules/secrets/` | `BOT_TOKEN` and `DATABASE_URL`. The database password comes from `service_database` |
| `DATABASE_URL` | that env file | Must end `?sslmode=require`. postgres.js reads it from the URL, so no code change is needed |

Anyone self-hosting instead can run the compose stack on a small VPS or a home server. Two
containers, one machine. `scripts/dump.sh` and `scripts/restore.sh` move such an instance by hand;
they are a convenience, not a backup.

Before pointing any deployment at a real competition: set the real dates in `src/config.ts`,
re-verify every guild's `memberCount`, and read the launch notes below.

## Launch notes

Things the bot cannot do for you, in the order they come up:

- **Post each guild's own link** (`https://t.me/<bot>?start=<slug>`, slugs in `src/config.ts`) in
  that guild's chat, and add the bot to the chat with permission to pin. Adding it with
  `https://t.me/<bot>?startgroup=<slug>` binds the chat in one step. Without pin permission the
  standings message still appears and updates, with a line asking for admin rights.
- **Ask each guild board for two or three well-liked, ordinary-fitness members** to log and say so
  in the guild chat in weeks one and two. Seeding through nominated friends is the one recruitment
  method with trial evidence behind it ([docs/evidence.md](docs/evidence.md) section 6.7).
- **Do not post totals, averages or shares yourself.** The bot shows counts and ranks only, on
  purpose (SPEC.md sections 4.3 and 8).
- **There is no off switch for the group chat alone.** Stopping the bot stops everything, and
  deleting a chat's row unbinds it but orphans the pinned message. Decide which before you need
  it.

## History

This replaces [`activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot), and was
designed from scratch rather than derived from it. [SPEC.md](SPEC.md) section 2 records the
defects worth not repeating. The bot was built in five phases between July and September 2026,
each with a design document in `docs/design/`, and the size is tracked as a trend rather than
capped (SPEC.md NFR-6): about 2,300 effective lines of application code.

# Sports Competition

A minimal Telegram bot for running a time-boxed physical activity competition between Aalto
University student guilds. One tap per day, guilds ranked on minutes per member.

**Status:** Phases 1 and 2 are built: registration, `/log`, `/me`, `/standings`, the group chat
(binding, pinned standings, the Monday post), and the Docker deployment below. English, and
reminders are a per-user choice. Phase 3 (reminders actually being sent) and Phase 4 (optional
tags, the nightly backup) are not built ([SPEC.md](SPEC.md) §10). Competition dates are still a
placeholder in `src/config.ts` ([SPEC.md](SPEC.md) §9); see Deploy below.

## Start here

| Document | What it's for |
|---|---|
| **[SPEC.md](SPEC.md)** | The requirements. Numbered, testable, with a build order. This is the source of truth |
| [docs/evidence.md](docs/evidence.md) | Primary citations for every design decision, with exact figures and the claims that did not survive checking |
| [prototype/bot-flows.html](prototype/bot-flows.html) | Clickable mockup of every screen. Open it in a browser |

## Deploy

1. `cp .env.example .env`, then fill it in: `BOT_TOKEN` from [@BotFather](https://t.me/BotFather)
   (`/newbot`, then copy the token it gives you), and a `POSTGRES_PASSWORD` of your choosing.
   `DATABASE_URL` already matches `docker-compose.yml`; leave it as is. `.env` is gitignored and
   never committed.
2. `docker compose up -d --build` starts the bot and its database. Logs: `docker compose logs -f
   bot`.
3. Before pointing this at a real competition, replace the placeholder dates in `src/config.ts`
   (`COMPETITION_START` / `COMPETITION_END`, see the comment there) and re-verify every guild's
   `memberCount`: it is the denominator of every ranking, so a stale count silently distorts every
   comparison in the competition.
4. For the eventual move to the guild's own hosting: `scripts/dump.sh` writes a timestamped dump to
   `./backups`, and `scripts/restore.sh <dump.sql>` replaces the contents of a running database with
   one. Copy the latest dump and `.env` over, then restore on the new host.

A guild's board adds the bot to their own group chat with `https://t.me/<bot>?startgroup=<slug>`
(their guild's slug from `src/config.ts`), which binds the chat and starts a pinned standings
message that keeps itself updated. Pinning needs the bot to be a chat admin with permission to
pin; without that permission the same message still appears and still updates, just unpinned,
with a line asking for admin rights until it gets them.

**Never run the `test` compose profile (`db-test`) on the production host.** It binds a port on the
host and uses a throwaway password; it exists only for `bun test` against a disposable database.

## The design in six lines

- **One tap a day.** Three coarse duration tiers plus a rest day. No sport taxonomy, so there is
  nothing to argue about.
- **The message comes to you** at an hour you choose, and silences itself after five ignores.
  Forgetting is the failure that ends these competitions, not friction.
- **A weekly target of 150 minutes**, taken from the WHO guideline, so there is a win available to
  everyone that does not require beating anyone.
- **Guilds ranked per member across the whole roster**, weekly and cumulative, so last place is
  never permanent.
- **Nothing is ever totalled and stored.** The database records what the user tapped; every number
  is derived at read time, so corrections and rule changes recompute for free.
- **Bot only, long polling.** No web app, no domain, no TLS, no inbound ports. It runs on a home
  server or a small VPS.

Roughly 1,300 lines of logic, two containers, one machine. See [SPEC.md](SPEC.md) NFR-6 for the
breakdown.

## Relationship to the earlier bot

This replaces [`activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot) and was
designed from scratch rather than derived from it. [SPEC.md](SPEC.md) §2 records the specific
defects worth not repeating, and §8 records the alternatives that were rejected and why. Read §8
before re-adding anything that seems obviously missing.

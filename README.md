# Sports Competition

A minimal Telegram bot for running a time-boxed physical activity competition between Aalto
University student guilds. One tap per day, guilds ranked on minutes per member.

**Status:** specified, not started. Three questions in [SPEC.md](SPEC.md) §9 block implementation.

## Start here

| Document | What it's for |
|---|---|
| **[SPEC.md](SPEC.md)** | The requirements. Numbered, testable, with a build order. This is the source of truth |
| [docs/evidence.md](docs/evidence.md) | Primary citations for every design decision, with exact figures and the claims that did not survive checking |
| [prototype/bot-flows.html](prototype/bot-flows.html) | Clickable mockup of every screen. Open it in a browser |

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

Roughly 800 to 1,000 lines, two containers, one machine.

## Relationship to the earlier bot

This replaces [`activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot) and was
designed from scratch rather than derived from it. [SPEC.md](SPEC.md) §2 records the specific
defects worth not repeating, and §8 records the alternatives that were rejected and why. Read §8
before re-adding anything that seems obviously missing.

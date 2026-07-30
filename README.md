# Sports Competition

A minimal Telegram bot for running a time-boxed physical-activity competition between student
guilds, scored per capita on MET-hours.

Complete rewrite of [`activity-challenge-bot`](https://github.com/AJBogo9/activity-challenge-bot),
with a deliberately tighter scope.

**Status:** design and prototype. No implementation yet.

## Design

[Design document](docs/superpowers/specs/2026-07-30-guild-activity-competition-design.md)

The short version:

- **Bot only.** No Mini App, no web app. Long polling, so the process needs no inbound
  connectivity, no domain, no TLS and no public HTTPS endpoint.
- **Points are never stored.** Activities record the MET value and duration used at logging time;
  points are derived at read time. Deletes, edits and MET corrections all recompute for free.
- **Per-capita guild ranking** against total guild membership, so guilds win by getting more people
  moving rather than by recruiting the already-active.
- **One tap to register** via `t.me/<bot>?start=<guild>` deep links, **two taps to log** an activity.
- **The group chat is the engagement loop:** a silently-updated pinned leaderboard plus a weekly
  post that notifies.

Roughly 700 to 900 lines, two containers, one small machine.

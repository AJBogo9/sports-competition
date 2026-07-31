# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                          # full suite (172 tests); DB tests need db-test running
bun run test:db                   # starts the disposable db-test container, then bun test
bun test tests/domain             # one directory
bun test tests/db/standings.test.ts   # one file
bun test -t "divides by the full roster"   # one test by name
bunx tsc --noEmit                 # typecheck; there is no linter, this is the static check
bun run start                     # run the bot locally (needs BOT_TOKEN and DATABASE_URL)
docker compose up -d --build      # bot + db
docker compose logs -f bot
```

`bun test` alone fails on `tests/db/*` unless the `db-test` service is up. Bun auto-loads `.env`,
so `TEST_DATABASE_URL` is picked up from there.

**Never run the `test` compose profile on the production host.** `db-test` binds a host port and
uses a throwaway password.

## Documents, in precedence order

- **[SPEC.md](SPEC.md) is the source of truth.** §5 is the numbered requirements list (FR-1 to
  FR-27, NFR-1 to NFR-6); code comments cite these IDs and so should yours. §8 lists deliberately
  rejected alternatives (Mini App, MET-based scoring, individual leaderboard). Re-adding one is a
  defect, so read §8 before adding anything that looks obviously missing. §10 is the build order.
- [docs/superpowers/specs/2026-07-30-telegram-bot-phase-1-design.md](docs/superpowers/specs/2026-07-30-telegram-bot-phase-1-design.md)
  resolves what SPEC.md leaves open. Comments cite it as "design 4.x".
- [.superpowers/sdd/2026-07-30-telegram-bot-phase-1/progress.md](.superpowers/sdd/2026-07-30-telegram-bot-phase-1/progress.md)
  is the build ledger: every finding, ruling and deferred item. `HANDOVER.md` beside it is the
  current state summary.
- [docs/SMOKE.md](docs/SMOKE.md) is the manual checklist. It is the *only* acceptance basis for
  the Telegram-facing files that have no automated tests by design: `registration.ts`,
  `checkin.ts`, `reports.ts`, `group.ts`, and the Telegram calls inside `ticker.ts`.
- [prototype/bot-flows.html](prototype/bot-flows.html) is the screen-by-screen mockup. Rendering
  details (keyboard order, copy, the 10-slot bar) trace to it.

## Architecture

Dependencies point one way, so scoring is never tested through Telegram:

```
config.ts -> domain/ (pure) -> db/ (SQL) -> bot/handlers -> bot/render.ts (pure)
```

- `src/config.ts` is the only place guilds, member counts, competition dates, tier minutes, the
  weekly target and the timezone exist (FR-25). Changing a value there and restarting recomputes
  all history, because nothing derived from it is stored.
- `src/domain/scoring.ts` holds only the genuinely pure parts: tier minutes, the progress bar,
  window membership, the streak reduction, competition ranking. `src/domain/scheduling.ts` holds
  the Monday-post decision (FR-20), pure for the same reason: testable without Telegram or a
  clock.
- `src/db/*` owns all SQL. `calendar.ts` is where every date bucket comes from, `chats.ts` owns
  the guild-to-chat binding and the pin/Monday-post ledger (FR-18 to FR-20), `tiers.ts` is the
  shared config-backed tier-minutes CTE used by `standings.ts` and `days.ts`.
- `src/bot/*`: `index.ts` builds the bot and installs handlers in order, `callbacks.ts` is the
  callback-data codec, `render.ts` is pure formatting, `strings.ts` (at `src/`) holds all copy.
  `group.ts` binds a chat to a guild (FR-18), and `ticker.ts` is the 60-second loop that refreshes
  the pinned standings and posts the Monday message (FR-19, FR-20).

Handlers register `callback_query:data` listeners that fall through via `next()`, so **install
order in `createBot` matters**: registration, then check-in, then reports, then a catch-all that
answers unclaimed callbacks.

**Phase 1 and Phase 2 are built** (registration, `/log`, `/me`, `/standings`, the group chat
binding, the pinned standings, the Monday post, Docker deploy). Phase 3 (reminders actually
sending) and Phase 4 (tags, nightly backup) are not. SPEC.md §10 forbids starting a phase before
the previous one works end to end, and neither phase's smoke run has been done yet
(docs/SMOKE.md).

## Invariants that are easy to break

These are load-bearing. Each one has already caused or nearly caused a defect.

- **No total is ever stored.** `days.tier` is the only ground truth; minutes are derived at read
  time from `TIER_MINUTES`. No column, cache, or snapshot table may hold a sum (SPEC.md §4.4). The
  tier-minutes lookup is a config-backed `unnest(...)` CTE injected into each query, not a table.
- **Date buckets are computed in SQL, in `Europe/Helsinki`, never with JavaScript date arithmetic**
  (design 4.2). The competition window straddles a clock change. The one deliberate exception is
  `previousWeek()` in `domain/scoring.ts`, which does UTC-midnight label arithmetic with no
  timezone conversion at all; its comment explains why that is safe.
- **Every `BIGINT` and `DATE` is selected as `::text`.** postgres.js returns BIGINT as a JS string
  and DATE as a `Date` at UTC midnight. Selecting them raw corrupts Telegram IDs and shifts dates.
- **Every per-member division casts `::numeric` before dividing, then `::float8`.** Postgres
  integer division truncates `142 / 650` to 0. The query printed in SPEC.md §6 has this bug.
- **Every ranking `ORDER BY` needs a unique tiebreaker** (`g.slug`, `telegram_id`). Guild names and
  first names are not unique, and without one Postgres may return different orderings across calls.
- **Callback payloads are untrusted and can be stale.** A check-in message stays live for days, so
  handlers recompute `today`/`yesterday` from the live calendar and refuse a payload date that is
  neither. `decode()` returns null for anything malformed. Keep payloads under Telegram's 64-byte
  limit.
- **Every button carries its full meaning; the process holds no session state** (NFR-5). No session
  middleware, no in-memory maps. A tap on a message sent before a restart must still work.
- **Escape only interpolated values with `escapeHtml`, never a whole message.** Templates contain
  intentional `<b>` and `<pre>`. Telegram first names are attacker-controlled and reach other users
  through `/me`. When padding a name for column alignment, pad the raw string *then* escape, or the
  escape sequences count as width and the table misaligns.
- **No code path may write activity data without a real user action, in any build** (NFR-4). No
  seed command, no debug route, no simulation.
- **No global individual leaderboard** (FR-15). Neighbours within a guild, capped at three rows,
  are the permitted half. There is no query anywhere that returns a top-N list of individuals.
- **`/me` is private-chat only**, because its "Around you" block names other people. `/standings`
  is deliberately unguarded so Phase 2's group chat can use it.
- **Long polling only** (NFR-1). No webhook, no inbound port.
- **`installGroup` must be installed before `installRegistration`.** grammY stops the middleware
  chain at the first command handler that does not call `next()`, and registration's `/start`
  returns early on non-private chats without calling it, so reversing the order silently disables
  every group `/start`.
- **Binding a chat requires chat admin on both the message and the callback path.** `/start@bot
  <slug>` is an ordinary message, so the check cannot live only on the picker callback.
- **The pinned message is edited and never resent, and the edit is skipped when the rendered text
  is unchanged.** Resending would notify a whole guild every 15 minutes, which is the opposite of
  FR-19.
- **Size ceiling: 2,000 effective lines.** Passing it means something from SPEC.md §8 crept back in
  (NFR-6). `src/` is currently 1,510 effective lines; 490 lines of headroom remain before Phase 3
  needs to budget against the ceiling.

## Conventions

- Imports carry explicit `.ts` extensions (`allowImportingTsExtensions`), and types are imported
  with `import type` (`verbatimModuleSyntax`). `strict` and `noUncheckedIndexedAccess` are on, so
  indexed access needs a guard or a justified `!`.
- All user-facing text is English, inline in `src/strings.ts`. No i18n framework (FR-27).
- Comments explain *why*, cite the requirement ID (FR-x, NFR-x, design 4.x), and record decisions
  that were considered and rejected. Match that density; it is the house style.
- No em dashes or en dashes anywhere, including message copy.
- Tests: one isolated Postgres schema per file via `freshDatabase("<name>")` from
  `tests/helpers/db.ts`, ended in `afterAll`. Give each file a unique bare-identifier name.
- The handler files (`registration.ts`, `checkin.ts`, `reports.ts`, `group.ts`) and the Telegram
  calls inside `ticker.ts` are untested by design. `domain/scheduling.ts`, the pure Monday-post
  decision `ticker.ts` calls, is unit tested normally. Changes to the untested parts are verified
  through `docs/SMOKE.md`, not unit tests.

## Before a real competition

`COMPETITION_START` / `COMPETITION_END` in `src/config.ts` are placeholders (SPEC.md §9 Q1), and a
test asserts today falls inside the window, so it will fail once the placeholder window expires.
Guild `memberCount` values are also unverified: they are the denominator of every ranking, so a
stale count silently distorts the whole competition.

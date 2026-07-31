# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                          # full suite (240 tests); DB tests need db-test running
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
  resolves what SPEC.md leaves open for Phase 1. Comments cite it as "design 4.x".
  [The Phase 2 design](docs/superpowers/specs/2026-07-31-telegram-bot-phase-2-design.md) does the
  same for the group chat, and its comments cite it as "phase 2 design N.N".
  [The Phase 3 design](docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md) does the
  same for reminders, and its comments cite it as "phase 3 design N.N".
- `.superpowers/sdd/<date>-telegram-bot-phase-<n>/progress.md` is the per-phase build ledger: every
  finding, ruling and deferred item, in order. `HANDOVER.md` beside it is the state summary.
  **These are local-only.** `.superpowers/sdd/.gitignore` contains `*`, so they are not in the
  repository and a fresh clone will not have them. They are listed here because they are the most
  useful context on the machine that has them, not because you can expect to find them.
- [docs/SMOKE.md](docs/SMOKE.md) is the manual checklist. It is the *only* acceptance basis for
  the Telegram-facing files that have no automated tests by design: `registration.ts`,
  `checkin.ts`, `reports.ts`, `group.ts`, `reminders.ts`, and the Telegram calls inside `ticker.ts`.
- [prototype/bot-flows.html](prototype/bot-flows.html) is the screen-by-screen mockup. Rendering
  details (keyboard order, copy, the 10-slot bar) trace to it.

## Architecture

Dependencies point one way, so scoring is never tested through Telegram:

```
config.ts -> domain/ (pure) -> db/ (SQL) -> bot/handlers -> bot/render.ts (pure)
```

- `src/config.ts` is the only place guilds, member counts, competition dates, tier minutes, the
  weekly target and the timezone exist (FR-25). Changing a value there recomputes all history,
  because nothing derived from it is stored. **In Docker that means `docker compose up -d --build`,
  not `docker compose restart bot`:** the Dockerfile does `COPY src ./src` and nothing bind-mounts
  `src`, so a plain restart silently runs the old config.
- `src/domain/scoring.ts` holds only the genuinely pure parts: tier minutes, the progress bar,
  window membership, the streak reduction, competition ranking. `src/domain/scheduling.ts` holds
  the Monday-post decision (FR-20), pure for the same reason: testable without Telegram or a
  clock.
- `src/db/*` owns all SQL. `calendar.ts` is where every date bucket comes from, `chats.ts` owns
  the guild-to-chat binding and the pin/Monday-post ledger (FR-18 to FR-20), `tiers.ts` is the
  shared config-backed tier-minutes CTE used by `standings.ts` and `days.ts`.
- `src/bot/*`: `index.ts` builds the bot and installs handlers in order, `callbacks.ts` is the
  callback-data codec, `render.ts` is pure formatting, `strings.ts` (at `src/`) holds all copy.
  `group.ts` binds a chat to a guild (FR-18), `reminders.ts` is `/remind` and its callbacks
  (FR-21 to FR-24), and `ticker.ts` is the 60-second loop that refreshes the pinned standings,
  posts the Monday message (FR-19, FR-20) and sends the daily reminders (FR-21).

Handlers register `callback_query:data` listeners that fall through via `next()`, so **install
order in `createBot` matters**: the blocked-clearing middleware first, then group, registration,
check-in, reports, reminders, then a catch-all that answers unclaimed callbacks.

**Phases 1, 2 and 3 are built** (registration, `/log`, `/me`, `/standings`, the group chat
binding, the pinned standings, the Monday post, the daily reminder with its five-ignore
auto-stop, `/remind`, 403 handling, Docker deploy). Phase 4 (tags, nightly backup) is not.
SPEC.md §10 forbids starting a phase before the previous one works end to end, and **no phase's
smoke run has been done yet** (docs/SMOKE.md).

## Invariants that are easy to break

These are load-bearing. Each one has already caused or nearly caused a defect.

- **No total is ever stored.** `days.tier` is the only ground truth; minutes are derived at read
  time from `TIER_MINUTES`. No column, cache, or snapshot table may hold a sum (SPEC.md §4.4). The
  tier-minutes lookup is a config-backed `unnest(...)` CTE injected into each query, not a table.
- **Date buckets are computed in SQL, in `Europe/Helsinki`, never with JavaScript date arithmetic**
  (design 4.2). The competition window straddles a clock change. The one deliberate exception is
  `previousWeek()` in `domain/scoring.ts`, which does UTC-midnight label arithmetic with no
  timezone conversion at all; its comment explains why that is safe.
- **`blocked` gates outbound messaging and never scoring.** There is no `NOT u.blocked` anywhere in
  `standings.ts`, and restoring one from the query printed in SPEC.md §6 is a defect. Because no
  total is stored, the clause is retroactive: the first user who blocks the bot would erase their
  whole season from their guild's total and the pinned message would publish the drop. Three tests
  in `tests/db/standings.test.ts` guard it, one per query, and they pass trivially until someone
  re-adds the clause.
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
- **The ticker's two halves stop on different dates, and the pin's gate must stay the tighter one.**
  The pin refresh stops at `COMPETITION_END`; the Monday post runs one week past it to deliver the
  final week's result (phase 2 design 4.8). Outside the window `standings(weekStart, today)` is an
  all-zero table, so relaxing the pin's gate to match the post's would overwrite the frozen final
  standings with zeroes in every guild chat.
- **The reminder pass sits inside the ticker's window gate and outside its 15-minute pin refresh.**
  Nested under `refreshPins` a reminder lands on a quarter-hour lattice instead of within a minute
  of its hour; hoisted above the window gate it keeps asking people to log days FR-26 refuses to
  store, for a week after the competition ends.
- **A user paused by FR-22 does not resume by logging.** `responded` clears `ignored_streak` only
  below the threshold. The follow-up asked for consent and got none, and logging is engagement with
  the competition, not consent to be messaged. Only "Keep them" or `/remind` resumes, and both do it
  by writing `ignored_streak` directly.
- **`blocked` is written now (FR-23), so the no-`NOT u.blocked` rule above is live rather than
  theoretical.** It also clears on any private-chat update, because a blocked user cannot send one.
- **`setReminderHour` does three things, and each one is load-bearing:** sets `reminder_asked`,
  resets `ignored_streak` (so `/remind` lifts a pause), and stamps `last_reminded_at` when the
  chosen hour has already passed (so picking 20:00 at 21:00 does not fire seconds later).
- **Size ceiling: 2,000 effective lines.** Passing it means something from SPEC.md §8 crept back in
  (NFR-6). `src/` is currently 1,886 effective lines, leaving about 114 lines of headroom. Phase 4's
  own budget is roughly 120 lines, so the remaining headroom is slightly under what Phase 4 is
  budgeted. Count it the same way each time or the trend is meaningless:

  ```bash
  find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
  ```

  Earlier figures in the build ledgers (1,186, 1,510) were taken by hand and run 10 to 30 lines
  below this command, so compare like with like rather than reading a jump that is not there.

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
- The handler files (`registration.ts`, `checkin.ts`, `reports.ts`, `group.ts`, `reminders.ts`) and
  the Telegram calls inside `ticker.ts` are untested by design. `domain/scheduling.ts` and
  `domain/reminders.ts`, the pure decisions they call, are unit tested normally.

## Before a real competition

`COMPETITION_START` / `COMPETITION_END` in `src/config.ts` are placeholders (SPEC.md §9 Q1), and a
test asserts today falls inside the window, so it will fail once the placeholder window expires.
Guild `memberCount` values are also unverified: they are the denominator of every ranking, so a
stale count silently distorts the whole competition.

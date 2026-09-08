# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                          # full suite (355 tests); DB tests need db-test running
bun run test:db                   # starts the disposable db-test container, then bun test
bun test tests/domain             # one directory
bun test tests/db/standings.test.ts   # one file
bun test -t "counts the members who logged"   # one test by name
bunx tsc --noEmit                 # typecheck; there is no linter, this is the static check
docker compose up -d --build      # bot + db; this is how you run it
docker compose logs -f bot
```

`bun test` alone fails on `tests/db/*` unless the `db-test` service is up. Bun auto-loads `.env`,
so `TEST_DATABASE_URL` is picked up from there.

**`bun run start` does not work against the shipped `.env`,** which is why it is not in the list
above. `DATABASE_URL` there is `postgres://bot:...@db:5432/bot`, the Compose network hostname,
which does not resolve from the host: the bot sits in `waitForDatabase`'s 30-second retry loop and
then throws. Run it through Compose, or override the variable for the one command
(`DATABASE_URL=postgres://bot:<pw>@localhost:5432/bot bun run src/main.ts`) after uncommenting the
`db` service's loopback port mapping in `docker-compose.yml`.

**Never run the `test` compose profile on a self-hosted production host.** `db-test` binds a host
port and uses a throwaway password.

## Documents, in precedence order

- **[SPEC.md](SPEC.md) is the source of truth.** §5 is the numbered requirements list (FR-1 to
  FR-31, NFR-1 to NFR-6); code comments cite these IDs and so should yours. §8 lists deliberately
  rejected alternatives (Mini App, MET-based scoring, individual leaderboard). Re-adding one is a
  defect, so read §8 before adding anything that looks obviously missing. §10 is the build order.
- [docs/superpowers/specs/2026-07-30-telegram-bot-phase-1-design.md](docs/superpowers/specs/2026-07-30-telegram-bot-phase-1-design.md)
  resolves what SPEC.md leaves open for Phase 1. Comments cite it as "design 4.x".
  [The Phase 2 design](docs/superpowers/specs/2026-07-31-telegram-bot-phase-2-design.md) does the
  same for the group chat, and its comments cite it as "phase 2 design N.N".
  [The Phase 3 design](docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md) does the
  same for reminders, and its comments cite it as "phase 3 design N.N".
  [The Phase 4 design](docs/superpowers/specs/2026-07-31-telegram-bot-phase-4-design.md) does the
  same for the restore-fidelity test and the deployment target, and its comments cite it as
  "phase 4 design N.N".
  [The Phase 5 design](docs/superpowers/specs/2026-09-07-telegram-bot-phase-5-design.md) does the
  same for the fun pass (the celebration, the streak on the confirmation, the tier heads, the
  Monday post's count and closing line), holds the feature admission scale every future feature is
  scored against (SPEC.md §9 Q6), and its comments cite it as "phase 5 design N.N". Its section 10
  is the critic pass: every claim an independent critic made, tested, and either dismantled with the
  reason or conceded with the change (the season result on the closing post, the scoring sentence,
  the welcome rewording, the neighbours guard). Read it before re-proposing any of the dismantled
  ones. Its section 11 is the build that followed the owner removing the size ceiling on
  2026-09-08: the competition clock, the local race and the self-chosen target, cited as "phase 5
  design 11.N". Its section 12 is the scoring change of the same day, from minutes per member to
  active days per member, made after two research briefings (`docs/research/2026-09-08-*.md`) and
  cited as "phase 5 design 12.N"; docs/evidence.md §6 holds the sources. Its section 13 is the
  finish pass (FR-31): a correctness critic and a polish critic, every finding tested, the ones
  that held fixed, cited as "phase 5 design 13.N".
- `.superpowers/sdd/<date>-telegram-bot-phase-<n>/progress.md` is the per-phase build ledger: every
  finding, ruling and deferred item, in order. `HANDOVER.md` beside it is the state summary.
  **These are local-only.** `.superpowers/sdd/.gitignore` contains `*`, so they are not in the
  repository and a fresh clone will not have them. They are listed here because they are the most
  useful context on the machine that has them, not because you can expect to find them.
- [docs/SMOKE.md](docs/SMOKE.md) is the manual checklist. It is the *only* acceptance basis for
  the Telegram-facing files that have no automated tests by design: `registration.ts`,
  `checkin.ts`, `reports.ts`, `group.ts`, `reminders.ts`, `target.ts`, and the Telegram calls
  inside `ticker.ts`.
- `prototype/bot-flows.html` was the screen-by-screen mockup, and rendering details (keyboard
  order, copy, the 10-slot bar) trace to it. It was deleted in commit 77507ee and is not in the
  working tree; read it with `git show 77507ee^:prototype/bot-flows.html` when a rendering question
  needs it.

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
  (FR-21 to FR-24), `target.ts` is `/target` and its callback (FR-29), and `ticker.ts` is the
  60-second loop that refreshes the pinned standings, posts the Monday message (FR-19, FR-20) and
  sends the daily reminders (FR-21).

Handlers register `callback_query:data` listeners that fall through via `next()`, so **install
order in `createBot` matters**: the blocked-clearing middleware first, then group, registration,
check-in, reports, reminders, target, then a catch-all that answers unclaimed callbacks, then the
`message:text` fallback that answers any typed message or unknown command in a private chat
(FR-31). The fallback must stay last: every command handler above it declines by not matching.

**Phases 1 to 3 are built** (registration, `/log`, `/me`, `/standings`, the group chat binding, the
pinned standings, the Monday post, the daily reminder with its five-ignore auto-stop, `/remind`, 403
handling). Phase 4's code is also done, the restore-fidelity test and the decoder hardening, but
**Phase 4 itself is not complete**: it reduces to NFR-3, and NFR-3 is met by deploying this bot's
database onto Tietokilta's infrastructure, which has not happened (SPEC.md NFR-3). FR-11's optional
tag is **cut**, not pending: SPEC.md §9 Q5. **Phase 5 is built** (2026-09-07, the fun pass: FR-28's
celebration, the streak and the tier-scaled heads on the confirmation, the Monday post's
participation as a count of people, the closing post written for newcomers, and after the critic
pass the season result on the closing post, the scoring rule in the reminder answers, and the
neighbours block hidden while all three are at zero, and after the owner removed the size ceiling
on 2026-09-08 the competition clock, the local race in the Monday post and the self-chosen weekly
target, FR-29). **No phase's smoke run
has been done yet** (docs/SMOKE.md), and that remains the gate on real users.

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
  limit (the longest, an undo, is 29).
- **Staleness applies to the payload's tier, not only its date.** The undo payload carries both the
  tier its log displaced (`restore`, what to put back) and the tier that log stored (`stored`, the
  guard), and `undoDay` matches on `stored` in the WHERE clause of both statements. Two
  confirmations for the same day can be live at once, one from the daily reminder and one from a
  later `/log` that corrected the tier, and applying the older payload unconditionally reverted the
  newer entry: it deleted the day outright when its `restore` was null, while the toast said "Put
  back". `undoDay` returns whether it applied and the handler shows `UNDO_SUPERSEDED` when it did
  not, so the bot never reports a change it did not make. The check is in SQL rather than a read
  followed by a write, so there is no window between them. It is also an `UPDATE`, not the upsert it
  used to be: `ON CONFLICT` would resurrect a day someone had already undone elsewhere.
- **The confirmation's progress block names the week the logged day falls in, not always "This
  week".** FR-10's backdate writes to yesterday, and on a Monday yesterday is Sunday, which belongs
  to the week that just ended, so `weekMinutes` returns last week's total. Labelling it "This week"
  printed a filled bar and "Target hit" for a week the user had logged nothing in, hours after the
  Monday post told their guild chat everyone was back to zero (FR-20). `checkin.ts` compares
  `weekStartOf(callback.date)` against `calendar().weekStart`, both from SQL, and passes a
  `LoggedWeek` to `render.ts`. The two labels are the same width on purpose: they sit in a
  fixed column inside a `<pre>`, so a longer one steps the numbers off the bar.
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
- **`decode()` re-encodes what it parsed and demands the result match the input.** That single
  assertion is what rejects trailing junk on all seven multi-part callback kinds, so a new kind
  inherits the check instead of needing its own length test. It also means `decode` is only ever as
  permissive as `encode` is: a handler that builds a payload by hand rather than through `encode`
  will have it rejected, which is the intended direction.
- **The compose `db` service is not production and its volume is not the competition's data.** The
  intended home for the real database is Tietokilta's shared Azure PostgreSQL server, which is what
  will satisfy NFR-3: that server's databases are dumped and shipped off-site nightly by
  infrastructure outside this repository. Until that move happens there is no off-machine backup at
  all, so a compose volume is the only copy and is not one anybody should be relying on.
  `tests/db/restore.test.ts` is this repository's half of NFR-3, and it uses real databases rather
  than `freshDatabase()` schemas because the backup it protects dumps per database.
- **`tiers.ts` passes explicit Postgres oids to `sql.array()`** (1009 for `text[]`, 1007 for
  `int4[]`), and this is load-bearing rather than decorative. postgres.js resolves an array
  parameter's wire type at query *construction* time, from a per-client cache that is only populated
  after that client has completed one prior round trip. Without the explicit oids, a standings or
  days query issued as the very first query on a fresh client serialises the array as bare,
  brace-less scalar text and Postgres rejects it as a malformed array literal; the `::text[]` and
  `::int[]` casts already in the SQL do not help, because the fault is in the wire-format parameter,
  not the SQL. Before the fix, production was safe only incidentally: `main.ts` calls
  `waitForDatabase()` (a `SELECT 1`) before anything else, and that round trip happened to warm the
  cache first. `tests/db/tiers.test.ts` pins this against a genuinely cold client and fails without
  the fix.
- **The celebration reaction comes after the confirmation edit, is fire-and-forget, and nothing
  else is ever celebrated** (FR-28, phase 5 design 5.1). `checkin.ts` calls `ctx.react` only after
  `editMessageText` has returned, so a refused reaction can never cost the user their confirmation,
  and `void`s it with a `.catch` so a rejected reaction never reaches `bot.catch` as a failed update
  (grammY's `react` throws synchronously only when the callback has no chat or message id, which no
  non-inline callback lacks, and this bot has no inline mode). `crossedTarget`
  in `domain/scoring.ts` is the only thing that may trigger it: it derives the total before the log
  from what `logDay` returns, so a re-log crosses only by the difference it adds and a week already
  over the target is not celebrated twice. Whether a bot may react to a message it sent itself in a
  private chat is documented nowhere; the Phase 5 smoke section settles it and the design records
  the effect-message fallback. Undo clears the reaction unconditionally, because an empty reaction
  list is a no-op on a message without one.
- **A streak is shown only while intact, and never shown resetting.** `/me` omits the line at zero,
  and the confirmation names it only once the target is met and only from two weeks up (phase 5
  design 5.2). A highlighted broken streak is the one streak display with evidence of harm
  (docs/evidence.md §5.3); do not add "streak lost" copy anywhere.
- **The closing post names the season result and the ordinary Monday post never does** (phase 5
  design 10.1). `MondayPostInput.final` is the season result, not a boolean, so a closing post
  without one cannot be built, and `sendMondayPost` fetches the season table only on that Monday,
  over the same range the pin froze on. Both variants stay under the skeleton-equality tests: the
  season sentence names a rank and must never vary its wording on it.
- **The neighbours block hides while all three rows are at zero** (phase 5 design 10.2). The query
  orders ties by first name, so an all-zero block is two strangers beside the reader's own zero and
  identifies nobody's contribution, which is the block's reason (docs/evidence.md §5.8). It must
  come back the moment any of the three has minutes, the reader included or not.
- **The competition clock comes from `calendar()` in SQL and hides itself outside the window**
  (phase 5 design 11.1). `weekNumber` is not clamped: before the start it is 0 or less and after the
  end it exceeds `weekCount`, and `render.ts`'s `clock()` falls back to "This week" in both cases.
  `/standings` is unguarded, so it can be asked outside the window; "Week 9 of 8" on a real phone
  means someone clamped the calendar or dropped the fallback.
- **Guilds are ranked on active days per member, and the per-member figure is never displayed**
  (SPEC.md §4.3 as of 2026-09-08, phase 5 design 12). `standings()` counts non-rest days per
  guild and divides by the roster for the ORDER BY; minutes per member is the tiebreaker and
  nothing else. The tables print the count of active days as a whole number, the Monday post
  prints counts and the gap in days, and nothing anywhere prints an average, a per-100 figure, a
  share or a decimal: an average over the roster is a low descriptive norm broadcast to everyone
  above it (docs/evidence.md §6.4). Tests assert the absence of decimals in both messages; a
  `toFixed(1)` creeping back in fails them. The footer is what explains a smaller guild sitting
  above a bigger count; do not cut it.
- **Ranks come from `standingRanks`, never from `competitionRanks` over `perMember` alone**
  (phase 5 design 13.1). The query orders by days per member, then minutes per member, and the
  ranks must break ties the same way, or a guild level on days is told it finished 1st while the
  Monday post says the other guild "took it". Under day counts, equal rosters (Prodeko and AS,
  SIK and Accounting, MK and Inkubio) tie far more easily than they did under minutes. The
  Monday post takes a list of winners for the same reason: several at rank 1 read "shared it",
  none with a day reads "nobody logged a day".
- **The standings header and the check-in prompt branch on `competitionPhase(today)`, never on
  the week number** (phase 5 design 13.2). A competition starting mid-week puts `weekNumber` at
  1 on the Monday before the window. After the end, `/standings` and `/me` show the final week
  under "Final week" so they agree with the frozen pin; the pin itself only ever renders "during".
- **The local race is computed from the same last-week table as the rank, by `localRace` in
  `domain/scoring.ts`, in active days, and has one sentence shape at every rank** (phase 5 design
  11.2, 12.2). It rounds the gap to a thousandth of a day before the ceiling, because `perMember`
  is a float and 26.000000000000004 must not become 27. A tie is 0 and renders "level with you";
  the winner races the guild below. Both Monday-post skeleton tests strip the sentence's name,
  direction word and count, so a rank-conditional rewording fails them.
- **The mark to beat is the guild's own last count and is omitted only at zero** (phase 5 design
  12.3). The branch is on the count, never on the rank; a threshold set by anyone else, or copy
  that says the mark was missed, is a SPEC.md §8 item.
- **The confirmation names the guild the day counted for, as a fact, and the registration reply
  asks for one recruit with the guild's own deep link** (FR-30). The link is built in
  `registration.ts` from `ctx.me.username`; the bot never posts it anywhere on a member's behalf.
- **The weekly target is the user's own (`users.target_minutes`, NULL meaning the config figure),
  and it changes nothing the guild is credited with** (FR-29, phase 5 design 11.3). `checkin.ts`
  and `reports.ts` pass `user.targetMinutes` to the bar, the streak and `crossedTarget`; the
  standings queries never read it. The column stores a choice, not a derived number, so it does not
  breach the no-stored-totals rule. `decode()` admits only a value in `TARGET_OPTIONS`, so a button
  for an option later removed from config is refused rather than written. Nothing below the WHO
  line is offered until SPEC.md §9 Q7 is decided.
- **The Monday post's participation is a count of people, never a share of the roster** (phase 5
  design 5.4). At the base rate SPEC.md §1 expects, a share is a low descriptive norm broadcast to a
  whole guild every Monday, and a broadcast low norm pulls the people above it down toward it
  (docs/evidence.md §5.2). The same rule bars any "N% of the guild" or "N logged today" line
  anywhere; SPEC.md §8 lists both.
- **Size is a trend, not a ceiling, and SPEC.md §8 is the alarm.** The owner removed NFR-6's
  2,000-line ceiling on 2026-09-08; it had been set to trim the bot hard and was blocking features
  that passed the admission rule and came from nowhere near §8. `src/` is currently 2,305 effective
  lines: 1,958 after the pre-smoke fixes, 1,981 after Phase 5's five features, 1,997 after the
  critic pass, 2,145 after the clock, the local race and `/target` (phase 5 design §11; the
  target alone is about 100 of the 148, `target.ts` being 47), 2,156 after the scoring change
  to active days (design §12), and 2,305 after the finish pass (design §13: the phase and rank
  helpers, the window-edge replies, the text fallback, the profile texts, the logged-already
  prompt, and the error reply). Lines still count on the admission
  rule's Cost axis (SPEC.md §9 Q6), so a large feature still has to earn them, and anything from §8
  is a defect at any size. SPEC.md §7's per-phase split was a rounded residual, not a costed
  estimate; the note there records this so the conflict is not rediscovered. Count it the same way
  each time or the trend is meaningless:

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
- The handler files (`registration.ts`, `checkin.ts`, `reports.ts`, `group.ts`, `reminders.ts`,
  `target.ts`) and the Telegram calls inside `ticker.ts` are untested by design.
  `domain/scheduling.ts` and `domain/reminders.ts`, the pure decisions they call, are unit tested
  normally.

## Before a real competition

`COMPETITION_START` / `COMPETITION_END` in `src/config.ts` are placeholders (SPEC.md §9 Q1), and a
test asserts today falls inside the window, so it will fail once the placeholder window expires.
Guild `memberCount` values are also unverified: they are the denominator of every ranking, so a
stale count silently distorts the whole competition.

NFR-3 is met by the deployment target, so it is not observably satisfied until this bot's database
exists on Tietokilta's shared PostgreSQL server. README's Deploy section lists what that change
contains.

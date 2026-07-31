# Phase 3 Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send each user a daily check-in reminder at the hour they chose, stop after five consecutive ignores with exactly one message asking whether to continue, handle being blocked, and give them a `/remind` command to change any of it.

**Architecture:** The existing 60-second ticker gains a third question. A SQL query decides who is a candidate for a reminder; a pure function in `domain/reminders.ts` decides what to send them and what the new ignore count is. State is two new columns on `users` plus the two that Phase 1 declared and never wrote. Nothing about scoring changes.

**Tech Stack:** Bun, TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), grammY, postgres.js, PostgreSQL, `bun:test`.

**Design document:** [docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md](../specs/2026-07-31-telegram-bot-phase-3-design.md). Section references below like "3.2" and "4.5" point into it. Where this plan and that document disagree, the document wins. Where that document and `SPEC.md` disagree, `SPEC.md` wins.

## Global Constraints

- **No em dashes or en dashes anywhere**, including message copy and comments.
- **Imports carry explicit `.ts` extensions.** Types are imported with `import type`.
- **`strict` and `noUncheckedIndexedAccess` are on.** Indexed access needs a guard or a justified `!`.
- **Every `BIGINT` and `DATE` is selected `::text`.** postgres.js returns BIGINT as a JS string and DATE as a `Date` at UTC midnight.
- **Date buckets are computed in SQL, in `Europe/Helsinki`.** Never with JavaScript date arithmetic.
- **No total is ever stored.** `days.tier` is the only ground truth. Nothing in this phase touches scoring.
- **No `NOT u.blocked` in any scoring query.** `blocked` gates outbound messaging only.
- **Escape only interpolated values with `escapeHtml`, never a whole message.**
- **Every button carries its full meaning; the process holds no session state** (NFR-5). No session middleware, no in-memory maps.
- **No code path may write activity data without a real user action** (NFR-4). No seed command, no debug route, no simulation.
- **All user-facing text is English and lives in `src/strings.ts`** (FR-27).
- **Comments explain why, cite the requirement ID** (FR-x, NFR-x) **and the design section** (this phase cites "phase 3 design N.N"), and record rejected alternatives. Match the existing density; it is the house style.
- **Size ceiling 2,000 effective lines.** Check with:
  ```bash
  find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
  ```
- **Tests:** one isolated Postgres schema per file via `freshDatabase("<name>")`, unique bare identifier, ended in `afterAll`.
- **DB tests need the container:** run `bun run test:db` (not bare `bun test`) or `tests/db/*` will fail to connect.
- **Never run the `test` compose profile on the production host.**

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/db/migrations/003_reminders.sql` | Two columns on `users`, plus the narrow backfill |
| `src/domain/reminders.ts` | Pure: the action table (3.2) and the grace window (4.1) |
| `src/db/reminders.ts` | SQL: who is due, and the four small writes |
| `src/bot/reminders.ts` | Telegram: `/remind`, its callbacks, and the send pass |
| `tests/domain/reminders.test.ts` | The FR-22 state machine, no database, no clock |
| `tests/db/reminders.test.ts` | The candidate query's exclusions, ordering and limit |

**Modify:**

| File | Change |
|---|---|
| `src/config.ts` | Three constants |
| `src/db/users.ts` | `reminderAsked` on `UserRow`; `setReminderHour` gains three behaviours |
| `src/bot/callbacks.ts` | Two new callback kinds |
| `src/strings.ts` | New copy, and the sentence Phase 1 cut |
| `src/bot/checkin.ts` | Extract `checkInMessage` so the reminder renders the same message |
| `src/bot/registration.ts` | Offer the keyboard on `reminder_asked`, not on a NULL hour |
| `src/bot/ticker.ts` | About six lines calling the send pass |
| `src/bot/index.ts` | The `blocked`-clearing middleware, `installReminders`, the `/remind` menu entry |
| `src/db/standings.ts` | One stale comment (the column is written now) |
| `tests/db/standings.test.ts` | One stale comment, same reason |
| `tests/bot/callbacks.test.ts` | Round-trip and rejection cases for the two new kinds |
| `tests/db/users.test.ts` | The new `setReminderHour` behaviours |
| `docs/SMOKE.md` | A Phase 3 section |
| `CLAUDE.md` | Phase 3 is built; the new invariants |

---

### Task 1: The pure decision (config constants and `domain/reminders.ts`)

This is the whole of FR-22, and it is first because everything else consumes it. It touches no database and no Telegram API.

**Files:**
- Modify: `src/config.ts` (append at the end)
- Create: `src/domain/reminders.ts`
- Test: `tests/domain/reminders.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `FOLLOWUP_AFTER_IGNORES: number` (5), `REMINDER_GRACE_HOURS: number` (2), `MAX_REMINDERS_PER_TICK: number` (25), all from `src/config.ts`
  - `type ReminderAction = "daily" | "followup" | "none"`
  - `interface ReminderDecision { action: ReminderAction; nextStreak: number }`
  - `reminderAction(input: { ignoredStreak: number; responded: boolean; followupAfter?: number }): ReminderDecision`
  - `isWithinGrace(input: { localHour: number; reminderHour: number; graceHours?: number }): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/domain/reminders.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isWithinGrace, reminderAction } from "../../src/domain/reminders.ts";

// Pinned explicitly so these tests never depend on the constant in config.ts,
// matching how tests/domain/scheduling.test.ts pins the competition window.
const AFTER = 5;

function decide(ignoredStreak: number, responded = false) {
  return reminderAction({ ignoredStreak, responded, followupAfter: AFTER });
}

describe("reminderAction (FR-21, FR-22)", () => {
  // FR-21. The ordinary case: someone who has not logged today gets the
  // check-in message, and the ignore count moves up by one.
  test("sends the daily reminder and counts it", () => {
    expect(decide(0)).toEqual({ action: "daily", nextStreak: 1 });
  });

  // FR-22's acceptance test, walked in full: five dailies, then exactly one
  // follow-up, then nothing. The sixth daily is never sent.
  test("sends five dailies, then exactly one follow-up, then nothing", () => {
    const actions: string[] = [];
    let streak = 0;
    for (let day = 0; day < 8; day++) {
      const decision = reminderAction({
        ignoredStreak: streak,
        responded: false,
        followupAfter: AFTER,
      });
      actions.push(decision.action);
      streak = decision.nextStreak;
    }
    expect(actions).toEqual([
      "daily", "daily", "daily", "daily", "daily",
      "followup",
      "none", "none",
    ]);
  });

  test("the follow-up is owed exactly at the threshold", () => {
    expect(decide(AFTER)).toEqual({ action: "followup", nextStreak: 6 });
  });

  // Phase 3 design 3.3. Past the follow-up the user is paused. db/reminders.ts
  // excludes them from the candidate query, so this branch is a defensive
  // second gate rather than the primary one.
  test("a paused user is sent nothing and the streak does not grow", () => {
    expect(decide(AFTER + 1)).toEqual({ action: "none", nextStreak: AFTER + 1 });
    expect(decide(AFTER + 4)).toEqual({ action: "none", nextStreak: AFTER + 4 });
  });

  // FR-22 counts CONSECUTIVE ignores, so any response mid-chain restarts it.
  test("a response mid-chain resets the count", () => {
    expect(decide(3, true)).toEqual({ action: "daily", nextStreak: 1 });
  });

  // Phase 3 design 3.3, the ruling most likely to be undone by accident.
  // Logging is engagement with the competition, not consent to be messaged.
  // The follow-up asked for consent and got no answer, so a log must NOT
  // resume reminders: only "Keep them" or /remind does that.
  test("a response does NOT resume a user who is already paused", () => {
    expect(decide(AFTER + 1, true).action).toBe("none");
  });

  test("defaults to the configured threshold when none is passed", () => {
    expect(reminderAction({ ignoredStreak: 0, responded: false }).action).toBe("daily");
  });
});

describe("isWithinGrace (phase 3 design 4.1)", () => {
  const grace = (localHour: number, reminderHour: number) =>
    isWithinGrace({ localHour, reminderHour, graceHours: 2 });

  test("includes the chosen hour itself", () => {
    expect(grace(20, 20)).toBe(true);
  });

  test("includes the hour after, so a short outage does not lose the day", () => {
    expect(grace(21, 20)).toBe(true);
  });

  test("excludes the second hour after, so nothing lands near midnight", () => {
    expect(grace(22, 20)).toBe(false);
  });

  test("excludes hours before the chosen one", () => {
    expect(grace(19, 20)).toBe(false);
  });

  // The column and the callback decoder both accept 0 to 23 even though
  // REMINDER_HOURS offers four, so the no-wrap property is asserted rather
  // than assumed from the keyboard. A 23:00 reminder missed at 23:00 is not
  // delivered at 00:30 the next day, on the next day's ledger.
  test("a 23:00 reminder does not wrap past midnight", () => {
    expect(grace(23, 23)).toBe(true);
    expect(grace(0, 23)).toBe(false);
    expect(grace(1, 23)).toBe(false);
  });

  test("defaults to the configured grace when none is passed", () => {
    expect(isWithinGrace({ localHour: 20, reminderHour: 20 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/domain/reminders.test.ts`
Expected: FAIL, "Cannot find module '../../src/domain/reminders.ts'".

- [ ] **Step 3: Add the three constants to `src/config.ts`**

Append to the end of `src/config.ts`:

```ts
/**
 * FR-22. Five consecutive reminders with no response stop the daily send and
 * buy exactly one message asking whether to continue (phase 3 design 3.2).
 *
 * A constant rather than configuration: FR-22 states the number, so a machine
 * that used a different one would not be running this competition's rules.
 */
export const FOLLOWUP_AFTER_IGNORES = 5;

/**
 * Phase 3 design 4.1. A reminder missed at its hour (a deploy, a short outage,
 * a slow tick) still goes out for this many hours, and after that the day is
 * skipped in silence.
 *
 * Deliberately NOT the Monday post's "late rather than never" rule (phase 2
 * design 4.4). Nobody blocks a group chat, and a 17:00 user pinged at 23:50 is
 * the annoyance case SPEC.md section 11 rates High, which ends in a
 * permanently unreachable user (SPEC.md section 3.2).
 */
export const REMINDER_GRACE_HOURS = 2;

/**
 * Phase 3 design 4.2. Reminder sends per tick. SPEC.md section 3.6 puts
 * Telegram's broadcast limit at 30 per second; this paces at 25 per MINUTE,
 * and the grace window above gives roughly 3,000 sends of capacity against a
 * few hundred users.
 *
 * Rejected: a throttler dependency, and a sleep between sends. Both add a
 * lifecycle to a problem the existing 60-second loop solves by doing less each
 * time it runs, and a sleep would hold the tick open across the interval,
 * colliding with startTicker's running guard.
 */
export const MAX_REMINDERS_PER_TICK = 25;
```

- [ ] **Step 4: Write `src/domain/reminders.ts`**

```ts
import { FOLLOWUP_AFTER_IGNORES, REMINDER_GRACE_HOURS } from "../config.ts";

/** What a due user should be sent, if anything. */
export type ReminderAction = "daily" | "followup" | "none";

export interface ReminderDecision {
  action: ReminderAction;
  /** The value to write back to users.ignored_streak. */
  nextStreak: number;
}

export interface ReminderInput {
  /** users.ignored_streak: consecutive reminders sent with no response. */
  ignoredStreak: number;
  /** Whether anything was logged since the last reminder went out. */
  responded: boolean;
  /** Defaults to FOLLOWUP_AFTER_IGNORES from config. */
  followupAfter?: number;
}

/**
 * FR-21 and FR-22, the whole of the rule.
 *
 * Pure, and unit tested end to end, for a reason that is specific rather than
 * stylistic: five consecutive ignores takes five days to reproduce, so this is
 * the one rule in the project that docs/SMOKE.md cannot be the acceptance
 * basis for. It must not live in a Telegram-facing file (phase 3 design 3).
 *
 * The count reaches the threshold only by five sends that were each ignored,
 * so the threshold means "the sixth daily is due" and the follow-up takes its
 * place. That is FR-22's acceptance test read literally: the sixth consecutive
 * daily is never sent, and exactly one follow-up is.
 *
 * Past the threshold the user is paused. db/reminders.ts already excludes them
 * from the candidate query, so this branch is a second gate rather than the
 * primary one: the paused state is an absence of candidacy, not an action.
 * Keeping it here anyway means a caller that forgets the SQL filter fails
 * safe, by sending nothing.
 */
export function reminderAction(input: ReminderInput): ReminderDecision {
  const followupAfter = input.followupAfter ?? FOLLOWUP_AFTER_IGNORES;

  // Phase 3 design 3.3. A response clears the count only BEFORE the follow-up
  // has gone out. Once it has, the user was asked whether to continue and did
  // not answer, and logging is engagement with the competition rather than
  // consent to be messaged. Only "Keep them" or /remind lifts a pause, and
  // both do it by writing ignored_streak directly.
  const effective = input.responded && input.ignoredStreak <= followupAfter
    ? 0
    : input.ignoredStreak;

  if (effective > followupAfter) return { action: "none", nextStreak: effective };
  if (effective === followupAfter) return { action: "followup", nextStreak: effective + 1 };
  return { action: "daily", nextStreak: effective + 1 };
}

export interface GraceInput {
  /** The hour 0 to 23 in TIMEZONE, from the SQL calendar. */
  localHour: number;
  /** users.reminder_hour, 0 to 23. */
  reminderHour: number;
  /** Defaults to REMINDER_GRACE_HOURS from config. */
  graceHours?: number;
}

/**
 * Phase 3 design 4.1. Whether now is still inside the window in which a
 * reminder for this hour may be delivered.
 *
 * Cannot wrap past midnight by construction: localHour is 0 to 23, so a
 * reminderHour of 23 yields a window of {23} and 22 yields {22, 23}. Stated as
 * a property and tested, rather than assumed from REMINDER_HOURS, because the
 * column and the callback decoder both accept the full 0 to 23 range.
 *
 * The db query applies the same rule in SQL so that the candidate set stays
 * small. This function is the definition; that is a copy of it under a WHERE
 * clause, and tests/db/reminders.test.ts pins the two together at the edges.
 */
export function isWithinGrace(input: GraceInput): boolean {
  const graceHours = input.graceHours ?? REMINDER_GRACE_HOURS;
  return input.localHour >= input.reminderHour
    && input.localHour < input.reminderHour + graceHours;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `bun test tests/domain/reminders.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/domain/reminders.ts tests/domain/reminders.test.ts
git commit -m "Decide reminders in a pure function (FR-21, FR-22)

The five-ignore rule takes five days to reproduce, so docs/SMOKE.md
cannot be its acceptance basis. It lives here, unit tested end to end,
rather than in a Telegram-facing file.

Phase 3 design 3.3: a response clears the count only before the
follow-up. Once the follow-up has been ignored, logging is engagement
with the competition, not consent to be messaged."
```

---

### Task 2: Migration 003 and the `users` columns

**Files:**
- Create: `src/db/migrations/003_reminders.sql`
- Modify: `src/db/users.ts`
- Test: `tests/db/users.test.ts` (append to the existing `describe("users", ...)` block)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `users.reminder_asked BOOLEAN NOT NULL DEFAULT FALSE`, `users.last_reminded_at TIMESTAMPTZ`
  - `UserRow.reminderAsked: boolean`
  - `setReminderHour(sql: Sql, telegramId: number, hour: number | null, at?: string | null): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append these tests inside the existing `describe("users", () => { ... })` block in `tests/db/users.test.ts`, after the last test:

```ts
  // Phase 3 design 2. reminder_asked is what finally separates "never asked"
  // from "asked and declined", which reminder_hour = NULL conflated in Phase 1.
  test("a new user has not been asked the reminder question yet", async () => {
    const user = await createUser(sql, {
      telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas",
    });
    expect(user.reminderAsked).toBe(false);
  });

  test("answering the reminder question marks the user as asked, either way", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Yes" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "No" });

    await setReminderHour(sql, 1, 20);
    await setReminderHour(sql, 2, null);

    expect((await findUser(sql, 1))?.reminderAsked).toBe(true);
    expect((await findUser(sql, 2))?.reminderAsked).toBe(true);
  });

  // Phase 3 design 3.4. Setting an hour is the explicit consent that lifts a
  // pause. Without the reset, a user paused by FR-22 who used /remind to ask
  // for reminders back would stay excluded by the candidate query and would
  // silently receive nothing, having just been told they were back on.
  test("setting an hour clears an ignore count, so /remind lifts a pause", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Paused" });
    await sql`UPDATE users SET ignored_streak = 6 WHERE telegram_id = 1`;

    await setReminderHour(sql, 1, 20);

    const [row] = await sql<{ ignored_streak: number }[]>`
      SELECT ignored_streak FROM users WHERE telegram_id = 1
    `;
    expect(row?.ignored_streak).toBe(0);
  });

  test("turning reminders off also clears the count, so turning them back on starts fresh", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Off" });
    await sql`UPDATE users SET ignored_streak = 3 WHERE telegram_id = 1`;

    await setReminderHour(sql, 1, null);

    const [row] = await sql<{ ignored_streak: number }[]>`
      SELECT ignored_streak FROM users WHERE telegram_id = 1
    `;
    expect(row?.ignored_streak).toBe(0);
  });

  // Phase 3 design 3.4. Picking 20:00 at 21:00 sits inside that hour's grace
  // window, so without this the user would receive a check-in message seconds
  // after asking to be reminded at 20:00. The stamp defers them to tomorrow.
  // 2026-07-28T18:30:00Z is 21:30 in Helsinki, which is UTC+3 in July.
  test("choosing an hour that has already passed does not fire a reminder today", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Late" });

    await setReminderHour(sql, 1, 20, "2026-07-28T18:30:00Z");

    const [row] = await sql<{ last_reminded_at: Date | null }[]>`
      SELECT last_reminded_at FROM users WHERE telegram_id = 1
    `;
    expect(row?.last_reminded_at).not.toBeNull();
  });

  // The other side of the same rule: an hour still to come today must NOT be
  // stamped, or the user's first reminder would be silently pushed to tomorrow.
  // 2026-07-28T05:00:00Z is 08:00 in Helsinki.
  test("choosing an hour still to come today leaves it free to fire", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Early" });

    await setReminderHour(sql, 1, 20, "2026-07-28T05:00:00Z");

    const [row] = await sql<{ last_reminded_at: Date | null }[]>`
      SELECT last_reminded_at FROM users WHERE telegram_id = 1
    `;
    expect(row?.last_reminded_at).toBeNull();
  });

  test("turning reminders off never stamps a send that did not happen", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Off" });

    await setReminderHour(sql, 1, null, "2026-07-28T18:30:00Z");

    const [row] = await sql<{ last_reminded_at: Date | null }[]>`
      SELECT last_reminded_at FROM users WHERE telegram_id = 1
    `;
    expect(row?.last_reminded_at).toBeNull();
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test:db 2>&1 | tail -30`
Expected: FAIL. `user.reminderAsked` is `undefined`, and `column "reminder_asked" does not exist`.

- [ ] **Step 3: Write the migration**

Create `src/db/migrations/003_reminders.sql`:

```sql
-- Phase 3 (FR-21 to FR-24). ignored_streak and blocked already exist, declared
-- in 001 from SPEC.md section 6 and written by nothing until now, so this adds
-- two columns rather than four.
ALTER TABLE users
  ADD COLUMN reminder_asked   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN last_reminded_at TIMESTAMPTZ;

-- Phase 3 design 2.1. Anyone holding an hour demonstrably answered the
-- question. A NULL hour is still ambiguous, meaning both "declined" and "never
-- got that far", so those users are left unasked and see the question once
-- more, which is exactly what Phase 1 does today rather than a regression.
-- Marking everyone asked would silently convert "never asked" into "declined"
-- for the very users the ambiguity applies to, which is what FR-4 forbids.
UPDATE users SET reminder_asked = TRUE WHERE reminder_hour IS NOT NULL;
```

- [ ] **Step 4: Update `src/db/users.ts`**

Add `TIMEZONE` to the config import on line 2:

```ts
import { GUILDS, TIMEZONE } from "../config.ts";
```

Add the field to `UserRow` (after `reminderHour`):

```ts
  reminderHour: number | null;
  /** FR-4. Whether the reminder question has been put to them at all, which
   *  reminderHour = null cannot express on its own (phase 3 design 2.1). */
  reminderAsked: boolean;
```

Add it to `UserRecord` (after `reminder_hour`):

```ts
  reminder_hour: number | null;
  reminder_asked: boolean;
```

Add it to `toUser`'s return (after `reminderHour`):

```ts
    reminderHour: record.reminder_hour,
    reminderAsked: record.reminder_asked,
```

Extend `USER_COLUMNS`:

```ts
const USER_COLUMNS =
  "telegram_id::text, guild_slug, first_name, username, reminder_hour, reminder_asked";
```

Replace `setReminderHour` entirely:

```ts
/**
 * FR-4 and FR-24. null means reminders off, which is a real stored answer
 * rather than an absence of one.
 *
 * Three writes, not one, and the two extra ones are load-bearing:
 *
 * - reminder_asked records that the question was put at all, so a decliner is
 *   never asked again (phase 3 design 4.6).
 * - ignored_streak resets, because setting an hour is the explicit consent
 *   phase 3 design 3.3 requires to lift an FR-22 pause. Without it, a paused
 *   user who ran /remind would be told reminders were back on and then
 *   silently receive nothing, since dueReminders excludes a paused row.
 *   Turning reminders OFF resets it too, so switching them on again later
 *   starts a fresh count rather than three ignores into an old one.
 * - last_reminded_at is stamped when the chosen hour has already passed
 *   locally (phase 3 design 3.4). Someone picking 20:00 at 21:00 is inside
 *   that hour's grace window and would otherwise be sent a check-in message
 *   seconds after asking to be reminded at 20:00. Picking an hour still to
 *   come is untouched and still fires the same evening.
 *
 * The local hour is read in the same statement, in TIMEZONE, so no caller has
 * to supply a clock. `at` pins a fixed instant for tests only, exactly as
 * calendar() does; production callers pass nothing and get now().
 */
export async function setReminderHour(
  sql: Sql,
  telegramId: number,
  hour: number | null,
  at: string | null = null,
): Promise<void> {
  await sql`
    UPDATE users
       SET reminder_hour    = ${hour},
           reminder_asked   = TRUE,
           ignored_streak   = 0,
           last_reminded_at = CASE
             WHEN ${hour}::smallint IS NOT NULL
              AND ${hour}::smallint <= EXTRACT(
                    HOUR FROM (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE})
                  )::int
             THEN COALESCE(${at}::timestamptz, now())
             ELSE last_reminded_at
           END
     WHERE telegram_id = ${telegramId}
  `;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun run test:db 2>&1 | tail -20`
Expected: PASS. The whole suite, not just this file: `freshDatabase` runs every migration, so a broken `003` fails every `tests/db/*` file, which is the migration's coverage.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0. If `registration.ts` errors on a missing property, you have edited more than this task; revert that and leave `registration.ts` for Task 7.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/003_reminders.sql src/db/users.ts tests/db/users.test.ts
git commit -m "Add reminder_asked and last_reminded_at (migration 003)

reminder_hour = NULL meant both 'never asked' and 'declined' since
Phase 1, which FR-4 needs to tell apart. The backfill is narrow on
purpose: only a stored hour proves the question was answered.

setReminderHour now also clears ignored_streak, so /remind lifts an
FR-22 pause, and stamps last_reminded_at when the chosen hour has
already passed, so picking 20:00 at 21:00 does not fire seconds later."
```

---

### Task 3: The candidate query (`db/reminders.ts`)

**Files:**
- Create: `src/db/reminders.ts`
- Test: `tests/db/reminders.test.ts`

**Interfaces:**
- Consumes: `FOLLOWUP_AFTER_IGNORES`, `REMINDER_GRACE_HOURS`, `MAX_REMINDERS_PER_TICK` from Task 1; the columns from Task 2.
- Produces:
  - `interface DueReminder { telegramId: number; ignoredStreak: number; responded: boolean }`
  - `dueReminders(sql: Sql, options?: { at?: string | null; limit?: number }): Promise<DueReminder[]>`
  - `recordReminder(sql: Sql, telegramId: number, nextStreak: number, at?: string | null): Promise<void>`
  - `resumeReminders(sql: Sql, telegramId: number): Promise<void>`
  - `setBlocked(sql: Sql, telegramId: number): Promise<void>`
  - `clearBlocked(sql: Sql, telegramId: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/db/reminders.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import {
  clearBlocked,
  dueReminders,
  recordReminder,
  resumeReminders,
  setBlocked,
} from "../../src/db/reminders.ts";
import { createUser, findUser, syncGuilds } from "../../src/db/users.ts";
import { logDay } from "../../src/db/days.ts";

const sql = await freshDatabase("reminders");
afterAll(async () => { await sql.end(); });

// Helsinki is UTC+3 in July, so these UTC instants are chosen to land on exact
// local hours. Every one of them is a Tuesday inside the placeholder window.
const AT_2000 = "2026-07-28T17:00:00Z"; // 20:00 local
const AT_2100 = "2026-07-28T18:00:00Z"; // 21:00 local, inside the grace window
const AT_2200 = "2026-07-28T19:00:00Z"; // 22:00 local, past it
const AT_0830 = "2026-07-28T05:30:00Z"; // 08:30 local, long before
const TODAY = "2026-07-28";

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
  await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Ada" });
  // Set the column directly rather than through setReminderHour, so these
  // tests pin dueReminders alone and do not also depend on that function's
  // stamping rule (phase 3 design 3.4), which has its own tests.
  await sql`UPDATE users SET reminder_hour = 20 WHERE telegram_id = 1`;
});

describe("dueReminders (FR-21)", () => {
  test("a user is due at their chosen hour", async () => {
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due.map((row) => row.telegramId)).toEqual([1]);
    expect(due[0]?.ignoredStreak).toBe(0);
    expect(due[0]?.responded).toBe(false);
  });

  test("nobody is due before their hour", async () => {
    expect(await dueReminders(sql, { at: AT_0830 })).toHaveLength(0);
  });

  // FR-21: "MUST send it only to users who have not yet recorded that day."
  test("logging today suppresses the reminder", async () => {
    await logDay(sql, 1, TODAY, "short");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  // FR-8. A rest day is an explicit record, so it counts as having answered
  // and must suppress the reminder exactly as a workout does.
  test("a rest day suppresses the reminder too", async () => {
    await logDay(sql, 1, TODAY, "rest");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  test("a log for yesterday does not suppress today's reminder", async () => {
    await logDay(sql, 1, "2026-07-27", "long");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(1);
  });

  // FR-23. blocked gates outbound messaging, and this is the gate.
  test("a blocked user is never a candidate", async () => {
    await setBlocked(sql, 1);
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  test("reminders off means no candidate", async () => {
    await sql`UPDATE users SET reminder_hour = NULL WHERE telegram_id = 1`;
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  // Phase 3 design 2.2. The tick runs every 60 seconds and the hour lasts 60
  // minutes, so without this gate one reminder would be sent sixty times.
  test("a user already reminded today is not due again", async () => {
    await recordReminder(sql, 1, 1, AT_2000);
    expect(await dueReminders(sql, { at: AT_2100 })).toHaveLength(0);
  });

  test("a reminder yesterday does not block one today", async () => {
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(1);
  });

  // Phase 3 design 4.1. The grace window, in SQL, matching isWithinGrace.
  test("a missed reminder is still due one hour later", async () => {
    expect(await dueReminders(sql, { at: AT_2100 })).toHaveLength(1);
  });

  test("a missed reminder is dropped two hours later", async () => {
    expect(await dueReminders(sql, { at: AT_2200 })).toHaveLength(0);
  });

  // Phase 3 design 3.1. The window cannot wrap past midnight: an hour-23 user
  // is not due at 00:30 the next day, which would be a different day's ledger.
  test("a 23:00 reminder does not wrap past midnight", async () => {
    await sql`UPDATE users SET reminder_hour = 23 WHERE telegram_id = 1`;
    expect(await dueReminders(sql, { at: "2026-07-28T20:30:00Z" })).toHaveLength(1); // 23:30
    expect(await dueReminders(sql, { at: "2026-07-28T21:30:00Z" })).toHaveLength(0); // 00:30
  });

  // Phase 3 design 3.3. The paused state is an absence of candidacy. Six means
  // the follow-up has gone out and was not answered.
  test("a paused user is excluded outright", async () => {
    await sql`UPDATE users SET ignored_streak = 6 WHERE telegram_id = 1`;
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  test("a user at the threshold is still a candidate, for the follow-up", async () => {
    await sql`UPDATE users SET ignored_streak = 5 WHERE telegram_id = 1`;
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.ignoredStreak).toBe(5);
  });

  // Phase 3 design 2.2. "responded" is the second job last_reminded_at does:
  // did anything get written since the last time we pinged this person.
  //
  // logged_at is stamped explicitly in both of these. logDay writes now(), the
  // real wall clock, which is always later than any pinned 2026 instant, so
  // without the stamp the second test would compare a real timestamp against a
  // fixed past one and pass for the wrong reason (or fail once the placeholder
  // window is replaced with real dates).
  test("responded is true when a log landed after the last reminder", async () => {
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");
    await logDay(sql, 1, "2026-07-27", "short");
    await sql`UPDATE days SET logged_at = '2026-07-27T19:00:00Z' WHERE telegram_id = 1`;
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.responded).toBe(true);
  });

  test("responded is false when the only log predates the last reminder", async () => {
    await logDay(sql, 1, "2026-07-27", "short");
    await sql`UPDATE days SET logged_at = '2026-07-27T10:00:00Z' WHERE telegram_id = 1`;
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.responded).toBe(false);
  });

  test("responded is false for a user who has never been reminded", async () => {
    await logDay(sql, 1, "2026-07-27", "short");
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.responded).toBe(false);
  });

  // Phase 3 design 4.2. The batch is capped so a popular hour cannot burst
  // past Telegram's rate limit, and the remainder rolls to the next tick.
  test("the batch is capped and never-reminded users go first", async () => {
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bo" });
    await createUser(sql, { telegramId: 3, guildSlug: "prodeko", firstName: "Cy" });
    await sql`UPDATE users SET reminder_hour = 20`;
    // User 1 was reminded yesterday; 2 and 3 never have been, so they sort
    // first under NULLS FIRST, then by telegram_id.
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");

    const due = await dueReminders(sql, { at: AT_2000, limit: 2 });
    expect(due.map((row) => row.telegramId)).toEqual([2, 3]);
  });

  test("telegramId comes back as a number, not a BIGINT string", async () => {
    await sql`DELETE FROM users`;
    await createUser(sql, { telegramId: 7123456789, guildSlug: "tik", firstName: "Iiris" });
    await sql`UPDATE users SET reminder_hour = 20 WHERE telegram_id = 7123456789`;
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.telegramId).toBe(7123456789);
    expect(typeof due[0]?.telegramId).toBe("number");
  });
});

describe("recordReminder", () => {
  test("writes the new streak and the send time together", async () => {
    await recordReminder(sql, 1, 3, AT_2000);
    const [row] = await sql<{ ignored_streak: number; last_reminded_at: Date }[]>`
      SELECT ignored_streak, last_reminded_at FROM users WHERE telegram_id = 1
    `;
    expect(row?.ignored_streak).toBe(3);
    expect(row?.last_reminded_at).not.toBeNull();
  });
});

describe("resumeReminders (FR-22)", () => {
  // "a user who taps 'keep them' resumes immediately". The hour must survive,
  // or resuming would silently mean choosing again.
  test("clears the pause and keeps the chosen hour", async () => {
    await sql`UPDATE users SET ignored_streak = 6 WHERE telegram_id = 1`;
    await resumeReminders(sql, 1);
    const [row] = await sql<{ ignored_streak: number }[]>`
      SELECT ignored_streak FROM users WHERE telegram_id = 1
    `;
    expect(row?.ignored_streak).toBe(0);
    expect((await findUser(sql, 1))?.reminderHour).toBe(20);
  });
});

describe("blocked (FR-23)", () => {
  test("setBlocked stops the user being a candidate, clearBlocked restores it", async () => {
    await setBlocked(sql, 1);
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);

    await clearBlocked(sql, 1);
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(1);
  });

  // Phase 3 design 3.5. clearBlocked runs on every private-chat update, so it
  // must be a cheap no-op for the overwhelming majority who are not blocked.
  test("clearBlocked on an unblocked user changes nothing", async () => {
    await clearBlocked(sql, 1);
    const [row] = await sql<{ blocked: boolean }[]>`
      SELECT blocked FROM users WHERE telegram_id = 1
    `;
    expect(row?.blocked).toBe(false);
  });

  // The invariant that must never move: blocking is a decision about being
  // messaged, never about being counted (SPEC.md section 6). The three tests in
  // tests/db/standings.test.ts guard the query side; this guards that setBlocked
  // itself does not touch anything scoring reads.
  test("blocking does not remove the day the user already logged", async () => {
    await logDay(sql, 1, TODAY, "long");
    await setBlocked(sql, 1);
    const rows = await sql`SELECT 1 FROM days WHERE telegram_id = 1`;
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test:db 2>&1 | tail -20`
Expected: FAIL, "Cannot find module '../../src/db/reminders.ts'".

- [ ] **Step 3: Write `src/db/reminders.ts`**

```ts
import type { Sql } from "postgres";
import {
  FOLLOWUP_AFTER_IGNORES,
  MAX_REMINDERS_PER_TICK,
  REMINDER_GRACE_HOURS,
  TIMEZONE,
} from "../config.ts";

export interface DueReminder {
  telegramId: number;
  /** users.ignored_streak, fed straight into reminderAction. */
  ignoredStreak: number;
  /** Whether anything was logged since the last reminder went out. */
  responded: boolean;
}

interface DueRecord {
  telegram_id: string;
  ignored_streak: number;
  responded: boolean;
}

export interface DueOptions {
  /** Pins a fixed instant, for tests only. Production passes nothing. */
  at?: string | null;
  /** Defaults to MAX_REMINDERS_PER_TICK. */
  limit?: number;
}

/**
 * FR-21. Everyone owed a reminder right now, capped.
 *
 * The split with domain/reminders.ts is deliberate (phase 3 design 3): this
 * decides WHO is a candidate, and the pure function decides WHAT they are
 * sent. Everything here is a filter that either needs the database or keeps
 * the returned set small; nothing here is policy that could be unit tested
 * without one.
 *
 * The clauses, in the order they appear:
 *
 * - reminder_hour IS NOT NULL: off is off (FR-4, FR-24).
 * - NOT blocked: FR-23. This is the only gate blocked has; it never reaches
 *   scoring, and restoring it into standings.ts would retroactively erase a
 *   blocked user's whole season (SPEC.md section 6).
 * - ignored_streak <= FOLLOWUP_AFTER_IGNORES: phase 3 design 3.3. Past the
 *   threshold the follow-up has gone out unanswered, and the paused state is
 *   an absence of candidacy rather than an action.
 * - The grace window, mirroring isWithinGrace (phase 3 design 4.1). It cannot
 *   wrap past midnight: EXTRACT(HOUR) is 0 to 23, so hour 23 yields {23}.
 * - Not already reminded today, in TIMEZONE. Without it the 60-second tick
 *   would send the same reminder sixty times inside one hour (phase 3 design
 *   2.2). This is the per-user analogue of chats.last_monday_week, and it is a
 *   column rather than process memory so a restart mid-hour cannot re-send
 *   (NFR-5).
 * - No days row for today: FR-21's "only to users who have not yet recorded
 *   that day". A rest day is a record, so it suppresses the reminder too
 *   (FR-8), which is the whole point of offering an honest rest button.
 *
 * `responded` is the second job last_reminded_at does: whether anything was
 * written since the last ping. A NULL last_reminded_at means nothing has been
 * sent, so it is false and ignored_streak is 0; the two agree and the first
 * send takes the ordinary path.
 *
 * ORDER BY carries a unique tiebreaker (telegram_id) like every other ordered
 * query in this project. Under a LIMIT it does more than stabilise output:
 * without it Postgres may return a different page across calls, so a user
 * could be starved rather than merely reordered. NULLS FIRST puts the
 * never-reminded at the front.
 *
 * `at` pins a fixed instant for tests only, exactly as calendar() does.
 */
export async function dueReminders(
  sql: Sql,
  options: DueOptions = {},
): Promise<DueReminder[]> {
  const at = options.at ?? null;
  const limit = options.limit ?? MAX_REMINDERS_PER_TICK;

  const records = await sql<DueRecord[]>`
    WITH local AS (
      SELECT (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE}) AS ts
    )
    SELECT u.telegram_id::text,
           u.ignored_streak,
           EXISTS (
             SELECT 1 FROM days d
              WHERE d.telegram_id = u.telegram_id
                AND u.last_reminded_at IS NOT NULL
                AND d.logged_at > u.last_reminded_at
           ) AS responded
      FROM users u, local l
     WHERE u.reminder_hour IS NOT NULL
       AND NOT u.blocked
       AND u.ignored_streak <= ${FOLLOWUP_AFTER_IGNORES}::int
       AND EXTRACT(HOUR FROM l.ts)::int >= u.reminder_hour
       AND EXTRACT(HOUR FROM l.ts)::int <  u.reminder_hour + ${REMINDER_GRACE_HOURS}::int
       AND (
         u.last_reminded_at IS NULL
         OR (u.last_reminded_at AT TIME ZONE ${TIMEZONE})::date < (l.ts)::date
       )
       AND NOT EXISTS (
         SELECT 1 FROM days d
          WHERE d.telegram_id = u.telegram_id AND d.date = (l.ts)::date
       )
     ORDER BY u.last_reminded_at NULLS FIRST, u.telegram_id
     LIMIT ${limit}
  `;

  return records.map((record) => ({
    // BIGINT arrives as a string from the driver. Telegram IDs are well inside
    // the safe integer range, so this is lossless, matching db/users.ts.
    telegramId: Number(record.telegram_id),
    ignoredStreak: record.ignored_streak,
    responded: record.responded,
  }));
}

/**
 * FR-21 and FR-22. The two halves of a send, written together: the new ignore
 * count from reminderAction, and the stamp that stops the next tick re-sending.
 *
 * Called only after Telegram has accepted the message. A send that succeeds and
 * then fails to record re-sends on the next tick, bounded by the grace window;
 * that gap is accepted rather than solved, because solving it means a
 * transaction spanning a Telegram call (phase 3 design 6).
 */
export async function recordReminder(
  sql: Sql,
  telegramId: number,
  nextStreak: number,
  at: string | null = null,
): Promise<void> {
  await sql`
    UPDATE users
       SET ignored_streak   = ${nextStreak},
           last_reminded_at = COALESCE(${at}::timestamptz, now())
     WHERE telegram_id = ${telegramId}
  `;
}

/**
 * FR-22's "keep them": resumes immediately, and the chosen hour survives
 * untouched, so resuming never silently means choosing again.
 *
 * Deliberately not setReminderHour(sql, id, sameHour): that would need the
 * caller to read the hour back and write it unchanged, which is a lost update
 * waiting to happen and says something different from what the user asked for.
 */
export async function resumeReminders(sql: Sql, telegramId: number): Promise<void> {
  await sql`UPDATE users SET ignored_streak = 0 WHERE telegram_id = ${telegramId}`;
}

/** FR-23. A 403 is recorded, and dueReminders never selects the row again. */
export async function setBlocked(sql: Sql, telegramId: number): Promise<void> {
  await sql`UPDATE users SET blocked = TRUE WHERE telegram_id = ${telegramId}`;
}

/**
 * Phase 3 design 3.5. An incoming update is proof Telegram has stopped
 * refusing us, because a blocked user physically cannot send one. FR-23's
 * "never retried" still holds exactly: no send is ever retried INTO a block.
 *
 * The `AND blocked` is not redundant. This runs on every private-chat update,
 * and it makes the normal case a matched-nothing no-op rather than a row
 * rewrite, without a read first.
 */
export async function clearBlocked(sql: Sql, telegramId: number): Promise<void> {
  await sql`UPDATE users SET blocked = FALSE WHERE telegram_id = ${telegramId} AND blocked`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run test:db 2>&1 | tail -20`
Expected: PASS, whole suite green.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/db/reminders.ts tests/db/reminders.test.ts
git commit -m "Query who is owed a reminder (FR-21, FR-22, FR-23)

SQL decides who is a candidate; domain/reminders.ts decides what they
are sent. Everything here either needs the database or keeps the
returned set small.

last_reminded_at does two jobs: its local date is the once-a-day gate
that stops a 60-second tick sending sixty times, and comparing it to
days.logged_at answers whether the last reminder was ignored."
```

---

### Task 4: Two new callback kinds

**Files:**
- Modify: `src/bot/callbacks.ts`
- Test: `tests/bot/callbacks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `{ kind: "remind"; hour: number | null }` and `{ kind: "keep" }` on the `Callback` union, handled by `encode` and `decode`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bot/callbacks.test.ts`:

```ts
describe("remind and keep (FR-22, FR-24)", () => {
  // Phase 3 design 4.4. A separate kind from "hour", which registration owns:
  // that one's confirmation carries the 150 minute target and the privacy
  // notice SPEC.md section 6 requires at registration, and /remind must repeat
  // neither. One kind would mean one handler guessing which message it is
  // editing, which it cannot know.
  test("a remind hour round-trips", () => {
    expect(decode(encode({ kind: "remind", hour: 20 }))).toEqual({ kind: "remind", hour: 20 });
  });

  test("remind off round-trips", () => {
    expect(decode(encode({ kind: "remind", hour: null }))).toEqual({ kind: "remind", hour: null });
  });

  test("keep round-trips", () => {
    expect(decode(encode({ kind: "keep" }))).toEqual({ kind: "keep" });
  });

  test("midnight is a real hour, not a falsy one", () => {
    expect(decode(encode({ kind: "remind", hour: 0 }))).toEqual({ kind: "remind", hour: 0 });
  });

  test("an out-of-range hour is rejected", () => {
    expect(decode("remind:24")).toBeNull();
    expect(decode("remind:-1")).toBeNull();
    expect(decode("remind:")).toBeNull();
    expect(decode("remind:evening")).toBeNull();
  });

  test("keep takes no payload", () => {
    expect(decode("keep:1")).toBeNull();
  });

  // Telegram rejects callback_data over 64 bytes.
  test("both payloads are well inside Telegram's limit", () => {
    expect(encode({ kind: "remind", hour: 20 }).length).toBeLessThan(64);
    expect(encode({ kind: "keep" }).length).toBeLessThan(64);
  });
});
```

`describe`, `expect`, `test`, `decode` and `encode` are already imported at the top of that file by its existing tests, so no import changes are needed.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/bot/callbacks.test.ts`
Expected: FAIL. TypeScript rejects `{ kind: "remind" }` as not assignable to `Callback`.

- [ ] **Step 3: Extend the union**

In `src/bot/callbacks.ts`, add to the `Callback` union after `{ kind: "hour"; hour: number | null }`:

```ts
  /** FR-24. /remind's own hour choice. Distinct from "hour" above, which
   *  registration owns: that confirmation carries the target and privacy copy
   *  and /remind must repeat neither (phase 3 design 4.4). */
  | { kind: "remind"; hour: number | null }
  /** FR-22. "Keep them" on the follow-up: resume without re-choosing an hour. */
  | { kind: "keep" }
```

In `encode`, add to the switch:

```ts
    case "remind":    return `remind:${callback.hour ?? "off"}`;
    case "keep":      return "keep";
```

In `decode`, add `"keep"` to the bare-kind list at the top of the switch:

```ts
    case "stay":
    case "me":
    case "standings":
    case "keep":
      return data === kind ? { kind } : null;
```

and add the `remind` case beside the existing `hour` case:

```ts
    case "remind": {
      if (first === "off") return { kind: "remind", hour: null };
      if (!first || !/^\d{1,2}$/.test(first)) return null;
      const hour = Number(first);
      return hour >= 0 && hour <= 23 ? { kind: "remind", hour } : null;
    }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun test tests/bot/callbacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0.

```bash
git add src/bot/callbacks.ts tests/bot/callbacks.test.ts
git commit -m "Add the remind and keep callback kinds (FR-22, FR-24)

Separate from registration's 'hour' kind on purpose: that confirmation
carries the 150 minute target and the privacy notice, and /remind must
repeat neither. One kind would mean one handler guessing which message
it is editing."
```

---

### Task 5: Copy, and one shared check-in message

No new tests. `strings.ts` is copy, and `checkInMessage` lands in `checkin.ts`, which `CLAUDE.md` lists as untested by design with `docs/SMOKE.md` as its acceptance basis. The gate for this task is the typecheck plus the existing suite staying green.

**Files:**
- Modify: `src/strings.ts`
- Modify: `src/bot/checkin.ts`
- Test: `tests/bot/render.test.ts` (one existing test inverts)

**Interfaces:**
- Consumes: `WEEKLY_TARGET_MINUTES` (already imported by `strings.ts`), `isInWindow` (already imported by `checkin.ts`).
- Produces:
  - `interface CheckIn { text: string; keyboard: InlineKeyboard }` and `checkInMessage(today: string, yesterday: string): CheckIn`, exported from `src/bot/checkin.ts`
  - From `src/strings.ts`: `REMIND_STATUS_OFF`, `REMIND_OFF`, `REMINDER_FOLLOWUP`, `BUTTON_REMINDER_KEEP`, `BUTTON_REMINDER_STOP`, `TOAST_REMINDERS_KEPT`, `remindStatusOn(hour: number): string`, `remindSet(hour: number): string`, `remindersKept(hour: number): string`, and `COMMAND_DESCRIPTIONS.remind`

- [ ] **Step 1: Invert the test that forbids the sentence, and watch it fail**

Phase 1 pinned its own restraint with a test. In `tests/bot/render.test.ts`, replace the comment and test at lines 248 to 253 (`"Phase 1 copy never points at the not-yet-existing /remind command"`) with its opposite:

```ts
  // FR-24 requires the control to be discoverable rather than only documented
  // in help text, and this is the moment every user passes through. Phase 1
  // asserted the opposite: /remind did not exist yet, and pointing at a
  // command that silently does nothing is worse than not mentioning it. Phase
  // 3 adds the command, so the restraint inverts into a requirement.
  test("the registration copy points at /remind, which exists now", () => {
    expect(reminderSet(20, "Prodeko")).toContain("/remind");
    expect(reminderOff("Prodeko")).toContain("/remind");
  });
```

Run: `bun test tests/bot/render.test.ts`
Expected: FAIL, both assertions, because the copy does not mention `/remind` yet. Steps 2 and 3 below make it pass.

- [ ] **Step 2: Restore the sentence Phase 1 cut**

In `src/strings.ts`, replace the docstring and body of `reminderSet` and `reminderOff`:

```ts
/**
 * FR-4 requires a real choice with no silent default in either direction, and
 * SPEC.md section 6 requires the privacy notice at registration.
 *
 * The "change it any time" sentence was cut in Phase 1 because /remind did not
 * exist yet, and is restored here alongside the command (FR-24, which requires
 * the control to be discoverable rather than only documented in help text).
 */
/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function reminderSet(hour: number, guildName: string): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>. Change it any time with /remind.\n\n` +
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions.\n\n` +
    `Your first name and how much you move are visible to others in ${escapeHtml(guildName)}.`
  );
}

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function reminderOff(guildName: string): string {
  return (
    "No reminders. Log whenever you like with /log, and /remind turns them on.\n\n" +
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions.\n\n` +
    `Your first name and how much you move are visible to others in ${escapeHtml(guildName)}.`
  );
}
```

- [ ] **Step 3: Add the `/remind` and follow-up copy**

Add to `src/strings.ts`, after `toastReminderSet`:

```ts
/**
 * FR-24. /remind's own screens. Deliberately shorter than the registration
 * pair above: the 150 minute target and the privacy notice belong to the
 * moment of registering (SPEC.md section 6), and repeating them every time
 * someone changes an hour would train people to skip them.
 */
export function remindStatusOn(hour: number): string {
  return (
    `Reminders are on for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    "Pick a different hour, or turn them off."
  );
}

export const REMIND_STATUS_OFF =
  "Reminders are off.\n\nPick an hour and I'll ask on days you haven't logged.";

export function remindSet(hour: number): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    "I'll only ask on days you haven't logged."
  );
}

export const REMIND_OFF =
  "Reminders off, starting now. /remind turns them back on whenever you want.";

/**
 * FR-22. Sent once, in place of the sixth consecutive daily reminder.
 *
 * Three things it has to do. Say what happened, so the silence that follows is
 * explained rather than read as the bot breaking. Offer both outcomes as real
 * buttons, because the point of asking is that they might simply have been
 * away. And name the way back in the text itself, which FR-22 requires
 * explicitly, so an ignored follow-up still leaves a route to reminders
 * through a message they can scroll back to.
 */
export const REMINDER_FOLLOWUP =
  "<b>Five days, no answer.</b>\n\n" +
  "I've stopped the daily nudge so it doesn't become noise. Want it back?\n\n" +
  "Either way, /remind changes this any time.";

export const BUTTON_REMINDER_KEEP = "Keep them";
export const BUTTON_REMINDER_STOP = "Turn them off";
export const TOAST_REMINDERS_KEPT = "Reminders back on";

export function remindersKept(hour: number): string {
  return (
    `Back on for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    "I'll only ask on days you haven't logged."
  );
}
```

Add `remind` to `COMMAND_DESCRIPTIONS`:

```ts
/** FR-17, private-chat command menu. */
export const COMMAND_DESCRIPTIONS = {
  log: "Log today",
  me: "My week",
  standings: "Guild standings",
  // FR-24 requires the reminder control to be discoverable from the command
  // menu, not merely documented in help text.
  remind: "Reminder settings",
} as const;
```

- [ ] **Step 4: Extract the shared check-in message**

In `src/bot/checkin.ts`, add this immediately after `checkInKeyboard`:

```ts
export interface CheckIn {
  text: string;
  keyboard: InlineKeyboard;
}

/**
 * FR-6 and FR-21. One definition of the check-in message, rendered from the
 * live calendar dates.
 *
 * FR-21 says the daily reminder MUST send the check-in message, not a message
 * that resembles it. The reminder pass has bot.api and a chat id but no ctx,
 * so without this there would be two constructions that agree today and drift
 * later. Pure, and takes the dates as arguments, so the ticker can render once
 * per tick instead of issuing a calendar query per user.
 */
export function checkInMessage(today: string, yesterday: string): CheckIn {
  // FR-10. Only offer the backdate button when yesterday is itself loggable.
  // On the competition's first day, yesterday falls outside the window, and
  // offering the button anyway would cost the user two taps (Yesterday, then
  // any tier) to reach the same OUTSIDE_WINDOW refusal a single tap gives.
  const backdateTo = isInWindow(yesterday) ? yesterday : null;
  return { text: CHECK_IN_PROMPT, keyboard: checkInKeyboard(today, backdateTo) };
}
```

Then replace the body of `sendCheckIn` to use it:

```ts
/** FR-6. The same check-in message, on demand. Also reused after registration. */
export async function sendCheckIn(ctx: Context, sql: Sql, telegramId: number): Promise<void> {
  const user = await findUser(sql, telegramId);
  if (!user) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }
  const { today, yesterday } = await calendar(sql);
  const message = checkInMessage(today, yesterday);
  await ctx.reply(message.text, { parse_mode: "HTML", reply_markup: message.keyboard });
}
```

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `bunx tsc --noEmit && bun run test:db 2>&1 | tail -10`
Expected: no typecheck output, whole suite green, including the test inverted in Step 1. Apart from that one test the copy change is additive and the extraction changes no behaviour, so any other failure means the extraction changed the rendered check-in message.

- [ ] **Step 6: Commit**

```bash
git add src/strings.ts src/bot/checkin.ts tests/bot/render.test.ts
git commit -m "Add the reminder copy, and share one check-in message

FR-21 says the reminder sends the check-in message, not one resembling
it. The reminder pass has no ctx, so checkInMessage makes 'the same
message' structural rather than two constructions that agree today.

Restores the '/remind' sentence Phase 1 cut from the registration copy
because the command did not exist yet."
```

---

### Task 6: `/remind` and the send pass (`bot/reminders.ts`)

Telegram-facing, so untested by design: `docs/SMOKE.md` is its acceptance basis (Task 8 adds the steps). All the logic it depends on is already tested in Tasks 1 and 3.

**Files:**
- Create: `src/bot/reminders.ts`

**Interfaces:**
- Consumes: `reminderAction` (Task 1); `dueReminders`, `recordReminder`, `resumeReminders`, `setBlocked` (Task 3); `{ kind: "remind" }` and `{ kind: "keep" }` (Task 4); `checkInMessage` and the copy (Task 5); `findUser`, `setReminderHour` (Task 2); `REMINDER_HOURS` from `src/strings.ts`.
- Produces:
  - `installReminders(bot: Bot, sql: Sql): void`
  - `sendDueReminders(bot: Bot, sql: Sql, today: string, yesterday: string): Promise<void>`

- [ ] **Step 1: Write `src/bot/reminders.ts`**

```ts
import { GrammyError, InlineKeyboard, type Bot } from "grammy";
import type { Sql } from "postgres";
import { reminderAction } from "../domain/reminders.ts";
import {
  dueReminders,
  recordReminder,
  resumeReminders,
  setBlocked,
} from "../db/reminders.ts";
import { findUser, setReminderHour } from "../db/users.ts";
import { checkInMessage } from "./checkin.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_REMINDER_KEEP,
  BUTTON_REMINDER_STOP,
  NOT_REGISTERED,
  REMIND_OFF,
  REMIND_STATUS_OFF,
  REMINDER_FOLLOWUP,
  REMINDER_HOURS,
  TOAST_REMINDERS_KEPT,
  TOAST_REMINDERS_OFF,
  remindSet,
  remindStatusOn,
  remindersKept,
  toastReminderSet,
} from "../strings.ts";

/**
 * FR-24. The same hours as registration, so there is one set of choices in the
 * product, but carrying the "remind" callback kind rather than "hour" (phase 3
 * design 4.4).
 */
function remindKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  REMINDER_HOURS.forEach((hour, index) => {
    keyboard.text(`${String(hour).padStart(2, "0")}:00`, encode({ kind: "remind", hour }));
    if (index % 2 === 1 && index < REMINDER_HOURS.length - 1) keyboard.row();
  });
  return keyboard.row().text(BUTTON_REMINDER_STOP, encode({ kind: "remind", hour: null }));
}

/**
 * FR-22. Both outcomes as real buttons. "Keep them" resumes without asking the
 * user to choose an hour again, which is why it is its own callback kind and
 * not a remind:<hour> carrying the hour they already have.
 */
function followupKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(BUTTON_REMINDER_KEEP, encode({ kind: "keep" }))
    .text(BUTTON_REMINDER_STOP, encode({ kind: "remind", hour: null }));
}

/** FR-23. Telegram's answer when the user has blocked the bot. */
function isBlockedError(error: unknown): boolean {
  return error instanceof GrammyError && error.error_code === 403;
}

/** Telegram's answer when we are sending too fast (SPEC.md section 3.6). */
function isRateLimited(error: unknown): boolean {
  return error instanceof GrammyError && error.error_code === 429;
}

export function installReminders(bot: Bot, sql: Sql): void {
  /**
   * FR-24. Off and on at any time, and the hour changeable, through a command
   * in the menu rather than buried in help text.
   *
   * Private-chat only, like /me: it is a personal setting, and answering it in
   * a group would publish one member's reminder hour to the whole chat. Unlike
   * /me this carries no other member's data, so the reason is smaller, but the
   * shape matches.
   */
  bot.command("remind", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const user = await findUser(sql, ctx.from.id);
    if (!user) {
      await ctx.reply(NOT_REGISTERED);
      return;
    }
    await ctx.reply(
      user.reminderHour === null ? REMIND_STATUS_OFF : remindStatusOn(user.reminderHour),
      { parse_mode: "HTML", reply_markup: remindKeyboard() },
    );
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || !from) return await next();

    if (callback.kind === "remind") {
      // FR-24. Takes effect immediately, including for a reminder already due
      // later today: setReminderHour writes reminder_hour, and dueReminders
      // reads it live on the next tick rather than from anything cached.
      await setReminderHour(sql, from.id, callback.hour);
      await ctx.answerCallbackQuery(
        callback.hour === null ? TOAST_REMINDERS_OFF : toastReminderSet(callback.hour),
      );
      await ctx.editMessageText(
        callback.hour === null ? REMIND_OFF : remindSet(callback.hour),
        { parse_mode: "HTML" },
      );
      return;
    }

    if (callback.kind === "keep") {
      const user = await findUser(sql, from.id);
      // A follow-up message stays live indefinitely, so this can be tapped by
      // someone whose row is gone, or who turned reminders off in the
      // meantime. Neither is an error worth an alarming message: resuming an
      // hour that is not set would leave them on nothing.
      if (!user || user.reminderHour === null) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(REMIND_STATUS_OFF, {
          parse_mode: "HTML",
          reply_markup: remindKeyboard(),
        });
        return;
      }
      // FR-22: "a user who taps 'keep them' resumes immediately". The hour is
      // untouched, so resuming never silently means choosing again.
      await resumeReminders(sql, from.id);
      await ctx.answerCallbackQuery(TOAST_REMINDERS_KEPT);
      await ctx.editMessageText(remindersKept(user.reminderHour), { parse_mode: "HTML" });
      return;
    }

    return await next();
  });
}

/**
 * FR-21, FR-22 and FR-23. One pass of the reminder loop, called once per tick
 * from ticker.ts.
 *
 * The dates arrive from the caller's single calendar() read, so the message is
 * rendered once for the whole batch rather than once per user.
 *
 * Per-user isolation matches the ticker's per-chat isolation: one person's
 * failure must not abandon the rest of the batch. The one deliberate exception
 * is a 429, which is Telegram saying the batch itself is the problem, so the
 * pass stops and the next tick picks up inside the same grace window.
 */
export async function sendDueReminders(
  bot: Bot,
  sql: Sql,
  today: string,
  yesterday: string,
): Promise<void> {
  const due = await dueReminders(sql);
  if (due.length === 0) return;

  const message = checkInMessage(today, yesterday);

  for (const user of due) {
    const { action, nextStreak } = reminderAction(user);
    // dueReminders already excludes the paused, so this cannot normally fire.
    // Kept because the alternative to a redundant guard here is sending a
    // reminder to someone who asked not to receive one.
    if (action === "none") continue;

    try {
      if (action === "daily") {
        await bot.api.sendMessage(String(user.telegramId), message.text, {
          parse_mode: "HTML",
          reply_markup: message.keyboard,
        });
      } else {
        await bot.api.sendMessage(String(user.telegramId), REMINDER_FOLLOWUP, {
          parse_mode: "HTML",
          reply_markup: followupKeyboard(),
        });
      }
      // Only after Telegram accepted it. A send that succeeds and then fails
      // to record re-sends next tick, bounded by the grace window; that gap is
      // accepted rather than solved (phase 3 design 6).
      await recordReminder(sql, user.telegramId, nextStreak);
    } catch (error) {
      if (isBlockedError(error)) {
        // FR-23. Recorded, and dueReminders never selects this row again
        // unless the user comes back and messages us (phase 3 design 3.5).
        console.warn(`user ${user.telegramId} has blocked the bot`);
        try {
          await setBlocked(sql, user.telegramId);
        } catch (blockError) {
          // Guarded for the same reason the ticker guards unbindChat: an
          // error here would escape the per-user catch and abandon the rest
          // of the batch, which is exactly what the isolation exists to stop.
          console.error(`failed to record block for ${user.telegramId}`, blockError);
        }
        continue;
      }
      if (isRateLimited(error)) {
        // Not a per-user failure: continuing would make it worse. The
        // remaining users stay due and the next tick retries them, still
        // inside the grace window (phase 3 design 4.1).
        console.warn("rate limited, stopping this tick's reminders");
        return;
      }
      console.error(`reminder to ${user.telegramId} failed`, error);
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0. Nothing imports this file yet, so the suite is unchanged.

- [ ] **Step 3: Run the suite to confirm nothing regressed**

Run: `bun run test:db 2>&1 | tail -10`
Expected: whole suite green.

- [ ] **Step 4: Commit**

```bash
git add src/bot/reminders.ts
git commit -m "Send the daily reminder and offer /remind (FR-21 to FR-24)

Per-user isolation, so one person's failure does not abandon the batch.
A 403 records the block and moves on; a 429 stops the pass entirely,
because that one says the batch itself is the problem, and the rest stay
due inside the grace window.

recordReminder runs only after Telegram accepts the message."
```

---

### Task 7: Wiring

The task where the feature turns on. Three files, and the placement rule in `ticker.ts` is the one thing here that fails silently if it is wrong.

**Files:**
- Modify: `src/bot/ticker.ts`
- Modify: `src/bot/index.ts`
- Modify: `src/bot/registration.ts`

**Interfaces:**
- Consumes: `installReminders`, `sendDueReminders` (Task 6); `clearBlocked` (Task 3); `UserRow.reminderAsked` (Task 2); `COMMAND_DESCRIPTIONS.remind` (Task 5).
- Produces: nothing new. This is the last code task.

- [ ] **Step 1: Call the pass from the ticker**

In `src/bot/ticker.ts`, add the import beside the others:

```ts
import { sendDueReminders } from "./reminders.ts";
```

In `tick()`, change the calendar destructure to pick up `yesterday`:

```ts
      const { today, yesterday, weekStart, hour } = await calendar(sql);
```

Then, immediately after the existing `if (!inWindow && !previousWeekInCompetition({ weekStart })) return;` line and **before** `const chats = await listChats(sql);`, insert:

```ts
      // FR-21. Placement is load-bearing and wrong in two different ways if
      // moved (phase 3 design 4.5).
      //
      // It sits INSIDE the window gate above, so reminders stop with the
      // competition rather than asking people for a week afterwards to log
      // days FR-26 refuses to store.
      //
      // It sits OUTSIDE the refreshPins branch below, which runs every 15
      // minutes. Nested there, a reminder would land on a quarter-hour lattice
      // and a user whose window opened at 20:01 would wait until 20:15.
      //
      // Guarded separately from the per-chat loop: a failing reminder pass
      // must not cost every chat its pin refresh and Monday post. The batch's
      // own per-user isolation is inside sendDueReminders.
      if (inWindow) {
        try {
          await sendDueReminders(bot, sql, today, yesterday);
        } catch (error) {
          console.error("reminder pass failed", error);
        }
      }
```

- [ ] **Step 2: Install the handlers and the block-clearing middleware**

In `src/bot/index.ts`, add the imports:

```ts
import { installReminders } from "./reminders.ts";
import { clearBlocked } from "../db/reminders.ts";
```

Inside `createBot`, immediately after `const bot = new Bot(token);` and **before** `installGroup`:

```ts
  /**
   * FR-23 and phase 3 design 3.5. A blocked user physically cannot send an
   * update, so receiving one is proof Telegram has stopped refusing us, and
   * FR-23's "never retried" still holds exactly: no send is ever retried INTO
   * a block. Without this, one transient 403 removes a user from the only
   * re-engagement mechanism the competition has, for the rest of the season.
   *
   * First, before every command handler, because it must see the update
   * whichever handler ends up consuming it. Private chats only: a group
   * message says nothing about whether its sender has blocked the bot.
   *
   * The write is guarded, deliberately. This is reachability bookkeeping, and
   * it must never be the reason a user's /log fails: on a database blip the
   * interaction proceeds and the flag is cleared by their next message.
   */
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private" && ctx.from) {
      try {
        await clearBlocked(sql, ctx.from.id);
      } catch (error) {
        console.error(`failed to clear blocked for ${ctx.from.id}`, error);
      }
    }
    await next();
  });
```

Then add `installReminders` to the handler chain, after `installReports` and before the catch-all:

```ts
  installRegistration(bot, sql);
  installCheckIn(bot, sql);
  installReports(bot, sql);
  // Installs a callback_query:data listener too, so it must stay above the
  // catch-all below, which answers anything unclaimed and stops the chain.
  installReminders(bot, sql);
```

In `installCommands`, add `/remind` to the private-chat menu only (FR-17: it is a personal setting, and FR-24 requires it discoverable from the menu):

```ts
  await bot.api.setMyCommands(
    [
      { command: "log", description: COMMAND_DESCRIPTIONS.log },
      { command: "me", description: COMMAND_DESCRIPTIONS.me },
      { command: "standings", description: COMMAND_DESCRIPTIONS.standings },
      { command: "remind", description: COMMAND_DESCRIPTIONS.remind },
    ],
    { scope: { type: "all_private_chats" } },
  );
```

Leave the group-chat `setMyCommands` call exactly as it is.

- [ ] **Step 3: Switch registration to `reminder_asked`**

In `src/bot/registration.ts`, replace `reminderKeyboardIfUnset` with:

```ts
/**
 * FR-4. Offered until the question has actually been put, which is what
 * reminder_asked records (phase 3 design 4.6).
 *
 * Phase 1 tested reminderHour === null instead, because reminder_hour was NULL
 * both for "never asked" and for "asked and declined", which cost a decliner
 * the question again on every /start. Migration 003 separates them and this is
 * the test that replaces it.
 */
function reminderKeyboardIfUnasked(reminderAsked: boolean): InlineKeyboard | undefined {
  return reminderAsked ? undefined : reminderKeyboard();
}
```

Then update its four call sites. In the `bot.command("start")` handler:

```ts
      await ctx.reply(alreadyRegistered(current?.name ?? existing.guildSlug), {
        parse_mode: "HTML",
        reply_markup: reminderKeyboardIfUnasked(existing.reminderAsked),
      });
```

In the `guild` callback branch, replace the whole `reply_markup` line and the four-line comment above it (the one beginning "reminder_hour is NULL both for") with:

```ts
          reply_markup: reminderKeyboardIfUnasked(existing.reminderAsked),
```

In the `move` branch:

```ts
        // See reminderKeyboardIfUnasked: moving guilds never touches the
        // reminder question, so a mover who was never asked still needs asking.
        reply_markup: reminderKeyboardIfUnasked(before?.reminderAsked ?? false),
```

In the `stay` branch:

```ts
        // See reminderKeyboardIfUnasked: staying never touches it either.
        reply_markup: user ? reminderKeyboardIfUnasked(user.reminderAsked) : undefined,
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 5: Run the whole suite**

Run: `bun run test:db 2>&1 | tail -10`
Expected: whole suite green.

- [ ] **Step 6: Confirm the ticker placement by reading it back**

Run: `sed -n '/const inWindow/,/const chats/p' src/bot/ticker.ts`
Expected: the `if (inWindow)` reminder block appears **after** the `return` gate and **before** `const chats`, and is not indented inside any `if (refreshPins)` block. This is a read-back rather than a test because `ticker.ts` is untested by design and this specific mistake produces no error, only reminders on a 15-minute lattice or reminders after the competition ends.

- [ ] **Step 7: Check the size ceiling**

Run:
```bash
find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
```
Expected: roughly 1,730 to 1,790, and it MUST be under 2,000 (NFR-6). If it is over, something from SPEC.md section 8 has crept in; stop and report rather than deleting comments to fit.

- [ ] **Step 8: Commit**

```bash
git add src/bot/ticker.ts src/bot/index.ts src/bot/registration.ts
git commit -m "Turn reminders on (FR-21 to FR-24)

The pass sits inside the ticker's window gate, so reminders stop with
the competition, and outside the 15-minute pin refresh, so a reminder
lands within a minute of its hour rather than on a quarter-hour lattice.

A middleware clears blocked on any private-chat update: a blocked user
cannot send one, so receiving one is proof Telegram has stopped
refusing us. Guarded, because reachability bookkeeping must never be
why someone's /log fails.

Registration now offers the reminder question on reminder_asked rather
than on a NULL hour, which stops re-asking a decliner on every /start."
```

---

### Task 8: The stale comments, the smoke checklist, and CLAUDE.md

Documentation and comments only, no behaviour. It is its own task because a reviewer could reasonably reject the wording while approving all the code.

**Files:**
- Modify: `src/db/standings.ts`
- Modify: `tests/db/standings.test.ts`
- Modify: `docs/SMOKE.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Fix the three comments that describe Phase 3 as still to come**

Two of them say some form of "nothing sets `blocked` until FR-23 lands in Phase 3", which stops being true in this phase. A stale comment saying a guard cannot fire is worse than no comment: it invites the next reader to conclude the guard is theoretical and delete it.

In `src/db/standings.ts`, replace these five lines of the `standings()` docstring (lines 36 to 40):

```
 * across its entire roster including everyone who never logs at all. Worse,
 * the clause is retroactive: nothing sets `blocked` until FR-23 lands in
 * Phase 3, and the moment it does, the first user who blocks the bot erases
 * their whole season's activity from their guild's total. The pinned message
 * then publishes that guild's score visibly dropping, which is impossible
```

with:

```
 * across its entire roster including everyone who never logs at all. Worse,
 * the clause is retroactive: FR-23 writes `blocked` as of Phase 3, so the
 * first user who blocks the bot erases their whole season's activity from
 * their guild's total. The pinned message then publishes that guild's score
 * visibly dropping, which is impossible
```

In `tests/db/standings.test.ts`, replace the two paragraphs above `describe("blocked users still count toward every score", ...)` with:

```ts
// `blocked` is written by FR-23 as of Phase 3, so these tests describe a state
// real users reach rather than one only this file can construct. They are the
// executable form of a decision that used to live only in a comment: blocking
// the bot is a decision about being messaged, and it must never move a number.
//
// They fail the moment someone restores `AND NOT u.blocked` from the query
// printed in SPEC.md section 6, which is the realistic way this regresses: that
// query is the source of truth's own text, it looks obviously right, and the
// damage it does is invisible until a real user blocks the bot mid-competition.
```

One more, in `tests/bot/callbacks.test.ts` line 59, which says the distinction "matters once Phase 3 sends check-ins". It does now, so replace that sentence with:

```ts
  // keyboard. The reminder pass sends the check-in message daily, so a payload
  // that means "offer the check-in again" and one that means "switch to
  // yesterday" are now both in live circulation.
```

- [ ] **Step 2: Run the suite, since a test file changed**

Run: `bun run test:db 2>&1 | tail -10`
Expected: whole suite green, same count as before. Only comments changed.

- [ ] **Step 3: Add the Phase 3 smoke section**

Append to `docs/SMOKE.md`:

```markdown
## Reminders (Phase 3)

`src/bot/reminders.ts` and the reminder call inside `ticker.ts` have no
automated tests by design, so this section is their entire acceptance basis.
The decision logic underneath them is tested: `tests/domain/reminders.test.ts`
covers the FR-22 state machine and `tests/db/reminders.test.ts` covers who is
due. What is unverified until these boxes are ticked is the wiring.

Run against a bot whose competition window contains today, on an account
registered to a guild.

### The daily send

- [ ] `/remind`, pick an hour still to come today, and confirm a check-in
      message arrives at that hour and is identical to the one `/log` produces
      (FR-21, FR-6)
- [ ] Tapping a tier on the reminder logs normally, edits in place into the
      confirmation, and the progress bar is right (FR-5, FR-12)
- [ ] On another day, log before the chosen hour, and confirm **nothing**
      arrives at that hour (FR-21). This is the requirement's own acceptance
      test and the one most worth waiting for
- [ ] Log a rest day (`Not today`) before the hour, and confirm nothing arrives
      either: a rest is a record (FR-8)
- [ ] Pick an hour that has already passed today, and confirm no reminder fires
      within the next few minutes (phase 3 design 3.4). It should arrive
      tomorrow instead

### Control (FR-24)

- [ ] `/remind` appears in the private command menu, without needing help text
- [ ] `/remind` shows the current hour when reminders are on, and shows they
      are off when they are off
- [ ] Turn reminders off at least an hour before a reminder is due, and confirm
      nothing arrives at the hour. FR-24's own acceptance test is "a user who
      turns reminders off at 19:00 receives nothing at 20:00"
- [ ] Turn them back on and confirm the hour you pick is stored and shown
- [ ] `/remind` in a group chat does nothing at all (it is private-chat only)

### The follow-up (FR-22)

Five consecutive ignored reminders take five days, so the count is set
directly. That is a database statement against messaging state, not a code
path: it writes no `days` row and no minute, so NFR-4 is untouched. There is
still no seed command, debug route or simulation anywhere in the build.

- [ ] With reminders on and nothing logged today, run
      `UPDATE users SET ignored_streak = 5, last_reminded_at = NULL WHERE telegram_id = <you>;`
      and confirm the next due hour produces the **follow-up**, not a sixth
      check-in message
- [ ] The follow-up names the way back to reminders in its own text, so an
      ignored one still leaves a route (FR-22)
- [ ] Tap `Keep them` and confirm it says reminders are back on **at the hour
      you already had**, without asking you to choose again (FR-22)
- [ ] Repeat the setup, tap `Turn them off` instead, and confirm `/remind`
      then reports reminders as off
- [ ] Repeat the setup, ignore the follow-up entirely, and confirm no further
      reminder arrives the next day (FR-22: reminders stay paused)
- [ ] Still paused, log a day with `/log`, and confirm reminders do **not**
      resume the following day (phase 3 design 3.3). Then `/remind`, pick an
      hour, and confirm they do

### Blocking (FR-23)

- [ ] Block the bot in Telegram, wait for a reminder to be due, and confirm the
      log records the block and `users.blocked` is true
- [ ] Confirm no further reminder is attempted while blocked
- [ ] Unblock, send `/log`, and confirm `users.blocked` returns to false and
      the reply arrives normally (phase 3 design 3.5)
- [ ] Confirm the blocked user's minutes never left the standings at any point
      in the above. This is the invariant with the largest blast radius in the
      project: blocking gates messaging and never scoring
```

- [ ] **Step 4: Update CLAUDE.md**

Four edits.

In the Documents section, add the Phase 3 design beside the Phase 2 one:

```markdown
  [The Phase 3 design](docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md) does the
  same for reminders, and its comments cite it as "phase 3 design N.N".
```

In the Architecture section, replace the "Phase 1 and Phase 2 are built" paragraph with:

```markdown
**Phases 1, 2 and 3 are built** (registration, `/log`, `/me`, `/standings`, the group chat
binding, the pinned standings, the Monday post, the daily reminder with its five-ignore
auto-stop, `/remind`, 403 handling, Docker deploy). Phase 4 (tags, nightly backup) is not.
SPEC.md §10 forbids starting a phase before the previous one works end to end, and **no phase's
smoke run has been done yet** (docs/SMOKE.md).
```

Add these to the "Invariants that are easy to break" list:

```markdown
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
```

Update the size line in the ceiling invariant with the real number from Task 7 Step 7, replacing the "1,547 effective lines, leaving about 450" sentence with the measured figure and the remaining headroom against 2,000.

In the Conventions section, extend the untested-by-design sentence to include the new file:

```markdown
- The handler files (`registration.ts`, `checkin.ts`, `reports.ts`, `group.ts`, `reminders.ts`) and
  the Telegram calls inside `ticker.ts` are untested by design. `domain/scheduling.ts` and
  `domain/reminders.ts`, the pure decisions they call, are unit tested normally.
```

- [ ] **Step 5: Final full verification**

Run all three, and record the actual output rather than asserting success:

```bash
bunx tsc --noEmit
bun run test:db 2>&1 | tail -5
find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
```

Expected: no typecheck output; the suite green with a test count higher than the 172 in `CLAUDE.md` (the new domain and db files add roughly 40); the line count under 2,000.

- [ ] **Step 6: Commit**

```bash
git add src/db/standings.ts tests/db/standings.test.ts tests/bot/callbacks.test.ts docs/SMOKE.md CLAUDE.md
git commit -m "Record Phase 3: smoke steps, invariants, and two stale comments

Two comments said nothing writes blocked until FR-23 lands in Phase 3.
FR-23 has landed, and a comment saying a guard cannot fire invites the
next reader to delete it as theoretical.

The smoke section is the entire acceptance basis for bot/reminders.ts
and the ticker's reminder call. FR-22's five-day path is set up with a
direct UPDATE of ignored_streak: messaging state, no days row, no
minute, so NFR-4 is untouched."
```

---

## What this plan does not do

Named so their absence is a decision rather than an oversight:

- **The smoke runs themselves.** Phases 1, 2 and now 3 all ship unsmoked. Every phase's design says the same thing and it is still true: the checklist gates real use, not code. It cannot be automated (design 1.1).
- **Tags (FR-11) and the nightly backup (NFR-3).** Phase 4.
- **Per-user timezones, free-text reminder hours, adaptive send times.** Rejected in the design's section 9, not deferred.
- **Any change to scoring.** No query in `standings.ts` or `days.ts` changes behaviour. The only edit there is a comment.

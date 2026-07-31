# Phase 2 (Guild Group Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the competition in each guild's group chat: bind a chat to a guild by link, keep a pinned standings message current by silent edits, and post a fresh-start message each Monday.

**Architecture:** A new `chats` table holds the binding and the per-chat scheduler state. One 60-second in-process ticker reads it, refreshes pins on 15 minutes of elapsed time, and posts on Mondays. The scheduling decision is a pure domain function so it is testable without Telegram; the Telegram-facing glue holds no decisions.

**Tech Stack:** Bun, grammY, postgres.js, PostgreSQL 17. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-07-31-telegram-bot-phase-2-design.md](../specs/2026-07-31-telegram-bot-phase-2-design.md). Cited below as "phase 2 design N.N", matching the code-comment convention.

## Global Constraints

Every task's requirements implicitly include all of these. They are project-wide and each has already caused or nearly caused a defect.

- **No total is ever stored.** `days.tier` is the only ground truth. No column, cache or snapshot table may hold a sum. `pinned_text` is a rendered string, not a total, and is never read back as data.
- **Date buckets are computed in SQL, in `Europe/Helsinki`,** never with JavaScript date arithmetic. The one permitted exception is UTC-midnight *label* arithmetic with no timezone conversion, as `previousWeek()` in `src/domain/scoring.ts` does; any new instance must carry the same justification in a comment.
- **Every `BIGINT` and `DATE` is selected `::text`.** postgres.js returns BIGINT as a JS string and DATE as a `Date` at UTC midnight. This includes `chat_id`, `pinned_message_id` and `last_monday_week`.
- **Every per-member division casts `::numeric` before dividing, then `::float8`.** Postgres integer division truncates `142 / 650` to 0.
- **Every ranking `ORDER BY` needs a unique tiebreaker** (`g.slug`, `telegram_id`).
- **Callback payloads are untrusted and can be stale.** `decode()` returns null for anything malformed. Payloads stay under Telegram's 64-byte limit.
- **Every button carries its full meaning; the process holds no session state** (NFR-5).
- **Escape only interpolated values with `escapeHtml`, never a whole message.** When padding a name for column alignment, pad the raw string *then* escape.
- **No code path may write activity data without a real user action** (NFR-4).
- **No global individual leaderboard** (FR-15).
- **Long polling only** (NFR-1). No webhook, no inbound port, no third container.
- **Imports carry explicit `.ts` extensions**, types use `import type`, `strict` and `noUncheckedIndexedAccess` are on.
- **All user-facing text is English and lives in `src/strings.ts`** (FR-27). No i18n framework.
- **No em dashes or en dashes anywhere,** including message copy and comments.
- **Comments explain *why*, cite the requirement ID** (FR-x, NFR-x, phase 2 design N.N) and record rejected alternatives. Match the existing density; it is the house style.
- **Size ceiling: 2,000 effective lines** across `src/`. This phase budgets 200 to 250.
- Tests: one isolated Postgres schema per file via `freshDatabase("<name>")`, ended in `afterAll`. Each file needs a unique bare-identifier name.

**Verification commands.** `bunx tsc --noEmit` must exit 0 and `bun test` must show 0 failures before every commit. The `db-test` container must be running (`bun run test:db` starts it). Baseline at the start of this plan is **132 pass, 0 fail**.

---

### Task 1: The `chats` table and its queries

**Files:**
- Create: `src/db/migrations/002_chats.sql`
- Create: `src/db/chats.ts`
- Test: `tests/db/chats.test.ts`

**Interfaces:**
- Consumes: `freshDatabase` from `tests/helpers/db.ts`, `syncGuilds` from `src/db/users.ts`.
- Produces: `Chat` interface with fields `chatId: string`, `guildSlug: string`, `pinnedMessageId: string | null`, `pinnedText: string | null`, `pinFailed: boolean`, `lastMondayWeek: string`. Functions `bindChat(sql, chatId: string, guildSlug: string, weekStart: string): Promise<void>`, `findChat(sql, chatId: string): Promise<Chat | null>`, `listChats(sql): Promise<Chat[]>`, `unbindChat(sql, chatId: string): Promise<void>`, `recordPin(sql, chatId: string, input: { messageId: string | null; text: string; pinFailed: boolean }): Promise<void>`, `recordMondayPost(sql, chatId: string, weekStart: string): Promise<void>`.

- [ ] **Step 1: Write the migration**

Create `src/db/migrations/002_chats.sql`:

```sql
-- FR-18. The guild-to-chat mapping SPEC.md section 6 leaves open.
--
-- A table rather than the column on guilds that section 6 also offers (design
-- 2.2.1): pinned_message_id, pinned_text, pin_failed and last_monday_week are
-- facts about a chat and not about a guild, one guild plausibly has both a
-- board chat and a general chat, and unbinding a chat the bot was removed from
-- must not touch a guilds row that syncGuilds rewrites on every boot.
--
-- last_monday_week is NOT NULL because NULL would read as "owed a post" and
-- fire a "new week, back to zero" message at a chat bound on a Thursday
-- (phase 2 design 2.4). Binding sets it to the current week.
CREATE TABLE chats (
  chat_id           BIGINT PRIMARY KEY,
  guild_slug        TEXT NOT NULL REFERENCES guilds(slug),
  pinned_message_id BIGINT,
  pinned_text       TEXT,
  pin_failed        BOOLEAN NOT NULL DEFAULT FALSE,
  last_monday_week  DATE NOT NULL,
  bound_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The foreign key onto `guilds(slug)` is safe: `syncGuilds` upserts and never deletes.

- [ ] **Step 2: Write the failing test**

Create `tests/db/chats.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds } from "../../src/db/users.ts";
import {
  bindChat,
  findChat,
  listChats,
  recordMondayPost,
  recordPin,
  unbindChat,
} from "../../src/db/chats.ts";

const sql = await freshDatabase("chats");
afterAll(async () => { await sql.end(); });

// A real supergroup id: large and negative, which is the shape that a missing
// ::text cast corrupts.
const SUPERGROUP = "-1001234567890";
const WEEK = "2026-07-27";

beforeEach(async () => {
  await sql`DELETE FROM chats`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
});

describe("chats (FR-18)", () => {
  test("binds a chat to a guild and reads it back", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    const chat = await findChat(sql, SUPERGROUP);
    expect(chat).not.toBeNull();
    expect(chat!.guildSlug).toBe("prodeko");
    expect(chat!.lastMondayWeek).toBe(WEEK);
    expect(chat!.pinnedMessageId).toBeNull();
    expect(chat!.pinFailed).toBe(false);
  });

  // Design 2.2.2. A supergroup id must survive the round trip as an exact
  // string, never as a JS number.
  test("returns the chat id as an exact string", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    const chat = await findChat(sql, SUPERGROUP);
    expect(chat!.chatId).toBe(SUPERGROUP);
    expect(typeof chat!.chatId).toBe("string");
  });

  test("returns null for a chat that was never bound", async () => {
    expect(await findChat(sql, SUPERGROUP)).toBeNull();
  });

  // Design 2.3.1. Rebinding changes the guild and must NOT reset the Monday
  // ledger, or rebinding would be a way to trigger a second post in one week.
  test("rebinding changes the guild but keeps last_monday_week", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordMondayPost(sql, SUPERGROUP, "2026-08-03");
    await bindChat(sql, SUPERGROUP, "inkubio", "2026-08-10");

    const chat = await findChat(sql, SUPERGROUP);
    expect(chat!.guildSlug).toBe("inkubio");
    expect(chat!.lastMondayWeek).toBe("2026-08-03");
    expect(await listChats(sql)).toHaveLength(1);
  });

  test("records a pinned message and its rendered text", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordPin(sql, SUPERGROUP, { messageId: "42", text: "rendered", pinFailed: false });

    const chat = await findChat(sql, SUPERGROUP);
    expect(chat!.pinnedMessageId).toBe("42");
    expect(chat!.pinnedText).toBe("rendered");
    expect(chat!.pinFailed).toBe(false);
  });

  // Design 2.3.2. The flag drives one extra line in the render and is cleared
  // the moment a retry succeeds.
  test("records and then clears a failed pin", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordPin(sql, SUPERGROUP, { messageId: "42", text: "a", pinFailed: true });
    expect((await findChat(sql, SUPERGROUP))!.pinFailed).toBe(true);

    await recordPin(sql, SUPERGROUP, { messageId: "42", text: "b", pinFailed: false });
    expect((await findChat(sql, SUPERGROUP))!.pinFailed).toBe(false);
  });

  test("records a Monday post", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordMondayPost(sql, SUPERGROUP, "2026-08-03");
    expect((await findChat(sql, SUPERGROUP))!.lastMondayWeek).toBe("2026-08-03");
  });

  test("unbinds a chat", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await unbindChat(sql, SUPERGROUP);
    expect(await findChat(sql, SUPERGROUP)).toBeNull();
    expect(await listChats(sql)).toHaveLength(0);
  });

  test("lists every bound chat", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await bindChat(sql, "-1009876543210", "tik", WEEK);
    const all = await listChats(sql);
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.guildSlug).sort()).toEqual(["prodeko", "tik"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test tests/db/chats.test.ts`
Expected: FAIL, unable to resolve `../../src/db/chats.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/db/chats.ts`:

```ts
import type { Sql } from "postgres";

export interface Chat {
  chatId: string;
  guildSlug: string;
  pinnedMessageId: string | null;
  pinnedText: string | null;
  pinFailed: boolean;
  lastMondayWeek: string;
}

interface ChatRecord {
  chat_id: string;
  guild_slug: string;
  pinned_message_id: string | null;
  pinned_text: string | null;
  pin_failed: boolean;
  last_monday_week: string;
}

/**
 * Every BIGINT and DATE is selected ::text. postgres.js hands BIGINT back as a
 * string and DATE as a Date at UTC midnight, and a supergroup id is large and
 * negative, so a raw select is exactly where a chat id would stop matching the
 * one Telegram sent.
 */
const CHAT_COLUMNS =
  "chat_id::text, guild_slug, pinned_message_id::text, pinned_text, pin_failed, last_monday_week::text";

function toChat(record: ChatRecord): Chat {
  return {
    chatId: record.chat_id,
    guildSlug: record.guild_slug,
    pinnedMessageId: record.pinned_message_id,
    pinnedText: record.pinned_text,
    pinFailed: record.pin_failed,
    lastMondayWeek: record.last_monday_week,
  };
}

/**
 * FR-18. Binding and rebinding are one operation.
 *
 * ON CONFLICT updates guild_slug alone, deliberately: last_monday_week must
 * survive a rebind (phase 2 design 3.1), or an admin could rebind a chat to force a
 * second Monday post in the same week. weekStart is therefore only ever used
 * for the initial insert, where it starts the ledger at the current week so a
 * chat bound mid-week does not immediately receive a "new week" post
 * (phase 2 design 2.4).
 */
export async function bindChat(
  sql: Sql,
  chatId: string,
  guildSlug: string,
  weekStart: string,
): Promise<void> {
  await sql`
    INSERT INTO chats (chat_id, guild_slug, last_monday_week)
    VALUES (${chatId}::bigint, ${guildSlug}, ${weekStart}::date)
    ON CONFLICT (chat_id) DO UPDATE SET guild_slug = EXCLUDED.guild_slug
  `;
}

export async function findChat(sql: Sql, chatId: string): Promise<Chat | null> {
  const [record] = await sql<ChatRecord[]>`
    SELECT ${sql.unsafe(CHAT_COLUMNS)} FROM chats WHERE chat_id = ${chatId}::bigint
  `;
  return record ? toChat(record) : null;
}

/** Ordered by chat_id so the ticker walks chats in a stable order. */
export async function listChats(sql: Sql): Promise<Chat[]> {
  const records = await sql<ChatRecord[]>`
    SELECT ${sql.unsafe(CHAT_COLUMNS)} FROM chats ORDER BY chat_id
  `;
  return records.map(toChat);
}

export async function unbindChat(sql: Sql, chatId: string): Promise<void> {
  await sql`DELETE FROM chats WHERE chat_id = ${chatId}::bigint`;
}

/**
 * FR-19. pinned_text is stored so the next refresh can skip an unchanged edit
 * rather than send it and collect Telegram's 400 "message is not modified"
 * (phase 2 design 2.3). It is a rendered string and is never read back as data.
 */
export async function recordPin(
  sql: Sql,
  chatId: string,
  input: { messageId: string | null; text: string; pinFailed: boolean },
): Promise<void> {
  await sql`
    UPDATE chats
       SET pinned_message_id = ${input.messageId}::bigint,
           pinned_text       = ${input.text},
           pin_failed        = ${input.pinFailed}
     WHERE chat_id = ${chatId}::bigint
  `;
}

/** FR-20. The ledger that makes the Monday post exactly-once across restarts. */
export async function recordMondayPost(
  sql: Sql,
  chatId: string,
  weekStart: string,
): Promise<void> {
  await sql`
    UPDATE chats SET last_monday_week = ${weekStart}::date WHERE chat_id = ${chatId}::bigint
  `;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/db/chats.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Verify the migration applies to an empty database and typecheck**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, and 141 pass / 0 fail. `tests/db/migrate.test.ts` exercises a cold migration, so a broken `002` fails there too.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/002_chats.sql src/db/chats.ts tests/db/chats.test.ts
git commit -m "Add the chats table and its queries (FR-18)"
```

---

### Task 2: `participation()`, and extract the duplicated tier-minutes CTE

**Files:**
- Modify: `src/db/standings.ts`
- Test: `tests/db/standings.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `participation(sql, guildSlug: string, from: string, to: string): Promise<number>` returning a share in `0..1`, not a percentage.

Design 2.9.1 asks for the CTE extraction here rather than later, because this task touches the file anyway and Phase 3 takes the duplication from four sites to six. The three existing queries are covered by tests, which is what makes the refactor safe.

- [ ] **Step 1: Write the failing test**

Add to `tests/db/standings.test.ts`, importing `participation` alongside the existing imports:

```ts
describe("participation (FR-20)", () => {
  // Design 2.4.3. The denominator is the configured roster, the same one every
  // other per-member number uses. Prodeko has 650 members in config.
  test("divides logging members by the full roster", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
    await logDay(sql, 1, "2026-07-28", "medium");
    await logDay(sql, 2, "2026-07-29", "long");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBeCloseTo(2 / 650, 10);
  });

  // Design 2.4.3. FR-8 makes rest an explicit record rather than an absence,
  // and this number measures engagement, not minutes.
  test("counts a rest day as participation", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "rest");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBeCloseTo(1 / 650, 10);
  });

  test("counts a member who logged twice only once", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "short");
    await logDay(sql, 1, "2026-07-29", "long");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBeCloseTo(1 / 650, 10);
  });

  test("excludes a registered member who never logged", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(0);
  });

  test("excludes days outside the range", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-08-05", "long");
    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(0);
  });

  test("returns zero for a guild with nobody registered", async () => {
    expect(await participation(sql, "athene", WEEK_FROM, WEEK_TO)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/db/standings.test.ts`
Expected: FAIL, `participation` is not exported.

- [ ] **Step 3: Extract the tier-minutes CTE**

In `src/db/standings.ts`, add below the `TIER_VALUES` constant:

```ts
/**
 * The config-backed tier lookup, injected into every query that converts tiers
 * into minutes. It is a CTE built from config on each call, never a table: no
 * total and nothing derived from TIER_MINUTES is ever stored (SPEC.md section
 * 4.4), so changing a tier value in config.ts and restarting recomputes all
 * history.
 *
 * One definition rather than four copies. Phase 3's "who has not logged today"
 * would have made it six.
 */
function tierMinutes(sql: Sql) {
  return sql`
    SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
  `;
}
```

Then replace the body of the CTE at all three existing sites. In `standings()`, `neighbours()` and `weeklyTotals()`, change:

```ts
    WITH tier_minutes(tier, minutes) AS (
      SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
    )
```

to:

```ts
    WITH tier_minutes(tier, minutes) AS (${tierMinutes(sql)})
```

In `neighbours()` the CTE is followed by `, totals AS (`, so the replacement there reads `WITH tier_minutes(tier, minutes) AS (${tierMinutes(sql)}), totals AS (`.

- [ ] **Step 4: Run the existing tests to prove the refactor changed nothing**

Run: `bun test tests/db/standings.test.ts tests/db/days.test.ts`
Expected: every previously passing test still passes. The new `participation` tests still fail. If any existing test now fails, the fragment is not composing: stop and fix it before continuing, because these three queries are the whole scoring system.

- [ ] **Step 5: Write `participation()`**

Append to `src/db/standings.ts`:

```ts
/**
 * FR-20. The share of a guild's roster that logged at least once in the range,
 * as a fraction between 0 and 1. The renderer turns it into a percentage.
 *
 * A rest day counts (phase 2 design 4.3): FR-8 makes rest an explicit record rather
 * than an absence, and this number measures engagement rather than minutes.
 * That is why it joins days without joining tier_minutes at all.
 *
 * The denominator is the configured member_count, the same roster every other
 * per-member number in the competition divides by, so the two cannot tell
 * different stories about the same guild.
 *
 * ::numeric before the division and ::float8 after, because Postgres integer
 * division would truncate 2 / 650 to 0.
 */
export async function participation(
  sql: Sql,
  guildSlug: string,
  from: string,
  to: string,
): Promise<number> {
  const [row] = await sql<{ share: number }[]>`
    SELECT (COUNT(DISTINCT d.telegram_id)::numeric / g.member_count)::float8 AS share
    FROM guilds g
    LEFT JOIN users u ON u.guild_slug = g.slug AND NOT u.blocked
    LEFT JOIN days d ON d.telegram_id = u.telegram_id
                    AND d.date BETWEEN ${from}::date AND ${to}::date
    WHERE g.slug = ${guildSlug}
    GROUP BY g.slug, g.member_count
  `;
  // guilds is synced from config on every boot, so a miss means the caller
  // passed a slug that is not in config at all. Surfacing it is better than
  // returning 0, which would render as a plausible but false "0% logged".
  if (!row) throw new Error(`guild "${guildSlug}" not found`);
  return row.share;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, 147 pass / 0 fail.

- [ ] **Step 7: Commit**

```bash
git add src/db/standings.ts tests/db/standings.test.ts
git commit -m "Add participation(), and extract the duplicated tier-minutes CTE"
```

---

### Task 3: `shouldPostMonday`, the scheduling decision

**Files:**
- Create: `src/domain/scheduling.ts`
- Create: `tests/domain/scheduling.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Consumes: `COMPETITION_START` from `src/config.ts`.
- Produces: `MONDAY_POST_HOUR` exported from `src/config.ts`; `shouldPostMonday(input: MondayPostDecision): boolean` where `MondayPostDecision` is `{ weekStart: string; lastPosted: string; localDate: string; localHour: number; postHour?: number; competitionStart?: string }`.

- [ ] **Step 1: Add the configured hour**

In `src/config.ts`, below `WEEKLY_TARGET_MINUTES`:

```ts
/**
 * FR-20. Monday morning, in TIMEZONE. Monday because that is the temporal
 * landmark where student gym attendance measurably rises, which is the whole
 * reason the post exists on that day rather than Sunday night.
 */
export const MONDAY_POST_HOUR = 9;
```

- [ ] **Step 2: Write the failing test**

Create `tests/domain/scheduling.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { shouldPostMonday } from "../../src/domain/scheduling.ts";

// A fixed competition window, passed explicitly so these tests never depend on
// the placeholder dates in config.ts.
const START = "2026-07-27";

function decide(overrides: Partial<Parameters<typeof shouldPostMonday>[0]> = {}) {
  return shouldPostMonday({
    weekStart: "2026-08-03",
    lastPosted: "2026-07-27",
    localDate: "2026-08-03",
    localHour: 9,
    postHour: 9,
    competitionStart: START,
    ...overrides,
  });
}

describe("shouldPostMonday (FR-20)", () => {
  test("posts on Monday once the hour has arrived", () => {
    expect(decide({ localHour: 9 })).toBe(true);
  });

  test("does not post before the hour on Monday", () => {
    expect(decide({ localHour: 8 })).toBe(false);
  });

  test("does not post twice for the same week", () => {
    expect(decide({ lastPosted: "2026-08-03" })).toBe(false);
  });

  // Design 2.4.4. Late beats never: a bot that was down for all of Monday
  // posts when it comes back, rather than skipping the week in silence.
  test("posts on Tuesday when Monday was missed", () => {
    expect(decide({ localDate: "2026-08-04", localHour: 3 })).toBe(true);
  });

  // Design 2.4.5. On the first Monday there is no last week to report, and the
  // generic path would announce a winner at 0.0 minutes per member.
  test("does not post on the competition's first Monday", () => {
    expect(decide({ weekStart: START, lastPosted: "2026-07-20", localDate: START })).toBe(false);
  });

  // Design 2.4.5. The test is on the previous week's END, so a competition
  // that starts mid-week still reports the partial week that happened.
  test("posts on the first Monday when the competition started mid-week", () => {
    expect(
      decide({
        competitionStart: "2026-07-29",
        weekStart: "2026-08-03",
        lastPosted: "2026-07-27",
      }),
    ).toBe(true);
  });

  // Design 2.2.4. Binding sets lastPosted to the current week, so a chat bound
  // on a Thursday is not owed a post for the week it was bound in.
  test("does not post for the week a chat was just bound in", () => {
    expect(decide({ lastPosted: "2026-08-03", localDate: "2026-08-06" })).toBe(false);
  });

  // Europe/Helsinki leaves DST on 2026-10-25, inside the competition. The
  // labels either side of it must still be exactly seven days apart.
  test("is unaffected by the October clock change", () => {
    expect(
      decide({ weekStart: "2026-10-26", lastPosted: "2026-10-19", localDate: "2026-10-26" }),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test tests/domain/scheduling.test.ts`
Expected: FAIL, unable to resolve `../../src/domain/scheduling.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/domain/scheduling.ts`:

```ts
import { COMPETITION_START, MONDAY_POST_HOUR } from "../config.ts";

export interface MondayPostDecision {
  /** Monday of the current week, yyyy-mm-dd, from the SQL calendar. */
  weekStart: string;
  /** chats.last_monday_week: the week whose post has already gone out. */
  lastPosted: string;
  /** Today in TIMEZONE, yyyy-mm-dd, from the SQL calendar. */
  localDate: string;
  /** The hour in TIMEZONE, 0 to 23, from the SQL calendar. */
  localHour: number;
  postHour?: number;
  competitionStart?: string;
}

/**
 * The day before a given yyyy-mm-dd label.
 *
 * Same deliberate exception as previousWeek() in scoring.ts, and safe for the
 * same reason: these are calendar labels rather than instants, parsed and
 * formatted at UTC midnight with no timezone conversion anywhere, so minus one
 * day is exact regardless of what Europe/Helsinki's offset is on either date.
 * The project rule that date buckets come from SQL exists to stop a timezone
 * conversion drifting a boundary across a clock change, and there is no
 * conversion here.
 */
export function dayBefore(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/**
 * FR-20. Whether this chat is owed a Monday post right now.
 *
 * Pure so that the interesting half of the ticker is testable without Telegram
 * and without a clock (phase 2 design 4.6). Every date is a yyyy-mm-dd label in the
 * competition timezone, which compares correctly as a plain string.
 *
 * Three rulings live here:
 *
 * - The condition is "no post for this week and past Monday's hour", NOT
 *   "today is Monday" (phase 2 design 4.4). A bot that was down for all of Monday
 *   posts on Tuesday. Over an eight-week competition, missing a post entirely
 *   is worse than one arriving late, and the alternative fails silently in
 *   exactly the case where something has already gone wrong.
 * - No post when the previous week ENDS before the competition starts
 *   (phase 2 design 4.5). On the first Monday there is no last week, and the generic
 *   path would announce a winner at 0.0 minutes per member as the first thing
 *   every guild sees. Testing the end rather than the start keeps it correct
 *   if COMPETITION_START ever stops being a Monday.
 * - lastPosted is initialised to the binding week, so a chat bound mid-week is
 *   not owed a post for that week (phase 2 design 2.4).
 */
export function shouldPostMonday(input: MondayPostDecision): boolean {
  const postHour = input.postHour ?? MONDAY_POST_HOUR;
  const competitionStart = input.competitionStart ?? COMPETITION_START;

  if (input.lastPosted >= input.weekStart) return false;
  if (dayBefore(input.weekStart) < competitionStart) return false;
  if (input.localDate === input.weekStart && input.localHour < postHour) return false;
  return true;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx tsc --noEmit && bun test tests/domain/scheduling.test.ts`
Expected: exit 0, 8 pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/scheduling.ts tests/domain/scheduling.test.ts src/config.ts
git commit -m "Add shouldPostMonday, the Monday post scheduling decision (FR-20)"
```

---

### Task 4: The two renderers

**Files:**
- Modify: `src/bot/render.ts`
- Modify: `src/strings.ts`
- Test: `tests/bot/render.test.ts`

**Interfaces:**
- Consumes: `GuildStanding` from `src/db/standings.ts`, `StandingsInput` and the private `ordinal()` and `table()` helpers already in `render.ts`.
- Produces: `pinnedStandings(input: StandingsInput & { pinFailed: boolean }): string`; `MondayPostInput` interface and `mondayPost(input: MondayPostInput): string`.

- [ ] **Step 1: Add the copy**

In `src/strings.ts`, below `STANDINGS_FOOTER`:

```ts
/**
 * FR-19. Appended to the pinned message when the bot could not pin it. The
 * message itself keeps working and keeps updating unpinned (phase 2 design 3.2), so
 * this is one line of explanation rather than an error state: the board makes
 * the bot an admin when convenient and the next refresh pins it.
 */
export const PIN_NEEDS_ADMIN =
  "Make me an admin with permission to pin, and I'll pin this to the top.";

/** FR-18. Shown in a group the bot was added to without a guild in the link. */
export const CHOOSE_GUILD_GROUP =
  "Which guild is this chat for? An admin of this chat can pick.";

/** FR-18. Answered to a non-admin who taps the guild picker in a group. */
export const TOAST_ADMINS_ONLY = "Only an admin of this chat can set the guild.";

/** FR-18. Confirms a binding, naming the guild so a wrong one is obvious. */
export function chatBound(guildName: string): string {
  return (
    `This chat is now following <b>${escapeHtml(guildName)}</b>.\n\n` +
    "Standings will appear here and stay updated. An admin can change the guild " +
    "by opening the guild's link again."
  );
}
```

`escapeHtml` is already imported at the top of `strings.ts` if other helpers use it; if not, add `import { escapeHtml } from "./html.ts";`.

- [ ] **Step 2: Write the failing test**

Add to `tests/bot/render.test.ts`, importing `mondayPost` and `pinnedStandings` alongside the existing imports:

```ts
const WEEK: GuildStanding[] = [
  { slug: "inkubio", name: "Inkubio", minutes: 9640, perMember: 24.1 },
  { slug: "prodeko", name: "Prodeko", minutes: 14820, perMember: 22.8 },
];

describe("pinnedStandings (FR-19)", () => {
  test("renders the same tables as /standings", () => {
    const pinned = pinnedStandings({ week: WEEK, season: WEEK, pinFailed: false });
    expect(pinned).toBe(standingsMessage({ week: WEEK, season: WEEK }));
  });

  // Design 2.3.2. The live number is the valuable part and it works unpinned,
  // so a missing right is one extra line, not a failure state.
  test("adds one line when the bot could not pin", () => {
    const pinned = pinnedStandings({ week: WEEK, season: WEEK, pinFailed: true });
    expect(pinned).toStartWith(standingsMessage({ week: WEEK, season: WEEK }));
    expect(pinned).toContain("admin");
  });
});

describe("mondayPost (FR-20)", () => {
  const input = {
    winnerName: "Inkubio",
    winnerPerMember: 24.1,
    guildName: "Prodeko",
    guildRank: 2,
    guildCount: 9,
    guildPerMember: 22.8,
    participation: 0.31,
  };

  test("names last week's winner and the reader's own guild", () => {
    const post = mondayPost(input);
    expect(post).toContain("Inkubio");
    expect(post).toContain("24.1");
    expect(post).toContain("Prodeko");
    expect(post).toContain("2nd");
    expect(post).toContain("22.8");
  });

  // Design 2.4.3. The percentage is about the reader's guild, not the winner's.
  test("states the reader's guild participation as a whole percentage", () => {
    expect(mondayPost(input)).toContain("31%");
  });

  // FR-20's acceptance test: it must state that the new week starts at zero.
  test("says the week resets", () => {
    const post = mondayPost(input);
    expect(post).toContain("zero");
    expect(post).toContain("Nothing carries over");
  });

  // SPEC.md section 11 rates a guild disengaging from a hopeless position as
  // the top risk, and this post is the fresh start that answers it. A guild
  // that is last must still read as having an opening.
  test("reads the same for a guild that finished last", () => {
    const post = mondayPost({ ...input, guildName: "Athene", guildRank: 9, guildPerMember: 4.2 });
    expect(post).toContain("9th");
    expect(post).toContain("Nothing carries over");
  });

  test("renders the winning guild reading its own post", () => {
    const post = mondayPost({ ...input, guildName: "Inkubio", guildRank: 1, guildPerMember: 24.1 });
    expect(post).toContain("1st");
  });

  // First names and guild names reach other users, so interpolation is escaped.
  test("escapes a guild name containing markup", () => {
    const post = mondayPost({ ...input, guildName: "<b>x</b>" });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
```

Add `import type { GuildStanding } from "../../src/db/standings.ts";` if the file does not already have it.

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test tests/bot/render.test.ts`
Expected: FAIL, `pinnedStandings` and `mondayPost` are not exported.

- [ ] **Step 4: Write the implementation**

Append to `src/bot/render.ts`, and add `PIN_NEEDS_ADMIN` to the existing `../strings.ts` import:

```ts
/**
 * FR-19. The pinned message is the same two tables /standings renders, through
 * the same renderer, so the pinned number and the on-demand number can never
 * disagree.
 */
export function pinnedStandings(input: StandingsInput & { pinFailed: boolean }): string {
  const base = standingsMessage(input);
  return input.pinFailed ? `${base}\n\n${PIN_NEEDS_ADMIN}` : base;
}

export interface MondayPostInput {
  winnerName: string;
  winnerPerMember: number;
  guildName: string;
  guildRank: number;
  guildCount: number;
  guildPerMember: number;
  /** A share between 0 and 1, from participation(). Rendered as a percentage. */
  participation: number;
}

/**
 * FR-20. A new message rather than an edit, so it notifies. That contrast with
 * the pinned message in the same chat is deliberate: the pin is ambient and
 * silent, and this is the one interruption per week.
 *
 * Framed as a fresh start rather than a report card. SPEC.md section 11 rates a
 * guild disengaging from a hopeless position as the competition's top risk, so
 * the guilds at the bottom must read an opening here rather than a fourth
 * consecutive notice that they are losing. Nothing in the copy varies on how
 * badly the reader's guild did.
 *
 * The participation figure is about the reader's own guild, not the winner's
 * (phase 2 design 4.3): it is the number the reader can actually change this week.
 *
 * Guild names come from config.ts and are trusted today; escaped defensively,
 * because this message reaches a whole guild chat.
 */
export function mondayPost(input: MondayPostInput): string {
  const percent = Math.round(input.participation * 100);
  return (
    "<b>New week. Everyone back to zero.</b>\n\n" +
    `Last week ${escapeHtml(input.winnerName)} took it, ` +
    `${input.winnerPerMember.toFixed(1)} minutes per member.\n\n` +
    `${escapeHtml(input.guildName)} finished ${ordinal(input.guildRank)} of ${input.guildCount}, ` +
    `${input.guildPerMember.toFixed(1)}, with ${percent}% of the guild logging at least once.\n\n` +
    "Nothing carries over. This week is open."
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, 163 pass / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/bot/render.ts src/strings.ts tests/bot/render.test.ts
git commit -m "Add the pinned standings and Monday post renderers (FR-19, FR-20)"
```

---

### Task 5: Binding a group chat to a guild

**Files:**
- Modify: `src/bot/callbacks.ts`
- Create: `src/bot/group.ts`
- Modify: `src/bot/index.ts`
- Test: `tests/bot/callbacks.test.ts`

**Interfaces:**
- Consumes: `bindChat`, `findChat`, `unbindChat` from Task 1; `chatBound`, `CHOOSE_GUILD_GROUP`, `TOAST_ADMINS_ONLY` from Task 4.
- Produces: `Callback` gains `| { kind: "bind"; slug: string }`; `installGroup(bot: Bot, sql: Sql): void` exported from `src/bot/group.ts`.

`group.ts` itself has no automated tests, consistent with the three existing handler files. Its acceptance is the checklist added in Task 7.

- [ ] **Step 1: Write the failing callback test**

Add to `tests/bot/callbacks.test.ts`:

```ts
describe("bind (FR-18)", () => {
  test("round-trips a guild slug", () => {
    expect(decode(encode({ kind: "bind", slug: "prodeko" }))).toEqual({
      kind: "bind",
      slug: "prodeko",
    });
  });

  test("stays inside Telegram's 64-byte callback_data limit", () => {
    expect(encode({ kind: "bind", slug: "accounting" }).length).toBeLessThanOrEqual(64);
  });

  test("rejects a malformed slug", () => {
    expect(decode("bind:NOT A SLUG")).toBeNull();
    expect(decode("bind:")).toBeNull();
    expect(decode("bind")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/bot/callbacks.test.ts`
Expected: FAIL, `"bind"` is not assignable to the `Callback` union.

- [ ] **Step 3: Extend the codec**

In `src/bot/callbacks.ts`, add to the `Callback` union:

```ts
  | { kind: "bind"; slug: string }
```

Add to `encode`'s switch:

```ts
    case "bind":      return `bind:${callback.slug}`;
```

Add to `decode`'s switch, beside the existing `guild` and `move` cases:

```ts
    case "bind":
      return first && SLUG.test(first) ? { kind: "bind", slug: first } : null;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun test tests/bot/callbacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the group handlers**

Create `src/bot/group.ts`:

```ts
import { InlineKeyboard, type Bot, type Context, type NextFunction } from "grammy";
import type { Sql } from "postgres";
import { GUILDS, guildBySlug } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { bindChat, findChat, unbindChat } from "../db/chats.ts";
import { decode, encode } from "./callbacks.ts";
import { CHOOSE_GUILD_GROUP, TOAST_ADMINS_ONLY, chatBound } from "../strings.ts";

/** FR-18. The same three-per-row shape the private guild picker uses. */
function bindKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  GUILDS.forEach((guild, index) => {
    keyboard.text(guild.name, encode({ kind: "bind", slug: guild.slug }));
    if (index % 3 === 2 && index < GUILDS.length - 1) keyboard.row();
  });
  return keyboard;
}

/**
 * FR-18. Binding decides which guild's numbers a whole chat sees, so it is
 * restricted to chat administrators.
 *
 * The check cannot live on the picker callback alone: `/start@bot <slug>` is an
 * ordinary message, so without this any member of a several-hundred-person
 * chat could re-point the chat at a rival guild by typing one line
 * (phase 2 design 3.1).
 *
 * Adding a bot to a group does not require admin in every group configuration,
 * so a non-admin who opens the link is refused here and the picker is left up
 * for an admin.
 */
async function isChatAdmin(ctx: Context, userId: number): Promise<boolean> {
  const member = await ctx.getChatMember(userId);
  return member.status === "administrator" || member.status === "creator";
}

async function bind(ctx: Context, sql: Sql, chatId: string, slug: string): Promise<void> {
  const guild = guildBySlug(slug);
  if (!guild) return;
  // The binding week starts the Monday ledger at the current week, so a chat
  // bound on a Thursday is not immediately owed a "new week" post
  // (phase 2 design 2.4). Rebinding ignores it, see bindChat.
  const { weekStart } = await calendar(sql);
  await bindChat(sql, chatId, guild.slug, weekStart);
  await ctx.reply(chatBound(guild.name), { parse_mode: "HTML" });
}

export function installGroup(bot: Bot, sql: Sql): void {
  /**
   * FR-18, the primary path. Opening ?startgroup=<slug> makes the client
   * invoke messages.startBot against the group, which reaches the bot as
   * `/start <slug>` here. Privacy mode does not interfere: bots receive
   * messages beginning with a slash regardless.
   *
   * This handler MUST be installed before installRegistration and MUST call
   * next() for private chats. grammY stops the middleware chain at the first
   * command handler that does not call next(), and registration.ts's own
   * /start handler returns early on non-private chats without calling it, so
   * installing this one second would mean it never runs at all.
   */
  bot.command("start", async (ctx, next) => {
    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return await next();
    const from = ctx.from;
    if (!from) return;

    const slug = ctx.match.trim();
    if (!slug || !guildBySlug(slug)) {
      await ctx.reply(CHOOSE_GUILD_GROUP, { reply_markup: bindKeyboard() });
      return;
    }
    if (!(await isChatAdmin(ctx, from.id))) {
      await ctx.reply(TOAST_ADMINS_ONLY);
      return;
    }
    await bind(ctx, sql, String(ctx.chat.id), slug);
  });

  /**
   * FR-18, the fallback path and the unbind path.
   *
   * my_chat_member is in Telegram's default update types, so this needs no
   * allowed_updates change.
   *
   * The picker covers a client that skips the startBot call and the ordinary
   * case of someone adding the bot from the group's own Add Member screen,
   * where there is no deep link at all. It is only offered when the chat has
   * no binding yet, so a bot promoted to admin later does not re-ask.
   */
  bot.on("my_chat_member", async (ctx) => {
    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;
    const chatId = String(ctx.chat.id);
    const status = ctx.myChatMember.new_chat_member.status;

    if (status === "left" || status === "kicked") {
      await unbindChat(sql, chatId);
      return;
    }
    if (status !== "member" && status !== "administrator") return;
    if (await findChat(sql, chatId)) return;

    await ctx.reply(CHOOSE_GUILD_GROUP, { reply_markup: bindKeyboard() });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || callback.kind !== "bind" || !from) return await next();
    if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
      return await next();
    }

    if (!(await isChatAdmin(ctx, from.id))) {
      await ctx.answerCallbackQuery(TOAST_ADMINS_ONLY);
      return;
    }
    await ctx.answerCallbackQuery();
    await bind(ctx, sql, String(ctx.chat.id), callback.slug);
  });
}
```

- [ ] **Step 6: Install the handlers and the group command scope**

In `src/bot/index.ts`, add the import and change `createBot`:

```ts
import { installGroup } from "./group.ts";
```

```ts
  // Group handlers install FIRST. grammY stops the middleware chain at the
  // first command handler that does not call next(), and registration's
  // /start returns early on non-private chats without calling it, so a group
  // /start would never reach group.ts if the order were reversed. group.ts's
  // own /start calls next() for private chats, so registration still sees
  // every private /start exactly as before.
  installGroup(bot, sql);

  // Registration installs the callback_query:data handler that falls through
  // to the others, so its order matters.
  installRegistration(bot, sql);
```

Then replace `installCommands` with:

```ts
/**
 * FR-17. Reporting commands appear only in private chats, standings appear in
 * group chats. The requirement's own acceptance test is that the menu in a
 * guild group offers /standings but not /log.
 */
export async function installCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands(
    [
      { command: "log", description: COMMAND_DESCRIPTIONS.log },
      { command: "me", description: COMMAND_DESCRIPTIONS.me },
      { command: "standings", description: COMMAND_DESCRIPTIONS.standings },
    ],
    { scope: { type: "all_private_chats" } },
  );
  await bot.api.setMyCommands(
    [{ command: "standings", description: COMMAND_DESCRIPTIONS.standings }],
    { scope: { type: "all_group_chats" } },
  );
}
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, 166 pass / 0 fail. No existing test covers `group.ts`; this step is checking that nothing regressed and that the codec change typechecks everywhere.

- [ ] **Step 8: Commit**

```bash
git add src/bot/callbacks.ts src/bot/group.ts src/bot/index.ts tests/bot/callbacks.test.ts
git commit -m "Bind group chats to guilds, and scope commands to groups (FR-18, FR-17)"
```

---

### Task 6: The ticker

**Files:**
- Modify: `src/db/calendar.ts`
- Create: `src/bot/ticker.ts`
- Modify: `src/main.ts`
- Create: `tests/db/calendar.test.ts` (it does not exist yet; `calendar()` is currently only exercised indirectly)

**Interfaces:**
- Consumes: everything from Tasks 1 to 4.
- Produces: `Calendar` gains `hour: number`; `startTicker(bot: Bot, sql: Sql): () => void` returning a stop function.

- [ ] **Step 1: Write the failing calendar test**

The ticker needs the local hour, and the calendar is the only place a date or time bucket may come from. Create `tests/db/calendar.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { calendar } from "../../src/db/calendar.ts";

const sql = await freshDatabase("calendar");
afterAll(async () => { await sql.end(); });

describe("calendar hour (FR-20)", () => {
// The ticker compares this against MONDAY_POST_HOUR, so it must be the hour in
// Europe/Helsinki, not UTC. 2026-08-03T00:30:00Z is 03:30 in Helsinki (UTC+3
// in summer).
test("reports the hour in the competition timezone", async () => {
  const at = await calendar(sql, "2026-08-03T00:30:00Z");
  expect(at.hour).toBe(3);
  expect(at.today).toBe("2026-08-03");
});

// Winter, UTC+2.
test("reports the hour correctly after the clock change", async () => {
  const at = await calendar(sql, "2026-11-03T00:30:00Z");
  expect(at.hour).toBe(2);
});
});
```

The `at` parameter is the existing testing-only pin on `calendar()`: production callers pass nothing and read the live clock.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/db/calendar.test.ts`
Expected: FAIL, `hour` does not exist on `Calendar`.

- [ ] **Step 3: Add the hour to the calendar**

In `src/db/calendar.ts`, add `hour: number;` to the `Calendar` interface with a comment, extend the row type with `hour: number`, add the column to the SELECT, and return it:

```ts
export interface Calendar {
  today: string;
  yesterday: string;
  weekStart: string;
  /** The hour 0 to 23 in TIMEZONE. FR-20's post fires against this, never UTC. */
  hour: number;
}
```

```ts
  const [row] = await sql<
    { today: string; yesterday: string; week_start: string; hour: number }[]
  >`
    WITH local AS (SELECT (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE}) AS ts)
    SELECT (ts)::date::text                              AS today,
           (ts::date - INTERVAL '1 day')::date::text     AS yesterday,
           date_trunc('week', ts)::date::text            AS week_start,
           EXTRACT(HOUR FROM ts)::int                    AS hour
    FROM local
  `;
  if (!row) throw new Error("calendar query returned no row");
  return {
    today: row.today,
    yesterday: row.yesterday,
    weekStart: row.week_start,
    hour: row.hour,
  };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx tsc --noEmit && bun test tests/db/calendar.test.ts`
Expected: exit 0, PASS.

- [ ] **Step 5: Write the ticker**

Create `src/bot/ticker.ts`:

```ts
import { GrammyError, type Bot } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_START } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { listChats, recordMondayPost, recordPin, unbindChat, type Chat } from "../db/chats.ts";
import { participation, standings } from "../db/standings.ts";
import { competitionRanks, isInWindow, previousWeek } from "../domain/scoring.ts";
import { dayBefore, shouldPostMonday } from "../domain/scheduling.ts";
import { mondayPost, pinnedStandings } from "./render.ts";

const TICK_MS = 60_000;
const PIN_REFRESH_MS = 15 * 60_000;

/**
 * Telegram errors that mean the chat is gone for good. The row is deleted so
 * the ticker stops retrying it forever (phase 2 design 6). A supergroup upgrade
 * lands here too: the chat_id changes, the old one stops resolving, and the
 * board re-adds via the link. Not migrated silently, because the new id
 * arrives on a field the bot may never see if it was down at the time.
 */
function isGone(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  const description = error.description.toLowerCase();
  return (
    error.error_code === 403 ||
    description.includes("chat not found") ||
    description.includes("upgraded to a supergroup")
  );
}

/** FR-19. Render, then edit only if the text actually changed. */
async function refreshPin(bot: Bot, sql: Sql, chat: Chat, weekStart: string, today: string) {
  const [week, season] = await Promise.all([
    standings(sql, weekStart, today),
    standings(sql, COMPETITION_START, today),
  ]);
  const text = pinnedStandings({ week, season, pinFailed: chat.pinFailed });

  if (chat.pinnedMessageId === null) {
    const sent = await bot.api.sendMessage(chat.chatId, text, { parse_mode: "HTML" });
    const messageId = String(sent.message_id);
    // FR-19. The pin is the requirement, but the live number is the value, so
    // a refused pin keeps the message and flags itself instead of failing
    // (phase 2 design 3.2).
    const pinFailed = !(await tryPin(bot, chat.chatId, messageId));
    await recordPin(sql, chat.chatId, { messageId, text, pinFailed });
    return;
  }

  // Design 2.2.3. Skipping the unchanged edit removes the API call entirely
  // rather than making it and swallowing Telegram's 400. Overnight, when
  // nobody logs, this means the refresh does nothing at all.
  //
  // The two conditions are separate on purpose. A chat whose text has not
  // changed but whose pin previously failed still has work to do: retry the
  // pin. Editing it with identical text to get there would produce exactly
  // the 400 this check exists to avoid.
  const unchanged = chat.pinnedText === text;
  if (unchanged && !chat.pinFailed) return;

  if (!unchanged) {
    // message_id is an int32 in the Bot API and grammY types it as a number.
    // Unlike chat_id it is small by construction, so the conversion is safe.
    await bot.api.editMessageText(chat.chatId, Number(chat.pinnedMessageId), text, {
      parse_mode: "HTML",
    });
  }

  // Retry the pin on every refresh until it takes, so the board's fix applies
  // without anyone restarting anything.
  const pinFailed = chat.pinFailed
    ? !(await tryPin(bot, chat.chatId, chat.pinnedMessageId))
    : false;
  await recordPin(sql, chat.chatId, { messageId: chat.pinnedMessageId, text, pinFailed });
}

async function tryPin(bot: Bot, chatId: string, messageId: string): Promise<boolean> {
  try {
    // disable_notification: FR-19 requires the pinned standings to generate no
    // notification, and pinning notifies by default.
    await bot.api.pinChatMessage(chatId, Number(messageId), { disable_notification: true });
    return true;
  } catch (error) {
    if (isGone(error)) throw error;
    return false;
  }
}

/** FR-20. A new message, so it notifies. Exactly once per chat per week. */
async function sendMondayPost(bot: Bot, sql: Sql, chat: Chat, weekStart: string) {
  // Last week runs from the previous Monday to the Sunday before this one.
  const lastWeekStart = previousWeek(weekStart);
  const lastWeekEnd = dayBefore(weekStart);
  const [table, share] = await Promise.all([
    standings(sql, lastWeekStart, lastWeekEnd),
    participation(sql, chat.guildSlug, lastWeekStart, lastWeekEnd),
  ]);

  const winner = table[0];
  const index = table.findIndex((row) => row.slug === chat.guildSlug);
  // chats.guild_slug carries a foreign key onto guilds.slug and standings()
  // selects FROM guilds, so a miss means the two have drifted. Surfacing it
  // beats posting a guessed rank to a whole guild chat.
  if (!winner || index === -1) throw new Error(`guild "${chat.guildSlug}" missing from standings`);
  const own = table[index]!;
  const ranks = competitionRanks(table.map((row) => row.perMember));

  await bot.api.sendMessage(
    chat.chatId,
    mondayPost({
      winnerName: winner.name,
      winnerPerMember: winner.perMember,
      guildName: own.name,
      guildRank: ranks[index]!,
      guildCount: table.length,
      guildPerMember: own.perMember,
      participation: share,
    }),
    { parse_mode: "HTML" },
  );
  await recordMondayPost(sql, chat.chatId, weekStart);
}

/**
 * FR-19 and FR-20. One 60-second loop, started in main.ts and stopped on
 * shutdown (phase 2 design 4.1).
 *
 * Rejected: a third container or a host cron entry. NFR-1 and NFR-2 hold the
 * deployment to two containers and one process, and an external scheduler
 * would need its own path to both the Bot API and the database to do work this
 * process is already positioned to do.
 *
 * Rejected: two intervals, one per feature. One loop asking two questions has
 * one lifecycle to stop cleanly and one place the calendar is read.
 *
 * Everything that must survive a restart is on the chats row. The only
 * in-memory state is the last pin refresh, and losing it costs one extra
 * render that the unchanged-text check turns into a no-op.
 */
export function startTicker(bot: Bot, sql: Sql): () => void {
  let lastPinRefresh = 0;

  async function tick(): Promise<void> {
    const { today, weekStart, hour } = await calendar(sql);
    // Design 2.4.7. Inert outside the competition, which leaves the closing
    // numbers pinned as the resting state of a competition that is over.
    if (!isInWindow(today)) return;

    const chats = await listChats(sql);
    const refreshPins = Date.now() - lastPinRefresh >= PIN_REFRESH_MS;
    if (refreshPins) lastPinRefresh = Date.now();

    for (const chat of chats) {
      // One chat's failure must not stop the other eight and must not kill the
      // interval, so every chat is isolated.
      try {
        if (refreshPins) await refreshPin(bot, sql, chat, weekStart, today);
        if (
          shouldPostMonday({
            weekStart,
            lastPosted: chat.lastMondayWeek,
            localDate: today,
            localHour: hour,
          })
        ) {
          await sendMondayPost(bot, sql, chat, weekStart);
        }
      } catch (error) {
        if (isGone(error)) {
          console.warn(`chat ${chat.chatId} is gone, unbinding`);
          await unbindChat(sql, chat.chatId);
          continue;
        }
        console.error(`tick failed for chat ${chat.chatId}`, error);
      }
    }
  }

  const timer = setInterval(() => {
    void tick().catch((error) => console.error("tick failed", error));
  }, TICK_MS);

  return () => clearInterval(timer);
}
```

`dayBefore` is imported from `src/domain/scheduling.ts` rather than redefined here. Task 3 exports it for exactly this reason: last week's Sunday and the first-week guard are the same calendar-label step, and two copies would be two places to get the clock change wrong.

- [ ] **Step 6: Wire it into startup and shutdown**

In `src/main.ts`:

```ts
import { startTicker } from "./bot/ticker.ts";
```

```ts
const bot = createBot(sql, token);
await installCommands(bot);

// FR-19 and FR-20. Stopped before the bot, so a shutdown cannot leave a tick
// half-way through an API call the polling loop is no longer serving.
const stopTicker = startTicker(bot, sql);

process.once("SIGINT", () => { stopTicker(); void bot.stop(); });
process.once("SIGTERM", () => { stopTicker(); void bot.stop(); });
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, 168 pass / 0 fail.

- [ ] **Step 8: Verify the container still builds**

Run: `docker compose build`
Expected: `Image sports-competition-bot Built`. The ticker adds no dependency, so a failure here means an import path is wrong.

- [ ] **Step 9: Commit**

```bash
git add src/db/calendar.ts src/bot/ticker.ts src/main.ts tests/db/calendar.test.ts
git commit -m "Add the ticker: pinned standings and the Monday post (FR-19, FR-20)"
```

---

### Task 7: The Phase 2 smoke checklist and documentation

**Files:**
- Modify: `docs/SMOKE.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

`group.ts` and the ticker's API calls are the only untested code in this phase, by design. This checklist is their entire acceptance basis, exactly as `docs/SMOKE.md` is for the three Phase 1 handler files.

- [ ] **Step 1: Add the Phase 2 section to `docs/SMOKE.md`**

Insert before the existing `## Survival` section:

```markdown
## The group chat (Phase 2)

- [ ] Open `t.me/<bot>?startgroup=prodeko` as an admin of a test group and pick
      the group. The bot joins and says the chat is now following Prodeko,
      naming the guild (FR-18)
- [ ] Add the bot to a second test group from the group's own Add Member
      screen, with no deep link. It offers the nine-guild picker instead
      (FR-18)
- [ ] Tap a guild in that picker as a **non-admin**. It must refuse and change
      nothing. Then tap as an admin and confirm it binds. This protects every
      number the chat will ever show, so it is worth the second account
- [ ] Send `/start@<bot> inkubio` in an already-bound group as a non-admin.
      It must refuse. As an admin it must rebind, and the pinned message must
      show Inkubio's line on the next refresh
- [ ] The command menu in the group offers `/standings` but not `/log` (FR-17)
- [ ] Within 15 minutes a standings message appears and is pinned. Confirm
      pinning it produced **no notification** for other members (FR-19)
- [ ] Log something from a phone, wait for the next refresh, and confirm the
      pinned message's number changes **without** the chat showing as unread
      or producing a notification. This is FR-19's actual acceptance test
- [ ] Remove the bot's pin permission, add it to a third group, and confirm the
      standings message still appears and still updates, with one extra line
      asking to be made an admin. Then promote the bot and confirm the next
      refresh pins it and the line disappears
- [ ] Remove the bot from a group. Confirm it stops posting there, and that the
      other groups are unaffected
- [ ] `docker compose restart bot`, then confirm the pinned message still
      updates in place rather than a second message appearing (NFR-5)

### The Monday post

The Monday post cannot be observed without waiting for a Monday. To test it
now, bind a chat and move its ledger back one week by hand:

```sql
UPDATE chats SET last_monday_week = last_monday_week - INTERVAL '7 days';
```

- [ ] Within a minute the bot posts a new message (not an edit) that notifies,
      names last week's winning guild with its minutes per member, gives this
      chat's own guild its placement and participation percentage, and says
      the week starts at zero (FR-20)
- [ ] Run the same `UPDATE` again and confirm exactly one further post appears,
      not two. Then restart the bot mid-week and confirm no post appears at
      all, which is the exactly-once ledger doing its job
- [ ] Confirm no Monday post fires for a chat bound this week, and none fires
      for the competition's first week
```

- [ ] **Step 2: Update `CLAUDE.md`**

Change the "Phase 1 only is built" paragraph to say Phase 1 and Phase 2 are built and Phases 3 to 4 are not. Add to the architecture diagram's file list: `src/bot/group.ts` (FR-18), `src/bot/ticker.ts` (FR-19, FR-20), `src/db/chats.ts`, `src/domain/scheduling.ts`. Add to the invariants list:

```markdown
- **`installGroup` must be installed before `installRegistration`.** grammY stops the middleware
  chain at the first command handler that does not call `next()`, and registration's `/start`
  returns early on non-private chats without calling it. Reversing the order silently disables
  every group `/start`.
- **Binding a chat requires chat admin on both paths.** `/start@bot <slug>` is an ordinary message,
  so the check cannot live only on the picker callback.
- **The pinned message is edited, never resent,** and the edit is skipped when the rendered text is
  unchanged. Resending would notify a whole guild every 15 minutes, which is the opposite of FR-19.
```

Add to the test-count line that the suite is now 168 tests, and add `tests/domain/scheduling.test.ts` and `tests/db/chats.test.ts` to any list of test files.

- [ ] **Step 3: Update `README.md`**

Change the status line from Phase 1 to "Phases 1 and 2 built; Phase 3 (reminders) and Phase 4 (tags, nightly backup) are not". Add one paragraph under deployment explaining that a guild board adds the bot with `https://t.me/<bot>?startgroup=<slug>` and that the bot needs admin with pin rights to pin the standings, but works unpinned without them.

- [ ] **Step 4: Verify the whole suite and the checklist's own claims**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, 168 pass / 0 fail.

Then re-read the new checklist against the code and confirm every step maps to a real path: the picker fallback exists, the admin refusal exists on both paths, `disable_notification` is set on the pin, and the `UPDATE chats` statement matches the real column name.

- [ ] **Step 5: Commit**

```bash
git add docs/SMOKE.md CLAUDE.md README.md
git commit -m "Add the Phase 2 smoke checklist and update the docs"
```

---

## After the plan

Phase 2's own "done when" is SPEC.md §10's: **the bot is in a test group, the pinned message updates without notifying, and a Monday post fires on schedule.** That is the checklist in Task 7 and it needs a real token and a real group. Nothing in this plan claims Phase 2 works until it has been run.

The Phase 1 smoke run is still outstanding and is still the gate on real use of either phase (phase 2 design 1.1). Both checklists can be run in the same session against the same bot.

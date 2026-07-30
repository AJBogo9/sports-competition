# Telegram Bot Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SPEC.md §10 Phase 1 of the guild activity competition bot: registration by deep link, one-tap daily check-in, `/me`, `/standings`, and a two-container deployment that runs on a home server.

**Architecture:** One Bun process using grammY long polling, plus PostgreSQL. Dependencies point one way (`config` to `domain` to `db` to `bot`), so scoring logic is tested without Telegram. No total is ever stored: `days.tier` is the only ground truth and every minute figure is derived at read time. No session middleware, so every callback button carries its own meaning and a restart loses nothing.

**Tech Stack:** Bun, TypeScript, grammY, postgres.js, PostgreSQL 17, Docker Compose.

**Source documents:** [SPEC.md](../../../SPEC.md) is the requirements. [docs/superpowers/specs/2026-07-30-telegram-bot-phase-1-design.md](../specs/2026-07-30-telegram-bot-phase-1-design.md) is the approved design and the authority on anything SPEC.md leaves open. `prototype/bot-flows.html` is the message copy.

## Global Constraints

Every task's requirements implicitly include this section.

- **No stored totals.** `days.tier` is the only ground truth. Minutes are derived at read time from `TIER_MINUTES` in config. No column, cache, or snapshot table ever holds a sum. (SPEC.md §4.4)
- **No code path may write activity data without a real user action, in any build.** No debug endpoint, no seed command, no simulation route. (NFR-4, and SPEC.md §2 defect 3)
- **Long polling only.** No webhook, no HTTPS endpoint, no inbound port. (NFR-1)
- **All state lives in PostgreSQL.** No session middleware, no in-memory maps, no globals holding user state. (NFR-5)
- **All user-facing text is English**, written inline in `src/strings.ts`. No i18n framework, no per-user language field, no translation table. (FR-27)
- **No global individual leaderboard.** No command or message may return a list of top individuals overall. Neighbours within a guild are permitted. (FR-15)
- **Configuration lives only in `src/config.ts`.** Guild names, member counts, competition dates, tier values, and the weekly target appear nowhere else. Changing a tier value and restarting must recompute all history. (FR-25)
- **Every date bucket is `Europe/Helsinki`,** computed in SQL, never with JavaScript date arithmetic. (design 4.1 and 4.2)
- **Every `BIGINT` and `DATE` is selected as `::text`.** Verified: postgres.js returns `BIGINT` as a JS string and `DATE` as a `Date` object at UTC midnight. Selecting them raw silently corrupts Telegram IDs and shifts dates.
- **Every per-member division casts to `::numeric` first.** Verified: `100 / 650` in Postgres is `0`, because both operands are integers. The query printed in SPEC.md §6 has this bug.
- **No em dashes or en dashes** in any file, including message copy. Use commas, colons, or parentheses.
- **Size ceiling.** If the total passes 2,000 effective lines, something from SPEC.md §8 has crept back in. (NFR-6)

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `package.json`, `tsconfig.json`, `.env.example` | Project skeleton | 1 |
| `src/config.ts` | Guilds, window, tiers, target, timezone. The only place these exist | 1 |
| `src/domain/scoring.ts` | Pure: tier minutes, progress bar, window membership, streak reduction | 1 |
| `docker-compose.yml` | `db` and `db-test` services | 2 |
| `src/db/client.ts` | Connection and startup retry | 2 |
| `src/db/migrate.ts`, `src/db/migrations/001_initial.sql` | Numbered migration runner and schema | 2 |
| `tests/helpers/db.ts` | Per-file isolated test schema | 2 |
| `src/db/calendar.ts` | Today, yesterday, week start, all from Postgres | 3 |
| `src/db/users.ts` | Guild sync, find, create, move, reminder hour | 3 |
| `src/db/days.ts` | Log, undo, day tier, week minutes | 4 |
| `src/db/standings.ts` | Guild standings, neighbours, weekly totals | 5 |
| `src/strings.ts` | All user-facing English | 6 |
| `src/bot/callbacks.ts` | Callback data encode and decode | 6 |
| `src/bot/render.ts` | Pure message formatting | 6 |
| `src/bot/index.ts`, `src/main.ts` | Bot construction, scopes, router, entrypoint | 7 |
| `src/bot/registration.ts` | FR-1 to FR-4 | 7 |
| `src/bot/checkin.ts` | FR-5 to FR-10 | 8 |
| `src/bot/reports.ts` | FR-14 and FR-16 handlers | 9 |
| `Dockerfile`, `.dockerignore`, `scripts/dump.sh`, `scripts/restore.sh`, `docs/SMOKE.md` | Deployment and manual verification | 10 |

**Branch:** `phase-1-bot` already exists and is checked out. Do not create another.

---

### Task 1: Project skeleton, configuration, and pure scoring

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `src/config.ts`, `src/domain/scoring.ts`
- Test: `tests/domain/scoring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Tier = "short" | "medium" | "long" | "rest"`
  - `interface Guild { slug: string; name: string; memberCount: number }`
  - `GUILDS: readonly Guild[]`, `TIER_MINUTES: Record<Tier, number>`, `TIER_ORDER: readonly Tier[]`
  - `WEEKLY_TARGET_MINUTES: number`, `TIMEZONE: string`, `COMPETITION_START: string`, `COMPETITION_END: string`
  - `guildBySlug(slug: string): Guild | undefined`
  - `tierMinutes(tier: Tier): number`, `isTier(value: string): value is Tier`
  - `progressBar(done: number, total: number): string`
  - `isInWindow(date: string, start?: string, end?: string): boolean`
  - `interface WeekTotal { weekStart: string; minutes: number }`
  - `weeklyStreak(weeks: readonly WeekTotal[], currentWeekStart: string, target?: number): number`
  - `previousWeek(weekStart: string): string`

- [ ] **Step 1: Initialise the project and install dependencies**

Run from the repository root:

```bash
bun init -y
bun add grammy postgres
```

Then replace the generated `package.json` with this (`bun init` produces a slightly different shape, and the scripts matter):

```json
{
  "name": "sports-competition",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/main.ts",
    "test": "bun test",
    "test:db": "docker compose --profile test up -d db-test && bun test"
  },
  "dependencies": {
    "grammy": "^1.0.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Leave the exact versions that `bun add` resolved in the dependencies block rather than the floors shown above. Delete any `index.ts` that `bun init` created at the root.

- [ ] **Step 2: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Add `.env.example`**

`.env` is already covered by `.gitignore`. This file is the committed template.

```bash
# Token from @BotFather. Never commit the real one.
BOT_TOKEN=123456:replace-me

# Used by the bot container. The host and database name match docker-compose.yml.
DATABASE_URL=postgres://bot:replace-me@db:5432/bot
POSTGRES_PASSWORD=replace-me

# Used only by the test suite, against the disposable db-test service.
TEST_DATABASE_URL=postgres://bot:test@localhost:5433/bot_test
```

- [ ] **Step 4: Write the failing test for configuration and scoring**

Create `tests/domain/scoring.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  COMPETITION_END,
  COMPETITION_START,
  GUILDS,
  TIER_MINUTES,
  WEEKLY_TARGET_MINUTES,
  guildBySlug,
} from "../../src/config.ts";
import {
  isInWindow,
  isTier,
  previousWeek,
  progressBar,
  tierMinutes,
  weeklyStreak,
} from "../../src/domain/scoring.ts";

describe("config", () => {
  test("carries all nine guilds from SPEC.md section 1", () => {
    expect(GUILDS).toHaveLength(9);
    expect(GUILDS.map((g) => g.slug)).toEqual([
      "tik", "prodeko", "as", "fk", "sik", "accounting", "mk", "inkubio", "athene",
    ]);
  });

  test("every guild has a positive member count, since it is the denominator", () => {
    for (const guild of GUILDS) expect(guild.memberCount).toBeGreaterThan(0);
  });

  test("slugs are unique, because a deep link resolves through them", () => {
    expect(new Set(GUILDS.map((g) => g.slug)).size).toBe(GUILDS.length);
  });

  test("guildBySlug resolves a known slug and rejects an unknown one", () => {
    expect(guildBySlug("prodeko")?.name).toBe("Prodeko");
    expect(guildBySlug("not-a-guild")).toBeUndefined();
  });

  // Design 4.6: a window not containing the present silently voids every log
  // via FR-26, which is the single most confusing way this can fail.
  test("the competition window contains today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(COMPETITION_START <= today).toBe(true);
    expect(today <= COMPETITION_END).toBe(true);
  });

  test("tier values match SPEC.md section 4.1", () => {
    expect(TIER_MINUTES).toEqual({ short: 22, medium: 45, long: 75, rest: 0 });
    expect(WEEKLY_TARGET_MINUTES).toBe(150);
  });
});

describe("tierMinutes", () => {
  test("derives minutes from the tier the user tapped", () => {
    expect(tierMinutes("short")).toBe(22);
    expect(tierMinutes("medium")).toBe(45);
    expect(tierMinutes("long")).toBe(75);
  });

  test("a rest day is zero minutes, not an absent day (FR-8)", () => {
    expect(tierMinutes("rest")).toBe(0);
  });
});

describe("isTier", () => {
  test("accepts the four real tiers", () => {
    for (const tier of ["short", "medium", "long", "rest"]) {
      expect(isTier(tier)).toBe(true);
    }
  });

  test("rejects anything else, including a forged callback payload", () => {
    expect(isTier("enormous")).toBe(false);
    expect(isTier("")).toBe(false);
    expect(isTier("constructor")).toBe(false);
  });
});

describe("progressBar", () => {
  // 10 slots, matching prototype/bot-flows.html exactly.
  test("renders the prototype's example: 112 of 150", () => {
    expect(progressBar(112, 150)).toBe("███████░░░");
  });

  test("empty at zero", () => {
    expect(progressBar(0, 150)).toBe("░░░░░░░░░░");
  });

  test("full at the target", () => {
    expect(progressBar(150, 150)).toBe("██████████");
  });

  test("never overflows past the target", () => {
    expect(progressBar(600, 150)).toBe("██████████");
  });

  test("is always ten characters wide", () => {
    for (const minutes of [0, 7, 22, 45, 75, 149, 150, 151, 900]) {
      expect([...progressBar(minutes, 150)]).toHaveLength(10);
    }
  });
});

describe("isInWindow (FR-26)", () => {
  test("includes both endpoints", () => {
    expect(isInWindow("2026-07-27", "2026-07-27", "2026-09-20")).toBe(true);
    expect(isInWindow("2026-09-20", "2026-07-27", "2026-09-20")).toBe(true);
  });

  test("excludes a backdated entry before the start", () => {
    expect(isInWindow("2026-07-26", "2026-07-27", "2026-09-20")).toBe(false);
  });

  test("excludes anything after the end", () => {
    expect(isInWindow("2026-09-21", "2026-07-27", "2026-09-20")).toBe(false);
  });
});

describe("previousWeek", () => {
  test("steps back exactly seven days", () => {
    expect(previousWeek("2026-07-27")).toBe("2026-07-20");
  });

  test("crosses a month boundary", () => {
    expect(previousWeek("2026-08-03")).toBe("2026-07-27");
  });

  // These are calendar labels, not instants, so the October clock change
  // must not shift them. See design 4.2.
  test("is unaffected by the 25 October 2026 clock change", () => {
    expect(previousWeek("2026-10-26")).toBe("2026-10-19");
  });
});

describe("weeklyStreak (FR-13)", () => {
  const weeks = [
    { weekStart: "2026-07-06", minutes: 160 },
    { weekStart: "2026-07-13", minutes: 200 },
    { weekStart: "2026-07-20", minutes: 150 },
    { weekStart: "2026-07-27", minutes: 112 },
  ];

  // The prototype shows "Streak 3 weeks at target" while the current week
  // sits at 112 of 150. An in-progress week must not break the streak.
  test("an unfinished current week does not break the streak", () => {
    expect(weeklyStreak(weeks, "2026-07-27", 150)).toBe(3);
  });

  test("the current week counts once the target is met", () => {
    const hit = [...weeks.slice(0, 3), { weekStart: "2026-07-27", minutes: 150 }];
    expect(weeklyStreak(hit, "2026-07-27", 150)).toBe(4);
  });

  test("a missed past week ends the streak there", () => {
    const missed = [
      { weekStart: "2026-07-06", minutes: 160 },
      { weekStart: "2026-07-13", minutes: 40 },
      { weekStart: "2026-07-20", minutes: 150 },
      { weekStart: "2026-07-27", minutes: 151 },
    ];
    expect(weeklyStreak(missed, "2026-07-27", 150)).toBe(2);
  });

  test("a week with no rows at all ends the streak", () => {
    const gap = [
      { weekStart: "2026-07-06", minutes: 160 },
      { weekStart: "2026-07-20", minutes: 150 },
      { weekStart: "2026-07-27", minutes: 151 },
    ];
    expect(weeklyStreak(gap, "2026-07-27", 150)).toBe(2);
  });

  test("a brand new user has no streak", () => {
    expect(weeklyStreak([], "2026-07-27", 150)).toBe(0);
  });

  // FR-8: rest days must not break anything. A rest day contributes a row
  // worth zero minutes, so a week holding rest days that still reaches the
  // target counts exactly like any other.
  test("rest days inside a week that still hits the target do not break it", () => {
    const withRest = [
      { weekStart: "2026-07-20", minutes: 150 },
      { weekStart: "2026-07-27", minutes: 150 },
    ];
    expect(weeklyStreak(withRest, "2026-07-27", 150)).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `bun test tests/domain/scoring.test.ts`
Expected: FAIL, with module resolution errors for `../../src/config.ts` and `../../src/domain/scoring.ts`.

- [ ] **Step 6: Write `src/config.ts`**

```typescript
/**
 * The only place guild names, member counts, competition dates, tier values
 * and the weekly target exist (FR-25). Changing a value here and restarting
 * recomputes all history, because nothing derived from these is ever stored.
 */

export type Tier = "short" | "medium" | "long" | "rest";

export interface Guild {
  slug: string;
  name: string;
  memberCount: number;
}

/**
 * Carried over from SPEC.md section 1.
 *
 * These counts are the per-capita denominator, so a stale count silently
 * distorts every comparison in the competition. SPEC.md requires them to be
 * re-verified with each guild before launch. That is a launch task, not a
 * code task, and it has not been done yet.
 */
export const GUILDS: readonly Guild[] = [
  { slug: "tik", name: "TiK", memberCount: 700 },
  { slug: "prodeko", name: "Prodeko", memberCount: 650 },
  { slug: "as", name: "AS", memberCount: 650 },
  { slug: "fk", name: "FK", memberCount: 600 },
  { slug: "sik", name: "SIK", memberCount: 450 },
  { slug: "accounting", name: "Aalto Accounting", memberCount: 450 },
  { slug: "mk", name: "MK", memberCount: 400 },
  { slug: "inkubio", name: "Inkubio", memberCount: 400 },
  { slug: "athene", name: "Athene", memberCount: 350 },
];

export function guildBySlug(slug: string): Guild | undefined {
  return GUILDS.find((guild) => guild.slug === slug);
}

/**
 * SPEC.md section 4.1. The top tier is capped at 75 minutes deliberately:
 * health benefit plateaus past about 300 minutes per week, and the cap bounds
 * dishonesty to roughly 3x an honest report.
 */
export const TIER_MINUTES: Record<Tier, number> = {
  short: 22,
  medium: 45,
  long: 75,
  rest: 0,
};

/** Keyboard order. Rest is last, as in prototype/bot-flows.html. */
export const TIER_ORDER: readonly Tier[] = ["short", "medium", "long", "rest"];

/** SPEC.md section 4.2. The WHO guideline for adults 18 to 64. */
export const WEEKLY_TARGET_MINUTES = 150;

/** Design 4.1. One timezone for the whole competition, not one per user. */
export const TIMEZONE = "Europe/Helsinki";

/**
 * PLACEHOLDER. SPEC.md section 9 Q1 is unresolved: the real competition dates
 * are still under discussion.
 *
 * Design 4.6 requires this window to contain the present. FR-26 excludes
 * anything outside it, so a window in the past or future silently makes every
 * log count for nothing, with no error anywhere. A test asserts that today
 * falls inside it.
 *
 * 2026-07-27 is a Monday. 2026-09-20 is the Sunday eight weeks later,
 * inclusive. Replace both when Q1 resolves.
 */
export const COMPETITION_START = "2026-07-27";
export const COMPETITION_END = "2026-09-20";
```

- [ ] **Step 7: Write `src/domain/scoring.ts`**

```typescript
import { TIER_MINUTES, WEEKLY_TARGET_MINUTES, COMPETITION_END, COMPETITION_START, type Tier } from "../config.ts";

/** Minutes are always derived, never stored. See SPEC.md section 4.4. */
export function tierMinutes(tier: Tier): number {
  return TIER_MINUTES[tier];
}

/** Guards callback payloads, which arrive as untrusted strings. */
export function isTier(value: string): value is Tier {
  return Object.hasOwn(TIER_MINUTES, value);
}

/** Ten slots, matching prototype/bot-flows.html exactly. */
export function progressBar(done: number, total: number): string {
  const slots = 10;
  const ratio = total > 0 ? done / total : 0;
  const filled = Math.min(slots, Math.max(0, Math.round(ratio * slots)));
  return "█".repeat(filled) + "░".repeat(slots - filled);
}

/**
 * FR-26. All three arguments are yyyy-mm-dd strings in the competition
 * timezone, which compare correctly as plain strings.
 */
export function isInWindow(
  date: string,
  start: string = COMPETITION_START,
  end: string = COMPETITION_END,
): boolean {
  return date >= start && date <= end;
}

export interface WeekTotal {
  weekStart: string;
  minutes: number;
}

/**
 * Steps one week back. These are calendar labels rather than instants, so the
 * arithmetic is anchored at UTC midnight and a daylight saving change cannot
 * shift the result. See design 4.2.
 */
export function previousWeek(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

/**
 * FR-13. Counted in weeks, never days, because the WHO guideline is weekly and
 * a daily streak would teach that a rest day is a failure.
 *
 * The current week counts only once its target is already met, so a week still
 * in progress never breaks a streak the user has not yet had time to extend.
 */
export function weeklyStreak(
  weeks: readonly WeekTotal[],
  currentWeekStart: string,
  target: number = WEEKLY_TARGET_MINUTES,
): number {
  const byWeek = new Map(weeks.map((week) => [week.weekStart, week.minutes]));
  let cursor = currentWeekStart;
  if ((byWeek.get(cursor) ?? 0) < target) cursor = previousWeek(cursor);

  let streak = 0;
  while ((byWeek.get(cursor) ?? 0) >= target) {
    streak += 1;
    cursor = previousWeek(cursor);
  }
  return streak;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `bun test tests/domain/scoring.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock tsconfig.json .env.example src/config.ts src/domain/scoring.ts tests/domain/scoring.test.ts
git commit -m "Add project skeleton, configuration and pure scoring

Tier values, guild roster, window and target live only in config, so
changing one and restarting recomputes history (FR-25). The streak
counts weeks rather than days (FR-13) and an in-progress week cannot
break it. The competition window is a placeholder pending SPEC.md Q1,
constrained by a test to contain the present, because FR-26 would
otherwise void every log silently."
```

---

### Task 2: Database client, schema, and the test harness

**Files:**
- Create: `docker-compose.yml`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/migrations/001_initial.sql`, `tests/helpers/db.ts`
- Test: `tests/db/migrate.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `connect(url?: string): Sql` from `src/db/client.ts`
  - `waitForDatabase(sql: Sql, attempts?: number, delayMs?: number): Promise<void>`
  - `migrate(sql: Sql): Promise<string[]>` returning the filenames applied this run
  - `freshDatabase(name: string): Promise<Sql>` from `tests/helpers/db.ts`, giving each test file its own isolated schema

- [ ] **Step 1: Write `docker-compose.yml`**

The `bot` service is added in Task 10. Neither database publishes a port to the network, per NFR-1. `db-test` is behind a profile so `docker compose up` never starts it, and uses `tmpfs` so it is fast and disposable.

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: bot
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: bot
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bot -d bot"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    # Uncomment to inspect the database from the host. Bound to loopback only.
    # ports:
    #   - "127.0.0.1:5432:5432"

  db-test:
    image: postgres:17-alpine
    profiles: ["test"]
    environment:
      POSTGRES_USER: bot
      POSTGRES_PASSWORD: test
      POSTGRES_DB: bot_test
    ports:
      - "127.0.0.1:5433:5432"
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bot -d bot_test"]
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  pgdata:
```

- [ ] **Step 2: Start the test database**

```bash
docker compose --profile test up -d db-test
docker compose ps
```

Expected: `db-test` listed as running and healthy within a few seconds.

- [ ] **Step 3: Write the failing test**

Create `tests/db/migrate.test.ts`:

```typescript
import { afterAll, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { migrate } from "../../src/db/migrate.ts";

const sql = await freshDatabase("migrate");
afterAll(async () => { await sql.end(); });

describe("migrate", () => {
  test("creates the three tables from SPEC.md section 6", async () => {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()
      ORDER BY table_name
    `;
    expect(tables.map((t) => t.table_name)).toEqual(["days", "guilds", "migrations", "users"]);
  });

  test("is idempotent, so a restart applies nothing (NFR-5)", async () => {
    const applied = await migrate(sql);
    expect(applied).toEqual([]);
  });

  test("records what it applied", async () => {
    const rows = await sql<{ name: string }[]>`SELECT name FROM migrations ORDER BY name`;
    expect(rows.map((r) => r.name)).toContain("001_initial.sql");
  });

  // SPEC.md section 6: the composite primary key makes double-logging
  // structurally impossible, which is what avoids defect 5 in section 2.
  // No duplicate-detection logic exists anywhere, so this must hold.
  test("the days primary key is (telegram_id, date)", async () => {
    await sql`INSERT INTO guilds (slug, name, member_count) VALUES ('t', 'T', 100)`;
    await sql`INSERT INTO users (telegram_id, guild_slug, first_name) VALUES (1, 't', 'A')`;
    await sql`INSERT INTO days (telegram_id, date, tier) VALUES (1, '2026-07-30', 'short')`;

    await expect(
      sql`INSERT INTO days (telegram_id, date, tier) VALUES (1, '2026-07-30', 'long')`,
    ).rejects.toThrow(/duplicate key/);
  });

  test("rejects a tier that is not one of the four", async () => {
    await expect(
      sql`INSERT INTO days (telegram_id, date, tier) VALUES (1, '2026-07-31', 'enormous')`,
    ).rejects.toThrow(/violates check constraint/);
  });

  test("rejects a guild with a non-positive member count, since it is a divisor", async () => {
    await expect(
      sql`INSERT INTO guilds (slug, name, member_count) VALUES ('z', 'Z', 0)`,
    ).rejects.toThrow(/violates check constraint/);
  });

  test("deleting a user removes their days, leaving no orphans", async () => {
    await sql`DELETE FROM users WHERE telegram_id = 1`;
    const rows = await sql`SELECT 1 FROM days WHERE telegram_id = 1`;
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun test tests/db/migrate.test.ts`
Expected: FAIL, with module resolution errors for `../helpers/db.ts` and `../../src/db/migrate.ts`.

- [ ] **Step 5: Write `src/db/client.ts`**

```typescript
import postgres, { type Sql } from "postgres";

/**
 * postgres.js returns BIGINT as a JS string and DATE as a Date object at UTC
 * midnight. Both are hazards here: a Telegram ID is a BIGINT and every day
 * bucket is a DATE. Rather than install global type parsers, every query in
 * src/db selects those columns as ::text. See the global constraints.
 */
export function connect(url: string | undefined = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("DATABASE_URL is unset");
  return postgres(url, { max: 5, onnotice: () => {} });
}

/**
 * Compose starts the bot and Postgres together, and Postgres is sometimes
 * slower to accept connections than the bot is to ask. Retrying beats a
 * crash-loop, which would look identical to a real configuration error.
 */
export async function waitForDatabase(
  sql: Sql,
  attempts = 30,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await sql`SELECT 1`;
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
```

- [ ] **Step 6: Write `src/db/migrations/001_initial.sql`**

The three tables are copied from SPEC.md section 6. The `CHECK` constraints on `tier` and `reminder_hour` are additions: they cost nothing and make an impossible value impossible rather than merely unexpected.

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
  reminder_hour   SMALLINT CHECK (reminder_hour BETWEEN 0 AND 23),
  ignored_streak  SMALLINT NOT NULL DEFAULT 0,
  blocked         BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE days (
  telegram_id   BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('short', 'medium', 'long', 'rest')),
  tag           TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_id, date)
);

CREATE INDEX days_date_idx ON days (date);
```

- [ ] **Step 7: Write `src/db/migrate.ts`**

```typescript
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "postgres";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url).pathname;

/**
 * Applies every numbered migration not yet recorded, each inside its own
 * transaction. Re-running is a no-op, so a restart is free (NFR-5).
 *
 * Returns the filenames applied on this run, which is empty on a warm start.
 */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const recorded = await sql<{ name: string }[]>`SELECT name FROM migrations`;
  const applied = new Set(recorded.map((row) => row.name));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO migrations (name) VALUES (${file})`;
    });
    ran.push(file);
  }
  return ran;
}
```

- [ ] **Step 8: Write `tests/helpers/db.ts`**

Each test file gets its own Postgres schema, so files never collide over shared tables regardless of how Bun orders them.

```typescript
import postgres, { type Sql } from "postgres";
import { migrate } from "../../src/db/migrate.ts";

const TEST_URL = process.env.TEST_DATABASE_URL
  ?? "postgres://bot:test@localhost:5433/bot_test";

/**
 * Returns a connection scoped to a freshly migrated schema of its own.
 * Call once per test file with a unique name, and end it in afterAll.
 */
export async function freshDatabase(name: string): Promise<Sql> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`test schema name must be a bare identifier, got ${name}`);
  }
  const schema = `test_${name}`;

  const admin = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
  await admin.end();

  const sql = postgres(TEST_URL, {
    max: 2,
    onnotice: () => {},
    connection: { search_path: schema },
  });
  await migrate(sql);
  return sql;
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `bun test tests/db/migrate.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 10: Verify migrations apply to a genuinely empty database**

```bash
docker compose --profile test down -v
docker compose --profile test up -d db-test
bun test tests/db/migrate.test.ts
```

Expected: PASS from a cold database, proving the migration runner does not depend on prior state.

- [ ] **Step 11: Commit**

```bash
git add docker-compose.yml src/db/client.ts src/db/migrate.ts src/db/migrations/001_initial.sql tests/helpers/db.ts tests/db/migrate.test.ts
git commit -m "Add database client, schema and test harness

Three tables from SPEC.md section 6. The composite primary key on days
makes double-logging structurally impossible, so no duplicate-detection
logic exists anywhere to drift out of step with its comment, which is
defect 5 in section 2.

Migrations are numbered files applied in their own transactions and
recorded, so restarts apply nothing. Each test file gets an isolated
schema. The startup retry exists because compose starts the bot and
Postgres together."
```

---

### Task 3: Calendar and user queries

**Files:**
- Create: `src/db/calendar.ts`, `src/db/users.ts`
- Test: `tests/db/users.test.ts`

**Interfaces:**
- Consumes: `connect`, `Sql`, `freshDatabase`, `GUILDS`, `guildBySlug`.
- Produces:
  - `interface Calendar { today: string; yesterday: string; weekStart: string }`
  - `calendar(sql: Sql): Promise<Calendar>`
  - `weekStartOf(sql: Sql, date: string): Promise<string>`
  - `interface UserRow { telegramId: number; guildSlug: string; firstName: string; username: string | null; reminderHour: number | null }`
  - `syncGuilds(sql: Sql): Promise<void>`
  - `findUser(sql: Sql, telegramId: number): Promise<UserRow | null>`
  - `createUser(sql, input: { telegramId: number; guildSlug: string; firstName: string; username?: string | null }): Promise<UserRow>`
  - `moveUser(sql: Sql, telegramId: number, guildSlug: string): Promise<void>`
  - `setReminderHour(sql: Sql, telegramId: number, hour: number | null): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/db/users.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { calendar, weekStartOf } from "../../src/db/calendar.ts";
import {
  createUser,
  findUser,
  moveUser,
  setReminderHour,
  syncGuilds,
} from "../../src/db/users.ts";
import { GUILDS } from "../../src/config.ts";

const sql = await freshDatabase("users");
afterAll(async () => { await sql.end(); });

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
});

describe("calendar", () => {
  test("today and yesterday are adjacent yyyy-mm-dd strings", async () => {
    const { today, yesterday } = await calendar(sql);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const gap = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${yesterday}T00:00:00Z`);
    expect(gap).toBe(24 * 60 * 60 * 1000);
  });

  test("the week starts on a Monday", async () => {
    const { weekStart } = await calendar(sql);
    expect(new Date(`${weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  test("today falls on or after the current week start", async () => {
    const { today, weekStart } = await calendar(sql);
    expect(weekStart <= today).toBe(true);
  });

  test("weekStartOf maps every day of a week to the same Monday", async () => {
    const monday = "2026-07-27";
    for (const day of [
      "2026-07-27", "2026-07-28", "2026-07-29",
      "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02",
    ]) {
      expect(await weekStartOf(sql, day)).toBe(monday);
    }
  });

  test("the next Monday starts a new week", async () => {
    expect(await weekStartOf(sql, "2026-08-03")).toBe("2026-08-03");
  });

  // Design 4.2. The clock changes on Sunday 25 October 2026, inside a window
  // that an autumn competition could easily span. A week boundary computed by
  // adding 7 times 24 hours would drift an hour across it.
  test("week boundaries survive the 25 October 2026 clock change", async () => {
    expect(await weekStartOf(sql, "2026-10-24")).toBe("2026-10-19");
    expect(await weekStartOf(sql, "2026-10-25")).toBe("2026-10-19");
    expect(await weekStartOf(sql, "2026-10-26")).toBe("2026-10-26");
  });
});

describe("syncGuilds", () => {
  test("writes every configured guild", async () => {
    const rows = await sql<{ slug: string }[]>`SELECT slug FROM guilds ORDER BY slug`;
    expect(rows).toHaveLength(GUILDS.length);
  });

  test("is idempotent, so a restart changes nothing", async () => {
    await syncGuilds(sql);
    const rows = await sql`SELECT slug FROM guilds`;
    expect(rows).toHaveLength(GUILDS.length);
  });

  // FR-25: correcting a member count in config and restarting must take
  // effect, because it is the denominator of every comparison.
  test("updates a name or member count changed in config", async () => {
    await sql`UPDATE guilds SET member_count = 1, name = 'Stale' WHERE slug = 'prodeko'`;
    await syncGuilds(sql);
    const [row] = await sql<{ name: string; member_count: number }[]>`
      SELECT name, member_count FROM guilds WHERE slug = 'prodeko'
    `;
    expect(row?.name).toBe("Prodeko");
    expect(row?.member_count).toBe(650);
  });
});

describe("users", () => {
  test("findUser returns null for someone who has never started the bot", async () => {
    expect(await findUser(sql, 999)).toBeNull();
  });

  // FR-1: tapping a guild link registers immediately, with zero extra taps.
  test("createUser registers against the guild from the deep link", async () => {
    const user = await createUser(sql, {
      telegramId: 4242,
      guildSlug: "prodeko",
      firstName: "Andreas",
      username: "abogo",
    });
    expect(user.guildSlug).toBe("prodeko");
    expect(user.firstName).toBe("Andreas");
    expect(user.reminderHour).toBeNull();
  });

  // A Telegram ID is a BIGINT, which the driver returns as a string. It must
  // arrive back as a number, or it silently stops matching anything.
  test("telegramId round-trips as a number", async () => {
    await createUser(sql, { telegramId: 7123456789, guildSlug: "tik", firstName: "Iiris" });
    const found = await findUser(sql, 7123456789);
    expect(found?.telegramId).toBe(7123456789);
    expect(typeof found?.telegramId).toBe("number");
  });

  test("a missing username is stored as null, not as the string undefined", async () => {
    await createUser(sql, { telegramId: 5, guildSlug: "as", firstName: "Noname" });
    expect((await findUser(sql, 5))?.username).toBeNull();
  });

  // FR-3: re-registration must not create a duplicate or silently move anyone.
  test("createUser on an existing user does not duplicate or move them", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await createUser(sql, { telegramId: 4242, guildSlug: "tik", firstName: "Andreas" });

    const rows = await sql`SELECT 1 FROM users WHERE telegram_id = 4242`;
    expect(rows).toHaveLength(1);
    expect((await findUser(sql, 4242))?.guildSlug).toBe("prodeko");
  });

  test("moveUser changes guild only when called explicitly", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await moveUser(sql, 4242, "tik");
    expect((await findUser(sql, 4242))?.guildSlug).toBe("tik");
  });

  // FR-4: declining must be permitted, and there is no silent default.
  test("reminder hour stores a chosen hour and clears back to off", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await setReminderHour(sql, 4242, 20);
    expect((await findUser(sql, 4242))?.reminderHour).toBe(20);

    await setReminderHour(sql, 4242, null);
    expect((await findUser(sql, 4242))?.reminderHour).toBeNull();
  });

  test("an hour outside 0 to 23 is rejected by the database", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await expect(setReminderHour(sql, 4242, 25)).rejects.toThrow(/violates check constraint/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/db/users.test.ts`
Expected: FAIL, with module resolution errors for `src/db/calendar.ts` and `src/db/users.ts`.

- [ ] **Step 3: Write `src/db/calendar.ts`**

```typescript
import type { Sql } from "postgres";
import { TIMEZONE } from "../config.ts";

export interface Calendar {
  today: string;
  yesterday: string;
  weekStart: string;
}

/**
 * Every date bucket in the competition comes from here.
 *
 * Postgres owns the calendar rather than the application (design 4.2): it has
 * a real timezone database, so the October clock change cannot drift a week
 * boundary the way adding 7 times 24 hours would. date_trunc('week', ...) is
 * already ISO Monday-based, which is what FR-16's weekly reset needs.
 *
 * Everything is cast to ::text because postgres.js otherwise returns DATE as a
 * Date object at UTC midnight, which shifts under formatting.
 */
export async function calendar(sql: Sql): Promise<Calendar> {
  const [row] = await sql<{ today: string; yesterday: string; week_start: string }[]>`
    WITH local AS (SELECT (now() AT TIME ZONE ${TIMEZONE}) AS ts)
    SELECT (ts)::date::text                              AS today,
           (ts::date - INTERVAL '1 day')::date::text     AS yesterday,
           date_trunc('week', ts)::date::text            AS week_start
    FROM local
  `;
  if (!row) throw new Error("calendar query returned no row");
  return { today: row.today, yesterday: row.yesterday, weekStart: row.week_start };
}

/** The Monday that starts the week containing the given yyyy-mm-dd date. */
export async function weekStartOf(sql: Sql, date: string): Promise<string> {
  const [row] = await sql<{ week_start: string }[]>`
    SELECT date_trunc('week', ${date}::date)::date::text AS week_start
  `;
  if (!row) throw new Error("weekStartOf query returned no row");
  return row.week_start;
}
```

- [ ] **Step 4: Write `src/db/users.ts`**

```typescript
import type { Sql } from "postgres";
import { GUILDS } from "../config.ts";

export interface UserRow {
  telegramId: number;
  guildSlug: string;
  firstName: string;
  username: string | null;
  reminderHour: number | null;
}

interface UserRecord {
  telegram_id: string;
  guild_slug: string;
  first_name: string;
  username: string | null;
  reminder_hour: number | null;
}

/** BIGINT arrives as a string from the driver. Telegram IDs are well inside
 *  the safe integer range, so this is lossless. */
function toUser(record: UserRecord): UserRow {
  return {
    telegramId: Number(record.telegram_id),
    guildSlug: record.guild_slug,
    firstName: record.first_name,
    username: record.username,
    reminderHour: record.reminder_hour,
  };
}

const USER_COLUMNS = "telegram_id::text, guild_slug, first_name, username, reminder_hour";

/**
 * Mirrors the config roster into the database at startup (FR-25). Names and
 * member counts are overwritten from config every time, so correcting a
 * denominator is a config edit plus a restart, with no admin UI and no
 * migration.
 */
export async function syncGuilds(sql: Sql): Promise<void> {
  for (const guild of GUILDS) {
    await sql`
      INSERT INTO guilds (slug, name, member_count)
      VALUES (${guild.slug}, ${guild.name}, ${guild.memberCount})
      ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name, member_count = EXCLUDED.member_count
    `;
  }
}

export async function findUser(sql: Sql, telegramId: number): Promise<UserRow | null> {
  const [record] = await sql<UserRecord[]>`
    SELECT ${sql.unsafe(USER_COLUMNS)} FROM users WHERE telegram_id = ${telegramId}
  `;
  return record ? toUser(record) : null;
}

/**
 * FR-1 and FR-3. Registering someone already registered is a no-op that
 * returns their existing row: it never duplicates, and it never moves them to
 * the guild whose link they happened to tap. Moving is moveUser, and only ever
 * after an explicit confirmation.
 */
export async function createUser(
  sql: Sql,
  input: {
    telegramId: number;
    guildSlug: string;
    firstName: string;
    username?: string | null;
  },
): Promise<UserRow> {
  const [record] = await sql<UserRecord[]>`
    INSERT INTO users (telegram_id, guild_slug, first_name, username)
    VALUES (
      ${input.telegramId}, ${input.guildSlug}, ${input.firstName}, ${input.username ?? null}
    )
    ON CONFLICT (telegram_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, username = EXCLUDED.username
    RETURNING ${sql.unsafe(USER_COLUMNS)}
  `;
  if (!record) throw new Error("createUser returned no row");
  return toUser(record);
}

/** FR-3. Only ever called after the user confirms the move. */
export async function moveUser(sql: Sql, telegramId: number, guildSlug: string): Promise<void> {
  await sql`UPDATE users SET guild_slug = ${guildSlug} WHERE telegram_id = ${telegramId}`;
}

/** FR-4 and FR-24. null means reminders off, which is a real stored answer
 *  rather than an absence of one. */
export async function setReminderHour(
  sql: Sql,
  telegramId: number,
  hour: number | null,
): Promise<void> {
  await sql`UPDATE users SET reminder_hour = ${hour} WHERE telegram_id = ${telegramId}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/db/users.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/db/calendar.ts src/db/users.ts tests/db/users.test.ts
git commit -m "Add calendar and user queries

Postgres owns the calendar, so the 25 October clock change cannot drift
a week boundary the way JavaScript date arithmetic would (design 4.2).
A test pins the three days either side of it.

createUser is idempotent and never moves an existing user to whichever
guild link they tapped, which is FR-3. Telegram IDs are selected as
::text and converted, because the driver returns BIGINT as a string."
```

---

### Task 4: Day logging queries

**Files:**
- Create: `src/db/days.ts`
- Test: `tests/db/days.test.ts`

**Interfaces:**
- Consumes: `Sql`, `Tier`, `freshDatabase`, `syncGuilds`, `createUser`.
- Produces:
  - `interface LogResult { stored: Tier; displaced: Tier | null }`
  - `logDay(sql: Sql, telegramId: number, date: string, tier: Tier): Promise<LogResult>`
  - `undoDay(sql: Sql, telegramId: number, date: string, restore: Tier | null): Promise<void>`
  - `dayTier(sql: Sql, telegramId: number, date: string): Promise<Tier | null>`
  - `weekMinutes(sql: Sql, telegramId: number, weekStart: string): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `tests/db/days.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds, createUser } from "../../src/db/users.ts";
import { dayTier, logDay, undoDay, weekMinutes } from "../../src/db/days.ts";

const sql = await freshDatabase("days");
afterAll(async () => { await sql.end(); });

const ANDREAS = 4242;
const WEEK = "2026-07-27"; // a Monday

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
  await createUser(sql, { telegramId: ANDREAS, guildSlug: "prodeko", firstName: "Andreas" });
});

describe("logDay", () => {
  test("a first log stores the tier and displaces nothing", async () => {
    const result = await logDay(sql, ANDREAS, "2026-07-28", "medium");
    expect(result).toEqual({ stored: "medium", displaced: null });
  });

  // FR-7: a second report for the same date replaces the first rather than
  // adding to it. The acceptance test is short then long giving 75, not 97.
  test("a second log the same day replaces the first (FR-7)", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "short");
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(75);
  });

  test("only ever one row per person per day", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "short");
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    const rows = await sql`SELECT 1 FROM days WHERE telegram_id = ${ANDREAS}`;
    expect(rows).toHaveLength(1);
  });

  // Design 4.5: FR-9's requirement and its acceptance test disagree unless
  // undo can put back what the log displaced.
  test("an overwrite reports the tier it displaced", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    const result = await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(result).toEqual({ stored: "long", displaced: "medium" });
  });

  test("logging the same tier twice reports it as displaced", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    const result = await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(result).toEqual({ stored: "long", displaced: "long" });
  });

  test("a rest day is a stored row worth zero minutes (FR-8)", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "rest");
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("rest");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  // FR-10: backdating one day writes to the previous date and is itself
  // subject to FR-7.
  test("backdating writes to the given date, not to today", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    await logDay(sql, ANDREAS, "2026-07-29", "short");
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("long");
    expect(await dayTier(sql, ANDREAS, "2026-07-29")).toBe("short");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(97);
  });
});

describe("undoDay (FR-9)", () => {
  test("removes the day entirely when nothing was displaced", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    await undoDay(sql, ANDREAS, "2026-07-28", null);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBeNull();
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  // FR-9's acceptance test: undo restores the exact weekly total from before
  // the log. Deleting the row would lose the displaced tier's minutes too.
  test("restores the displaced tier, giving back the exact prior total", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    const before = await weekMinutes(sql, ANDREAS, WEEK);

    const { displaced } = await logDay(sql, ANDREAS, "2026-07-28", "long");
    await undoDay(sql, ANDREAS, "2026-07-28", displaced);

    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(before);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("medium");
  });

  test("undoing a day that is already gone is harmless", async () => {
    await undoDay(sql, ANDREAS, "2026-07-28", null);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBeNull();
  });

  test("leaves other days untouched", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    await logDay(sql, ANDREAS, "2026-07-29", "long");
    await undoDay(sql, ANDREAS, "2026-07-29", null);
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(75);
  });
});

describe("weekMinutes", () => {
  test("is zero for a user who has logged nothing", async () => {
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  test("sums the week from Monday to Sunday inclusive", async () => {
    await logDay(sql, ANDREAS, "2026-07-27", "short");  // Monday
    await logDay(sql, ANDREAS, "2026-08-02", "short");  // Sunday
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(44);
  });

  test("excludes the next week, since the week resets on Monday", async () => {
    await logDay(sql, ANDREAS, "2026-08-03", "long");   // the following Monday
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  test("excludes the previous week", async () => {
    await logDay(sql, ANDREAS, "2026-07-26", "long");   // the preceding Sunday
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  test("returns a number rather than a driver string", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    expect(typeof await weekMinutes(sql, ANDREAS, WEEK)).toBe("number");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/db/days.test.ts`
Expected: FAIL, with a module resolution error for `../../src/db/days.ts`.

- [ ] **Step 3: Write `src/db/days.ts`**

The tier list is injected from config through `unnest` rather than stored in a table, so retuning a tier value recomputes every historical figure with no migration (FR-25 and SPEC.md §4.4).

```typescript
import type { Sql } from "postgres";
import { TIER_MINUTES, type Tier } from "../config.ts";

const TIER_NAMES = Object.keys(TIER_MINUTES) as Tier[];
const TIER_VALUES = TIER_NAMES.map((tier) => TIER_MINUTES[tier]);

export interface LogResult {
  /** The tier now stored for that day. */
  stored: Tier;
  /** The tier this log replaced, or null if the day was empty. Carried into
   *  the undo button so FR-9 can put it back. See design 4.5. */
  displaced: Tier | null;
}

/**
 * FR-5 and FR-7. One row per person per day, enforced by the composite primary
 * key rather than by any duplicate-detection logic.
 *
 * The CTE reads the existing row from the statement's snapshot, so `previous`
 * still sees the pre-update tier even though the insert overwrites it.
 */
export async function logDay(
  sql: Sql,
  telegramId: number,
  date: string,
  tier: Tier,
): Promise<LogResult> {
  const [row] = await sql<{ stored: Tier; displaced: Tier | null }[]>`
    WITH previous AS (
      SELECT tier FROM days WHERE telegram_id = ${telegramId} AND date = ${date}::date
    ), upserted AS (
      INSERT INTO days (telegram_id, date, tier)
      VALUES (${telegramId}, ${date}::date, ${tier})
      ON CONFLICT (telegram_id, date) DO UPDATE
        SET tier = EXCLUDED.tier, logged_at = now()
      RETURNING tier
    )
    SELECT u.tier AS stored, p.tier AS displaced
    FROM upserted u LEFT JOIN previous p ON TRUE
  `;
  if (!row) throw new Error("logDay returned no row");
  return { stored: row.stored, displaced: row.displaced };
}

/**
 * FR-9. Restores the displaced tier when the log overwrote one, and otherwise
 * removes the day entirely. Both readings of the requirement hold: the day's
 * record is removed when there was nothing before it, and the exact weekly
 * total from before the log is restored when there was.
 */
export async function undoDay(
  sql: Sql,
  telegramId: number,
  date: string,
  restore: Tier | null,
): Promise<void> {
  if (restore === null) {
    await sql`
      DELETE FROM days WHERE telegram_id = ${telegramId} AND date = ${date}::date
    `;
    return;
  }
  await sql`
    INSERT INTO days (telegram_id, date, tier)
    VALUES (${telegramId}, ${date}::date, ${restore})
    ON CONFLICT (telegram_id, date) DO UPDATE
      SET tier = EXCLUDED.tier, logged_at = now()
  `;
}

export async function dayTier(
  sql: Sql,
  telegramId: number,
  date: string,
): Promise<Tier | null> {
  const [row] = await sql<{ tier: Tier }[]>`
    SELECT tier FROM days WHERE telegram_id = ${telegramId} AND date = ${date}::date
  `;
  return row?.tier ?? null;
}

/**
 * Minutes so far in the week beginning on the given Monday (FR-12).
 * Derived from the config tier list at read time, never read from a stored
 * total, so a tier change recomputes it.
 */
export async function weekMinutes(
  sql: Sql,
  telegramId: number,
  weekStart: string,
): Promise<number> {
  const [row] = await sql<{ minutes: number }[]>`
    WITH tier_minutes(tier, minutes) AS (
      SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
    )
    SELECT COALESCE(SUM(t.minutes), 0)::int AS minutes
    FROM days d
    JOIN tier_minutes t ON t.tier = d.tier
    WHERE d.telegram_id = ${telegramId}
      AND d.date >= ${weekStart}::date
      AND d.date <  ${weekStart}::date + INTERVAL '7 days'
  `;
  return row?.minutes ?? 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/db/days.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/db/days.ts tests/db/days.test.ts
git commit -m "Add day logging queries

logDay reports the tier it displaced, which is what lets undo restore
the exact prior weekly total rather than merely deleting the row.
FR-9's requirement and its acceptance test disagree without that, since
deleting also loses the displaced tier's minutes (design 4.5).

Minutes are derived from the config tier list injected through unnest,
so retuning a tier recomputes every historical figure with no migration
and no stored total to drift."
```

---

### Task 5: Standings, neighbours, and weekly totals

**Files:**
- Create: `src/db/standings.ts`
- Test: `tests/db/standings.test.ts`

**Interfaces:**
- Consumes: `Sql`, `WeekTotal`, `freshDatabase`, `syncGuilds`, `createUser`, `logDay`.
- Produces:
  - `interface GuildStanding { slug: string; name: string; minutes: number; perMember: number }`
  - `standings(sql: Sql, from: string, to: string): Promise<GuildStanding[]>`
  - `interface Neighbour { firstName: string; minutes: number; isSelf: boolean }`
  - `neighbours(sql, telegramId, guildSlug, from, to): Promise<Neighbour[]>`
  - `weeklyTotals(sql: Sql, telegramId: number): Promise<WeekTotal[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/db/standings.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds, createUser } from "../../src/db/users.ts";
import { logDay } from "../../src/db/days.ts";
import { neighbours, standings, weeklyTotals } from "../../src/db/standings.ts";

const sql = await freshDatabase("standings");
afterAll(async () => { await sql.end(); });

const WEEK_FROM = "2026-07-27";
const WEEK_TO = "2026-08-02";

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
});

describe("standings (FR-16)", () => {
  test("lists every configured guild, including ones with nobody registered", async () => {
    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    expect(table).toHaveLength(9);
    expect(table.every((row) => typeof row.perMember === "number")).toBe(true);
  });

  // SPEC.md section 4.3: minutes per member across the entire roster,
  // including everyone who never logs anything. Prodeko has 650 members and
  // TiK has 700, both from config.
  test("divides by the full roster, hand-calculated", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
    await createUser(sql, { telegramId: 3, guildSlug: "tik", firstName: "Carol" });

    await logDay(sql, 1, "2026-07-28", "medium");  // 45
    await logDay(sql, 1, "2026-07-29", "long");    // 75
    await logDay(sql, 2, "2026-07-28", "short");   // 22
    await logDay(sql, 3, "2026-07-28", "rest");    // 0

    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    const prodeko = table.find((row) => row.slug === "prodeko");
    const tik = table.find((row) => row.slug === "tik");

    expect(prodeko?.minutes).toBe(142);
    expect(prodeko?.perMember).toBeCloseTo(142 / 650, 5);
    expect(tik?.minutes).toBe(0);
    expect(tik?.perMember).toBe(0);
  });

  // Verified against Postgres: SUM(minutes) / member_count with two integers
  // returns 0, because 142 / 650 truncates. The query printed in SPEC.md
  // section 6 has this bug.
  test("per-member is fractional, not truncated to zero by integer division", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "long");

    const prodeko = (await standings(sql, WEEK_FROM, WEEK_TO))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.perMember).toBeGreaterThan(0);
    expect(prodeko?.perMember).toBeCloseTo(75 / 650, 5);
  });

  test("ranks by minutes per member, not by raw minutes", async () => {
    // Athene has 350 members, TiK has 700. Equal raw minutes must put the
    // smaller guild ahead.
    await createUser(sql, { telegramId: 1, guildSlug: "athene", firstName: "Small" });
    await createUser(sql, { telegramId: 2, guildSlug: "tik", firstName: "Big" });
    await logDay(sql, 1, "2026-07-28", "long");
    await logDay(sql, 2, "2026-07-28", "long");

    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    expect(table[0]?.slug).toBe("athene");
  });

  test("excludes days outside the requested range, which is the weekly reset", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-08-03", "long");  // the following Monday

    const prodeko = (await standings(sql, WEEK_FROM, WEEK_TO))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.minutes).toBe(0);
  });

  test("a season range accumulates across weeks", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "long");
    await logDay(sql, 1, "2026-08-04", "long");

    const prodeko = (await standings(sql, "2026-07-27", "2026-08-09"))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.minutes).toBe(150);
  });
});

describe("neighbours (FR-15)", () => {
  beforeEach(async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Sanna" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Andreas" });
    await createUser(sql, { telegramId: 3, guildSlug: "prodeko", firstName: "Otto" });
    await createUser(sql, { telegramId: 4, guildSlug: "prodeko", firstName: "Far" });
    await createUser(sql, { telegramId: 5, guildSlug: "tik", firstName: "Outsider" });

    await logDay(sql, 1, "2026-07-28", "long");    // 75
    await logDay(sql, 1, "2026-07-29", "long");    // 150 total
    await logDay(sql, 2, "2026-07-28", "long");    // 75
    await logDay(sql, 3, "2026-07-28", "medium");  // 45
    await logDay(sql, 5, "2026-07-28", "long");    // other guild
  });

  test("returns the user with one neighbour either side", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.map((r) => r.firstName)).toEqual(["Sanna", "Andreas", "Otto"]);
    expect(rows.map((r) => r.minutes)).toEqual([150, 75, 45]);
  });

  test("marks exactly one row as the user", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.filter((r) => r.isSelf)).toHaveLength(1);
    expect(rows.find((r) => r.isSelf)?.firstName).toBe("Andreas");
  });

  test("never reaches into another guild", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.map((r) => r.firstName)).not.toContain("Outsider");
  });

  test("never returns more than three rows, so it cannot become a leaderboard", async () => {
    const rows = await neighbours(sql, 1, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  test("the top user has no one above them", async () => {
    const rows = await neighbours(sql, 1, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows[0]?.firstName).toBe("Sanna");
    expect(rows[0]?.isSelf).toBe(true);
  });

  test("a user who has logged nothing still appears, at zero", async () => {
    const rows = await neighbours(sql, 4, "prodeko", WEEK_FROM, WEEK_TO);
    const self = rows.find((r) => r.isSelf);
    expect(self?.firstName).toBe("Far");
    expect(self?.minutes).toBe(0);
  });
});

describe("weeklyTotals", () => {
  test("groups minutes by the Monday that starts each week", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "long");   // week of 07-27
    await logDay(sql, 1, "2026-07-29", "long");   // week of 07-27
    await logDay(sql, 1, "2026-08-04", "medium"); // week of 08-03

    const totals = await weeklyTotals(sql, 1);
    expect(totals).toEqual([
      { weekStart: "2026-07-27", minutes: 150 },
      { weekStart: "2026-08-03", minutes: 45 },
    ]);
  });

  test("returns an empty list for a user who has logged nothing", async () => {
    await createUser(sql, { telegramId: 9, guildSlug: "prodeko", firstName: "New" });
    expect(await weeklyTotals(sql, 9)).toEqual([]);
  });

  test("a week of only rest days appears at zero minutes", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "rest");
    expect(await weeklyTotals(sql, 1)).toEqual([{ weekStart: "2026-07-27", minutes: 0 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/db/standings.test.ts`
Expected: FAIL, with a module resolution error for `../../src/db/standings.ts`.

- [ ] **Step 3: Write `src/db/standings.ts`**

```typescript
import type { Sql } from "postgres";
import { TIER_MINUTES, type Tier } from "../config.ts";
import type { WeekTotal } from "../domain/scoring.ts";

const TIER_NAMES = Object.keys(TIER_MINUTES) as Tier[];
const TIER_VALUES = TIER_NAMES.map((tier) => TIER_MINUTES[tier]);

export interface GuildStanding {
  slug: string;
  name: string;
  minutes: number;
  perMember: number;
}

export interface Neighbour {
  firstName: string;
  minutes: number;
  isSelf: boolean;
}

/**
 * FR-16 and SPEC.md section 4.3. Minutes per member across the guild's entire
 * roster, including everyone who never logs anything, which is what makes
 * activating quiet members the winning strategy.
 *
 * Two casts matter. `::numeric` before the division, because Postgres integer
 * division truncates 142 / 650 to 0, which is the bug in the query printed in
 * SPEC.md section 6. Then `::float8` so the driver hands back a number rather
 * than a numeric string.
 *
 * `NOT u.blocked` is carried over from SPEC.md section 6 as written. It cannot
 * fire in Phase 1, because nothing sets `blocked` until FR-23 lands in Phase 3.
 * Revisit it then: it currently erases a blocked user's past activity from
 * their guild's total, which is a different thing from not messaging them.
 */
export async function standings(
  sql: Sql,
  from: string,
  to: string,
): Promise<GuildStanding[]> {
  return await sql<GuildStanding[]>`
    WITH tier_minutes(tier, minutes) AS (
      SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
    )
    SELECT g.slug,
           g.name,
           COALESCE(SUM(t.minutes), 0)::int AS minutes,
           (COALESCE(SUM(t.minutes), 0)::numeric / g.member_count)::float8 AS "perMember"
    FROM guilds g
    LEFT JOIN users u ON u.guild_slug = g.slug AND NOT u.blocked
    LEFT JOIN days d ON d.telegram_id = u.telegram_id
                    AND d.date BETWEEN ${from}::date AND ${to}::date
    LEFT JOIN tier_minutes t ON t.tier = d.tier
    GROUP BY g.slug, g.name, g.member_count
    ORDER BY "perMember" DESC, g.name ASC
  `;
}

/**
 * FR-15. The user and at most one person either side of them, within their own
 * guild only. This is the permitted half of the requirement: there is no query
 * anywhere that returns a top-N list of individuals, and the three-row cap is
 * what keeps it that way.
 */
export async function neighbours(
  sql: Sql,
  telegramId: number,
  guildSlug: string,
  from: string,
  to: string,
): Promise<Neighbour[]> {
  const rows = await sql<
    { telegram_id: string; first_name: string; minutes: number; rank: number }[]
  >`
    WITH tier_minutes(tier, minutes) AS (
      SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
    ), totals AS (
      SELECT u.telegram_id,
             u.first_name,
             COALESCE(SUM(t.minutes), 0)::int AS minutes
      FROM users u
      LEFT JOIN days d ON d.telegram_id = u.telegram_id
                      AND d.date BETWEEN ${from}::date AND ${to}::date
      LEFT JOIN tier_minutes t ON t.tier = d.tier
      WHERE u.guild_slug = ${guildSlug} AND NOT u.blocked
      GROUP BY u.telegram_id, u.first_name
    ), ranked AS (
      SELECT telegram_id, first_name, minutes,
             ROW_NUMBER() OVER (ORDER BY minutes DESC, first_name ASC) AS rank
      FROM totals
    ), me AS (
      SELECT rank FROM ranked WHERE telegram_id = ${telegramId}
    )
    SELECT r.telegram_id::text, r.first_name, r.minutes, r.rank::int AS rank
    FROM ranked r, me
    WHERE r.rank BETWEEN me.rank - 1 AND me.rank + 1
    ORDER BY r.rank
  `;

  return rows.map((row) => ({
    firstName: row.first_name,
    minutes: row.minutes,
    isSelf: Number(row.telegram_id) === telegramId,
  }));
}

/**
 * FR-13's input. One row per week the user has any record in, keyed by the
 * Monday that starts it, so the streak can be reduced in pure code.
 */
export async function weeklyTotals(sql: Sql, telegramId: number): Promise<WeekTotal[]> {
  const rows = await sql<{ week_start: string; minutes: number }[]>`
    WITH tier_minutes(tier, minutes) AS (
      SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
    )
    SELECT date_trunc('week', d.date)::date::text AS week_start,
           COALESCE(SUM(t.minutes), 0)::int       AS minutes
    FROM days d
    JOIN tier_minutes t ON t.tier = d.tier
    WHERE d.telegram_id = ${telegramId}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((row) => ({ weekStart: row.week_start, minutes: row.minutes }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/db/standings.test.ts`
Expected: PASS, all tests green. In particular the hand-calculated case must
give Prodeko 142 minutes and 142/650 per member.

- [ ] **Step 5: Run the whole suite**

Run: `bun test`
Expected: PASS, every file green.

- [ ] **Step 6: Commit**

```bash
git add src/db/standings.ts tests/db/standings.test.ts
git commit -m "Add standings, neighbours and weekly totals

Per-member casts to numeric before dividing. Postgres integer division
truncates 142 / 650 to zero, so the query printed in SPEC.md section 6
would have ranked every guild at nought, verified against a real
database.

Neighbours is capped at three rows within one guild, which is the
permitted half of FR-15. No query anywhere returns a top-N list of
individuals."
```

---

### Task 6: Copy, callback encoding, and renderers

**Files:**
- Create: `src/strings.ts`, `src/bot/callbacks.ts`, `src/bot/render.ts`
- Test: `tests/bot/callbacks.test.ts`, `tests/bot/render.test.ts`

**Interfaces:**
- Consumes: `Tier`, `progressBar`, `GuildStanding`, `Neighbour`.
- Produces:
  - `type Callback` (discriminated union, see Step 3), `encode(cb: Callback): string`, `decode(data: string): Callback | null`
  - `TIER_LABELS: Record<Tier, string>`, plus the copy constants used by Tasks 7 to 9
  - `progressBlock(minutes: number, target: number): string`
  - `confirmation(tier: Tier, weekMinutes: number, target: number): string`
  - `meMessage(input: MeInput): string`, `standingsMessage(input: StandingsInput): string`

- [ ] **Step 1: Write the failing test for callbacks**

Callback data has a hard 64-byte limit, and a payload from an old message must
still be readable after a restart, because there is no session state. Create
`tests/bot/callbacks.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { decode, encode, type Callback } from "../../src/bot/callbacks.ts";

const SAMPLES: Callback[] = [
  { kind: "guild", slug: "prodeko" },
  { kind: "guild", slug: "accounting" },
  { kind: "hour", hour: 20 },
  { kind: "hour", hour: null },
  { kind: "log", date: "2026-07-30", tier: "short" },
  { kind: "log", date: "2026-07-30", tier: "rest" },
  { kind: "undo", date: "2026-07-30", restore: null },
  { kind: "undo", date: "2026-07-30", restore: "medium" },
  { kind: "yesterday", date: "2026-07-29" },
  { kind: "checkin", date: "2026-07-30" },
  { kind: "move", slug: "tik" },
  { kind: "stay" },
  { kind: "me" },
  { kind: "standings" },
];

describe("callback encoding", () => {
  test("every sample round-trips unchanged", () => {
    for (const sample of SAMPLES) {
      expect(decode(encode(sample))).toEqual(sample);
    }
  });

  // Telegram rejects callback_data longer than 64 bytes, and the failure is a
  // runtime API error rather than anything the type system catches.
  test("every payload fits inside Telegram's 64-byte limit", () => {
    for (const sample of SAMPLES) {
      expect(Buffer.byteLength(encode(sample), "utf8")).toBeLessThanOrEqual(64);
    }
  });

  test("rejects malformed data rather than throwing", () => {
    for (const bad of ["", "nonsense", "log", "log:2026-07-30", "hour:banana", "log:2026-07-30:enormous"]) {
      expect(decode(bad)).toBeNull();
    }
  });

  test("rejects a tier that is not one of the four", () => {
    expect(decode("log:2026-07-30:gigantic")).toBeNull();
  });

  test("rejects a date that is not yyyy-mm-dd", () => {
    expect(decode("log:30-07-2026:short")).toBeNull();
    expect(decode("log:2026-7-3:short")).toBeNull();
  });

  test("an undo payload with no displaced tier decodes to null, not to a string", () => {
    const decoded = decode(encode({ kind: "undo", date: "2026-07-30", restore: null }));
    expect(decoded).toEqual({ kind: "undo", date: "2026-07-30", restore: null });
  });

  // Offering the check-in again after an undo is a different intent from
  // switching the keyboard to yesterday, even though both re-render a
  // keyboard. Keeping them distinct matters once Phase 3 sends check-ins.
  test("a checkin payload is distinct from a yesterday payload", () => {
    expect(encode({ kind: "checkin", date: "2026-07-30" }))
      .not.toBe(encode({ kind: "yesterday", date: "2026-07-30" }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/bot/callbacks.test.ts`
Expected: FAIL, module not found for `../../src/bot/callbacks.ts`.

- [ ] **Step 3: Write `src/bot/callbacks.ts`**

```typescript
import { isTier, type Tier } from "../domain/scoring.ts";

/**
 * Every button carries its full meaning, so a tap on a message sent before a
 * restart still works and the process holds no session state (NFR-5).
 *
 * Telegram rejects callback_data over 64 bytes. The longest payload here is an
 * undo carrying a date and a displaced tier, at 27 bytes.
 */
export type Callback =
  | { kind: "guild"; slug: string }
  | { kind: "hour"; hour: number | null }
  | { kind: "log"; date: string; tier: Tier }
  | { kind: "undo"; date: string; restore: Tier | null }
  | { kind: "yesterday"; date: string }
  | { kind: "checkin"; date: string }
  | { kind: "move"; slug: string }
  | { kind: "stay" }
  | { kind: "me" }
  | { kind: "standings" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z][a-z0-9-]{0,30}$/;

export function encode(callback: Callback): string {
  switch (callback.kind) {
    case "guild":     return `guild:${callback.slug}`;
    case "hour":      return `hour:${callback.hour ?? "off"}`;
    case "log":       return `log:${callback.date}:${callback.tier}`;
    case "undo":      return `undo:${callback.date}:${callback.restore ?? "none"}`;
    case "yesterday": return `yesterday:${callback.date}`;
    case "checkin":   return `checkin:${callback.date}`;
    case "move":      return `move:${callback.slug}`;
    case "stay":      return "stay";
    case "me":        return "me";
    case "standings": return "standings";
  }
}

/** Returns null for anything malformed. Callback data is user-controllable. */
export function decode(data: string): Callback | null {
  const [kind, first, second] = data.split(":");

  switch (kind) {
    case "stay":
    case "me":
    case "standings":
      return data === kind ? { kind } : null;

    case "guild":
      return first && SLUG.test(first) ? { kind: "guild", slug: first } : null;

    case "move":
      return first && SLUG.test(first) ? { kind: "move", slug: first } : null;

    case "hour": {
      if (first === "off") return { kind: "hour", hour: null };
      if (!first || !/^\d{1,2}$/.test(first)) return null;
      const hour = Number(first);
      return hour >= 0 && hour <= 23 ? { kind: "hour", hour } : null;
    }

    case "yesterday":
      return first && DATE.test(first) ? { kind: "yesterday", date: first } : null;

    case "checkin":
      return first && DATE.test(first) ? { kind: "checkin", date: first } : null;

    case "log":
      if (!first || !DATE.test(first) || !second || !isTier(second)) return null;
      return { kind: "log", date: first, tier: second };

    case "undo": {
      if (!first || !DATE.test(first) || !second) return null;
      if (second === "none") return { kind: "undo", date: first, restore: null };
      return isTier(second) ? { kind: "undo", date: first, restore: second } : null;
    }

    default:
      return null;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun test tests/bot/callbacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for renderers**

Create `tests/bot/render.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { confirmation, meMessage, progressBlock, standingsMessage } from "../../src/bot/render.ts";

describe("progressBlock (FR-12)", () => {
  test("shows minutes against the target with a bar, as in the prototype", () => {
    const block = progressBlock(112, 150);
    expect(block).toContain("112 / 150 min");
    expect(block).toContain("███████░░░");
  });

  // FR-12's acceptance test: 45 logged onto a week already holding 67 reads
  // 112 / 150 with a bar filled to roughly three quarters.
  test("the acceptance example reads 112 of 150", () => {
    expect(progressBlock(67 + 45, 150)).toContain("112 / 150 min");
  });
});

describe("confirmation (FR-12)", () => {
  test("leads with the minutes just logged", () => {
    expect(confirmation("medium", 112, 150)).toContain("45 min");
  });

  test("says how much is left when the target is not yet met", () => {
    expect(confirmation("medium", 112, 150)).toContain("38 minutes to go");
  });

  test("nudges rather than counts when the gap is small", () => {
    expect(confirmation("short", 130, 150)).toContain("One more session");
  });

  test("congratulates once the target is met", () => {
    expect(confirmation("long", 150, 150)).toContain("Target hit");
  });

  // FR-8: a rest day must read as permitted, not as a failure.
  test("a rest day is framed as breaking nothing", () => {
    const message = confirmation("rest", 67, 150);
    expect(message).toContain("Rest days");
    expect(message).not.toContain("0 min.");
  });

  test("contains no dash characters, per the project copy rule", () => {
    expect(confirmation("medium", 112, 150)).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("meMessage (FR-14)", () => {
  const input = {
    weekMinutes: 112,
    target: 150,
    streak: 3,
    guildName: "Prodeko",
    guildRank: 2,
    guildCount: 9,
    neighbours: [
      { firstName: "Sanna", minutes: 134, isSelf: false },
      { firstName: "Andreas", minutes: 112, isSelf: true },
      { firstName: "Otto", minutes: 98, isSelf: false },
    ],
  };

  test("shows weekly progress, the streak and the guild rank", () => {
    const message = meMessage(input);
    expect(message).toContain("112 / 150 min");
    expect(message).toContain("3 weeks at target");
    expect(message).toContain("Prodeko, 2nd of 9 this week");
  });

  test("renders the user as 'you' rather than by name", () => {
    const message = meMessage(input);
    expect(message).toContain("you");
    expect(message).not.toContain("Andreas");
  });

  test("names the neighbours either side", () => {
    const message = meMessage(input);
    expect(message).toContain("Sanna");
    expect(message).toContain("Otto");
  });

  test("uses the right ordinal for first and third", () => {
    expect(meMessage({ ...input, guildRank: 1 })).toContain("1st of 9");
    expect(meMessage({ ...input, guildRank: 3 })).toContain("3rd of 9");
  });

  test("reads sensibly with no streak yet", () => {
    const message = meMessage({ ...input, streak: 0 });
    expect(message).not.toContain("0 weeks at target");
  });

  test("omits the neighbours block when the user is alone in their guild", () => {
    const alone = { ...input, neighbours: [{ firstName: "Andreas", minutes: 112, isSelf: true }] };
    expect(meMessage(alone)).not.toContain("Around you");
  });
});

describe("standingsMessage (FR-16)", () => {
  const week = [
    { slug: "inkubio", name: "Inkubio", minutes: 9640, perMember: 24.1 },
    { slug: "prodeko", name: "Prodeko", minutes: 14820, perMember: 22.8 },
  ];
  const season = [
    { slug: "prodeko", name: "Prodeko", minutes: 54730, perMember: 84.2 },
    { slug: "inkubio", name: "Inkubio", minutes: 30560, perMember: 76.4 },
  ];

  test("puts the weekly table first, so last place is never permanent", () => {
    const message = standingsMessage({ week, season });
    expect(message.indexOf("This week")).toBeLessThan(message.indexOf("Season"));
  });

  test("renders both tables in one message", () => {
    const message = standingsMessage({ week, season });
    expect(message).toContain("Inkubio");
    expect(message).toContain("Prodeko");
    expect(message).toContain("24.1");
    expect(message).toContain("84.2");
  });

  test("states that the denominator is the whole roster", () => {
    expect(standingsMessage({ week, season })).toContain("Everyone in the guild counts");
  });

  test("numbers the rows in rank order", () => {
    const message = standingsMessage({ week, season });
    expect(message).toMatch(/1\s+Inkubio/);
    expect(message).toMatch(/2\s+Prodeko/);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bun test tests/bot/render.test.ts`
Expected: FAIL, module not found for `../../src/bot/render.ts`.

- [ ] **Step 7: Write `src/strings.ts`**

All user-facing English lives here (FR-27). Copy follows
`prototype/bot-flows.html`, with the two departures the design requires: the
FR-4 reminder question names both outcomes rather than reading as a skippable
step, and registration carries the privacy notice SPEC.md section 6 requires.

```typescript
import type { Tier } from "./config.ts";

export const TIER_LABELS: Record<Tier, string> = {
  short: "15 to 30 min",
  medium: "30 to 60 min",
  long: "60+ min",
  rest: "Not today",
};

export const CHECK_IN_PROMPT = "<b>Moved today?</b>";
export const CHECK_IN_PROMPT_YESTERDAY = "<b>And yesterday?</b>";
export const BUTTON_YESTERDAY = "Log yesterday instead";
export const BUTTON_UNDO = "Undo";
export const BUTTON_ME = "My week";
export const BUTTON_STANDINGS = "Standings";
export const BUTTON_REMINDER_OFF = "No, I'll remember";

export const REMINDER_HOURS = [17, 18, 20, 21] as const;

export function welcome(firstName: string, guildName: string): string {
  return (
    `Moi ${firstName}. You're in, for <b>${guildName}</b>.\n\n` +
    "One tap a day, that's it. Most people forget by week three unless " +
    "something asks, so: should I?"
  );
}

/**
 * FR-4 requires a real choice with no silent default in either direction, and
 * SPEC.md section 6 requires the privacy notice at registration.
 */
export function reminderSet(hour: number, guildName: string): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>. Change it any time with /remind.\n\n` +
    "Target is <b>150 minutes a week</b>, the WHO guideline. That's about four sessions.\n\n" +
    `Your first name and how much you move are visible to others in ${guildName}.`
  );
}

export function reminderOff(guildName: string): string {
  return (
    "No reminders. Log whenever you like with /log.\n\n" +
    "Target is <b>150 minutes a week</b>, the WHO guideline. That's about four sessions.\n\n" +
    `Your first name and how much you move are visible to others in ${guildName}.`
  );
}

export const CHOOSE_GUILD = "Which guild are you in?";

export function alreadyRegistered(guildName: string): string {
  return `You're already counted for <b>${guildName}</b>.`;
}

export function confirmMove(fromGuild: string, toGuild: string): string {
  return (
    `You're currently counted for <b>${fromGuild}</b>. ` +
    `Move to <b>${toGuild}</b>?\n\n` +
    "Everything you've logged stays with you."
  );
}

export function moved(guildName: string): string {
  return `Moved. You're counted for <b>${guildName}</b> now.`;
}

export function stayed(guildName: string): string {
  return `Fine. Still <b>${guildName}</b>.`;
}

export const UNDO_DONE = "Removed.";
export const OUTSIDE_WINDOW =
  "That date is outside the competition, so it wouldn't count. Nothing was saved.";
export const NOT_REGISTERED =
  "Start with your guild's link first, or send /start to pick a guild.";
export const STANDINGS_FOOTER = "Everyone in the guild counts, logging or not.";
```

- [ ] **Step 8: Write `src/bot/render.ts`**

```typescript
import { progressBar, tierMinutes } from "../domain/scoring.ts";
import { STANDINGS_FOOTER } from "../strings.ts";
import type { Tier } from "../config.ts";
import type { GuildStanding, Neighbour } from "../db/standings.ts";

/** FR-12. Monospace so the bar and the numbers line up on a narrow phone. */
export function progressBlock(minutes: number, target: number): string {
  return (
    `<pre>This week   ${minutes} / ${target} min\n` +
    `            ${progressBar(minutes, target)}</pre>`
  );
}

function tail(minutes: number, target: number): string {
  const left = target - minutes;
  if (left <= 0) return "Target hit.";
  if (left <= 45) return "One more session does it.";
  return `${left} minutes to go.`;
}

/** FR-12. Every confirmation shows progress against the weekly target. */
export function confirmation(tier: Tier, minutes: number, target: number): string {
  const head = tier === "rest"
    ? "Noted. Rest days don't break anything."
    : `<b>${tierMinutes(tier)} min.</b> Good.`;
  return `${head}\n\n${progressBlock(minutes, target)}\n${tail(minutes, target)}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13
    ? "th"
    : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

export interface MeInput {
  weekMinutes: number;
  target: number;
  streak: number;
  guildName: string;
  guildRank: number;
  guildCount: number;
  neighbours: readonly Neighbour[];
}

/** FR-14. Weekly progress, the streak, and the rank of the user's guild. */
export function meMessage(input: MeInput): string {
  const lines = [
    `This week    ${input.weekMinutes} / ${input.target} min`,
    `             ${progressBar(input.weekMinutes, input.target)}`,
  ];
  if (input.streak > 0) {
    const weeks = input.streak === 1 ? "week" : "weeks";
    lines.push(`Streak       ${input.streak} ${weeks} at target`);
  }
  lines.push(
    `Guild        ${input.guildName}, ${ordinal(input.guildRank)} of ${input.guildCount} this week`,
  );

  let message = `<pre>${lines.join("\n")}</pre>`;

  // FR-15 permits neighbours but never a global ranking. With nobody either
  // side of the user there is nothing to show.
  if (input.neighbours.length > 1) {
    const rows = input.neighbours.map((n) => {
      const name = n.isSelf ? "you" : n.firstName;
      return `  ${name.padEnd(10)} ${String(n.minutes).padStart(3)} min`;
    });
    message += `\n\n<b>Around you</b>\n<pre>${rows.join("\n")}</pre>`;
  }
  return message;
}

export interface StandingsInput {
  week: readonly GuildStanding[];
  season: readonly GuildStanding[];
}

function table(rows: readonly GuildStanding[]): string {
  return rows
    .map((row, index) =>
      `${String(index + 1).padStart(2)}  ${row.name.padEnd(18)}${row.perMember.toFixed(1)}`)
    .join("\n");
}

/**
 * FR-16. The weekly table comes first, deliberately: a guild ninth for the
 * season can still be winning the week, and without that the bottom guilds
 * receive nothing but repeated failure signals.
 */
export function standingsMessage(input: StandingsInput): string {
  return (
    `<b>This week</b> · minutes per member\n<pre>${table(input.week)}</pre>\n\n` +
    `<b>Season</b>\n<pre>${table(input.season)}</pre>\n\n` +
    STANDINGS_FOOTER
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bun test tests/bot/`
Expected: PASS, both files green.

- [ ] **Step 10: Commit**

```bash
git add src/strings.ts src/bot/callbacks.ts src/bot/render.ts tests/bot/callbacks.test.ts tests/bot/render.test.ts
git commit -m "Add copy, callback encoding and renderers

Callback payloads carry their full meaning and are validated on the way
back in, so a tap on a message from before a restart still works and no
session state exists to lose. A test pins every payload under
Telegram's 64-byte limit.

The registration copy departs from the mockup twice, both required: the
reminder question names both outcomes rather than reading as a skippable
step (FR-4), and registration carries the privacy notice from SPEC.md
section 6, which the mockup omits."
```

---

### Task 7: Bot core and registration

**Files:**
- Create: `src/bot/index.ts`, `src/bot/registration.ts`, `src/main.ts`
- Modify: none

**Interfaces:**
- Consumes: everything from Tasks 1 to 6.
- Produces:
  - `createBot(sql: Sql, token: string): Bot` from `src/bot/index.ts`
  - `installRegistration(bot: Bot, sql: Sql): void` from `src/bot/registration.ts`
  - `installCommands(bot: Bot): Promise<void>` from `src/bot/index.ts`

This task has no automated test. Registration is Telegram plumbing over
already-tested pieces, and its acceptance is the manual smoke checklist in
Task 10. Keep the handlers thin: anything worth asserting belongs in
`domain/`, `db/`, or `render.ts`, all of which are covered.

- [ ] **Step 1: Write `src/bot/registration.ts`**

```typescript
import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { GUILDS, guildBySlug } from "../config.ts";
import { createUser, findUser, moveUser, setReminderHour } from "../db/users.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_REMINDER_OFF,
  CHOOSE_GUILD,
  REMINDER_HOURS,
  alreadyRegistered,
  confirmMove,
  moved,
  reminderOff,
  reminderSet,
  stayed,
  welcome,
} from "../strings.ts";
import { sendCheckIn } from "./checkin.ts";

/** FR-2. Three per row over nine guilds. */
function guildKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  GUILDS.forEach((guild, index) => {
    keyboard.text(guild.name, encode({ kind: "guild", slug: guild.slug }));
    if (index % 3 === 2) keyboard.row();
  });
  return keyboard;
}

/** FR-4. A real choice between two named outcomes, with no silent default. */
function reminderKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  REMINDER_HOURS.forEach((hour, index) => {
    keyboard.text(`${String(hour).padStart(2, "0")}:00`, encode({ kind: "hour", hour }));
    if (index % 2 === 1) keyboard.row();
  });
  return keyboard.row().text(BUTTON_REMINDER_OFF, encode({ kind: "hour", hour: null }));
}

export function installRegistration(bot: Bot, sql: Sql): void {
  /**
   * FR-1: a guild deep link registers immediately with zero further input.
   * FR-2: a bare or unrecognised payload falls back to the picker.
   * FR-3: an existing user is never moved silently.
   */
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const from = ctx.from;
    if (!from) return;

    const payload = ctx.match.trim();
    const target = payload ? guildBySlug(payload) : undefined;
    const existing = await findUser(sql, from.id);

    if (existing) {
      const current = guildBySlug(existing.guildSlug);
      if (target && target.slug !== existing.guildSlug) {
        await ctx.reply(confirmMove(current?.name ?? existing.guildSlug, target.name), {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(`Move to ${target.name}`, encode({ kind: "move", slug: target.slug }))
            .row()
            .text(`Stay in ${current?.name ?? existing.guildSlug}`, encode({ kind: "stay" })),
        });
        return;
      }
      await ctx.reply(alreadyRegistered(current?.name ?? existing.guildSlug), {
        parse_mode: "HTML",
      });
      await sendCheckIn(ctx, sql, from.id);
      return;
    }

    if (!target) {
      await ctx.reply(CHOOSE_GUILD, { reply_markup: guildKeyboard() });
      return;
    }

    await registerAndAsk(ctx, sql, target.slug);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;

    if (!callback || !from) return await next();

    if (callback.kind === "guild") {
      const guild = guildBySlug(callback.slug);
      if (!guild) return void (await ctx.answerCallbackQuery());
      await ctx.answerCallbackQuery();
      const existing = await findUser(sql, from.id);
      if (existing) {
        await ctx.editMessageText(alreadyRegistered(guild.name), { parse_mode: "HTML" });
        return;
      }
      await registerAndAsk(ctx, sql, guild.slug, true);
      return;
    }

    if (callback.kind === "hour") {
      await ctx.answerCallbackQuery(
        callback.hour === null ? "Reminders off" : `Reminder set for ${callback.hour}:00`,
      );
      const user = await findUser(sql, from.id);
      if (!user) return;
      const guild = guildBySlug(user.guildSlug);
      const guildName = guild?.name ?? user.guildSlug;

      await setReminderHour(sql, from.id, callback.hour);
      await ctx.editMessageText(
        callback.hour === null ? reminderOff(guildName) : reminderSet(callback.hour, guildName),
        { parse_mode: "HTML" },
      );
      await sendCheckIn(ctx, sql, from.id);
      return;
    }

    if (callback.kind === "move") {
      const guild = guildBySlug(callback.slug);
      if (!guild) return void (await ctx.answerCallbackQuery());
      await moveUser(sql, from.id, guild.slug);
      await ctx.answerCallbackQuery("Moved");
      await ctx.editMessageText(moved(guild.name), { parse_mode: "HTML" });
      return;
    }

    if (callback.kind === "stay") {
      const user = await findUser(sql, from.id);
      const guild = user ? guildBySlug(user.guildSlug) : undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(stayed(guild?.name ?? "your guild"), { parse_mode: "HTML" });
      return;
    }

    return await next();
  });
}

async function registerAndAsk(
  ctx: Context,
  sql: Sql,
  guildSlug: string,
  edit = false,
): Promise<void> {
  const from = ctx.from;
  const guild = guildBySlug(guildSlug);
  if (!guild || !from) return;

  await createUser(sql, {
    telegramId: from.id,
    guildSlug,
    firstName: from.first_name,
    username: from.username ?? null,
  });

  const text = welcome(from.first_name, guild.name);
  const options = { parse_mode: "HTML" as const, reply_markup: reminderKeyboard() };
  if (edit) await ctx.editMessageText(text, options);
  else await ctx.reply(text, options);
}
```

- [ ] **Step 2: Write `src/bot/index.ts`**

```typescript
import { Bot } from "grammy";
import type { Sql } from "postgres";
import { installRegistration } from "./registration.ts";
import { installCheckIn } from "./checkin.ts";
import { installReports } from "./reports.ts";

export function createBot(sql: Sql, token: string): Bot {
  const bot = new Bot(token);

  // Registration installs the callback_query:data handler that falls through
  // to the others, so its order matters.
  installRegistration(bot, sql);
  installCheckIn(bot, sql);
  installReports(bot, sql);

  // Any unclaimed callback still needs answering, or the client spins forever.
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  /**
   * An error inside one update must never kill the process. Long polling
   * would otherwise stop for everyone because of one bad message.
   */
  bot.catch((error) => {
    console.error("update failed", error.error);
  });

  return bot;
}

/**
 * FR-17, private-chat half. Group scopes land in Phase 2 along with the group
 * chat itself.
 */
export async function installCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands(
    [
      { command: "log", description: "Log today" },
      { command: "me", description: "My week" },
      { command: "standings", description: "Guild standings" },
    ],
    { scope: { type: "all_private_chats" } },
  );
}
```

- [ ] **Step 3: Write `src/main.ts`**

```typescript
import { createBot, installCommands } from "./bot/index.ts";
import { connect, waitForDatabase } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";
import { syncGuilds } from "./db/users.ts";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is unset");

const sql = connect();
await waitForDatabase(sql);

const applied = await migrate(sql);
if (applied.length > 0) console.log(`applied migrations: ${applied.join(", ")}`);
await syncGuilds(sql);

const bot = createBot(sql, token);
await installCommands(bot);

process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());

await bot.start({
  onStart: (me) => console.log(`@${me.username} polling`),
});

await sql.end();
```

- [ ] **Step 4: Verify it type-checks and starts**

`src/main.ts` imports `./bot/checkin.ts` and `./bot/reports.ts`, which land in
Tasks 8 and 9. Create both as stubs now so the module graph resolves:

```typescript
// src/bot/checkin.ts, replaced in full by Task 8
import type { Bot, Context } from "grammy";
import type { Sql } from "postgres";

export function installCheckIn(_bot: Bot, _sql: Sql): void {}
export async function sendCheckIn(_ctx: Context, _sql: Sql, _telegramId: number): Promise<void> {}
```

```typescript
// src/bot/reports.ts, replaced in full by Task 9
import type { Bot } from "grammy";
import type { Sql } from "postgres";

export function installReports(_bot: Bot, _sql: Sql): void {}
```

Then run:

```bash
bunx tsc --noEmit
bun test
```

Expected: no type errors, and the whole suite still passes.

- [ ] **Step 5: Commit**

```bash
git add src/bot/index.ts src/bot/registration.ts src/bot/checkin.ts src/bot/reports.ts src/main.ts
git commit -m "Add bot core and registration

A guild deep link registers in one tap (FR-1), a bare or unrecognised
payload falls back to the picker (FR-2), and an existing user tapping
another guild's link is asked rather than moved (FR-3).

Every callback is answered, including unclaimed ones, or the client
spinner never stops. bot.catch keeps one bad update from stopping long
polling for everyone."
```

---

### Task 8: Check-in

**Files:**
- Modify: `src/bot/checkin.ts` (replacing the Task 7 stub in full)

**Interfaces:**
- Consumes: `logDay`, `undoDay`, `weekMinutes`, `calendar`, `weekStartOf`, `findUser`, `decode`, `encode`, `confirmation`, `TIER_LABELS`, `isInWindow`.
- Produces:
  - `installCheckIn(bot: Bot, sql: Sql): void`
  - `sendCheckIn(ctx: Context, sql: Sql, telegramId: number): Promise<void>`

- [ ] **Step 1: Replace `src/bot/checkin.ts`**

```typescript
import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { TIER_ORDER, WEEKLY_TARGET_MINUTES, type Tier } from "../config.ts";
import { calendar, weekStartOf } from "../db/calendar.ts";
import { logDay, undoDay, weekMinutes } from "../db/days.ts";
import { findUser } from "../db/users.ts";
import { isInWindow } from "../domain/scoring.ts";
import { confirmation, progressBlock } from "./render.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_ME,
  BUTTON_STANDINGS,
  BUTTON_UNDO,
  BUTTON_YESTERDAY,
  CHECK_IN_PROMPT,
  CHECK_IN_PROMPT_YESTERDAY,
  NOT_REGISTERED,
  OUTSIDE_WINDOW,
  TIER_LABELS,
  UNDO_DONE,
} from "../strings.ts";

/**
 * FR-5. One tier per row, so a tap is unambiguous on a phone, and no
 * confirmation step: the tap itself is the commit.
 *
 * FR-10. Backdating is one extra row, so today stays one tap and yesterday
 * costs two.
 */
function checkInKeyboard(date: string, yesterday: string | null): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const tier of TIER_ORDER) {
    keyboard.text(TIER_LABELS[tier], encode({ kind: "log", date, tier })).row();
  }
  if (yesterday) {
    keyboard.text(BUTTON_YESTERDAY, encode({ kind: "yesterday", date: yesterday }));
  }
  return keyboard;
}

/** The undo button carries the tier this log displaced, so FR-9 can put it
 *  back rather than merely deleting the day. See design 4.5. */
function afterLogKeyboard(date: string, displaced: Tier | null): InlineKeyboard {
  return new InlineKeyboard()
    .text(BUTTON_UNDO, encode({ kind: "undo", date, restore: displaced }))
    .text(BUTTON_ME, encode({ kind: "me" }))
    .text(BUTTON_STANDINGS, encode({ kind: "standings" }));
}

/** FR-6. The same check-in message, on demand. Also reused after registration. */
export async function sendCheckIn(ctx: Context, sql: Sql, telegramId: number): Promise<void> {
  const user = await findUser(sql, telegramId);
  if (!user) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }
  const { today, yesterday } = await calendar(sql);
  await ctx.reply(CHECK_IN_PROMPT, {
    parse_mode: "HTML",
    reply_markup: checkInKeyboard(today, yesterday),
  });
}

export function installCheckIn(bot: Bot, sql: Sql): void {
  bot.command("log", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    await sendCheckIn(ctx, sql, ctx.from.id);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || !from) return await next();

    if (callback.kind === "yesterday") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(CHECK_IN_PROMPT_YESTERDAY, {
        parse_mode: "HTML",
        reply_markup: checkInKeyboard(callback.date, null),
      });
      return;
    }

    // Offered after an undo, to log the same day again.
    if (callback.kind === "checkin") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(CHECK_IN_PROMPT, {
        parse_mode: "HTML",
        reply_markup: checkInKeyboard(callback.date, null),
      });
      return;
    }

    if (callback.kind === "log") {
      const user = await findUser(sql, from.id);
      if (!user) {
        await ctx.answerCallbackQuery(NOT_REGISTERED);
        return;
      }

      // FR-26. Nothing outside the competition window is ever written.
      if (!isInWindow(callback.date)) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(OUTSIDE_WINDOW);
        return;
      }

      const { displaced } = await logDay(sql, from.id, callback.date, callback.tier);
      await ctx.answerCallbackQuery("Logged");

      const weekStart = await weekStartOf(sql, callback.date);
      const minutes = await weekMinutes(sql, from.id, weekStart);
      await ctx.editMessageText(
        confirmation(callback.tier, minutes, WEEKLY_TARGET_MINUTES),
        {
          parse_mode: "HTML",
          reply_markup: afterLogKeyboard(callback.date, displaced),
        },
      );
      return;
    }

    if (callback.kind === "undo") {
      // FR-9. Restores the displaced tier when the log overwrote one, so the
      // exact prior weekly total comes back rather than merely vanishing.
      await undoDay(sql, from.id, callback.date, callback.restore);
      await ctx.answerCallbackQuery("Removed");

      const weekStart = await weekStartOf(sql, callback.date);
      const minutes = await weekMinutes(sql, from.id, weekStart);
      await ctx.editMessageText(
        `${UNDO_DONE}\n\n${progressBlock(minutes, WEEKLY_TARGET_MINUTES)}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("Log again", encode({ kind: "checkin", date: callback.date })),
        },
      );
      return;
    }

    return await next();
  });
}
```

- [ ] **Step 2: Run the tests**

Run: `bun test && bunx tsc --noEmit`
Expected: PASS with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/checkin.ts
git commit -m "Add the one-tap check-in

One tap commits with no confirmation step (FR-5), and the tap's own
callback carries the date and tier, so a restart cannot orphan a
pending message. Backdating is a second keyboard row, keeping today at
one tap and yesterday at two (FR-10).

The undo button carries the tier the log displaced, so undo restores
the exact prior weekly total (FR-9). A date outside the competition
window is refused rather than written (FR-26)."
```

---

### Task 9: `/me` and `/standings`

**Files:**
- Modify: `src/bot/reports.ts` (replacing the Task 7 stub in full)

**Interfaces:**
- Consumes: `standings`, `neighbours`, `weeklyTotals`, `weekMinutes`, `calendar`, `findUser`, `weeklyStreak`, `meMessage`, `standingsMessage`.
- Produces: `installReports(bot: Bot, sql: Sql): void`

- [ ] **Step 1: Replace `src/bot/reports.ts`**

```typescript
import type { Bot, Context } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_START, GUILDS, WEEKLY_TARGET_MINUTES, guildBySlug } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { weekMinutes } from "../db/days.ts";
import { neighbours, standings, weeklyTotals } from "../db/standings.ts";
import { findUser } from "../db/users.ts";
import { weeklyStreak } from "../domain/scoring.ts";
import { meMessage, standingsMessage } from "./render.ts";
import { decode } from "./callbacks.ts";
import { NOT_REGISTERED } from "../strings.ts";

/** FR-14. Read-only: this path performs no write of any kind. */
async function replyMe(ctx: Context, sql: Sql, telegramId: number): Promise<void> {
  const user = await findUser(sql, telegramId);
  if (!user) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }

  const { today, weekStart } = await calendar(sql);
  const [minutes, totals, week, around] = await Promise.all([
    weekMinutes(sql, telegramId, weekStart),
    weeklyTotals(sql, telegramId),
    standings(sql, weekStart, today),
    neighbours(sql, telegramId, user.guildSlug, weekStart, today),
  ]);

  const rank = week.findIndex((row) => row.slug === user.guildSlug) + 1;
  const guild = guildBySlug(user.guildSlug);

  await ctx.reply(
    meMessage({
      weekMinutes: minutes,
      target: WEEKLY_TARGET_MINUTES,
      streak: weeklyStreak(totals, weekStart),
      guildName: guild?.name ?? user.guildSlug,
      guildRank: rank > 0 ? rank : GUILDS.length,
      guildCount: week.length,
      neighbours: around,
    }),
    { parse_mode: "HTML" },
  );
}

/** FR-16. The weekly table first, then the season, both per member. */
async function replyStandings(ctx: Context, sql: Sql): Promise<void> {
  const { today, weekStart } = await calendar(sql);
  const [week, season] = await Promise.all([
    standings(sql, weekStart, today),
    standings(sql, COMPETITION_START, today),
  ]);
  await ctx.reply(standingsMessage({ week, season }), { parse_mode: "HTML" });
}

export function installReports(bot: Bot, sql: Sql): void {
  bot.command("me", async (ctx) => {
    if (!ctx.from) return;
    await replyMe(ctx, sql, ctx.from.id);
  });

  bot.command("standings", async (ctx) => {
    await replyStandings(ctx, sql);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    if (!callback || !ctx.from) return await next();

    if (callback.kind === "me") {
      await ctx.answerCallbackQuery();
      await replyMe(ctx, sql, ctx.from.id);
      return;
    }
    if (callback.kind === "standings") {
      await ctx.answerCallbackQuery();
      await replyStandings(ctx, sql);
      return;
    }
    return await next();
  });
}
```

- [ ] **Step 2: Check the season window against FR-26**

`replyStandings` passes `COMPETITION_START` as the season's lower bound and
today as its upper bound. Confirm by reading `src/config.ts` that
`COMPETITION_START` is the same constant `isInWindow` defaults to, so the
season table can never include a date the check-in path would have refused.

- [ ] **Step 3: Run the tests**

Run: `bun test && bunx tsc --noEmit`
Expected: PASS with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/bot/reports.ts
git commit -m "Add /me and /standings

Both paths are read-only (FR-14). /me shows weekly progress, the streak
in weeks, and the rank of the user's guild among guilds, plus the
neighbours FR-15 permits. Nothing returns a global list of individuals.

/standings puts the weekly table before the season table, so a guild
ninth for the season can still be seen winning the week."
```

---

### Task 10: Deployment and the manual smoke checklist

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `scripts/dump.sh`, `scripts/restore.sh`, `docs/SMOKE.md`
- Modify: `docker-compose.yml` (adding the `bot` service)

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
.git
.env
docs
prototype
tests
*.md
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

USER bun

CMD ["bun", "run", "src/main.ts"]
```

If `bun install` produced `bun.lockb` rather than `bun.lock`, change the `COPY`
line to match the file that actually exists in the repository.

- [ ] **Step 3: Add the `bot` service to `docker-compose.yml`**

Insert above the existing `db` service. NFR-1: no ports, outbound only.

```yaml
  bot:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      BOT_TOKEN: ${BOT_TOKEN:?set BOT_TOKEN in .env}
      DATABASE_URL: postgres://bot:${POSTGRES_PASSWORD}@db:5432/bot
    restart: unless-stopped
```

- [ ] **Step 4: Write the backup scripts**

NFR-3 files nightly backups under Phase 4. These two exist now because moving
from the home server to guild hosting is a dump and a restore.

`scripts/dump.sh`:

```bash
#!/usr/bin/env bash
# Writes a timestamped dump to ./backups. Phase 4 adds the nightly cron and
# ships the file off the machine, which is the part that actually protects a
# running competition (NFR-3).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/bot-$(date +%Y%m%d-%H%M%S).sql"

docker compose exec -T db pg_dump -U bot -d bot --clean --if-exists > "$out"
echo "wrote $out"
```

`scripts/restore.sh`:

```bash
#!/usr/bin/env bash
# Restores a dump into the running database, replacing its contents.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <dump.sql>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
docker compose exec -T db psql -U bot -d bot -v ON_ERROR_STOP=1 < "$1"
echo "restored from $1"
```

Then: `chmod +x scripts/dump.sh scripts/restore.sh`

- [ ] **Step 5: Verify the containers build and come up**

```bash
cp .env.example .env   # then fill in a real BOT_TOKEN and POSTGRES_PASSWORD
docker compose build
docker compose up -d
docker compose ps
docker compose logs bot
```

Expected: `db` healthy, `bot` running, and the bot log showing
`applied migrations: 001_initial.sql` on the first start followed by
`@yourbot polling`. Restart with `docker compose restart bot` and confirm the
second start applies no migrations.

- [ ] **Step 6: Write `docs/SMOKE.md`**

The automated suite covers scoring, queries, callbacks, and rendering. It
cannot cover a real person tapping a real button, which is what SPEC.md §10
requires before Phase 1 is done.

```markdown
# Phase 1 smoke checklist

Automated tests cover scoring, queries, callback encoding and rendering.
This is the part they cannot: two people, two phones, one real bot.

Run through it against a bot whose `COMPETITION_START` and `COMPETITION_END`
contain today. Nothing here is done until every box is ticked.

## Registration

- [ ] `t.me/<bot>?start=prodeko` on a fresh account registers to Prodeko in one
      tap and immediately asks the reminder question (FR-1, FR-4)
- [ ] The reminder question offers hours and a decline, and declining is
      accepted without nagging (FR-4)
- [ ] The message after choosing states the 150 minute target and says that
      your first name and activity are visible to others in your guild
- [ ] A bare `/start` on a second fresh account shows all nine guilds (FR-2)
- [ ] Tapping a guild in that list registers you (FR-2)
- [ ] Opening a *different* guild's link as an existing user offers Move and
      Stay, and Stay leaves the guild unchanged (FR-3)
- [ ] Move actually moves you, and your logged days come with you (FR-3)

## Check-in

- [ ] `/log` produces the check-in message at any time of day (FR-6)
- [ ] One tap logs, with no confirmation step, and the message edits in place
      into the confirmation (FR-5)
- [ ] The confirmation shows minutes this week against 150 with a bar (FR-12)
- [ ] Logging a second time the same day replaces rather than adds: log
      `15 to 30`, then `60+`, and confirm the week shows 75 more than before,
      not 97 (FR-7)
- [ ] Undo after that overwrite puts the week back exactly where it was before
      the second log (FR-9, design 4.5)
- [ ] Undo on a fresh log removes the day entirely (FR-9)
- [ ] `Not today` records a rest day, shows zero minutes added, and reads as
      permitted rather than as a failure (FR-8)
- [ ] `Log yesterday instead` writes to yesterday, and logging yesterday twice
      replaces rather than adds (FR-10, FR-7)

## Reading

- [ ] `/me` shows weekly progress, the streak in weeks, and your guild's rank
      among guilds (FR-14)
- [ ] `/me` shows you as "you" with at most one person either side, and no
      global list of individuals appears anywhere in the bot (FR-15)
- [ ] `/standings` shows the weekly table first, then the season, both as
      minutes per member (FR-16)
- [ ] The command menu in a private chat offers `/log`, `/me` and `/standings`

## The numbers

- [ ] Hand-calculate one guild's weekly minutes from what the two test accounts
      logged, divide by that guild's member count in `src/config.ts`, and
      confirm `/standings` matches. This is SPEC.md §10's "done when" for
      Phase 1
- [ ] A guild with nobody registered still appears in the table, at zero

## Survival

- [ ] `docker compose restart bot` mid-session, then tap a button on a message
      sent *before* the restart. It must still work (NFR-5)
- [ ] `scripts/dump.sh` writes a dump, `docker compose down -v` destroys the
      volume, `docker compose up -d` plus `scripts/restore.sh` brings the same
      standings back
```

- [ ] **Step 7: Run the full suite one last time**

```bash
bun test
bunx tsc --noEmit
docker compose config --quiet && echo "compose config valid"
```

Expected: all tests pass, no type errors, compose config valid.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml scripts/ docs/SMOKE.md
git commit -m "Add deployment and the manual smoke checklist

Two containers, neither publishing a port, per NFR-1 and NFR-2. The bot
waits for a healthy database and applies migrations at startup, so a
restart applies nothing and loses nothing.

The dump and restore scripts are ahead of NFR-3's phase because moving
from the home server to guild hosting is a dump and a restore. The
nightly cron and off-machine shipping stay in Phase 4.

SMOKE.md is the part the automated suite cannot reach: two people on
real phones, which is SPEC.md section 10's own done-when for Phase 1."
```

---

## Requirement coverage

Checked against SPEC.md section 5. Every Phase 1 requirement maps to a task.

| Requirement | Task | Verified by |
|---|---|---|
| FR-1 guild deep links | 7 | SMOKE.md |
| FR-2 fallback registration | 7 | SMOKE.md |
| FR-3 idempotent re-registration | 3, 7 | `users.test.ts`, SMOKE.md |
| FR-4 reminder choice at signup | 3, 7 | `users.test.ts`, SMOKE.md |
| FR-5 one-tap check-in | 8 | SMOKE.md |
| FR-6 `/log` pull path | 8 | SMOKE.md |
| FR-7 one record per person per day | 2, 4 | `migrate.test.ts`, `days.test.ts` |
| FR-8 rest day | 1, 4, 6 | `scoring.test.ts`, `days.test.ts`, `render.test.ts` |
| FR-9 undo | 4, 8 | `days.test.ts`, SMOKE.md |
| FR-10 backdating | 4, 8 | `days.test.ts`, SMOKE.md |
| FR-12 progress on every confirmation | 1, 6 | `scoring.test.ts`, `render.test.ts` |
| FR-13 weekly streak | 1, 5 | `scoring.test.ts`, `standings.test.ts` |
| FR-14 `/me` | 9 | `render.test.ts`, SMOKE.md |
| FR-15 no global individual leaderboard | 5, 6, 9 | `standings.test.ts`, `render.test.ts` |
| FR-16 guild standings | 5, 6, 9 | `standings.test.ts`, `render.test.ts` |
| FR-17 command scopes (private half) | 7 | SMOKE.md |
| FR-25 configuration in version control | 1, 3 | `scoring.test.ts`, `users.test.ts` |
| FR-26 competition window | 1, 8 | `scoring.test.ts`, SMOKE.md |
| FR-27 English only | 6 | Review of `src/strings.ts` |
| NFR-1 single process, outbound only | 10 | `docker-compose.yml` review |
| NFR-2 two containers | 10 | Step 5 of Task 10 |
| NFR-4 no debug endpoints | all | Review: no such path is written |
| NFR-5 restart safety | 2, 6, 10 | `migrate.test.ts`, `callbacks.test.ts`, SMOKE.md |

**FR-11 (optional tag) is deliberately absent.** The `days.tag` column exists
from Task 2, and the UI is Phase 4 per SPEC.md §10.

## Carried forward to Phase 3

Two things surfaced while writing this plan that Phase 1 cannot resolve.

1. **`NOT u.blocked` erases history, not just contact.** The standings query in
   SPEC.md §6 excludes blocked users' days from their guild's total. Blocking
   the bot is a statement about being messaged, not a retraction of activity
   already logged, and the exclusion also silently lowers a guild's numbers
   without lowering its denominator. Phase 1 never sets `blocked`, so it cannot
   fire. Decide before FR-23 lands.
2. **`/remind` is promised by copy that ships in Phase 1.** `reminderSet` tells
   the user to change their hour with `/remind`, and the command arrives with
   FR-24 in Phase 3. If Phase 3 slips past the start of real use, cut that
   sentence from `src/strings.ts` rather than shipping a lie.

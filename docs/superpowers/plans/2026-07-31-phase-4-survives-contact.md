# Phase 4 Implementation Plan: It Survives Contact

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a dump of this bot's database restores into an empty database and reproduces every published number exactly (SPEC.md §10 Phase 4's acceptance test), harden `decode()` against trailing junk, and record that NFR-3 is satisfied by the deployment target rather than by code here.

**Architecture:** Almost all of this phase is tests and documents. Exactly one function in `src/` changes: `decode()` in `src/bot/callbacks.ts` gains a round-trip assertion. The deliverable is a new `tests/db/restore.test.ts` that creates two real PostgreSQL databases in the `db-test` container, seeds one, dumps it, restores into the other, and asserts the recomputed derived surface is deeply equal. Because no total is ever stored (SPEC.md §4.4), every published number is a pure function of `guilds`, `users` and `days`, so fidelity is a deep-equality assertion rather than a row diff.

**Tech Stack:** Bun test, postgres.js 3.4.9, PostgreSQL 17 in Docker Compose (`db-test` service), `pg_dump` / `pg_restore` / `psql` executed inside that container.

**Design:** [docs/superpowers/specs/2026-07-31-telegram-bot-phase-4-design.md](../specs/2026-07-31-telegram-bot-phase-4-design.md). Cite it in comments as "phase 4 design N.N".

## Global Constraints

These apply to every task. They are the project's standing rules, not this phase's inventions.

- **No em dashes or en dashes anywhere**, including comments, copy and commit messages. Use commas, colons, parentheses, or restructure.
- **Imports carry explicit `.ts` extensions**; types are imported with `import type` (`verbatimModuleSyntax`).
- **`strict` and `noUncheckedIndexedAccess` are on**, so indexed access needs a guard or a justified `!`.
- **Comments explain *why*, cite the requirement ID** (FR-x, NFR-x, design 4.x, phase 4 design N.N), and record rejected alternatives. Match the existing density; it is the house style.
- **No total is ever stored.** `days.tier` is the only ground truth (SPEC.md §4.4).
- **No `NOT u.blocked` in any scoring query.** `blocked` gates outbound messaging and never scoring.
- **NFR-4: no code path may write activity data without a real user action, in any build.** The fixture in Task 2 stays inside `tests/`. It must not become a script, a CLI command, or an export from `src/`.
- **Size ceiling 2,000 effective lines in `src/`** (NFR-6). Currently 1,916. This phase adds about 5. Count with:
  ```bash
  find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
  ```
- **Baseline to preserve:** `bun run test:db` reports **242 pass, 0 fail**, and `bunx tsc --noEmit` exits 0. Verified at `f9b1c35`.
- **Tests need the `db-test` container.** `bun run test:db` starts it and then runs `bun test`. Plain `bun test` fails on `tests/db/*` without it.
- **Never run the `test` compose profile on a production host.**

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/bot/callbacks.ts` | Modify `decode()` only: add the round-trip assertion before returning | 1 |
| `tests/bot/callbacks.test.ts` | Add trailing-junk rejection tests, one per callback kind | 1 |
| `tests/db/restore.test.ts` | **New.** The whole restore-fidelity test: database helpers, fixture, derived-surface capture, both dump formats | 2, 3 |
| `SPEC.md` | §9 Q5, NFR-2, NFR-3, §10 Phase 4, §7 note | 4 |
| `docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md` | §3.5 narrative correction | 4 |
| `README.md` | Deploy rewritten for pannu plus Azure PG, plus the infra handover | 5 |
| `CLAUDE.md` | Phase status, ceiling figure, compose-is-not-production | 6 |

**Verified mechanics** (these commands were run against the real container while writing this plan, do not re-derive them):

- `docker compose exec -T db-test <cmd>` works **without** `--profile test`.
- Multiple statements in a single `psql -c` run inside an implicit transaction, so `CREATE DATABASE` fails there. Use **one `-c` per statement**; each `-c` gets its own transaction.
- `DROP DATABASE IF EXISTS x WITH (FORCE)` is supported on PostgreSQL 17 and evicts stale connections.
- postgres.js can issue `CREATE DATABASE` / `DROP DATABASE` via `sql.unsafe(...)`, because it does not wrap statements in a transaction.
- The host has **no** `pg_dump`, `pg_restore` or `psql`. They exist only inside the container.

---

### Task 1: `decode()` rejects payloads it would not itself have produced

**Files:**
- Modify: `src/bot/callbacks.ts:52-104` (the `decode` function)
- Test: `tests/bot/callbacks.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature change. `decode(data: string): Callback | null` keeps its exact type. Behaviour narrows: payloads that decode to a callback whose `encode()` differs from the input now return `null`.

**Why:** `decode("remind:20:30")` currently returns `{ kind: "remind", hour: 20 }`. `data.split(":")` destructures only three parts and the rest is discarded silently. The same holds for `guild`, `move`, `bind`, `yesterday`, `checkin`, `hour` and `log`, so seven kinds share one hole. A single `data === encode(result)` assertion closes all of them, because `encode` is total over `Callback` and already the inverse of the intended parse. Parked as a one-liner by the Phase 3 final review; phase 4 design 5.1.

**Deliberate consequence to preserve:** `decode("hour:07")` becomes `null`. It previously returned `{ kind: "hour", hour: 7 }`, but `encode` produces `"hour:7"`, so `"hour:07"` is a payload no build of this bot has ever sent. Rejecting it is the point, not a regression.

- [ ] **Step 1: Write the failing tests**

Add this describe block to the end of `tests/bot/callbacks.test.ts`:

```ts
// Phase 4 design 5.1. decode() destructures only the first three colon-separated
// parts, so every kind silently ignored trailing junk: decode("remind:20:30")
// returned a valid remind. Harmless in itself, since a forged payload can only
// set the forger's own hour to a range-checked value, but it meant seven kinds
// each had their own unchecked tail. One round-trip assertion closes all seven,
// which is why this is tested per kind rather than once.
describe("decode rejects anything it would not itself have encoded", () => {
  test("every kind rejects a trailing segment", () => {
    for (const bad of [
      "guild:prodeko:extra",
      "move:tik:extra",
      "bind:prodeko:extra",
      "hour:20:extra",
      "remind:20:30",
      "yesterday:2026-07-29:extra",
      "checkin:2026-07-30:extra",
      "log:2026-07-30:short:extra",
      "undo:2026-07-30:medium:extra",
    ]) {
      expect(decode(bad)).toBeNull();
    }
  });

  // "off" is the encoded form of hour: null for both kinds, so the round-trip
  // has to survive the null case rather than only the numeric one.
  test("the off payloads still decode", () => {
    expect(decode("hour:off")).toEqual({ kind: "hour", hour: null });
    expect(decode("remind:off")).toEqual({ kind: "remind", hour: null });
  });

  // encode() emits "hour:7", never "hour:07", so a zero-padded hour is a payload
  // no build of this bot has sent. Pinned rather than left implicit: it is the
  // one input whose behaviour this change deliberately alters.
  test("a zero-padded hour is not a payload this bot produces", () => {
    expect(decode("hour:07")).toBeNull();
    expect(decode("hour:7")).toEqual({ kind: "hour", hour: 7 });
  });

  test("every sample still round-trips, so the assertion is not too strict", () => {
    for (const sample of SAMPLES) {
      expect(decode(encode(sample))).toEqual(sample);
    }
    for (const sample of [
      { kind: "remind", hour: 20 },
      { kind: "remind", hour: 0 },
      { kind: "remind", hour: null },
      { kind: "keep" },
    ] as const satisfies readonly Callback[]) {
      expect(decode(encode(sample))).toEqual(sample);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test tests/bot/callbacks.test.ts
```

Expected: FAIL. `"every kind rejects a trailing segment"` fails on the first entry, because `decode("guild:prodeko:extra")` currently returns `{ kind: "guild", slug: "prodeko" }`. The `"the off payloads still decode"` and round-trip tests should already PASS; if either fails, stop and report, because the change has not been made yet and those describe current behaviour.

- [ ] **Step 3: Implement the round-trip assertion**

In `src/bot/callbacks.ts`, rename the existing `decode` to a private `parse` and wrap it. Replace line 51 (`/** Returns null for anything malformed. ... */`) and the `export function decode(data: string): Callback | null {` line so the file reads:

```ts
/**
 * Returns null for anything malformed. Callback data is user-controllable.
 *
 * Phase 4 design 5.1. The parse below destructures only the first three
 * colon-separated parts, so on its own it accepts trailing junk on seven of the
 * kinds: "remind:20:30" parsed as a valid remind for 20:00. Rather than add a
 * length check to each branch, decode() re-encodes what it parsed and demands
 * the result be identical to the input. encode() is total over Callback and is
 * already the inverse of this parse, so one assertion closes every kind at once
 * and cannot drift out of step with a new one.
 *
 * Rejected: checking `data.split(":").length` per branch. It is the same test
 * written nine times, and a tenth kind added later would silently not have it.
 */
export function decode(data: string): Callback | null {
  const parsed = parse(data);
  // A payload this bot would not itself have produced is not one it should act
  // on. "hour:07" is the only realistic example, and encode() emits "hour:7".
  return parsed && encode(parsed) === data ? parsed : null;
}

function parse(data: string): Callback | null {
```

Leave the entire body of the original function unchanged below that line.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test tests/bot/callbacks.test.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the full suite and the typecheck**

```bash
bun run test:db && bunx tsc --noEmit
```

Expected: **246 pass, 0 fail**. That is the 242 baseline plus the 4 tests added in Step 1. If the total is 246 but some other file's count moved, something else changed: investigate rather than accepting the total. `tsc` exits 0.

If any pre-existing test now fails, the assertion is too strict. Do not loosen it blindly: report which payload broke, because a real handler emitting a payload `encode` cannot reproduce is a defect in that handler, not in this assertion.

- [ ] **Step 6: Check the ceiling**

```bash
find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
```

Expected: about 1,921, and in any case under 2,000.

- [ ] **Step 7: Commit**

```bash
git add src/bot/callbacks.ts tests/bot/callbacks.test.ts
git commit -m "decode() rejects payloads it would not itself have encoded

Seven callback kinds silently ignored trailing segments, because
decode() destructures only the first three colon-separated parts:
decode(\"remind:20:30\") returned a valid remind for 20:00.

One round-trip assertion closes all of them. encode() is total over
Callback and already the inverse of the parse, so a kind added later
inherits the check instead of needing its own.

Deliberate: \"hour:07\" is now null. encode() emits \"hour:7\", so the
padded form is a payload no build of this bot has ever sent.

Parked by the Phase 3 final review. Phase 4 design 5.1."
```

---

### Task 2: The restore-fidelity test, directory format

**Files:**
- Create: `tests/db/restore.test.ts`

**Interfaces:**
- Consumes: `migrate(sql)`, `syncGuilds(sql)`, `createUser(sql, { telegramId, guildSlug, firstName, username? })`, `logDay(sql, telegramId, date, tier)`, `weekMinutes(sql, telegramId, weekStart)`, `standings(sql, from, to)`, `neighbours(sql, telegramId, guildSlug, from, to)`, `participation(sql, guildSlug, from, to)`, `weeklyTotals(sql, telegramId)`, `weeklyStreak(weeks, currentWeekStart, target?)`. All exist unchanged on `main`.
- Produces: `Surface`, `captureSurface`, `seedFixture`, `createDatabase`, `dropDatabase`, `inContainer`, `urlFor`, all file-local. Task 3 reuses them.

**Why:** SPEC.md §10 Phase 4's acceptance test is *"the backup restores into an empty database and reproduces the standings exactly"*. This is the only gate in the project that can be automated. Phase 4 design §4.

**Design constraints this task must honour:**
- Real **databases**, not schemas (design 4.1). §10 says "an empty database" and the TiK backup dumps per database, so a schema-scoped test would exercise a path nobody runs. This is the one deliberate departure from the `freshDatabase("<name>")` convention.
- **Non-triviality is asserted before any comparison** (design 4.2). An empty fixture would make deep equality hold vacuously.
- **Fails loudly, never skips** (design 4.4).
- The fixture **stays in `tests/`** (design 4.5, NFR-4).

- [ ] **Step 1: Write the failing test**

Create `tests/db/restore.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres, { type Sql } from "postgres";
import { migrate } from "../../src/db/migrate.ts";
import { createUser, syncGuilds } from "../../src/db/users.ts";
import { logDay, weekMinutes } from "../../src/db/days.ts";
import {
  neighbours,
  participation,
  standings,
  weeklyTotals,
  type GuildStanding,
  type Neighbour,
} from "../../src/db/standings.ts";
import { weeklyStreak } from "../../src/domain/scoring.ts";

/**
 * NFR-3, and SPEC.md section 10 Phase 4's acceptance test: "the backup restores
 * into an empty database and reproduces the standings exactly".
 *
 * This is the only gate in the project that can be automated. docs/SMOKE.md
 * needs two real Telegram accounts and two overnight waits; this needs neither.
 *
 * Because no total is ever stored (SPEC.md section 4.4), every published number
 * is a pure function of guilds, users and days plus config. So "reproduces the
 * standings exactly" is a deep equality assertion on recomputed output rather
 * than a row-by-row diff, which is a stronger check for less code: a dump that
 * lost a single tier would change a number here.
 *
 * Phase 4 design 4.1. This file uses real databases rather than the project's
 * usual freshDatabase("<name>") schema isolation, because section 10 says "an
 * empty database" and the backup this protects (Tietokilta/infra's
 * stage-postgresql.sh) dumps per database. A schema-scoped test would exercise
 * a path nobody runs.
 */

const BASE_URL = process.env.TEST_DATABASE_URL
  ?? "postgres://bot:test@localhost:5433/bot_test";

const SOURCE_DB = "restore_source";
const TARGET_DB = "restore_target";

const WEEK_FROM = "2026-07-27";
const WEEK_TO = "2026-08-02";
const SEASON_FROM = "2026-07-27";
const SEASON_TO = "2026-09-20";

/** The repository root, so `docker compose` finds docker-compose.yml. */
const REPO_ROOT = new URL("../../", import.meta.url).pathname;

function urlFor(database: string): string {
  const url = new URL(BASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Runs a command inside the db-test container.
 *
 * The host has no pg_dump, pg_restore or psql; they exist only in the container,
 * at the same major version as the server. Driving them through `docker compose
 * exec` matches `bun run test:db`, which already starts that container before
 * `bun test`.
 *
 * Phase 4 design 4.4: this throws rather than skipping when Docker is missing.
 * A backup test that quietly skips itself is indistinguishable from a passing
 * one in a summary line, which is the exact failure NFR-3 exists to prevent.
 */
async function inContainer(argv: string[]): Promise<string> {
  let proc;
  try {
    proc = Bun.spawn(["docker", "compose", "exec", "-T", "db-test", ...argv], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (cause) {
    throw new Error(
      "could not run `docker compose`, which this test needs for pg_dump and "
        + "pg_restore. Start the database with `bun run test:db`. This test "
        + "fails rather than skipping on purpose: see phase 4 design 4.4.",
      { cause },
    );
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`db-test \`${argv.join(" ")}\` exited ${code}: ${stderr}`);
  }
  return stdout;
}

/**
 * One statement per -c. Multiple statements in a single -c run inside an
 * implicit transaction block, and CREATE DATABASE cannot run in one.
 */
async function createDatabase(name: string): Promise<void> {
  await dropDatabase(name);
  await inContainer(["psql", "-U", "bot", "-d", "bot_test", "-q", "-c", `CREATE DATABASE ${name}`]);
}

/** WITH (FORCE) evicts a connection a failed run left behind. PostgreSQL 13+. */
async function dropDatabase(name: string): Promise<void> {
  await inContainer([
    "psql", "-U", "bot", "-d", "bot_test", "-q",
    "-c", `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`,
  ]);
}

/**
 * Spans what the standings actually read: two guilds with registered users and
 * one without, every tier including an explicit rest (FR-8), a day that
 * displaces an earlier tier (FR-7), and both edges of the competition window.
 *
 * Alice clears the 150 minute target in the first week so the streak is 1
 * rather than 0, because a zero streak would survive a dump that lost every
 * row and prove nothing.
 *
 * NFR-4: this seeds activity data and therefore stays in tests/. It must not
 * become a script, a CLI command, or an export from src/. SPEC.md section 2
 * defect 3 is what that rule protects against.
 */
async function seedFixture(sql: Sql): Promise<void> {
  await syncGuilds(sql);
  await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
  await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
  await createUser(sql, { telegramId: 3, guildSlug: "tik", firstName: "Carol" });

  // Alice: 45 + 75 + 45 = 165, over the 150 target, so weeklyStreak returns 1.
  await logDay(sql, 1, "2026-07-27", "medium"); // first day of the window
  await logDay(sql, 1, "2026-07-28", "long");
  await logDay(sql, 1, "2026-07-29", "medium");

  // Bob: a short, plus an explicit rest that must survive as a row worth zero.
  await logDay(sql, 2, "2026-07-28", "short");
  await logDay(sql, 2, "2026-07-30", "rest");

  // Carol: the last day of the window, and a tier displaced by a second log
  // on the same date (FR-7), so the dump carries the replacement not the sum.
  await logDay(sql, 3, "2026-09-20", "short");
  await logDay(sql, 3, "2026-09-20", "long");
}

interface Surface {
  week: GuildStanding[];
  season: GuildStanding[];
  neighbours: Neighbour[];
  aliceWeekMinutes: number;
  aliceStreak: number;
  prodekoParticipation: number;
}

/** Every published number, recomputed from whatever rows are present. */
async function captureSurface(sql: Sql): Promise<Surface> {
  return {
    week: await standings(sql, WEEK_FROM, WEEK_TO),
    season: await standings(sql, SEASON_FROM, SEASON_TO),
    neighbours: await neighbours(sql, 1, "prodeko", WEEK_FROM, WEEK_TO),
    aliceWeekMinutes: await weekMinutes(sql, 1, WEEK_FROM),
    aliceStreak: weeklyStreak(await weeklyTotals(sql, 1), WEEK_FROM),
    prodekoParticipation: await participation(sql, "prodeko", WEEK_FROM, WEEK_TO),
  };
}

let source: Sql;
let original: Surface;

beforeAll(async () => {
  await createDatabase(SOURCE_DB);
  source = postgres(urlFor(SOURCE_DB), { max: 2, onnotice: () => {} });
  await migrate(source);
  await seedFixture(source);
  original = await captureSurface(source);
});

afterAll(async () => {
  await source?.end();
  await dropDatabase(SOURCE_DB);
  await dropDatabase(TARGET_DB);
});

describe("the fixture is worth comparing (phase 4 design 4.2)", () => {
  // If the seed silently failed, both sides of every comparison below would be
  // empty, deep equality would hold, and the test would pass while proving
  // nothing. A vacuously passing backup test is worse than none, because it
  // converts an unknown into a false assurance. So the fixture is pinned first.
  test("has non-zero minutes, a real streak and a neighbour list", () => {
    expect(original.week.some((row) => row.minutes > 0)).toBe(true);
    expect(original.season.some((row) => row.minutes > 0)).toBe(true);
    expect(original.aliceWeekMinutes).toBe(165);
    expect(original.aliceStreak).toBe(1);
    expect(original.neighbours.length).toBeGreaterThan(1);
    expect(original.prodekoParticipation).toBeGreaterThan(0);
  });

  // Hand-calculated: Alice 165 + Bob 22 = 187 in the week, and Carol's 75 lands
  // outside it. The season adds Carol's displaced-then-replaced long.
  test("the hand-calculated totals are what the fixture actually produces", () => {
    const prodekoWeek = original.week.find((row) => row.slug === "prodeko");
    const tikSeason = original.season.find((row) => row.slug === "tik");
    expect(prodekoWeek?.minutes).toBe(187);
    expect(tikSeason?.minutes).toBe(75);
  });
});

describe("restore fidelity, directory format (NFR-3, SPEC.md section 10)", () => {
  // This is the format Tietokilta/infra's stage-postgresql.sh actually runs:
  // pg_dump --format=directory --compress=none, restored with pg_restore. It is
  // therefore the path whose failure loses a competition.
  test("a directory dump restores into an empty database and reproduces every number", async () => {
    await inContainer(["sh", "-c", "rm -rf /tmp/restore-dir"]);
    await inContainer([
      "pg_dump", "-U", "bot", "-d", SOURCE_DB,
      "--format=directory", "--compress=none", "-f", "/tmp/restore-dir",
    ]);

    await createDatabase(TARGET_DB);
    await inContainer(["pg_restore", "-U", "bot", "-d", TARGET_DB, "/tmp/restore-dir"]);

    const target = postgres(urlFor(TARGET_DB), { max: 2, onnotice: () => {} });
    try {
      const restored = await captureSurface(target);
      expect(restored).toEqual(original);
    } finally {
      await target.end();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run test:db 2>&1 | tail -20
```

Expected: FAIL, and the failure must be a real one. The most likely first failure is a mismatch in the hand-calculated totals, since those numbers are asserted rather than derived.

**Do not adjust the assertion to match the output without checking the arithmetic first.** Verify by hand: `TIER_MINUTES` is `short: 22, medium: 45, long: 75, rest: 0` in `src/config.ts`. Alice logs medium + long + medium inside `2026-07-27` to `2026-08-02`, so 45 + 75 + 45 = 165. Bob logs short (22) and rest (0), so 22. Prodeko's week is 187. Carol logs short then long on `2026-09-20`, and FR-7 makes the second replace the first, so TiK's season is 75 and not 97. If the code disagrees with that arithmetic, the defect is in the code, not the test.

- [ ] **Step 3: Make it pass**

There is no implementation to write: the queries already exist and the dump path was verified while planning. If the test fails, it is one of:
- a wrong constant in the fixture, corrected against the arithmetic in Step 2;
- `docker compose` not running, fixed with `bun run test:db` rather than by adding a skip;
- a genuine fidelity defect, which is the finding this task exists to produce. Report it rather than working around it.

- [ ] **Step 4: Run the full suite and the typecheck**

```bash
bun run test:db && bunx tsc --noEmit
```

Expected: all tests pass, `0 fail`. `tsc` exits 0.

- [ ] **Step 5: Verify the test cannot pass vacuously**

Temporarily comment out the body of `seedFixture` (leave `syncGuilds`), re-run, and confirm the `"the fixture is worth comparing"` block **fails**. Restore the body afterwards and re-run to confirm it passes again.

This is the one manual check in the plan. It exists because the assertion in design 4.2 is the difference between a real backup test and a decorative one, and nothing else proves the guard is wired up.

```bash
bun test tests/db/restore.test.ts 2>&1 | tail -10
```

- [ ] **Step 6: Confirm no stray databases are left**

```bash
docker compose exec -T db-test psql -U bot -d bot_test -tAc \
  "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')"
```

Expected: `bot_test` only. If `restore_source` or `restore_target` remain, `afterAll` is not dropping them.

- [ ] **Step 7: Commit**

```bash
git add tests/db/restore.test.ts
git commit -m "Restore-fidelity test: a dump reproduces every published number

SPEC.md section 10 Phase 4's acceptance test, and the only gate in this
project that can be automated: docs/SMOKE.md needs two real Telegram
accounts and two overnight waits, this needs neither.

Uses real databases rather than the usual freshDatabase() schema
isolation, because section 10 says \"an empty database\" and the backup
this protects dumps per database. Runs pg_dump and pg_restore inside the
db-test container, since the host has no pg client binaries.

The fixture is asserted non-trivial before anything is compared. Empty
on both sides would satisfy deep equality and prove nothing, which is a
worse outcome than no test at all.

Fails rather than skips when Docker is absent. Phase 4 design 4.1 to 4.5."
```

---

### Task 3: The plain-SQL dump format

**Files:**
- Modify: `tests/db/restore.test.ts` (add one describe block)

**Interfaces:**
- Consumes: `inContainer`, `createDatabase`, `urlFor`, `captureSurface`, `original`, `SOURCE_DB`, `TARGET_DB` from Task 2. All file-local, no signature changes.
- Produces: nothing new.

**Why:** `scripts/dump.sh` and `scripts/restore.sh` use plain SQL with `--clean --if-exists`, restored through `psql`. That is the host-move path. Covering it costs one describe block because the fixture and comparison are already built, and it means neither format is the untested one. Phase 4 design 4.3.

**Scope limit to preserve:** this tests the **format**, not the scripts. It replicates their `pg_dump` flags rather than invoking `scripts/dump.sh`, because those scripts target the compose `db` service and their argument handling and empty-file guards are not what a competition depends on. Do not change the scripts in this task.

- [ ] **Step 1: Write the failing test**

Append to `tests/db/restore.test.ts`:

```ts
describe("restore fidelity, plain SQL format (scripts/dump.sh)", () => {
  // The format scripts/dump.sh and scripts/restore.sh use for a host move.
  // Phase 4 design 4.3: this covers the format, not the scripts themselves.
  // Their argument handling and empty-file guards are not what a competition
  // depends on; a faithful round trip is.
  test("a plain SQL dump restores into an empty database and reproduces every number", async () => {
    const dump = await inContainer([
      "pg_dump", "-U", "bot", "-d", SOURCE_DB, "--clean", "--if-exists",
    ]);
    expect(dump).toContain("COPY public.days");

    await createDatabase(TARGET_DB);

    // psql reads the dump on stdin, which `docker compose exec -T` forwards.
    const proc = Bun.spawn(
      [
        "docker", "compose", "exec", "-T", "db-test",
        "psql", "-U", "bot", "-d", TARGET_DB, "-q",
        "-v", "ON_ERROR_STOP=1", "--single-transaction",
      ],
      { cwd: REPO_ROOT, stdin: new TextEncoder().encode(dump), stdout: "pipe", stderr: "pipe" },
    );
    const [stderr, code] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(code, `psql restore failed: ${stderr}`).toBe(0);

    const target = postgres(urlFor(TARGET_DB), { max: 2, onnotice: () => {} });
    try {
      expect(await captureSurface(target)).toEqual(original);
    } finally {
      await target.end();
    }
  });
});
```

- [ ] **Step 2: Run it**

```bash
bun test tests/db/restore.test.ts
```

Expected: PASS. If `expect(dump).toContain("COPY public.days")` fails, the dump is empty or the table is elsewhere, and that is a real finding: report it rather than deleting the assertion. It exists so an empty dump cannot silently restore into an empty database and satisfy deep equality, which is the same vacuity trap as design 4.2.

- [ ] **Step 3: Run the full suite and the typecheck**

```bash
bun run test:db && bunx tsc --noEmit
```

Expected: all pass, `0 fail`, `tsc` exits 0.

- [ ] **Step 4: Confirm no stray databases**

```bash
docker compose exec -T db-test psql -U bot -d bot_test -tAc \
  "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')"
```

Expected: `bot_test` only.

- [ ] **Step 5: Commit**

```bash
git add tests/db/restore.test.ts
git commit -m "Cover the plain SQL dump format too

scripts/dump.sh and restore.sh use --clean --if-exists through psql for
a host move, while Tietokilta/infra uses directory format and
pg_restore. Covering both costs one describe block because the fixture
and the comparison are already built, and it means neither format is
the untested one.

Tests the format, not the scripts: their argument handling and
empty-file guards are not what a competition depends on. Asserts the
dump actually contains rows, so an empty dump cannot restore into an
empty database and satisfy deep equality. Phase 4 design 4.3."
```

---

### Task 4: SPEC.md amendments and the Phase 3 narrative fix

**Files:**
- Modify: `SPEC.md` (§7 NFR-6, NFR-2, NFR-3, §9, §10 Phase 4)
- Modify: `docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md` (§3.5)

**Interfaces:** none. Documentation only.

**Why:** SPEC.md is the source of truth. Four things in it are now wrong or incomplete: it implies FR-11 is pending, it describes a deployment that is not the one being used, it describes NFR-3 as unmet work, and its §10 Phase 4 lists items built in Phase 1. Phase 4 design 5.2.

**Rule for this task:** the requirements themselves do not change. NFR-3 still requires a nightly dump shipped off the machine. What changes is the record of *how* it is met and by whom. Do not weaken a requirement to match the implementation.

- [ ] **Step 1: Add Q5 to SPEC.md §9 "Decided"**

Insert after Q4, matching Q4's form:

```markdown
**Q5. FR-11's optional tag is cut.** *Decided 2026-07-31.* FR-11 is the only `MAY` in section 5;
every other requirement is `MUST` or `SHOULD`. Cutting it exercises an option this specification
granted rather than deviating from it.

Four reasons. It was never designed: [prototype/bot-flows.html](prototype/bot-flows.html) has no tag
screen, so building it means inventing one. It serves none of the four success criteria in section
1, because no other participant ever sees a tag. It adds a tap to the one path that must stay at one
tap (section 4.1), which is the friction section 2 defect 6 blames for mid-competition dropoff. And
it costs 70 to 90 effective lines against the 84 that remained under NFR-6, since NFR-5 forbids
session state and so the tag list must be preset buttons in the callback payload.

Recorded honestly: a tag is the defanged form of the sport taxonomy section 8 rejects. FR-11 removes
the dispute by removing the scoring, and it is one configuration change away from restoring it. That
is not why it is cut, but it is why re-adding it should go through section 8 first.

`days.tag` stays in the schema. Dropping it costs a migration to buy nothing.
```

- [ ] **Step 2: Restate NFR-2 in SPEC.md §7**

Replace the existing NFR-2 paragraph with:

```markdown
**NFR-2. Deployment.** The bot MUST run as a single long-polling process with its state in
PostgreSQL. *Updated 2026-07-31:* it is deployed onto Tietokilta's existing infrastructure, as a
NixOS service on `tikpannu` beside the guild's other Telegram bots, with its database on the shared
Azure PostgreSQL flexible server. The two-container Docker Compose setup in this repository is the
development and test path, not the deployment.

The original sizing stands for anyone self-hosting instead: two containers on one machine, **1 vCPU,
2 GB RAM, 20 GB disk**, roughly €3.50 to €6 per month on a small VPS, or zero on an existing home
server. Recheck prices before ordering: Hetzner repriced cloud servers on 15 June 2026.
```

- [ ] **Step 3: Restate NFR-3 in SPEC.md §7**

Replace the existing NFR-3 paragraph with:

```markdown
**NFR-3. Backups.** A nightly `pg_dump` MUST be shipped off the machine. This is the one operational
step that must not be skipped; a competition that loses its data mid-run is over.

*Updated 2026-07-31:* satisfied by the deployment target rather than by code in this repository.
Tietokilta's backup system enumerates every non-system database on the shared PostgreSQL server,
dumps each one nightly, and ships the result to off-site storage with a 7 daily plus 4 weekly
retention, reporting success and failure to a status page. Putting this bot's database there is what
meets the requirement, and it is met from the moment the database exists.

What this repository owns instead is the proof that a dump is worth having:
`tests/db/restore.test.ts` restores one into an empty database and asserts every published number is
reproduced exactly, in both dump formats. An untested restore is the usual way a backup fails.
```

- [ ] **Step 4: Restate §10 Phase 4**

Replace the Phase 4 block with:

```markdown
### Phase 4: it survives contact

The nightly backup and the proof it restores.

*Updated 2026-07-31:* three of this phase's original contents were built earlier. The weekly streak
moved to Phase 1 because FR-14 makes `/me` show it; the undo edge cases moved with it, because FR-9
contradicts its own acceptance test whenever a log displaced an earlier tier; and deployment shipped
with Phase 2. FR-11's optional tag is cut (section 9, Q5). What remains is NFR-3.

*Done when:* the backup restores into an empty database and reproduces the standings exactly.
```

- [ ] **Step 5: Add the NFR-6 note in SPEC.md §7**

Append to NFR-6, after the existing "If the total passes 2,000" paragraph:

```markdown
*Note added 2026-07-31:* the per-phase split above (900, then about 150, 180 and 120) is a rounded
residual, not a costed estimate. The table has no row for tags and none for backups, its rows sum to
1,305, and the phase split sums to 1,350. Phase 4's 120 in particular was written while the weekly
streak was still unbuilt, and Phases 1 and 2 have since spent it. Actual figures: 1,916 effective
lines after Phase 3, about 1,921 after Phase 4.
```

- [ ] **Step 6: Fix the Phase 3 design §3.5 narrative**

In `docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md` §3.5, the ruling still states the premise that a blocked user cannot produce an update. The code comment in `index.ts` was corrected during the Phase 3 fix round; this narrative was not. Correct the premise in place and note the counterexample:

```markdown
`my_chat_member` is the exception, and it is the one that matters: that update type fires precisely
when someone blocks or unblocks the bot, so it arrives *from* a user who has just blocked it.
Trusting it would let a block event clear the flag the send loop had just set. The middleware
therefore clears `blocked` on any private-chat update except that one.
```

- [ ] **Step 7: Check for dashes and verify nothing else drifted**

```bash
grep -n "—\|–" SPEC.md docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md || echo "no em/en dashes"
grep -n "FR-11" SPEC.md
```

Expected: no dashes. `FR-11` should now appear in §5 (the requirement, unchanged) and in §9 Q5. The requirement text itself is **not** deleted: it stays as written, and Q5 records that it is not being built.

- [ ] **Step 8: Commit**

```bash
git add SPEC.md docs/superpowers/specs/2026-07-31-telegram-bot-phase-3-design.md
git commit -m "SPEC.md: record Q5, the real deployment, and how NFR-3 is met

Q5 cuts FR-11, the only MAY in section 5, with its reasoning. NFR-2 and
NFR-3 are restated: the bot deploys onto Tietokilta's infrastructure,
and NFR-3 is satisfied by that target's existing nightly backup rather
than by code here. Neither requirement is weakened; what changed is the
record of how it is met and by whom.

Section 10's Phase 4 no longer lists three items built in Phase 1, and
NFR-6 gains a note that the per-phase line split was a rounded residual,
so the budget conflict is not rediscovered.

Also corrects the Phase 3 design 3.5 premise that a blocked user cannot
produce an update. my_chat_member is the counterexample; the code
comment was fixed during the Phase 3 fix round and this was not."
```

---

### Task 5: README deploy rewrite and the infra handover

**Files:**
- Modify: `README.md` (the status paragraph and the Deploy section)

**Interfaces:** none. Documentation only.

**Why:** README currently tells a reader to deploy with `docker compose up -d --build` and to move hosts by copying a dump. That is no longer how this runs. It must also carry the infra handover, or that work becomes folklore. Phase 4 design §6 and 5.2.

**The point that must survive editing:** state plainly which database is the real one. A compose file that looks like production but is not is how someone ends up backing up the wrong thing (design 3.2).

- [ ] **Step 1: Update the status paragraph**

Replace the "Phase 3 ... and Phase 4 ... are not built" sentence with:

```markdown
**Status:** Phases 1 to 4 are built: registration, `/log`, `/me`, `/standings`, the group chat
(binding, pinned standings, the Monday post), reminders with their five-ignore auto-stop and
`/remind`, and the restore-fidelity test that proves a backup is worth having. English, and
reminders are a per-user choice. FR-11's optional tag is cut ([SPEC.md](SPEC.md) §9 Q5).

Two things gate real use. No phase's smoke run has been done ([docs/SMOKE.md](docs/SMOKE.md)), and
competition dates are still a placeholder in `src/config.ts` ([SPEC.md](SPEC.md) §9 Q1).
```

- [ ] **Step 2: Rewrite the Deploy section**

Replace steps 1 to 4 of Deploy with:

```markdown
## Run it locally

1. `cp .env.example .env`, then fill it in: `BOT_TOKEN` from [@BotFather](https://t.me/BotFather)
   (`/newbot`, then copy the token it gives you), and a `POSTGRES_PASSWORD` of your choosing.
   `DATABASE_URL` already matches `docker-compose.yml`; leave it as is. `.env` is gitignored and
   never committed.
2. `docker compose up -d --build` starts the bot and its database. Logs: `docker compose logs -f
   bot`.
3. **Any change under `src/` needs `docker compose up -d --build`, not `docker compose restart
   bot`.** The image copies `src` in at build time and nothing bind-mounts it, so a restart quietly
   keeps running the previous configuration.

**This compose setup is the development and test path, not the deployment.** The `db` service is a
throwaway database in a local volume. It is not the competition's data and it is not what gets
backed up. See below for what is.

## Deploy

The bot runs on Tietokilta's infrastructure ([`Tietokilta/infra`](https://github.com/Tietokilta/infra)):
the process as a NixOS service on `tikpannu` beside the guild's other Telegram bots, and **the
database on the shared Azure PostgreSQL flexible server**. That database is the real one.

Putting it there is also what satisfies NFR-3. That backup system enumerates every non-system
database on the server nightly, dumps each one and ships it off-site with a 7 daily plus 4 weekly
retention, so this bot's data is covered from the moment the database exists, with no backup code in
this repository. What this repository provides instead is `tests/db/restore.test.ts`, which proves a
dump restores into an empty database and reproduces every published number exactly.

### What the infra change has to contain

| Piece | Where | Note |
|---|---|---|
| Database | a Terraform module calling `modules/service_database` | The `db_name` is what the nightly backup discovery picks up. Nothing further is needed for NFR-3 |
| Bot package | `Tietokilta/tikbots` | The flake `modules/tikbots/default.nix` imports, and how the other bots reach `tikpannu` |
| NixOS service | `tikpannu-nixos-config/modules/tikbots/` | Follow `tikbot.nix`: a sops secret for the token and a `sops.templates` env file owned by the service user |
| Secrets | `tikpannu-nixos-config/modules/secrets/` | `BOT_TOKEN` and `DATABASE_URL`. The database password is generated by `service_database` |
| `DATABASE_URL` | that env file | Must end `?sslmode=require`. Azure PostgreSQL requires TLS, and postgres.js reads `sslmode` straight from the URL, so no code change is needed |

Before pointing any of this at a real competition, replace the placeholder dates in `src/config.ts`
(`COMPETITION_START` / `COMPETITION_END`) and re-verify every guild's `memberCount`: it is the
denominator of every ranking, so a stale count silently distorts every comparison.

`scripts/dump.sh` and `scripts/restore.sh` remain for moving a self-hosted instance by hand. They
are a convenience, not the backup.
```

- [ ] **Step 3: Check the result renders and has no dashes**

```bash
grep -n "—\|–" README.md || echo "no em/en dashes"
grep -n "docker compose up -d --build" README.md
```

Expected: no dashes. The build command appears under "Run it locally", and no longer reads as the production deployment.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: separate running it locally from deploying it

Compose is the development and test path; the deployment is a NixOS
service on tikpannu with the database on the shared Azure PostgreSQL
server. Says plainly which database is the real one, because a compose
file that looks like production is how someone ends up backing up the
wrong thing.

Carries the infra handover as a table so that work is findable rather
than folklore, and records that NFR-3 is met by that target's existing
nightly backup. Phase 4 design 6 and 5.2."
```

---

### Task 6: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (the phase status paragraph, the size ceiling bullet, and one new invariant)

**Interfaces:** none.

**Why:** CLAUDE.md is the first thing read in a fresh session. Three things in it are now stale, and one new load-bearing fact is missing. Last, as in every previous phase, so it describes what was actually built rather than what was planned.

- [ ] **Step 1: Update the phase status paragraph**

Replace the "**Phases 1, 2 and 3 are built**" paragraph with:

```markdown
**Phases 1 to 4 are built** (registration, `/log`, `/me`, `/standings`, the group chat binding, the
pinned standings, the Monday post, the daily reminder with its five-ignore auto-stop, `/remind`, 403
handling, and the restore-fidelity test). FR-11's optional tag is **cut**, not pending: SPEC.md §9
Q5. **No phase's smoke run has been done yet** (docs/SMOKE.md), and that remains the gate on real
users.
```

- [ ] **Step 2: Update the size ceiling bullet**

Replace the current figures in the "Size ceiling" bullet:

```markdown
- **Size ceiling: 2,000 effective lines.** Passing it means something from SPEC.md §8 crept back in
  (NFR-6). `src/` is currently about 1,921 effective lines. Phase 4 spent 5 of the 84 that remained
  after Phase 3, because its work was tests and documents rather than application logic, and because
  FR-11 was cut. SPEC.md §7's per-phase split was a rounded residual, not a costed estimate; the note
  added there records this so the conflict is not rediscovered. Count it the same way each time or
  the trend is meaningless:
```

- [ ] **Step 3: Add two invariants**

Append to the "Invariants that are easy to break" list:

```markdown
- **`decode()` re-encodes what it parsed and demands the result match the input.** That single
  assertion is what rejects trailing junk on all seven multi-part callback kinds, so a new kind
  inherits the check instead of needing its own length test. It also means `decode` is only ever as
  permissive as `encode` is: a handler that builds a payload by hand rather than through `encode`
  will have it rejected, which is the intended direction.
- **The compose `db` service is not production and its volume is not the competition's data.** The
  real database is on Tietokilta's shared Azure PostgreSQL server, which is also what makes NFR-3
  true: that server's databases are dumped and shipped off-site nightly by infrastructure outside
  this repository. `tests/db/restore.test.ts` is this repository's half, and it uses real databases
  rather than `freshDatabase()` schemas because the backup it protects dumps per database.
```

- [ ] **Step 4: Update the "Before a real competition" section**

The `COMPETITION_START` / `COMPETITION_END` and `memberCount` notes stay exactly as they are: both are still open and both are launch tasks. Add one line:

```markdown
NFR-3 is met by the deployment target, so it is not observably satisfied until this bot's database
exists on Tietokilta's shared PostgreSQL server. README's Deploy section lists what that change
contains.
```

- [ ] **Step 5: Verify**

```bash
grep -n "—\|–" CLAUDE.md || echo "no em/en dashes"
find src -name '*.ts' | xargs cat | grep -vE '^\s*$' | grep -vE '^\s*(//|/\*|\*|\*/)' | wc -l
```

Expected: no dashes, and the count matches the figure written into CLAUDE.md in Step 2. If they disagree, the file is wrong, not the count.

- [ ] **Step 6: Final full verification**

```bash
bun run test:db && bunx tsc --noEmit && echo "ALL GREEN"
```

Expected: all tests pass with `0 fail`, `tsc` exits 0, and `ALL GREEN` prints.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: Phase 4 status, real ceiling figure, two invariants

Records that FR-11 is cut rather than pending, that Phase 4 spent 5 of
the 84 remaining lines because its work was tests and documents, and two
things a fresh session would otherwise have to rediscover: what the
decode() round-trip assertion guarantees, and that the compose db
service is not the competition's data."
```

---

## Self-Review

**Spec coverage.** Every section of the design maps to a task:

| Design section | Task |
|---|---|
| §1 scope, §1.1 the size conflict | 4 (SPEC.md §10 and NFR-6 note), 6 (CLAUDE.md) |
| §2 FR-11 cut | 4 (SPEC.md §9 Q5) |
| §3 deployment target, §3.1 portability, §3.2 compose | 4 (NFR-2, NFR-3), 5 (README), 6 (CLAUDE.md invariant) |
| §4.1 to §4.5 the restore test | 2, and 3 for the second format |
| §5.1 carry-forwards | 1 (`decode`), 4 (Phase 3 §3.5 narrative) |
| §5.2 documents | 4, 5, 6 |
| §6 infra handover | 5 (README table) |
| §7 verification | Steps in every task; the full suite plus typecheck runs in 1, 2, 3 and 6 |
| §8 size | 1 Step 6, 6 Step 5 |
| §9 deferred | Nothing to build. NFR-3's dependency on the infra PR is recorded in 4 Step 3 and 5 Step 2 |

**Gaps deliberately left:** `COMPETITION_START` / `COMPETITION_END` and the guild `memberCount`
values are launch tasks the owner answers, not plan tasks. The `Tietokilta/infra` PR is out of scope
by the design's own §6. No task claims NFR-3 is done.

**Placeholder scan:** no TBD, no "add error handling", no "similar to Task N". Every code step
carries the actual code. The one step without code is Task 2 Step 3, which is deliberate: there is no
implementation to write, and it enumerates the three real failure causes instead.

**Type consistency:** `Surface`, `captureSurface`, `seedFixture`, `inContainer`, `createDatabase`,
`dropDatabase`, `urlFor`, `SOURCE_DB`, `TARGET_DB`, `REPO_ROOT` and `original` are defined in Task 2
and reused under the same names in Task 3. `decode` and `encode` keep their exact signatures in Task
1; only `decode`'s behaviour narrows, and the private `parse` is new and unexported. Imported
signatures (`logDay`, `weekMinutes`, `standings`, `neighbours`, `participation`, `weeklyTotals`,
`weeklyStreak`, `createUser`, `syncGuilds`, `migrate`) were read from `main` and are used as written.

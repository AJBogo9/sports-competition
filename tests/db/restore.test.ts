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

describe("restore fidelity, plain SQL format (scripts/dump.sh)", () => {
  // The format scripts/dump.sh and scripts/restore.sh use for a host move.
  // Phase 4 design 4.3: this covers the format, not the scripts themselves.
  // Their argument handling and empty-file guards are not what a competition
  // depends on; a faithful round trip is.
  test("a plain SQL dump restores into an empty database and reproduces every number", async () => {
    const dump = await inContainer([
      "pg_dump", "-U", "bot", "-d", SOURCE_DB, "--clean", "--if-exists",
    ]);

    // pg_dump emits the COPY header even for a zero-row table, followed straight by
    // the "\." terminator, so the header alone would prove only that the table
    // exists in the dumped schema. What has to be true here is that the dump
    // carries rows: a dump that lost them would restore into an empty database and
    // satisfy the deep equality below for entirely the wrong reason. FR-7 semantics
    // (same-date tier replacement creates one row, not two) must survive the dump.
    // The terminator is anchored (^\.$ in multiline mode) rather than split on "\n\."
    // because when the table is empty, the terminator is the first line of copyBody
    // with no preceding newline, which is exactly the case this assertion exists to catch.
    const copyBody = dump.split(/^COPY public\.days [^\n]*\n/m)[1] ?? "";
    const dumpedDays = copyBody.split(/^\\\.$/m)[0]?.split("\n").filter((line) => line !== "") ?? [];
    expect(dumpedDays).toHaveLength(6);

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
    const [_stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
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

import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds } from "../../src/db/users.ts";
import { standings } from "../../src/db/standings.ts";

/**
 * Regression test for the construction-time array oid bug that
 * `src/db/tiers.ts` fixes with `sql.array(TIER_NAMES, 1009)` and
 * `sql.array(TIER_VALUES, 1007)`. See the comment on `tierMinutes()` there
 * for the full mechanism; the short version: postgres.js infers an untyped
 * `sql.array()` parameter's wire type at query construction time from a
 * cache shared across a client, and that cache is only populated once the
 * client has completed one prior round trip. A client whose first-ever query
 * is a `standings()`/`weekMinutes()`/`weeklyTotals()` call therefore has an
 * empty cache, and without the explicit oids the array serializes as
 * `Array.prototype.toString()`, comma-joined with no braces, which Postgres
 * rejects with "malformed array literal". This was found by
 * tests/db/restore.test.ts, whose restored-database connection happened to
 * be the first genuinely fresh client this project ever builds mid-test.
 *
 * `freshDatabase("tiers")` is used only to create and migrate the schema.
 * The connection it returns has already run several queries by the time a
 * test body executes (`migrate()` alone is several statements), so it is not
 * cold and would not catch this regression. The test therefore opens a
 * second, deliberately fresh client pointed at the same schema (via
 * `connection.search_path`, the same option `freshDatabase` itself uses) and
 * makes `standings()` the very first query that client ever builds. Without
 * the fix in tiers.ts, this fails with "malformed array literal".
 */
const TEST_URL = process.env.TEST_DATABASE_URL
  ?? "postgres://bot:test@localhost:5433/bot_test";

const sql = await freshDatabase("tiers");
afterAll(async () => { await sql.end(); });

describe("tierMinutes on a cold client (regression, found by tests/db/restore.test.ts)", () => {
  test("standings() resolves and lists every configured guild as the first query on a brand new client", async () => {
    await syncGuilds(sql);

    // freshDatabase creates schema "test_tiers" for name "tiers" (helpers/db.ts).
    const cold = postgres(TEST_URL, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: "test_tiers" },
    });
    try {
      const table = await standings(cold, "2026-07-27", "2026-08-02");
      expect(table).toHaveLength(9);
    } finally {
      await cold.end();
    }
  });
});

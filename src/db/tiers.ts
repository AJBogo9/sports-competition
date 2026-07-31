import type { Sql } from "postgres";
import { TIER_MINUTES, type Tier } from "../config.ts";

const TIER_NAMES = Object.keys(TIER_MINUTES) as Tier[];
const TIER_VALUES = TIER_NAMES.map((tier) => TIER_MINUTES[tier]);

/**
 * The config-backed tier lookup, injected into every query that converts tiers
 * into minutes. It is a CTE built from config on each call, never a table: no
 * total and nothing derived from TIER_MINUTES is ever stored (SPEC.md section
 * 4.4), so changing a tier value in config.ts and restarting recomputes all
 * history.
 *
 * One definition, shared by `standings.ts` and `days.ts` (four call sites
 * between them), rather than one copy per query site. It lives in its own
 * module rather than being exported from either of those two: `standings.ts`
 * and `days.ts` are peers today, and having one import a shared fragment from
 * the other would read, later, as if one depended on the other.
 *
 * `sql.array(..., 1009)` and `sql.array(..., 1007)` pass each array's Postgres
 * oid explicitly (1009 is `text[]`, 1007 is `int4[]`). Without it, postgres.js
 * infers a `sql.array()` parameter's wire type at query *construction* time,
 * the synchronous moment this template literal runs, from a cache shared
 * across the whole client that is only populated once that client has
 * completed one prior round trip. A brand new client whose first-ever query
 * is this one has an empty cache, so both arrays fall back to scalar text
 * (postgres.js's inferType() returns the same untyped oid for a string
 * element and a number element alike, so TIER_VALUES falls back to text too,
 * not int4) instead of an array type, and get serialized as
 * `Array.prototype.toString()`, comma-joined with no braces, which Postgres
 * then rejects as a malformed array literal. The `::text[]` / `::int[]` casts
 * below do not help: the failure is in the wire-format parameter postgres.js
 * sends, not in the SQL. tests/db/tiers.test.ts pins this against a
 * deliberately cold client; it was first found by tests/db/restore.test.ts,
 * whose restored-database connection is the first genuinely fresh client this
 * project builds mid-test.
 *
 * Rejected: relying on every real boot calling `waitForDatabase()` (a `SELECT
 * 1` retry loop) before any query reaches here, which happens to be true
 * today. Rejected because `waitForDatabase()` exists for Compose start
 * ordering, Postgres sometimes answering slower than the bot asks, not for
 * warming a type cache, and nothing documents that second job. A maintainer
 * moving the database to a managed, always-on server, which removes the
 * stated reason for `waitForDatabase()` to exist, could delete the call with
 * no signal that doing so arms this bug.
 */
export function tierMinutes(sql: Sql) {
  return sql`
    SELECT * FROM unnest(${sql.array(TIER_NAMES, 1009)}::text[], ${sql.array(TIER_VALUES, 1007)}::int[])
  `;
}

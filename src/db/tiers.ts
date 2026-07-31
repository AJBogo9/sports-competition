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
 */
export function tierMinutes(sql: Sql) {
  return sql`
    SELECT * FROM unnest(${sql.array(TIER_NAMES)}::text[], ${sql.array(TIER_VALUES)}::int[])
  `;
}

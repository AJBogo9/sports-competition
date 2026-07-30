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

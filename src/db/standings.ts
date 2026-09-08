import type { Sql } from "postgres";
import type { WeekTotal } from "../domain/scoring.ts";
import { tierMinutes } from "./tiers.ts";

export interface GuildStanding {
  slug: string;
  name: string;
  /** SPEC.md section 4.3 (2026-09-08). Days logged as anything but rest, at
   *  most one per member per day. This is what the tables display. */
  activeDays: number;
  /** Summed tier minutes; the tiebreaker, never displayed. */
  minutes: number;
  /** Active days per member of the roster: the ranking unit. Never displayed
   *  (phase 5 design 12.2): an average over the roster is a low descriptive
   *  norm broadcast to everyone above it. */
  perMember: number;
  /** The roster size the average is over (phase 5 design 11.2: the local
   *  race converts a per-member gap into days over the reader's roster). */
  memberCount: number;
}

export interface Neighbour {
  firstName: string;
  minutes: number;
  isSelf: boolean;
}

/**
 * FR-16 and SPEC.md section 4.3. Active days per member across the guild's
 * entire roster, including everyone who never logs anything, which is what
 * makes activating quiet members the winning strategy. Minutes are still
 * summed, as the tiebreaker.
 *
 * Two casts matter. `::numeric` before the division, because Postgres integer
 * division truncates 142 / 650 to 0, which is the bug in the query printed in
 * SPEC.md section 6. Then `::float8` so the driver hands back a number rather
 * than a numeric string.
 *
 * There is deliberately no `NOT u.blocked` here, which is a considered
 * departure from the query printed in SPEC.md section 6. `blocked` gates
 * outbound messaging and never scoring, and the three places it used to
 * appear (here, `neighbours()` and `participation()`) were all removed
 * together.
 *
 * Blocking the bot is a decision about being messaged. It does not remove
 * anyone from their guild's roster, and SPEC.md section 4.3 scores a guild
 * across its entire roster including everyone who never logs at all. Worse,
 * the clause is retroactive: FR-23 writes `blocked` as of Phase 3, so the
 * first user who blocks the bot erases their whole season's activity from
 * their guild's total. The pinned message then publishes that guild's score
 * visibly dropping, which is impossible
 * under this project's derive-everything model (SPEC.md section 4.4) and
 * reads to several hundred people as data loss.
 *
 * Do not restore it from SPEC.md section 6 on sight. That same printed query
 * also truncates its own division to zero, which is why the casts below
 * depart from it too.
 *
 * The ORDER BY ends with g.slug as a tiebreaker to guarantee total ordering.
 * Guild names (g.name) are not unique in the schema, only slugs are the primary
 * key. Without this tiebreaker, Postgres could return guilds in arbitrary order
 * when two have identical per-member scores, leading to non-deterministic results
 * across successive calls.
 *
 * SPEC.md section 4.3 as amended 2026-09-08 (phase 5 design 12.1): the ranking
 * unit is active days per member, a day being any record that is not rest,
 * and minutes per member breaks ties. A day counts once whatever its tier, so
 * nobody can carry a guild and the marginal newcomer's first session is worth
 * exactly what the marginal athlete's seventh is; the trials that made
 * competition work scored visits and goal-days, not minutes
 * (docs/evidence.md section 6). COUNT(d.date) counts only joined rows, so a
 * guild with nobody registered is 0 rather than NULL.
 */
export async function standings(
  sql: Sql,
  from: string,
  to: string,
): Promise<GuildStanding[]> {
  return await sql<GuildStanding[]>`
    WITH tier_minutes(tier, minutes) AS (${tierMinutes(sql)})
    SELECT g.slug,
           g.name,
           COUNT(d.date) FILTER (WHERE d.tier <> 'rest')::int AS "activeDays",
           COALESCE(SUM(t.minutes), 0)::int AS minutes,
           (COUNT(d.date) FILTER (WHERE d.tier <> 'rest')::numeric / g.member_count)::float8
             AS "perMember",
           g.member_count AS "memberCount"
    FROM guilds g
    LEFT JOIN users u ON u.guild_slug = g.slug
    LEFT JOIN days d ON d.telegram_id = u.telegram_id
                    AND d.date BETWEEN ${from}::date AND ${to}::date
    LEFT JOIN tier_minutes t ON t.tier = d.tier
    GROUP BY g.slug, g.name, g.member_count
    ORDER BY "perMember" DESC,
             (COALESCE(SUM(t.minutes), 0)::numeric / g.member_count) DESC,
             g.name ASC,
             g.slug ASC
  `;
}

/**
 * FR-15. The user and at most one person either side of them, within their own
 * guild only. This is the permitted half of the requirement: there is no query
 * anywhere that returns a top-N list of individuals, and the three-row cap is
 * what keeps it that way.
 *
 * No `NOT u.blocked` here either, for the reason given on `standings()` above.
 * This was the third and quietest of the three sites: it carried the clause
 * with no note at all while the other two carried a warning, so a future
 * Phase 3 change working from that warning would have fixed two of three and
 * left this one. The symptom would have been smaller but the same in kind: a
 * blocked guildmate silently vanishing from the "Around you" block, taking
 * the reader's own displayed position with them.
 *
 * The ROW_NUMBER() ORDER BY ends with telegram_id as a tiebreaker to guarantee
 * total ordering. First names are not unique: two users named "Alex" who have
 * both logged nothing are an ordinary occurrence in a 650-member guild. Without
 * this tiebreaker, Postgres could assign different ranks across successive calls,
 * so the same user might get different neighbours on invocation 1 vs invocation 2.
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
    WITH tier_minutes(tier, minutes) AS (${tierMinutes(sql)}), totals AS (
      SELECT u.telegram_id,
             u.first_name,
             COALESCE(SUM(t.minutes), 0)::int AS minutes
      FROM users u
      LEFT JOIN days d ON d.telegram_id = u.telegram_id
                      AND d.date BETWEEN ${from}::date AND ${to}::date
      LEFT JOIN tier_minutes t ON t.tier = d.tier
      WHERE u.guild_slug = ${guildSlug}
      GROUP BY u.telegram_id, u.first_name
    ), ranked AS (
      SELECT telegram_id, first_name, minutes,
             ROW_NUMBER() OVER (ORDER BY minutes DESC, first_name ASC, telegram_id ASC) AS rank
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
    WITH tier_minutes(tier, minutes) AS (${tierMinutes(sql)})
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

/**
 * FR-20. How many of a guild's members logged at least once in the range.
 *
 * A count of people, deliberately not the share of the roster it used to be
 * (phase 5 design 5.4). At the signup-to-participation base rate SPEC.md
 * section 1 expects, a share is a low descriptive norm sent to a whole guild
 * chat every Monday, and a broadcast low norm pulls the people above it down
 * toward it (docs/evidence.md 5.2). A count names the people who did it
 * without stating that most did not, and it is still the number the reader
 * can change this week (phase 2 design 3.3).
 *
 * A rest day counts (phase 2 design 4.3): FR-8 makes rest an explicit record rather
 * than an absence, and this number measures engagement rather than minutes.
 * That is why it joins days without joining tier_minutes at all.
 *
 * No `NOT u.blocked` here either, for the reason given on `standings()` above.
 * On this query the clause was the most visible of the three: it would have
 * dropped a guild's published participation retroactively, in the Monday
 * post, the moment one of its members blocked the bot.
 */
export async function participation(
  sql: Sql,
  guildSlug: string,
  from: string,
  to: string,
): Promise<number> {
  const [row] = await sql<{ loggers: number }[]>`
    SELECT COUNT(DISTINCT d.telegram_id)::int AS loggers
    FROM guilds g
    LEFT JOIN users u ON u.guild_slug = g.slug
    LEFT JOIN days d ON d.telegram_id = u.telegram_id
                    AND d.date BETWEEN ${from}::date AND ${to}::date
    WHERE g.slug = ${guildSlug}
    GROUP BY g.slug
  `;
  // guilds is synced from config on every boot, so a miss means the caller
  // passed a slug that is not in config at all. Surfacing it is better than
  // returning 0, which would render as a plausible but false "0 of you".
  if (!row) throw new Error(`guild "${guildSlug}" not found`);
  return row.loggers;
}

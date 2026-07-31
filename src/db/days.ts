import type { Sql } from "postgres";
import type { Tier } from "../config.ts";
import { tierMinutes } from "./tiers.ts";

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
    WITH tier_minutes(tier, minutes) AS (${tierMinutes(sql)})
    SELECT COALESCE(SUM(t.minutes), 0)::int AS minutes
    FROM days d
    JOIN tier_minutes t ON t.tier = d.tier
    WHERE d.telegram_id = ${telegramId}
      AND d.date >= ${weekStart}::date
      AND d.date <  ${weekStart}::date + INTERVAL '7 days'
  `;
  return row?.minutes ?? 0;
}

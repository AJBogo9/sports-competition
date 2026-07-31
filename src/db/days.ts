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
 *
 * `expected` is the tier the undo's own log stored, and every statement below
 * matches on it. An undo button lives on a confirmation message, which stays
 * in the chat and stays tappable indefinitely (NFR-5), so two confirmations
 * for the same day can both be live: one from the daily reminder, one from a
 * later /log that corrected the tier. Applying the older payload
 * unconditionally reverted the newer entry, deleting the day outright when its
 * `restore` was null, and told the user "Put back" while putting back
 * something they had already replaced. checkin.ts recomputes the payload's
 * DATE against the live calendar for exactly this reason; the tier had no
 * equivalent.
 *
 * The check is in the WHERE clause rather than a read followed by a write, so
 * there is no window between the two for a concurrent tap to land in.
 *
 * Returns whether the undo applied. False means the day no longer holds
 * `expected`: it was logged again, or already undone. Nothing is written in
 * that case, and the caller says so rather than reporting a change it did not
 * make.
 */
export async function undoDay(
  sql: Sql,
  telegramId: number,
  date: string,
  input: { expected: Tier; restore: Tier | null },
): Promise<boolean> {
  if (input.restore === null) {
    const removed = await sql`
      DELETE FROM days
       WHERE telegram_id = ${telegramId}
         AND date = ${date}::date
         AND tier = ${input.expected}
      RETURNING tier
    `;
    return removed.length > 0;
  }
  // An UPDATE rather than the upsert this used to be. The upsert would
  // resurrect a day somebody had already undone from another message, since
  // ON CONFLICT makes a missing row an insert rather than a no-op.
  const restored = await sql`
    UPDATE days
       SET tier = ${input.restore}, logged_at = now()
     WHERE telegram_id = ${telegramId}
       AND date = ${date}::date
       AND tier = ${input.expected}
    RETURNING tier
  `;
  return restored.length > 0;
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

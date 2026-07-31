import type { Sql } from "postgres";
import {
  FOLLOWUP_AFTER_IGNORES,
  MAX_REMINDERS_PER_TICK,
  REMINDER_GRACE_HOURS,
  TIMEZONE,
} from "../config.ts";

export interface DueReminder {
  telegramId: number;
  /** users.ignored_streak, fed straight into reminderAction. */
  ignoredStreak: number;
  /** Whether anything was logged since the last reminder went out. */
  responded: boolean;
}

interface DueRecord {
  telegram_id: string;
  ignored_streak: number;
  responded: boolean;
}

export interface DueOptions {
  /** Pins a fixed instant, for tests only. Production passes nothing. */
  at?: string | null;
  /** Defaults to MAX_REMINDERS_PER_TICK. */
  limit?: number;
}

/**
 * FR-21. Everyone owed a reminder right now, capped.
 *
 * The split with domain/reminders.ts is deliberate (phase 3 design 3): this
 * decides WHO is a candidate, and the pure function decides WHAT they are
 * sent. Everything here is a filter that either needs the database or keeps
 * the returned set small; nothing here is policy that could be unit tested
 * without one.
 *
 * The clauses, in the order they appear:
 *
 * - reminder_hour IS NOT NULL: off is off (FR-4, FR-24).
 * - NOT blocked: FR-23. This is the only gate blocked has; it never reaches
 *   scoring, and restoring it into standings.ts would retroactively erase a
 *   blocked user's whole season (SPEC.md section 6).
 * - ignored_streak <= FOLLOWUP_AFTER_IGNORES: phase 3 design 3.3. Past the
 *   threshold the follow-up has gone out unanswered, and the paused state is
 *   an absence of candidacy rather than an action.
 * - The grace window, mirroring isWithinGrace (phase 3 design 4.1). It cannot
 *   wrap past midnight: EXTRACT(HOUR) is 0 to 23, so hour 23 yields {23}.
 * - Not already reminded today, in TIMEZONE. Without it the 60-second tick
 *   would send the same reminder sixty times inside one hour (phase 3 design
 *   2.2). This is the per-user analogue of chats.last_monday_week, and it is a
 *   column rather than process memory so a restart mid-hour cannot re-send
 *   (NFR-5).
 * - No days row for today: FR-21's "only to users who have not yet recorded
 *   that day". A rest day is a record, so it suppresses the reminder too
 *   (FR-8), which is the whole point of offering an honest rest button.
 *
 * `responded` is the second job last_reminded_at does: whether anything was
 * written since the last ping. A NULL last_reminded_at means nothing has been
 * sent, so it is false and ignored_streak is 0; the two agree and the first
 * send takes the ordinary path.
 *
 * ORDER BY carries a unique tiebreaker (telegram_id) like every other ordered
 * query in this project. Under a LIMIT it does more than stabilise output:
 * without it Postgres may return a different page across calls, so a user
 * could be starved rather than merely reordered. NULLS FIRST puts the
 * never-reminded at the front.
 *
 * `at` pins a fixed instant for tests only, exactly as calendar() does.
 */
export async function dueReminders(
  sql: Sql,
  options: DueOptions = {},
): Promise<DueReminder[]> {
  const at = options.at ?? null;
  const limit = options.limit ?? MAX_REMINDERS_PER_TICK;

  const records = await sql<DueRecord[]>`
    WITH local AS (
      SELECT (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE}) AS ts
    )
    SELECT u.telegram_id::text,
           u.ignored_streak,
           EXISTS (
             SELECT 1 FROM days d
              WHERE d.telegram_id = u.telegram_id
                AND u.last_reminded_at IS NOT NULL
                AND d.logged_at > u.last_reminded_at
           ) AS responded
      FROM users u, local l
     WHERE u.reminder_hour IS NOT NULL
       AND NOT u.blocked
       AND u.ignored_streak <= ${FOLLOWUP_AFTER_IGNORES}::int
       AND EXTRACT(HOUR FROM l.ts)::int >= u.reminder_hour
       AND EXTRACT(HOUR FROM l.ts)::int <  u.reminder_hour + ${REMINDER_GRACE_HOURS}::int
       AND (
         u.last_reminded_at IS NULL
         OR (u.last_reminded_at AT TIME ZONE ${TIMEZONE})::date < (l.ts)::date
       )
       AND NOT EXISTS (
         SELECT 1 FROM days d
          WHERE d.telegram_id = u.telegram_id AND d.date = (l.ts)::date
       )
     ORDER BY u.last_reminded_at NULLS FIRST, u.telegram_id
     LIMIT ${limit}
  `;

  return records.map((record) => ({
    // BIGINT arrives as a string from the driver. Telegram IDs are well inside
    // the safe integer range, so this is lossless, matching db/users.ts.
    telegramId: Number(record.telegram_id),
    ignoredStreak: record.ignored_streak,
    responded: record.responded,
  }));
}

/**
 * FR-21 and FR-22. The two halves of a send, written together: the new ignore
 * count from reminderAction, and the stamp that stops the next tick re-sending.
 *
 * Called only after Telegram has accepted the message. A send that succeeds and
 * then fails to record re-sends on the next tick, bounded by the grace window;
 * that gap is accepted rather than solved, because solving it means a
 * transaction spanning a Telegram call (phase 3 design 6).
 */
export async function recordReminder(
  sql: Sql,
  telegramId: number,
  nextStreak: number,
  at: string | null = null,
): Promise<void> {
  await sql`
    UPDATE users
       SET ignored_streak   = ${nextStreak},
           last_reminded_at = COALESCE(${at}::timestamptz, now())
     WHERE telegram_id = ${telegramId}
  `;
}

/**
 * FR-22's "keep them": resumes immediately, and the chosen hour survives
 * untouched, so resuming never silently means choosing again.
 *
 * Deliberately not setReminderHour(sql, id, sameHour): that would need the
 * caller to read the hour back and write it unchanged, which is a lost update
 * waiting to happen and says something different from what the user asked for.
 *
 * Mirrors setReminderHour's phase 3 design 3.4 stamp, reading the existing
 * reminder_hour column rather than taking it as a parameter, since this path
 * never changes it. Without this, resuming after the hour has already passed
 * today (the follow-up went out days ago, at the user's hour, so by the time
 * they tap "Keep them" that hour is long gone for today) leaves
 * last_reminded_at stale, and the next tick still finds them inside the
 * once-per-day gate for today with the grace window open, sending a reminder
 * seconds after they asked to be reminded. The two paths must agree, or
 * resuming can fire immediately in a case picking the hour fresh never would.
 *
 * `at` pins a fixed instant for tests only, exactly as setReminderHour does.
 */
export async function resumeReminders(
  sql: Sql,
  telegramId: number,
  at: string | null = null,
): Promise<void> {
  await sql`
    UPDATE users
       SET ignored_streak   = 0,
           last_reminded_at = CASE
             WHEN reminder_hour IS NOT NULL
              AND reminder_hour <= EXTRACT(
                    HOUR FROM (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE})
                  )::int
             THEN COALESCE(${at}::timestamptz, now())
             ELSE last_reminded_at
           END
     WHERE telegram_id = ${telegramId}
  `;
}

/** FR-23. A 403 is recorded, and dueReminders never selects the row again. */
export async function setBlocked(sql: Sql, telegramId: number): Promise<void> {
  await sql`UPDATE users SET blocked = TRUE WHERE telegram_id = ${telegramId}`;
}

/**
 * Phase 3 design 3.5. An incoming update is proof Telegram has stopped
 * refusing us, with one exception: my_chat_member fires precisely when
 * someone blocks or unblocks the bot, so it arrives from a user who has just
 * blocked it and proves nothing. The caller (bot/index.ts) excludes that
 * update type before calling this. FR-23's "never retried" still holds
 * exactly: no send is ever retried INTO a block.
 *
 * The `AND blocked` is not redundant. This runs on every private-chat update,
 * and it makes the normal case a matched-nothing no-op rather than a row
 * rewrite, without a read first.
 */
export async function clearBlocked(sql: Sql, telegramId: number): Promise<void> {
  await sql`UPDATE users SET blocked = FALSE WHERE telegram_id = ${telegramId} AND blocked`;
}

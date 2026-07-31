import type { Sql } from "postgres";
import { GUILDS, TIMEZONE } from "../config.ts";

export interface UserRow {
  telegramId: number;
  guildSlug: string;
  firstName: string;
  username: string | null;
  reminderHour: number | null;
  /** FR-4. Whether the reminder question has been put to them at all, which
   *  reminderHour = null cannot express on its own (phase 3 design 2.1). */
  reminderAsked: boolean;
}

interface UserRecord {
  telegram_id: string;
  guild_slug: string;
  first_name: string;
  username: string | null;
  reminder_hour: number | null;
  reminder_asked: boolean;
}

/** BIGINT arrives as a string from the driver. Telegram IDs are well inside
 *  the safe integer range, so this is lossless. */
function toUser(record: UserRecord): UserRow {
  return {
    telegramId: Number(record.telegram_id),
    guildSlug: record.guild_slug,
    firstName: record.first_name,
    username: record.username,
    reminderHour: record.reminder_hour,
    reminderAsked: record.reminder_asked,
  };
}

const USER_COLUMNS =
  "telegram_id::text, guild_slug, first_name, username, reminder_hour, reminder_asked";

/**
 * Mirrors the config roster into the database at startup (FR-25). Names and
 * member counts are overwritten from config every time, so correcting a
 * denominator is a config edit plus a restart, with no admin UI and no
 * migration.
 */
export async function syncGuilds(sql: Sql): Promise<void> {
  for (const guild of GUILDS) {
    await sql`
      INSERT INTO guilds (slug, name, member_count)
      VALUES (${guild.slug}, ${guild.name}, ${guild.memberCount})
      ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name, member_count = EXCLUDED.member_count
    `;
  }
}

export async function findUser(sql: Sql, telegramId: number): Promise<UserRow | null> {
  const [record] = await sql<UserRecord[]>`
    SELECT ${sql.unsafe(USER_COLUMNS)} FROM users WHERE telegram_id = ${telegramId}
  `;
  return record ? toUser(record) : null;
}

/**
 * FR-1 and FR-3. Registering someone already registered is a no-op that
 * returns their existing row: it never duplicates, and it never moves them to
 * the guild whose link they happened to tap. Moving is moveUser, and only ever
 * after an explicit confirmation.
 */
export async function createUser(
  sql: Sql,
  input: {
    telegramId: number;
    guildSlug: string;
    firstName: string;
    username?: string | null;
  },
): Promise<UserRow> {
  const [record] = await sql<UserRecord[]>`
    INSERT INTO users (telegram_id, guild_slug, first_name, username)
    VALUES (
      ${input.telegramId}, ${input.guildSlug}, ${input.firstName}, ${input.username ?? null}
    )
    ON CONFLICT (telegram_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, username = EXCLUDED.username
    RETURNING ${sql.unsafe(USER_COLUMNS)}
  `;
  if (!record) throw new Error("createUser returned no row");
  return toUser(record);
}

/** FR-3. Only ever called after the user confirms the move. */
export async function moveUser(sql: Sql, telegramId: number, guildSlug: string): Promise<void> {
  await sql`UPDATE users SET guild_slug = ${guildSlug} WHERE telegram_id = ${telegramId}`;
}

/**
 * FR-4 and FR-24. null means reminders off, which is a real stored answer
 * rather than an absence of one.
 *
 * Three writes, not one, and the two extra ones are load-bearing:
 *
 * - reminder_asked records that the question was put at all, so a decliner is
 *   never asked again (phase 3 design 4.6).
 * - ignored_streak resets, because setting an hour is the explicit consent
 *   phase 3 design 3.3 requires to lift an FR-22 pause. Without it, a paused
 *   user who ran /remind would be told reminders were back on and then
 *   silently receive nothing, since dueReminders excludes a paused row.
 *   Turning reminders OFF resets it too, so switching them on again later
 *   starts a fresh count rather than three ignores into an old one.
 * - last_reminded_at is stamped when the chosen hour has already passed
 *   locally (phase 3 design 3.4). Someone picking 20:00 at 21:00 is inside
 *   that hour's grace window and would otherwise be sent a check-in message
 *   seconds after asking to be reminded at 20:00. Picking an hour still to
 *   come is untouched and still fires the same evening.
 *
 * The local hour is read in the same statement, in TIMEZONE, so no caller has
 * to supply a clock. `at` pins a fixed instant for tests only, exactly as
 * calendar() does; production callers pass nothing and get now().
 */
export async function setReminderHour(
  sql: Sql,
  telegramId: number,
  hour: number | null,
  at: string | null = null,
): Promise<void> {
  await sql`
    UPDATE users
       SET reminder_hour    = ${hour},
           reminder_asked   = TRUE,
           ignored_streak   = 0,
           last_reminded_at = CASE
             WHEN ${hour}::smallint IS NOT NULL
              AND ${hour}::smallint <= EXTRACT(
                    HOUR FROM (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE})
                  )::int
             THEN COALESCE(${at}::timestamptz, now())
             ELSE last_reminded_at
           END
     WHERE telegram_id = ${telegramId}
  `;
}

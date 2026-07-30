import type { Sql } from "postgres";
import { GUILDS } from "../config.ts";

export interface UserRow {
  telegramId: number;
  guildSlug: string;
  firstName: string;
  username: string | null;
  reminderHour: number | null;
}

interface UserRecord {
  telegram_id: string;
  guild_slug: string;
  first_name: string;
  username: string | null;
  reminder_hour: number | null;
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
  };
}

const USER_COLUMNS = "telegram_id::text, guild_slug, first_name, username, reminder_hour";

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

/** FR-4 and FR-24. null means reminders off, which is a real stored answer
 *  rather than an absence of one. */
export async function setReminderHour(
  sql: Sql,
  telegramId: number,
  hour: number | null,
): Promise<void> {
  await sql`UPDATE users SET reminder_hour = ${hour} WHERE telegram_id = ${telegramId}`;
}

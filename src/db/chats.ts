import type { Sql } from "postgres";

export interface Chat {
  chatId: string;
  guildSlug: string;
  pinnedMessageId: string | null;
  pinnedText: string | null;
  pinFailed: boolean;
  lastMondayWeek: string;
}

interface ChatRecord {
  chat_id: string;
  guild_slug: string;
  pinned_message_id: string | null;
  pinned_text: string | null;
  pin_failed: boolean;
  last_monday_week: string;
}

/**
 * Every BIGINT and DATE is selected ::text. postgres.js hands BIGINT back as a
 * string and DATE as a Date at UTC midnight, and a supergroup id is large and
 * negative, so a raw select is exactly where a chat id would stop matching the
 * one Telegram sent.
 */
const CHAT_COLUMNS =
  "chat_id::text, guild_slug, pinned_message_id::text, pinned_text, pin_failed, last_monday_week::text";

function toChat(record: ChatRecord): Chat {
  return {
    chatId: record.chat_id,
    guildSlug: record.guild_slug,
    pinnedMessageId: record.pinned_message_id,
    pinnedText: record.pinned_text,
    pinFailed: record.pin_failed,
    lastMondayWeek: record.last_monday_week,
  };
}

/**
 * FR-18. Binding and rebinding are one operation.
 *
 * ON CONFLICT updates guild_slug alone, deliberately: last_monday_week must
 * survive a rebind (phase 2 design 3.1), or an admin could rebind a chat to
 * force a second Monday post in the same week. weekStart is therefore only
 * ever used for the initial insert, where it starts the ledger at the current
 * week so a chat bound mid-week does not immediately receive a "new week" post
 * (phase 2 design 2.4).
 */
export async function bindChat(
  sql: Sql,
  chatId: string,
  guildSlug: string,
  weekStart: string,
): Promise<void> {
  await sql`
    INSERT INTO chats (chat_id, guild_slug, last_monday_week)
    VALUES (${chatId}::bigint, ${guildSlug}, ${weekStart}::date)
    ON CONFLICT (chat_id) DO UPDATE SET guild_slug = EXCLUDED.guild_slug
  `;
}

export async function findChat(sql: Sql, chatId: string): Promise<Chat | null> {
  const [record] = await sql<ChatRecord[]>`
    SELECT ${sql.unsafe(CHAT_COLUMNS)} FROM chats WHERE chat_id = ${chatId}::bigint
  `;
  return record ? toChat(record) : null;
}

/**
 * Ordered by the ::text form of chat_id (lexicographic, not numeric, since
 * the unaliased cast in CHAT_COLUMNS becomes the output column ORDER BY
 * resolves against), which is fine: the ticker only needs a stable order to
 * walk chats in, not a numeric one.
 */
export async function listChats(sql: Sql): Promise<Chat[]> {
  const records = await sql<ChatRecord[]>`
    SELECT ${sql.unsafe(CHAT_COLUMNS)} FROM chats ORDER BY chat_id
  `;
  return records.map(toChat);
}

export async function unbindChat(sql: Sql, chatId: string): Promise<void> {
  await sql`DELETE FROM chats WHERE chat_id = ${chatId}::bigint`;
}

/**
 * FR-19. pinned_text is stored so the next refresh can skip an unchanged edit
 * rather than send it and collect Telegram's 400 "message is not modified"
 * (phase 2 design 2.3). It is a rendered string and is never read back as data.
 */
export async function recordPin(
  sql: Sql,
  chatId: string,
  input: { messageId: string | null; text: string; pinFailed: boolean },
): Promise<void> {
  await sql`
    UPDATE chats
       SET pinned_message_id = ${input.messageId}::bigint,
           pinned_text       = ${input.text},
           pin_failed        = ${input.pinFailed}
     WHERE chat_id = ${chatId}::bigint
  `;
}

/** FR-20. The ledger that makes the Monday post exactly-once across restarts. */
export async function recordMondayPost(
  sql: Sql,
  chatId: string,
  weekStart: string,
): Promise<void> {
  await sql`
    UPDATE chats SET last_monday_week = ${weekStart}::date WHERE chat_id = ${chatId}::bigint
  `;
}

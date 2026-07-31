import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds } from "../../src/db/users.ts";
import {
  bindChat,
  findChat,
  listChats,
  recordMondayPost,
  recordPin,
  unbindChat,
} from "../../src/db/chats.ts";

const sql = await freshDatabase("chats");
afterAll(async () => { await sql.end(); });

// A real supergroup id: large and negative, which is the shape that a missing
// ::text cast corrupts.
const SUPERGROUP = "-1001234567890";
const WEEK = "2026-07-27";

beforeEach(async () => {
  await sql`DELETE FROM chats`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
});

describe("chats (FR-18)", () => {
  test("binds a chat to a guild and reads it back", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    const chat = await findChat(sql, SUPERGROUP);
    expect(chat).not.toBeNull();
    expect(chat!.guildSlug).toBe("prodeko");
    expect(chat!.lastMondayWeek).toBe(WEEK);
    expect(chat!.pinnedMessageId).toBeNull();
    expect(chat!.pinFailed).toBe(false);
  });

  // Phase 2 design 2.2. A supergroup id must survive the round trip as an
  // exact string, never as a JS number.
  test("returns the chat id as an exact string", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    const chat = await findChat(sql, SUPERGROUP);
    expect(chat!.chatId).toBe(SUPERGROUP);
    expect(typeof chat!.chatId).toBe("string");
  });

  test("returns null for a chat that was never bound", async () => {
    expect(await findChat(sql, SUPERGROUP)).toBeNull();
  });

  // Phase 2 design 3.1. Rebinding changes the guild and must NOT reset the
  // Monday ledger, or rebinding would be a way to trigger a second post in
  // one week.
  test("rebinding changes the guild but keeps last_monday_week", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordMondayPost(sql, SUPERGROUP, "2026-08-03");
    await bindChat(sql, SUPERGROUP, "inkubio", "2026-08-10");

    const chat = await findChat(sql, SUPERGROUP);
    expect(chat!.guildSlug).toBe("inkubio");
    expect(chat!.lastMondayWeek).toBe("2026-08-03");
    expect(await listChats(sql)).toHaveLength(1);
  });

  test("records a pinned message and its rendered text", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordPin(sql, SUPERGROUP, { messageId: "42", text: "rendered", pinFailed: false });

    const chat = await findChat(sql, SUPERGROUP);
    expect(chat!.pinnedMessageId).toBe("42");
    expect(chat!.pinnedText).toBe("rendered");
    expect(chat!.pinFailed).toBe(false);
  });

  // Phase 2 design 3.2. The flag drives one extra line in the render and is
  // cleared the moment a retry succeeds.
  test("records and then clears a failed pin", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordPin(sql, SUPERGROUP, { messageId: "42", text: "a", pinFailed: true });
    expect((await findChat(sql, SUPERGROUP))!.pinFailed).toBe(true);

    await recordPin(sql, SUPERGROUP, { messageId: "42", text: "b", pinFailed: false });
    expect((await findChat(sql, SUPERGROUP))!.pinFailed).toBe(false);
  });

  test("records a Monday post", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await recordMondayPost(sql, SUPERGROUP, "2026-08-03");
    expect((await findChat(sql, SUPERGROUP))!.lastMondayWeek).toBe("2026-08-03");
  });

  test("unbinds a chat", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await unbindChat(sql, SUPERGROUP);
    expect(await findChat(sql, SUPERGROUP)).toBeNull();
    expect(await listChats(sql)).toHaveLength(0);
  });

  test("lists every bound chat", async () => {
    await bindChat(sql, SUPERGROUP, "prodeko", WEEK);
    await bindChat(sql, "-1009876543210", "tik", WEEK);
    const all = await listChats(sql);
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.guildSlug).sort()).toEqual(["prodeko", "tik"]);
  });
});

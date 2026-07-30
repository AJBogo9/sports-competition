import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { calendar, weekStartOf } from "../../src/db/calendar.ts";
import {
  createUser,
  findUser,
  moveUser,
  setReminderHour,
  syncGuilds,
} from "../../src/db/users.ts";
import { GUILDS } from "../../src/config.ts";

const sql = await freshDatabase("users");
afterAll(async () => { await sql.end(); });

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
});

describe("calendar", () => {
  test("today and yesterday are adjacent yyyy-mm-dd strings", async () => {
    const { today, yesterday } = await calendar(sql);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const gap = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${yesterday}T00:00:00Z`);
    expect(gap).toBe(24 * 60 * 60 * 1000);
  });

  test("the week starts on a Monday", async () => {
    const { weekStart } = await calendar(sql);
    expect(new Date(`${weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  test("today falls on or after the current week start", async () => {
    const { today, weekStart } = await calendar(sql);
    expect(weekStart <= today).toBe(true);
  });

  test("weekStartOf maps every day of a week to the same Monday", async () => {
    const monday = "2026-07-27";
    for (const day of [
      "2026-07-27", "2026-07-28", "2026-07-29",
      "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02",
    ]) {
      expect(await weekStartOf(sql, day)).toBe(monday);
    }
  });

  test("the next Monday starts a new week", async () => {
    expect(await weekStartOf(sql, "2026-08-03")).toBe("2026-08-03");
  });

  // Design 4.2. The clock changes on Sunday 25 October 2026, inside a window
  // that an autumn competition could easily span. A week boundary computed by
  // adding 7 times 24 hours would drift an hour across it.
  test("week boundaries survive the 25 October 2026 clock change", async () => {
    expect(await weekStartOf(sql, "2026-10-24")).toBe("2026-10-19");
    expect(await weekStartOf(sql, "2026-10-25")).toBe("2026-10-19");
    expect(await weekStartOf(sql, "2026-10-26")).toBe("2026-10-26");
  });
});

describe("syncGuilds", () => {
  test("writes every configured guild", async () => {
    const rows = await sql<{ slug: string }[]>`SELECT slug FROM guilds ORDER BY slug`;
    expect(rows).toHaveLength(GUILDS.length);
  });

  test("is idempotent, so a restart changes nothing", async () => {
    await syncGuilds(sql);
    const rows = await sql`SELECT slug FROM guilds`;
    expect(rows).toHaveLength(GUILDS.length);
  });

  // FR-25: correcting a member count in config and restarting must take
  // effect, because it is the denominator of every comparison.
  test("updates a name or member count changed in config", async () => {
    await sql`UPDATE guilds SET member_count = 1, name = 'Stale' WHERE slug = 'prodeko'`;
    await syncGuilds(sql);
    const [row] = await sql<{ name: string; member_count: number }[]>`
      SELECT name, member_count FROM guilds WHERE slug = 'prodeko'
    `;
    expect(row?.name).toBe("Prodeko");
    expect(row?.member_count).toBe(650);
  });
});

describe("users", () => {
  test("findUser returns null for someone who has never started the bot", async () => {
    expect(await findUser(sql, 999)).toBeNull();
  });

  // FR-1: tapping a guild link registers immediately, with zero extra taps.
  test("createUser registers against the guild from the deep link", async () => {
    const user = await createUser(sql, {
      telegramId: 4242,
      guildSlug: "prodeko",
      firstName: "Andreas",
      username: "abogo",
    });
    expect(user.guildSlug).toBe("prodeko");
    expect(user.firstName).toBe("Andreas");
    expect(user.reminderHour).toBeNull();
  });

  // A Telegram ID is a BIGINT, which the driver returns as a string. It must
  // arrive back as a number, or it silently stops matching anything.
  test("telegramId round-trips as a number", async () => {
    await createUser(sql, { telegramId: 7123456789, guildSlug: "tik", firstName: "Iiris" });
    const found = await findUser(sql, 7123456789);
    expect(found?.telegramId).toBe(7123456789);
    expect(typeof found?.telegramId).toBe("number");
  });

  test("a missing username is stored as null, not as the string undefined", async () => {
    await createUser(sql, { telegramId: 5, guildSlug: "as", firstName: "Noname" });
    expect((await findUser(sql, 5))?.username).toBeNull();
  });

  // FR-3: re-registration must not create a duplicate or silently move anyone.
  test("createUser on an existing user does not duplicate or move them", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await createUser(sql, { telegramId: 4242, guildSlug: "tik", firstName: "Andreas" });

    const rows = await sql`SELECT 1 FROM users WHERE telegram_id = 4242`;
    expect(rows).toHaveLength(1);
    expect((await findUser(sql, 4242))?.guildSlug).toBe("prodeko");
  });

  test("moveUser changes guild only when called explicitly", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await moveUser(sql, 4242, "tik");
    expect((await findUser(sql, 4242))?.guildSlug).toBe("tik");
  });

  // FR-4: declining must be permitted, and there is no silent default.
  test("reminder hour stores a chosen hour and clears back to off", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await setReminderHour(sql, 4242, 20);
    expect((await findUser(sql, 4242))?.reminderHour).toBe(20);

    await setReminderHour(sql, 4242, null);
    expect((await findUser(sql, 4242))?.reminderHour).toBeNull();
  });

  test("an hour outside 0 to 23 is rejected by the database", async () => {
    await createUser(sql, { telegramId: 4242, guildSlug: "prodeko", firstName: "Andreas" });
    await expect(setReminderHour(sql, 4242, 25)).rejects.toThrow(/violates check constraint/);
  });
});

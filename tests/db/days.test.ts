import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds, createUser } from "../../src/db/users.ts";
import { dayTier, logDay, undoDay, weekMinutes } from "../../src/db/days.ts";

const sql = await freshDatabase("days");
afterAll(async () => { await sql.end(); });

const ANDREAS = 4242;
const WEEK = "2026-07-27"; // a Monday

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
  await createUser(sql, { telegramId: ANDREAS, guildSlug: "prodeko", firstName: "Andreas" });
});

describe("logDay", () => {
  test("a first log stores the tier and displaces nothing", async () => {
    const result = await logDay(sql, ANDREAS, "2026-07-28", "medium");
    expect(result).toEqual({ stored: "medium", displaced: null });
  });

  // FR-7: a second report for the same date replaces the first rather than
  // adding to it. The acceptance test is short then long giving 75, not 97.
  test("a second log the same day replaces the first (FR-7)", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "short");
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(75);
  });

  test("only ever one row per person per day", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "short");
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    const rows = await sql`SELECT 1 FROM days WHERE telegram_id = ${ANDREAS}`;
    expect(rows).toHaveLength(1);
  });

  // Design 4.5: FR-9's requirement and its acceptance test disagree unless
  // undo can put back what the log displaced.
  test("an overwrite reports the tier it displaced", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    const result = await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(result).toEqual({ stored: "long", displaced: "medium" });
  });

  test("logging the same tier twice reports it as displaced", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    const result = await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(result).toEqual({ stored: "long", displaced: "long" });
  });

  test("a rest day is a stored row worth zero minutes (FR-8)", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "rest");
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("rest");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  // FR-10: backdating one day writes to the previous date and is itself
  // subject to FR-7.
  test("backdating writes to the given date, not to today", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    await logDay(sql, ANDREAS, "2026-07-29", "short");
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("long");
    expect(await dayTier(sql, ANDREAS, "2026-07-29")).toBe("short");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(97);
  });
});

describe("undoDay (FR-9)", () => {
  test("removes the day entirely when nothing was displaced", async () => {
    const { stored } = await logDay(sql, ANDREAS, "2026-07-28", "medium");
    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: null })).toBe(true);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBeNull();
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  // FR-9's acceptance test: undo restores the exact weekly total from before
  // the log. Deleting the row would lose the displaced tier's minutes too.
  test("restores the displaced tier, giving back the exact prior total", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    const before = await weekMinutes(sql, ANDREAS, WEEK);

    const { stored, displaced } = await logDay(sql, ANDREAS, "2026-07-28", "long");
    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: displaced })).toBe(true);

    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(before);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("medium");
  });

  test("undoing a day that is already gone is harmless", async () => {
    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: "medium", restore: null })).toBe(false);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBeNull();
  });

  test("leaves other days untouched", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "long");
    const { stored } = await logDay(sql, ANDREAS, "2026-07-29", "long");
    await undoDay(sql, ANDREAS, "2026-07-29", { expected: stored, restore: null });
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(75);
  });

  // A confirmation message stays live for days and its Undo button never
  // expires (NFR-5), so two confirmations for the same day can both be sitting
  // in the chat: one from the daily reminder, one from a later /log that
  // corrected the tier. Tapping the older one used to apply its own stale
  // payload unconditionally, reverting an entry it knew nothing about. The date
  // was already rechecked against the live calendar; the tier was not.
  test("refuses to delete a day that has been logged again since", async () => {
    const { stored } = await logDay(sql, ANDREAS, "2026-07-28", "medium");
    await logDay(sql, ANDREAS, "2026-07-28", "long");

    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: null })).toBe(false);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("long");
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(75);
  });

  test("refuses to restore over a day that has been logged again since", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "short");
    const { stored, displaced } = await logDay(sql, ANDREAS, "2026-07-28", "medium");
    await logDay(sql, ANDREAS, "2026-07-28", "long");

    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: displaced })).toBe(false);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("long");
  });

  // The guard is the day's tier, not a version counter, so re-logging the same
  // tier leaves the older undo applicable. That is the right answer: the day
  // holds exactly what that undo expects, so putting the displaced tier back
  // restores exactly the total it promises.
  test("still applies when the day was re-logged at the same tier", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "short");
    const { stored, displaced } = await logDay(sql, ANDREAS, "2026-07-28", "long");
    await logDay(sql, ANDREAS, "2026-07-28", "long");

    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: displaced })).toBe(true);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBe("short");
  });

  test("a second tap on the same undo changes nothing further", async () => {
    const { stored, displaced } = await logDay(sql, ANDREAS, "2026-07-28", "medium");
    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: displaced })).toBe(true);
    expect(await undoDay(sql, ANDREAS, "2026-07-28", { expected: stored, restore: displaced })).toBe(false);
    expect(await dayTier(sql, ANDREAS, "2026-07-28")).toBeNull();
  });
});

describe("weekMinutes", () => {
  test("is zero for a user who has logged nothing", async () => {
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  test("sums the week from Monday to Sunday inclusive", async () => {
    await logDay(sql, ANDREAS, "2026-07-27", "short");  // Monday
    await logDay(sql, ANDREAS, "2026-08-02", "short");  // Sunday
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(44);
  });

  test("excludes the next week, since the week resets on Monday", async () => {
    await logDay(sql, ANDREAS, "2026-08-03", "long");   // the following Monday
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  test("excludes the previous week", async () => {
    await logDay(sql, ANDREAS, "2026-07-26", "long");   // the preceding Sunday
    expect(await weekMinutes(sql, ANDREAS, WEEK)).toBe(0);
  });

  test("returns a number rather than a driver string", async () => {
    await logDay(sql, ANDREAS, "2026-07-28", "medium");
    expect(typeof await weekMinutes(sql, ANDREAS, WEEK)).toBe("number");
  });
});

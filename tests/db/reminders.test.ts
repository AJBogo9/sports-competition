import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import {
  clearBlocked,
  dueReminders,
  recordReminder,
  resumeReminders,
  setBlocked,
} from "../../src/db/reminders.ts";
import { createUser, findUser, syncGuilds } from "../../src/db/users.ts";
import { logDay } from "../../src/db/days.ts";

const sql = await freshDatabase("reminders");
afterAll(async () => { await sql.end(); });

// Helsinki is UTC+3 in July, so these UTC instants are chosen to land on exact
// local hours. Every one of them is a Tuesday inside the placeholder window.
const AT_2000 = "2026-07-28T17:00:00Z"; // 20:00 local
const AT_2100 = "2026-07-28T18:00:00Z"; // 21:00 local, inside the grace window
const AT_2200 = "2026-07-28T19:00:00Z"; // 22:00 local, past it
const AT_0830 = "2026-07-28T05:30:00Z"; // 08:30 local, long before
const TODAY = "2026-07-28";

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
  await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Ada" });
  // Set the column directly rather than through setReminderHour, so these
  // tests pin dueReminders alone and do not also depend on that function's
  // stamping rule (phase 3 design 3.4), which has its own tests.
  await sql`UPDATE users SET reminder_hour = 20 WHERE telegram_id = 1`;
});

describe("dueReminders (FR-21)", () => {
  test("a user is due at their chosen hour", async () => {
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due.map((row) => row.telegramId)).toEqual([1]);
    expect(due[0]?.ignoredStreak).toBe(0);
    expect(due[0]?.responded).toBe(false);
  });

  test("nobody is due before their hour", async () => {
    expect(await dueReminders(sql, { at: AT_0830 })).toHaveLength(0);
  });

  // FR-21: "MUST send it only to users who have not yet recorded that day."
  test("logging today suppresses the reminder", async () => {
    await logDay(sql, 1, TODAY, "short");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  // FR-8. A rest day is an explicit record, so it counts as having answered
  // and must suppress the reminder exactly as a workout does.
  test("a rest day suppresses the reminder too", async () => {
    await logDay(sql, 1, TODAY, "rest");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  test("a log for yesterday does not suppress today's reminder", async () => {
    await logDay(sql, 1, "2026-07-27", "long");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(1);
  });

  // FR-23. blocked gates outbound messaging, and this is the gate.
  test("a blocked user is never a candidate", async () => {
    await setBlocked(sql, 1);
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  test("reminders off means no candidate", async () => {
    await sql`UPDATE users SET reminder_hour = NULL WHERE telegram_id = 1`;
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  // Phase 3 design 2.2. The tick runs every 60 seconds and the hour lasts 60
  // minutes, so without this gate one reminder would be sent sixty times.
  test("a user already reminded today is not due again", async () => {
    await recordReminder(sql, 1, 1, AT_2000);
    expect(await dueReminders(sql, { at: AT_2100 })).toHaveLength(0);
  });

  test("a reminder yesterday does not block one today", async () => {
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(1);
  });

  // Phase 3 design 4.1. The grace window, in SQL, matching isWithinGrace.
  test("a missed reminder is still due one hour later", async () => {
    expect(await dueReminders(sql, { at: AT_2100 })).toHaveLength(1);
  });

  test("a missed reminder is dropped two hours later", async () => {
    expect(await dueReminders(sql, { at: AT_2200 })).toHaveLength(0);
  });

  // Phase 3 design 3.1. The window cannot wrap past midnight: an hour-23 user
  // is not due at 00:30 the next day, which would be a different day's ledger.
  test("a 23:00 reminder does not wrap past midnight", async () => {
    await sql`UPDATE users SET reminder_hour = 23 WHERE telegram_id = 1`;
    expect(await dueReminders(sql, { at: "2026-07-28T20:30:00Z" })).toHaveLength(1); // 23:30
    expect(await dueReminders(sql, { at: "2026-07-28T21:30:00Z" })).toHaveLength(0); // 00:30
  });

  // Phase 3 design 3.3. The paused state is an absence of candidacy. Six means
  // the follow-up has gone out and was not answered.
  test("a paused user is excluded outright", async () => {
    await sql`UPDATE users SET ignored_streak = 6 WHERE telegram_id = 1`;
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);
  });

  test("a user at the threshold is still a candidate, for the follow-up", async () => {
    await sql`UPDATE users SET ignored_streak = 5 WHERE telegram_id = 1`;
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.ignoredStreak).toBe(5);
  });

  // Phase 3 design 2.2. "responded" is the second job last_reminded_at does:
  // did anything get written since the last time we pinged this person.
  //
  // logged_at is stamped explicitly in both of these. logDay writes now(), the
  // real wall clock, which is always later than any pinned 2026 instant, so
  // without the stamp the second test would compare a real timestamp against a
  // fixed past one and pass for the wrong reason (or fail once the placeholder
  // window is replaced with real dates).
  test("responded is true when a log landed after the last reminder", async () => {
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");
    await logDay(sql, 1, "2026-07-27", "short");
    await sql`UPDATE days SET logged_at = '2026-07-27T19:00:00Z' WHERE telegram_id = 1`;
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.responded).toBe(true);
  });

  test("responded is false when the only log predates the last reminder", async () => {
    await logDay(sql, 1, "2026-07-27", "short");
    await sql`UPDATE days SET logged_at = '2026-07-27T10:00:00Z' WHERE telegram_id = 1`;
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.responded).toBe(false);
  });

  test("responded is false for a user who has never been reminded", async () => {
    await logDay(sql, 1, "2026-07-27", "short");
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.responded).toBe(false);
  });

  // Phase 3 design 4.2. The batch is capped so a popular hour cannot burst
  // past Telegram's rate limit, and the remainder rolls to the next tick.
  test("the batch is capped and never-reminded users go first", async () => {
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bo" });
    await createUser(sql, { telegramId: 3, guildSlug: "prodeko", firstName: "Cy" });
    await sql`UPDATE users SET reminder_hour = 20`;
    // User 1 was reminded yesterday; 2 and 3 never have been, so they sort
    // first under NULLS FIRST, then by telegram_id.
    await recordReminder(sql, 1, 1, "2026-07-27T17:00:00Z");

    const due = await dueReminders(sql, { at: AT_2000, limit: 2 });
    expect(due.map((row) => row.telegramId)).toEqual([2, 3]);
  });

  test("telegramId comes back as a number, not a BIGINT string", async () => {
    await sql`DELETE FROM users`;
    await createUser(sql, { telegramId: 7123456789, guildSlug: "tik", firstName: "Iiris" });
    await sql`UPDATE users SET reminder_hour = 20 WHERE telegram_id = 7123456789`;
    const due = await dueReminders(sql, { at: AT_2000 });
    expect(due[0]?.telegramId).toBe(7123456789);
    expect(typeof due[0]?.telegramId).toBe("number");
  });
});

describe("recordReminder", () => {
  test("writes the new streak and the send time together", async () => {
    await recordReminder(sql, 1, 3, AT_2000);
    const [row] = await sql<{ ignored_streak: number; last_reminded_at: Date }[]>`
      SELECT ignored_streak, last_reminded_at FROM users WHERE telegram_id = 1
    `;
    expect(row?.ignored_streak).toBe(3);
    expect(row?.last_reminded_at).not.toBeNull();
  });
});

describe("resumeReminders (FR-22)", () => {
  // "a user who taps 'keep them' resumes immediately". The hour must survive,
  // or resuming would silently mean choosing again.
  test("clears the pause and keeps the chosen hour", async () => {
    await sql`UPDATE users SET ignored_streak = 6 WHERE telegram_id = 1`;
    await resumeReminders(sql, 1);
    const [row] = await sql<{ ignored_streak: number }[]>`
      SELECT ignored_streak FROM users WHERE telegram_id = 1
    `;
    expect(row?.ignored_streak).toBe(0);
    expect((await findUser(sql, 1))?.reminderHour).toBe(20);
  });
});

describe("blocked (FR-23)", () => {
  test("setBlocked stops the user being a candidate, clearBlocked restores it", async () => {
    await setBlocked(sql, 1);
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(0);

    await clearBlocked(sql, 1);
    expect(await dueReminders(sql, { at: AT_2000 })).toHaveLength(1);
  });

  // Phase 3 design 3.5. clearBlocked runs on every private-chat update, so it
  // must be a cheap no-op for the overwhelming majority who are not blocked.
  test("clearBlocked on an unblocked user changes nothing", async () => {
    await clearBlocked(sql, 1);
    const [row] = await sql<{ blocked: boolean }[]>`
      SELECT blocked FROM users WHERE telegram_id = 1
    `;
    expect(row?.blocked).toBe(false);
  });

  // The invariant that must never move: blocking is a decision about being
  // messaged, never about being counted (SPEC.md section 6). The three tests in
  // tests/db/standings.test.ts guard the query side; this guards that setBlocked
  // itself does not touch anything scoring reads.
  test("blocking does not remove the day the user already logged", async () => {
    await logDay(sql, 1, TODAY, "long");
    await setBlocked(sql, 1);
    const rows = await sql`SELECT 1 FROM days WHERE telegram_id = 1`;
    expect(rows).toHaveLength(1);
  });
});

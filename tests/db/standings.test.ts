import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { syncGuilds, createUser } from "../../src/db/users.ts";
import { logDay } from "../../src/db/days.ts";
import { neighbours, participation, standings, weeklyTotals } from "../../src/db/standings.ts";

const sql = await freshDatabase("standings");
afterAll(async () => { await sql.end(); });

const WEEK_FROM = "2026-07-27";
const WEEK_TO = "2026-08-02";

beforeEach(async () => {
  await sql`DELETE FROM days`;
  await sql`DELETE FROM users`;
  await sql`DELETE FROM guilds`;
  await syncGuilds(sql);
});

describe("standings (FR-16)", () => {
  test("lists every configured guild, including ones with nobody registered", async () => {
    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    expect(table).toHaveLength(9);
    expect(table.every((row) => typeof row.perMember === "number")).toBe(true);
    expect(table.every((row) => typeof row.activeDays === "number")).toBe(true);
  });

  // Phase 5 design 11.2. The local race converts a per-member gap into sessions
  // over the reader's own roster, so each row carries its denominator.
  test("each row carries its roster size from config", async () => {
    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    expect(table.find((row) => row.slug === "prodeko")?.memberCount).toBe(650);
    expect(table.find((row) => row.slug === "tik")?.memberCount).toBe(700);
  });

  // SPEC.md section 4.3 (amended 2026-09-08): active days per member across
  // the entire roster, including everyone who never logs anything. Prodeko has
  // 650 members and TiK has 700, both from config. Minutes are still summed,
  // as the tiebreaker.
  test("divides by the full roster, hand-calculated", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
    await createUser(sql, { telegramId: 3, guildSlug: "tik", firstName: "Carol" });

    await logDay(sql, 1, "2026-07-28", "medium");  // 45
    await logDay(sql, 1, "2026-07-29", "long");    // 75
    await logDay(sql, 2, "2026-07-28", "short");   // 22
    await logDay(sql, 3, "2026-07-28", "rest");    // 0

    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    const prodeko = table.find((row) => row.slug === "prodeko");
    const tik = table.find((row) => row.slug === "tik");

    expect(prodeko?.activeDays).toBe(3);
    expect(prodeko?.minutes).toBe(142);
    expect(prodeko?.perMember).toBeCloseTo(3 / 650, 5);
    expect(tik?.activeDays).toBe(0);
    expect(tik?.minutes).toBe(0);
    expect(tik?.perMember).toBe(0);
  });

  // Phase 5 design 12.1. A day counts once whatever its tier, and a rest day
  // is a record but not an active day.
  test("a day counts once however long, and a rest day is not an active day", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-27", "rest");
    await logDay(sql, 1, "2026-07-28", "long");
    await logDay(sql, 1, "2026-07-29", "short");

    const prodeko = (await standings(sql, WEEK_FROM, WEEK_TO))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.activeDays).toBe(2);
    expect(prodeko?.perMember).toBeCloseTo(2 / 650, 5);
  });

  // Phase 5 design 12.1. Equal active days per member break the tie on
  // minutes per member, so volume decides ties without deciding the race.
  // Prodeko and AS both have 650 members.
  test("equal active days per member are broken by minutes per member", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "as", firstName: "Short" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Long" });
    await logDay(sql, 1, "2026-07-28", "short");
    await logDay(sql, 2, "2026-07-28", "long");

    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    expect(table[0]?.slug).toBe("prodeko");
    expect(table[1]?.slug).toBe("as");
    expect(table[0]?.perMember).toBe(table[1]?.perMember);
  });

  // Verified against Postgres: SUM(minutes) / member_count with two integers
  // returns 0, because 142 / 650 truncates. The query printed in SPEC.md
  // section 6 has this bug.
  test("per-member is fractional, not truncated to zero by integer division", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "long");

    const prodeko = (await standings(sql, WEEK_FROM, WEEK_TO))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.perMember).toBeGreaterThan(0);
    expect(prodeko?.perMember).toBeCloseTo(1 / 650, 5);
  });

  test("ranks by active days per member, not by raw days", async () => {
    // Athene has 350 members, TiK has 700. Equal raw days must put the
    // smaller guild ahead.
    await createUser(sql, { telegramId: 1, guildSlug: "athene", firstName: "Small" });
    await createUser(sql, { telegramId: 2, guildSlug: "tik", firstName: "Big" });
    await logDay(sql, 1, "2026-07-28", "long");
    await logDay(sql, 2, "2026-07-28", "long");

    const table = await standings(sql, WEEK_FROM, WEEK_TO);
    expect(table[0]?.slug).toBe("athene");
  });

  test("excludes days outside the requested range, which is the weekly reset", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-08-03", "long");  // the following Monday

    const prodeko = (await standings(sql, WEEK_FROM, WEEK_TO))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.activeDays).toBe(0);
    expect(prodeko?.minutes).toBe(0);
  });

  test("a season range accumulates across weeks", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "long");
    await logDay(sql, 1, "2026-08-04", "long");

    const prodeko = (await standings(sql, "2026-07-27", "2026-08-09"))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.activeDays).toBe(2);
    expect(prodeko?.minutes).toBe(150);
  });
});

describe("neighbours (FR-15)", () => {
  beforeEach(async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Sanna" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Andreas" });
    await createUser(sql, { telegramId: 3, guildSlug: "prodeko", firstName: "Otto" });
    await createUser(sql, { telegramId: 4, guildSlug: "prodeko", firstName: "Far" });
    await createUser(sql, { telegramId: 5, guildSlug: "tik", firstName: "Outsider" });

    await logDay(sql, 1, "2026-07-28", "long");    // 75
    await logDay(sql, 1, "2026-07-29", "long");    // 150 total
    await logDay(sql, 2, "2026-07-28", "long");    // 75
    await logDay(sql, 3, "2026-07-28", "medium");  // 45
    await logDay(sql, 5, "2026-07-28", "long");    // other guild
  });

  test("returns the user with one neighbour either side", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.map((r) => r.firstName)).toEqual(["Sanna", "Andreas", "Otto"]);
    expect(rows.map((r) => r.minutes)).toEqual([150, 75, 45]);
  });

  test("marks exactly one row as the user", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.filter((r) => r.isSelf)).toHaveLength(1);
    expect(rows.find((r) => r.isSelf)?.firstName).toBe("Andreas");
  });

  test("never reaches into another guild", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.map((r) => r.firstName)).not.toContain("Outsider");
  });

  test("never returns more than three rows, so it cannot become a leaderboard", async () => {
    const rows = await neighbours(sql, 1, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  test("the top user has no one above them", async () => {
    const rows = await neighbours(sql, 1, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows[0]?.firstName).toBe("Sanna");
    expect(rows[0]?.isSelf).toBe(true);
  });

  test("a user who has logged nothing still appears, at zero", async () => {
    const rows = await neighbours(sql, 4, "prodeko", WEEK_FROM, WEEK_TO);
    const self = rows.find((r) => r.isSelf);
    expect(self?.firstName).toBe("Far");
    expect(self?.minutes).toBe(0);
  });

  test("ordering is deterministic when two users tie on minutes and name", async () => {
    // Two users with the same first name and same minutes (0, since they log
    // nothing). Without telegram_id as a tiebreaker in ORDER BY, Postgres could
    // return them in different order on successive calls, breaking /me consistency.
    await createUser(sql, { telegramId: 10, guildSlug: "prodeko", firstName: "Alex" });
    await createUser(sql, { telegramId: 11, guildSlug: "prodeko", firstName: "Alex" });

    const call1 = await neighbours(sql, 10, "prodeko", WEEK_FROM, WEEK_TO);
    const call2 = await neighbours(sql, 10, "prodeko", WEEK_FROM, WEEK_TO);

    // Results must be identical across calls: same rows in same order, proving
    // the ordering is deterministic (not dependent on Postgres' arbitrary choice
    // when all sort keys are equal).
    expect(call1).toEqual(call2);

    // Exactly one row must be marked isSelf, the one with telegram_id 10.
    expect(call1.filter((r) => r.isSelf)).toHaveLength(1);
    expect(call1.find((r) => r.isSelf)?.firstName).toBe("Alex");

    // With telegram_id as the final tiebreaker, when Alex (10) and Alex (11)
    // both score 0 with the same first name, the lower telegram_id (10) must
    // rank before the higher telegram_id (11). In the window (ranks 3-5: Otto,
    // Alex(10), Alex(11)), the self row sits at index 1.
    const selfIndex = call1.findIndex((r) => r.isSelf);
    expect(selfIndex).toBe(1);
    const alexRows = call1.filter((r) => r.firstName === "Alex");
    expect(alexRows[0]?.isSelf).toBe(true);
  });
});

describe("weeklyTotals", () => {
  test("groups minutes by the Monday that starts each week", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "long");   // week of 07-27
    await logDay(sql, 1, "2026-07-29", "long");   // week of 07-27
    await logDay(sql, 1, "2026-08-04", "medium"); // week of 08-03

    const totals = await weeklyTotals(sql, 1);
    expect(totals).toEqual([
      { weekStart: "2026-07-27", minutes: 150 },
      { weekStart: "2026-08-03", minutes: 45 },
    ]);
  });

  test("returns an empty list for a user who has logged nothing", async () => {
    await createUser(sql, { telegramId: 9, guildSlug: "prodeko", firstName: "New" });
    expect(await weeklyTotals(sql, 9)).toEqual([]);
  });

  test("a week of only rest days appears at zero minutes", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "rest");
    expect(await weeklyTotals(sql, 1)).toEqual([{ weekStart: "2026-07-27", minutes: 0 }]);
  });
});

describe("participation (FR-20)", () => {
  // Phase 5 design 5.4. A count of people, not a share of the roster: at the
  // base rate SPEC.md section 1 expects, the share this used to return was a
  // low descriptive norm broadcast to a whole guild chat every Monday.
  test("counts the members who logged at least once", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
    await logDay(sql, 1, "2026-07-28", "medium");
    await logDay(sql, 2, "2026-07-29", "long");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(2);
  });

  // Phase 2 design 4.3. FR-8 makes rest an explicit record rather than an
  // absence, and this number measures engagement, not minutes.
  test("counts a rest day as participation", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "rest");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(1);
  });

  test("counts a member who logged twice only once", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-07-28", "short");
    await logDay(sql, 1, "2026-07-29", "long");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(1);
  });

  test("excludes a registered member who never logged", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(0);
  });

  test("excludes days outside the range", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await logDay(sql, 1, "2026-08-05", "long");
    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(0);
  });

  // WEEK_FROM and WEEK_TO are the range's exact boundaries, not a day inside
  // it. BETWEEN is inclusive on both ends, and a log on either boundary date
  // must still count, unlike the three-days-past-the-end case above.
  test("includes both boundary dates of the range", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
    await logDay(sql, 1, "2026-07-27", "long"); // WEEK_FROM itself
    await logDay(sql, 2, "2026-08-02", "long"); // WEEK_TO itself

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(2);
  });

  test("returns zero for a guild with nobody registered", async () => {
    expect(await participation(sql, "athene", WEEK_FROM, WEEK_TO)).toBe(0);
  });

  // Proves the u.guild_slug = g.slug join is load-bearing: a logger in
  // another guild must not inflate this guild's numerator. Contamination here
  // would be silent, since the count would still look plausible.
  test("a logger in another guild does not inflate this guild's participation", async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "tik", firstName: "Bob" });
    await logDay(sql, 2, "2026-07-28", "long");

    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(0);
  });

  test("throws for a guild slug not in config", async () => {
    expect(participation(sql, "nonexistent", WEEK_FROM, WEEK_TO)).rejects.toThrow(/not found/);
  });
});

// `blocked` is written by FR-23 as of Phase 3, so these tests describe a state
// real users reach rather than one only this file can construct. They are the
// executable form of a decision that used to live only in a comment: blocking
// the bot is a decision about being messaged, and it must never move a number.
//
// They fail the moment someone restores `AND NOT u.blocked` from the query
// printed in SPEC.md section 6, which is the realistic way this regresses: that
// query is the source of truth's own text, it looks obviously right, and the
// damage it does is invisible until a real user blocks the bot mid-competition.
describe("blocked users still count toward every score", () => {
  beforeEach(async () => {
    await createUser(sql, { telegramId: 1, guildSlug: "prodeko", firstName: "Alice" });
    await createUser(sql, { telegramId: 2, guildSlug: "prodeko", firstName: "Bob" });
    await logDay(sql, 1, "2026-07-28", "long");   // 75
    await logDay(sql, 2, "2026-07-28", "medium"); // 45
    await sql`UPDATE users SET blocked = TRUE WHERE telegram_id = 1`;
  });

  // The worst of the three. Under the derive-everything model (SPEC.md
  // section 4.4) a guild's season total is recomputed from days on every
  // read, so excluding a blocked user does not stop counting them from now
  // on: it retroactively deletes every minute they ever logged. The pinned
  // message then publishes the guild's score dropping, in front of the whole
  // guild, with no event to explain it.
  test("standings keeps a blocked user's days and minutes", async () => {
    const prodeko = (await standings(sql, WEEK_FROM, WEEK_TO))
      .find((row) => row.slug === "prodeko");
    expect(prodeko?.activeDays).toBe(2);
    expect(prodeko?.minutes).toBe(120);
    expect(prodeko?.perMember).toBeCloseTo(2 / 650, 5);
  });

  // FR-20's participation count, which reaches the Monday post.
  test("participation keeps a blocked user", async () => {
    expect(await participation(sql, "prodeko", WEEK_FROM, WEEK_TO)).toBe(2);
  });

  // The quietest of the three, and the one whose comment did not carry the
  // warning the other two did. A blocked guildmate dropping out of the
  // "Around you" block also shifts the reader's own position in it.
  test("neighbours keeps a blocked guildmate", async () => {
    const rows = await neighbours(sql, 2, "prodeko", WEEK_FROM, WEEK_TO);
    expect(rows.map((row) => row.firstName)).toContain("Alice");
    expect(rows.find((row) => row.isSelf)?.firstName).toBe("Bob");
  });
});

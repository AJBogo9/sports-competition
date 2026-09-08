import { describe, expect, test } from "bun:test";
import {
  COMPETITION_END,
  COMPETITION_START,
  GUILDS,
  TIER_MINUTES,
  WEEKLY_TARGET_MINUTES,
  guildBySlug,
} from "../../src/config.ts";
import {
  competitionPhase,
  competitionRanks,
  crossedTarget,
  isInWindow,
  localRace,
  longDate,
  standingRanks,
  isTier,
  previousWeek,
  progressBar,
  tierMinutes,
  weeklyStreak,
} from "../../src/domain/scoring.ts";

describe("config", () => {
  test("carries all nine guilds from SPEC.md section 1", () => {
    expect(GUILDS).toHaveLength(9);
    expect(GUILDS.map((g) => g.slug)).toEqual([
      "tik", "prodeko", "as", "fk", "sik", "accounting", "mk", "inkubio", "athene",
    ]);
  });

  test("every guild has a positive member count, since it is the denominator", () => {
    for (const guild of GUILDS) expect(guild.memberCount).toBeGreaterThan(0);
  });

  test("slugs are unique, because a deep link resolves through them", () => {
    expect(new Set(GUILDS.map((g) => g.slug)).size).toBe(GUILDS.length);
  });

  test("guildBySlug resolves a known slug and rejects an unknown one", () => {
    expect(guildBySlug("prodeko")?.name).toBe("Prodeko");
    expect(guildBySlug("not-a-guild")).toBeUndefined();
  });

  // Design 4.6: a window not containing the present silently voids every log
  // via FR-26, which is the single most confusing way this can fail.
  test("the competition window contains today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(COMPETITION_START <= today).toBe(true);
    expect(today <= COMPETITION_END).toBe(true);
  });

  test("tier values match SPEC.md section 4.1", () => {
    expect(TIER_MINUTES).toEqual({ short: 22, medium: 45, long: 75, rest: 0 });
    expect(WEEKLY_TARGET_MINUTES).toBe(150);
  });
});

describe("tierMinutes", () => {
  test("derives minutes from the tier the user tapped", () => {
    expect(tierMinutes("short")).toBe(22);
    expect(tierMinutes("medium")).toBe(45);
    expect(tierMinutes("long")).toBe(75);
  });

  test("a rest day is zero minutes, not an absent day (FR-8)", () => {
    expect(tierMinutes("rest")).toBe(0);
  });
});

describe("isTier", () => {
  test("accepts the four real tiers", () => {
    for (const tier of ["short", "medium", "long", "rest"]) {
      expect(isTier(tier)).toBe(true);
    }
  });

  test("rejects anything else, including a forged callback payload", () => {
    expect(isTier("enormous")).toBe(false);
    expect(isTier("")).toBe(false);
    expect(isTier("constructor")).toBe(false);
  });
});

describe("progressBar", () => {
  // 10 slots, matching prototype/bot-flows.html exactly.
  test("renders the prototype's example: 112 of 150", () => {
    expect(progressBar(112, 150)).toBe("███████░░░");
  });

  test("empty at zero", () => {
    expect(progressBar(0, 150)).toBe("░░░░░░░░░░");
  });

  test("full at the target", () => {
    expect(progressBar(150, 150)).toBe("██████████");
  });

  test("never overflows past the target", () => {
    expect(progressBar(600, 150)).toBe("██████████");
  });

  test("is always ten characters wide", () => {
    for (const minutes of [0, 7, 22, 45, 75, 149, 150, 151, 900]) {
      expect([...progressBar(minutes, 150)]).toHaveLength(10);
    }
  });
});

describe("isInWindow (FR-26)", () => {
  test("includes both endpoints", () => {
    expect(isInWindow("2026-07-27", "2026-07-27", "2026-09-20")).toBe(true);
    expect(isInWindow("2026-09-20", "2026-07-27", "2026-09-20")).toBe(true);
  });

  test("excludes a backdated entry before the start", () => {
    expect(isInWindow("2026-07-26", "2026-07-27", "2026-09-20")).toBe(false);
  });

  test("excludes anything after the end", () => {
    expect(isInWindow("2026-09-21", "2026-07-27", "2026-09-20")).toBe(false);
  });
});

describe("previousWeek", () => {
  test("steps back exactly seven days", () => {
    expect(previousWeek("2026-07-27")).toBe("2026-07-20");
  });

  test("crosses a month boundary", () => {
    expect(previousWeek("2026-08-03")).toBe("2026-07-27");
  });

  // These are calendar labels, not instants, so the October clock change
  // must not shift them. See design 4.2.
  test("is unaffected by the 25 October 2026 clock change", () => {
    expect(previousWeek("2026-10-26")).toBe("2026-10-19");
  });
});

describe("competitionRanks", () => {
  test("no ties, ranks are plain positions", () => {
    expect(competitionRanks([24.1, 22.8, 18.0])).toEqual([1, 2, 3]);
  });

  test("all values equal, every rank is 1", () => {
    expect(competitionRanks([0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("a tie at the top skips the next rank to 3", () => {
    expect(competitionRanks([24.1, 24.1, 18.0])).toEqual([1, 1, 3]);
  });

  // The exact case from the review: 24.1, 22.8, 22.8, 18.0 renders 1, 2, 2, 4.
  test("a tie in the middle skips the rank after it", () => {
    expect(competitionRanks([24.1, 22.8, 22.8, 18.0])).toEqual([1, 2, 2, 4]);
  });

  test("a tie at the bottom shares the last rank", () => {
    expect(competitionRanks([30, 24, 24])).toEqual([1, 2, 2]);
  });

  test("a single element is rank 1", () => {
    expect(competitionRanks([42])).toEqual([1]);
  });

  test("an empty array produces no ranks", () => {
    expect(competitionRanks([])).toEqual([]);
  });
});

describe("weeklyStreak (FR-13)", () => {
  const weeks = [
    { weekStart: "2026-07-06", minutes: 160 },
    { weekStart: "2026-07-13", minutes: 200 },
    { weekStart: "2026-07-20", minutes: 150 },
    { weekStart: "2026-07-27", minutes: 112 },
  ];

  // The prototype shows "Streak 3 weeks at target" while the current week
  // sits at 112 of 150. An in-progress week must not break the streak.
  test("an unfinished current week does not break the streak", () => {
    expect(weeklyStreak(weeks, "2026-07-27", 150)).toBe(3);
  });

  test("the current week counts once the target is met", () => {
    const hit = [...weeks.slice(0, 3), { weekStart: "2026-07-27", minutes: 150 }];
    expect(weeklyStreak(hit, "2026-07-27", 150)).toBe(4);
  });

  test("a missed past week ends the streak there", () => {
    const missed = [
      { weekStart: "2026-07-06", minutes: 160 },
      { weekStart: "2026-07-13", minutes: 40 },
      { weekStart: "2026-07-20", minutes: 150 },
      { weekStart: "2026-07-27", minutes: 151 },
    ];
    expect(weeklyStreak(missed, "2026-07-27", 150)).toBe(2);
  });

  test("a week with no rows at all ends the streak", () => {
    const gap = [
      { weekStart: "2026-07-06", minutes: 160 },
      { weekStart: "2026-07-20", minutes: 150 },
      { weekStart: "2026-07-27", minutes: 151 },
    ];
    expect(weeklyStreak(gap, "2026-07-27", 150)).toBe(2);
  });

  test("a brand new user has no streak", () => {
    expect(weeklyStreak([], "2026-07-27", 150)).toBe(0);
  });

  // FR-8: rest days must not break anything. A rest day contributes a row
  // worth zero minutes, so a week holding rest days that still reaches the
  // target counts exactly like any other.
  test("rest days inside a week that still hits the target do not break it", () => {
    const withRest = [
      { weekStart: "2026-07-20", minutes: 150 },
      { weekStart: "2026-07-27", minutes: 150 },
    ];
    expect(weeklyStreak(withRest, "2026-07-27", 150)).toBe(2);
  });
});

describe("crossedTarget (FR-28)", () => {
  // The log that takes a week from below the target to at or above it is the
  // one moment the bot celebrates (phase 5 design 5.1). The total before the
  // log is derived from what logDay already returns: after, minus the stored
  // tier's minutes, plus the displaced tier's. Nothing is stored for it.
  test("a log that lifts the week over the target crosses", () => {
    // 112 before, plus a medium (45) = 157.
    expect(crossedTarget(157, "medium", null, 150)).toBe(true);
  });

  test("the exact boundary counts as a crossing", () => {
    // 105 before, plus a medium (45) = 150.
    expect(crossedTarget(150, "medium", null, 150)).toBe(true);
  });

  test("a week already at target before the log does not cross again", () => {
    // 150 before, plus a short (22) = 172.
    expect(crossedTarget(172, "short", null, 150)).toBe(false);
  });

  test("a week still below the target after the log does not cross", () => {
    expect(crossedTarget(112, "medium", null, 150)).toBe(false);
  });

  // FR-8: a rest day adds nothing, so it can never be the crossing log.
  test("a rest day never crosses", () => {
    expect(crossedTarget(150, "rest", null, 150)).toBe(false);
  });

  // FR-7: a re-log replaces the day, so only the difference between the two
  // tiers moves the total, and the displaced tier is part of "before".
  test("a re-log crosses only by the difference it adds", () => {
    // A short (22) re-logged as a long (75) on a week that read 140 with the
    // short: before = 193 - 75 + 22 = 140, after = 193.
    expect(crossedTarget(193, "long", "short", 150)).toBe(true);
    // A long re-logged as a short: before = 150 - 22 + 75 = 203, after = 150.
    expect(crossedTarget(150, "short", "long", 150)).toBe(false);
  });

  // FR-7 again: logging the same tier twice replaces the day with itself, so
  // the total does not move and the crossing already celebrated is not
  // celebrated again. logDay reports the same tier as displaced in that case
  // (tests/db/days.test.ts); this pins the consumer side of that contract.
  test("re-logging the same tier moves nothing and never crosses", () => {
    expect(crossedTarget(157, "medium", "medium", 150)).toBe(false);
  });

  // FR-8 from the other side: a rest day that gets replaced contributed
  // nothing, so replacing it counts the whole new tier as added.
  test("replacing a rest day crosses by the whole new tier", () => {
    expect(crossedTarget(150, "long", "rest", 150)).toBe(true);
  });

  test("a re-log on a week that was already over does not cross", () => {
    // A medium (45) re-logged as a long (75) on a week that read 160 with the
    // medium: before = 190 - 75 + 45 = 160.
    expect(crossedTarget(190, "long", "medium", 150)).toBe(false);
  });

  test("defaults to the configured weekly target", () => {
    expect(crossedTarget(WEEKLY_TARGET_MINUTES, "medium", null)).toBe(true);
  });
});

// Phase 5 design 11.2 and 12.2. The local race: the adjacent guild and the
// gap to it in active days over the reader's roster, which is the number a
// member can act on (one more person logging one more day). The guild above
// for everyone, the guild below for the winner, and a tie reads as level
// rather than as zero days. perMember here is active days per member.
describe("localRace (phase 5 design 11.2)", () => {
  const table = [
    { name: "TiK", perMember: 0.2, memberCount: 700 },
    { name: "FK", perMember: 0.16, memberCount: 600 },
    { name: "Prodeko", perMember: 0.12, memberCount: 650 },
    { name: "AS", perMember: 0.12, memberCount: 650 },
    { name: "Athene", perMember: 0.04, memberCount: 350 },
  ];

  test("a guild in the middle races the one above, in days over its own roster", () => {
    // (0.16 - 0.12) * 650 = 26 days.
    expect(localRace(table, 2)).toEqual({ name: "FK", direction: "up", days: 26 });
  });

  test("the winner races the guild below it", () => {
    // (0.2 - 0.16) * 700 = 28 days.
    expect(localRace(table, 0)).toEqual({ name: "FK", direction: "down", days: 28 });
  });

  test("the last guild races the one above, however far", () => {
    // (0.12 - 0.04) * 350 = 28 days.
    expect(localRace(table, 4)).toEqual({ name: "AS", direction: "up", days: 28 });
  });

  test("a gap smaller than one day still rounds up to one, never to zero", () => {
    const close = [
      { name: "A", perMember: 0.101, memberCount: 100 },
      { name: "B", perMember: 0.1, memberCount: 100 },
    ];
    expect(localRace(close, 1)).toEqual({ name: "A", direction: "up", days: 1 });
  });

  test("float noise in the product does not add a day", () => {
    // (0.16 - 0.12) * 650 is 26.000000000000004 in floating point.
    expect(localRace(table, 2)?.days).toBe(26);
  });

  test("a tie is level, not zero days away", () => {
    expect(localRace(table, 3)).toEqual({ name: "Prodeko", direction: "up", days: 0 });
  });

  test("a table with one guild has no race", () => {
    expect(localRace([{ name: "A", perMember: 1, memberCount: 10 }], 0)).toBeNull();
  });
});

// Phase 5 design 13.1. Ranks must break ties the way the query orders: equal
// active days per member are ordered by minutes per member, so two guilds
// level on days and apart on minutes are 1st and 2nd, not joint 1st. Ranking
// on perMember alone told a guild it finished 1st while the Monday post said
// the other guild "took it".
describe("standingRanks (phase 5 design 13.1)", () => {
  test("a tie on days per member is broken by minutes per member", () => {
    const rows = [
      { perMember: 1 / 650, minutes: 75, memberCount: 650 },
      { perMember: 1 / 650, minutes: 22, memberCount: 650 },
      { perMember: 0, minutes: 0, memberCount: 700 },
    ];
    expect(standingRanks(rows)).toEqual([1, 2, 3]);
  });

  test("identical days and minutes per member share the rank, and the next skips", () => {
    const rows = [
      { perMember: 1 / 650, minutes: 45, memberCount: 650 },
      { perMember: 1 / 650, minutes: 45, memberCount: 650 },
      { perMember: 0, minutes: 0, memberCount: 700 },
    ];
    expect(standingRanks(rows)).toEqual([1, 1, 3]);
  });

  test("before anyone logs, every guild is jointly first", () => {
    const rows = [1, 2, 3].map((memberCount) => ({ perMember: 0, minutes: 0, memberCount }));
    expect(standingRanks(rows)).toEqual([1, 1, 1]);
  });
});

// Phase 5 design 13.2. Which stretch of the competition today falls in, for
// the standings header and the check-in prompt. Pure label comparison, like
// isInWindow; no date arithmetic.
describe("competitionPhase (phase 5 design 13.2)", () => {
  test("before, during and after", () => {
    expect(competitionPhase("2026-07-26", "2026-07-27", "2026-09-20")).toBe("before");
    expect(competitionPhase("2026-07-27", "2026-07-27", "2026-09-20")).toBe("during");
    expect(competitionPhase("2026-09-20", "2026-07-27", "2026-09-20")).toBe("during");
    expect(competitionPhase("2026-09-21", "2026-07-27", "2026-09-20")).toBe("after");
  });

  test("defaults to the configured window", () => {
    expect(competitionPhase(COMPETITION_START)).toBe("during");
    expect(competitionPhase(COMPETITION_END)).toBe("during");
  });
});

// Phase 5 design 13.2. A yyyy-mm-dd label rendered for a person, with no Date
// object involved: the label is already in the competition timezone.
describe("longDate", () => {
  test("renders day, month name and year from the label", () => {
    expect(longDate("2026-07-27")).toBe("27 July 2026");
    expect(longDate("2026-09-20")).toBe("20 September 2026");
    expect(longDate("2026-01-05")).toBe("5 January 2026");
  });
});

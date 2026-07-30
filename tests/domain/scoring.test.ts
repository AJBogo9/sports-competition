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
  isInWindow,
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

import { describe, expect, test } from "bun:test";
import {
  isFinalMondayPost,
  previousWeekInCompetition,
  shouldPostMonday,
} from "../../src/domain/scheduling.ts";

// A fixed competition window, passed explicitly so these tests never depend on
// the placeholder dates in config.ts. 14 weeks, Monday to Sunday inclusive.
//
// END was added with the closing-post bound and is not decoration: before it
// existed, this file pinned only the start, so the October clock change test
// below silently fell back to COMPETITION_END from config and would have
// started failing the moment shouldPostMonday grew an end bound at all. Both
// ends of the window are pinned here for that reason.
const START = "2026-07-27";
const END = "2026-11-01";

function decide(overrides: Partial<Parameters<typeof shouldPostMonday>[0]> = {}) {
  return shouldPostMonday({
    weekStart: "2026-08-03",
    lastPosted: "2026-07-27",
    localDate: "2026-08-03",
    localHour: 9,
    postHour: 9,
    competitionStart: START,
    competitionEnd: END,
    ...overrides,
  });
}

describe("shouldPostMonday (FR-20)", () => {
  test("posts on Monday once the hour has arrived", () => {
    expect(decide({ localHour: 9 })).toBe(true);
  });

  test("does not post before the hour on Monday", () => {
    expect(decide({ localHour: 8 })).toBe(false);
  });

  test("does not post twice for the same week", () => {
    expect(decide({ lastPosted: "2026-08-03" })).toBe(false);
  });

  // Phase 2 design 4.4. Late beats never: a bot that was down for all of Monday
  // posts when it comes back, rather than skipping the week in silence.
  test("posts on Tuesday when Monday was missed", () => {
    expect(decide({ localDate: "2026-08-04", localHour: 3 })).toBe(true);
  });

  // Phase 2 design 4.5. On the first Monday there is no last week to report, and the
  // generic path would announce a winner at 0.0 minutes per member.
  test("does not post on the competition's first Monday", () => {
    expect(decide({ weekStart: START, lastPosted: "2026-07-20", localDate: START })).toBe(false);
  });

  // Phase 2 design 4.5. The test is on the previous week's END, so a competition
  // that starts mid-week still reports the partial week that happened.
  test("posts on the first Monday when the competition started mid-week", () => {
    expect(
      decide({
        competitionStart: "2026-07-29",
        weekStart: "2026-08-03",
        lastPosted: "2026-07-27",
      }),
    ).toBe(true);
  });

  // Phase 2 design 2.4. Binding sets lastPosted to the current week, so a chat bound
  // on a Thursday is not owed a post for the week it was bound in.
  test("does not post for the week a chat was just bound in", () => {
    expect(decide({ lastPosted: "2026-08-03", localDate: "2026-08-06" })).toBe(false);
  });

  // Europe/Helsinki leaves DST on 2026-10-25, inside the competition. The
  // labels either side of it must still be exactly seven days apart.
  test("is unaffected by the October clock change", () => {
    expect(
      decide({ weekStart: "2026-10-26", lastPosted: "2026-10-19", localDate: "2026-10-26" }),
    ).toBe(true);
  });

  // Phase 2 design 4.8. The competition ends on a Sunday, so the final week's
  // result falls due on the Monday AFTER the window closes. Without this the
  // ticker is already inert by then and that one week's result is the only
  // one never announced.
  test("posts the wrap-up on the Monday after the competition ends", () => {
    expect(
      decide({ weekStart: "2026-11-02", lastPosted: "2026-10-26", localDate: "2026-11-02" }),
    ).toBe(true);
  });

  // The bound is one week wide, not open-ended. A second Monday past the end
  // has no week left to report and must announce nothing, forever.
  test("does not post a second Monday after the competition ends", () => {
    expect(
      decide({ weekStart: "2026-11-09", lastPosted: "2026-11-02", localDate: "2026-11-09" }),
    ).toBe(false);
  });

  // Phase 2 design 4.8, the mirror of the mid-week start case above. The bound
  // tests the previous week's START against the end date, so a competition
  // ending on a Wednesday still gets a wrap-up covering its partial final week.
  test("posts the wrap-up when the competition ended mid-week", () => {
    expect(
      decide({
        competitionEnd: "2026-10-28",
        weekStart: "2026-11-02",
        lastPosted: "2026-10-26",
        localDate: "2026-11-02",
      }),
    ).toBe(true);
  });
});

describe("previousWeekInCompetition", () => {
  // Exported because startTicker needs the same question answered to decide
  // whether it has any work left once the window has closed. The ticker's own
  // call is not unit tested (it is Telegram glue), so these are the only
  // guard on that boundary.
  test("is true for an ordinary mid-competition Monday", () => {
    expect(
      previousWeekInCompetition({
        weekStart: "2026-08-10",
        competitionStart: START,
        competitionEnd: END,
      }),
    ).toBe(true);
  });

  test("is false before the competition has a week to report", () => {
    expect(
      previousWeekInCompetition({
        weekStart: START,
        competitionStart: START,
        competitionEnd: END,
      }),
    ).toBe(false);
  });

  test("is true on the wrap-up Monday and false the Monday after it", () => {
    const at = (weekStart: string) =>
      previousWeekInCompetition({ weekStart, competitionStart: START, competitionEnd: END });
    expect(at("2026-11-02")).toBe(true);
    expect(at("2026-11-09")).toBe(false);
  });
});

describe("isFinalMondayPost", () => {
  test("a Monday inside the window is an ordinary post", () => {
    expect(isFinalMondayPost({ weekStart: "2026-10-26", competitionEnd: END })).toBe(false);
  });

  test("the Monday after the window closes is the closing post", () => {
    expect(isFinalMondayPost({ weekStart: "2026-11-02", competitionEnd: END })).toBe(true);
  });

  // The discriminating case, and the reason this is a named function rather
  // than a reuse of isInWindow(today) at the call site. With a competition
  // ending on Wednesday 2026-10-28, Thursday the 29th is already outside the
  // window, but the Monday of that same week (2026-10-26) is reporting the
  // week before it and there is still a partial week to come. Deciding the
  // copy from today's date instead of from weekStart would print "That's the
  // competition" while the competition was still running.
  test("a mid-week end does not make that week's own Monday the closing post", () => {
    expect(isFinalMondayPost({ weekStart: "2026-10-26", competitionEnd: "2026-10-28" })).toBe(false);
    expect(isFinalMondayPost({ weekStart: "2026-11-02", competitionEnd: "2026-10-28" })).toBe(true);
  });
});

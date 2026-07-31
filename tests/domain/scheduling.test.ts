import { describe, expect, test } from "bun:test";
import { shouldPostMonday } from "../../src/domain/scheduling.ts";

// A fixed competition window, passed explicitly so these tests never depend on
// the placeholder dates in config.ts.
const START = "2026-07-27";

function decide(overrides: Partial<Parameters<typeof shouldPostMonday>[0]> = {}) {
  return shouldPostMonday({
    weekStart: "2026-08-03",
    lastPosted: "2026-07-27",
    localDate: "2026-08-03",
    localHour: 9,
    postHour: 9,
    competitionStart: START,
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

  // Design 2.4.4. Late beats never: a bot that was down for all of Monday
  // posts when it comes back, rather than skipping the week in silence.
  test("posts on Tuesday when Monday was missed", () => {
    expect(decide({ localDate: "2026-08-04", localHour: 3 })).toBe(true);
  });

  // Design 2.4.5. On the first Monday there is no last week to report, and the
  // generic path would announce a winner at 0.0 minutes per member.
  test("does not post on the competition's first Monday", () => {
    expect(decide({ weekStart: START, lastPosted: "2026-07-20", localDate: START })).toBe(false);
  });

  // Design 2.4.5. The test is on the previous week's END, so a competition
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

  // Design 2.2.4. Binding sets lastPosted to the current week, so a chat bound
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
});

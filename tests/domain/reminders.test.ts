import { describe, expect, test } from "bun:test";
import { isWithinGrace, reminderAction } from "../../src/domain/reminders.ts";

// Pinned explicitly so these tests never depend on the constant in config.ts,
// matching how tests/domain/scheduling.test.ts pins the competition window.
const AFTER = 5;

function decide(ignoredStreak: number, responded = false) {
  return reminderAction({ ignoredStreak, responded, followupAfter: AFTER });
}

describe("reminderAction (FR-21, FR-22)", () => {
  // FR-21. The ordinary case: someone who has not logged today gets the
  // check-in message, and the ignore count moves up by one.
  test("sends the daily reminder and counts it", () => {
    expect(decide(0)).toEqual({ action: "daily", nextStreak: 1 });
  });

  // FR-22's acceptance test, walked in full: five dailies, then exactly one
  // follow-up, then nothing. The sixth daily is never sent.
  test("sends five dailies, then exactly one follow-up, then nothing", () => {
    const actions: string[] = [];
    let streak = 0;
    for (let day = 0; day < 8; day++) {
      const decision = reminderAction({
        ignoredStreak: streak,
        responded: false,
        followupAfter: AFTER,
      });
      actions.push(decision.action);
      streak = decision.nextStreak;
    }
    expect(actions).toEqual([
      "daily", "daily", "daily", "daily", "daily",
      "followup",
      "none", "none",
    ]);
  });

  test("the follow-up is owed exactly at the threshold", () => {
    expect(decide(AFTER)).toEqual({ action: "followup", nextStreak: 6 });
  });

  // Phase 3 design 3.3. Past the follow-up the user is paused. db/reminders.ts
  // excludes them from the candidate query, so this branch is a defensive
  // second gate rather than the primary one.
  test("a paused user is sent nothing and the streak does not grow", () => {
    expect(decide(AFTER + 1)).toEqual({ action: "none", nextStreak: AFTER + 1 });
    expect(decide(AFTER + 4)).toEqual({ action: "none", nextStreak: AFTER + 4 });
  });

  // FR-22 counts CONSECUTIVE ignores, so any response mid-chain restarts it.
  test("a response mid-chain resets the count", () => {
    expect(decide(3, true)).toEqual({ action: "daily", nextStreak: 1 });
  });

  // Phase 3 design 3.3, the ruling most likely to be undone by accident.
  // Logging is engagement with the competition, not consent to be messaged.
  // The follow-up asked for consent and got no answer, so a log must NOT
  // resume reminders: only "Keep them" or /remind does that.
  test("a response does NOT resume a user who is already paused", () => {
    expect(decide(AFTER + 1, true).action).toBe("none");
  });

  test("defaults to the configured threshold when none is passed", () => {
    expect(reminderAction({ ignoredStreak: 0, responded: false }).action).toBe("daily");
  });
});

describe("isWithinGrace (phase 3 design 4.1)", () => {
  const grace = (localHour: number, reminderHour: number) =>
    isWithinGrace({ localHour, reminderHour, graceHours: 2 });

  test("includes the chosen hour itself", () => {
    expect(grace(20, 20)).toBe(true);
  });

  test("includes the hour after, so a short outage does not lose the day", () => {
    expect(grace(21, 20)).toBe(true);
  });

  test("excludes the second hour after, so nothing lands near midnight", () => {
    expect(grace(22, 20)).toBe(false);
  });

  test("excludes hours before the chosen one", () => {
    expect(grace(19, 20)).toBe(false);
  });

  // The column and the callback decoder both accept 0 to 23 even though
  // REMINDER_HOURS offers four, so the no-wrap property is asserted rather
  // than assumed from the keyboard. A 23:00 reminder missed at 23:00 is not
  // delivered at 00:30 the next day, on the next day's ledger.
  test("a 23:00 reminder does not wrap past midnight", () => {
    expect(grace(23, 23)).toBe(true);
    expect(grace(0, 23)).toBe(false);
    expect(grace(1, 23)).toBe(false);
  });

  test("defaults to the configured grace when none is passed", () => {
    expect(isWithinGrace({ localHour: 20, reminderHour: 20 })).toBe(true);
  });
});

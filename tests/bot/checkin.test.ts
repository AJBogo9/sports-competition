import { describe, expect, test } from "bun:test";
import { checkInMessage } from "../../src/bot/checkin.ts";
import { CHECK_IN_PROMPT, TIER_LABELS } from "../../src/strings.ts";

// The check-in prompt is the one pure export of checkin.ts (the handlers
// stay untested by design, docs/SMOKE.md is their acceptance basis). Dates
// inside the placeholder window; the yesterday button depends on config.
const TODAY = "2026-08-05";
const YESTERDAY = "2026-08-04";

function buttons(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

describe("checkInMessage (FR-5, FR-10)", () => {
  test("offers the four tiers and yesterday", () => {
    const message = checkInMessage(TODAY, YESTERDAY);
    expect(message.text).toBe(CHECK_IN_PROMPT);
    expect(buttons(message.keyboard)).toEqual([
      TIER_LABELS.short,
      TIER_LABELS.medium,
      TIER_LABELS.long,
      TIER_LABELS.rest,
      "Log yesterday instead",
    ]);
  });

  test("drops the yesterday button when yesterday is outside the window", () => {
    expect(buttons(checkInMessage(TODAY, "2000-01-01").keyboard)).not.toContain("Log yesterday instead");
  });

  // Phase 5 design 13.3. FR-7 replaces silently; the prompt now says what is
  // there, so an evening tap is not mistaken for adding to a lunchtime one.
  test("says what is already logged today and that a tap replaces it", () => {
    const message = checkInMessage(TODAY, YESTERDAY, "medium");
    expect(message.text).toContain(CHECK_IN_PROMPT);
    expect(message.text).toContain("Logged already: 30 to 60 min. A tap replaces it.");
    expect(buttons(message.keyboard)).toContain(TIER_LABELS.long);
  });

  test("a logged rest day is named too", () => {
    expect(checkInMessage(TODAY, YESTERDAY, "rest").text).toContain("Logged already: Not today.");
  });

  test("with nothing logged the prompt is the bare question", () => {
    expect(checkInMessage(TODAY, YESTERDAY, null).text).toBe(CHECK_IN_PROMPT);
  });
});

// Phase 5 design 13.3 and the smoke run of 2026-09-08. "Today instead" and
// "Log again" re-render the prompt through the same function as /log, so the
// logged-already line and the yesterday button come back with it; before
// this they rendered a bare prompt with neither.
describe("checkInMessage for a specific date", () => {
  test("today's prompt is the /log prompt, with the yesterday button", () => {
    const message = checkInMessage(TODAY, YESTERDAY, "short", TODAY);
    expect(message.text).toContain("Logged already: 15 to 30 min.");
    expect(buttons(message.keyboard)).toContain("Log yesterday instead");
    expect(buttons(message.keyboard)).not.toContain("Today instead");
  });

  test("yesterday's prompt asks about yesterday, names what is logged there, and offers today", () => {
    const message = checkInMessage(TODAY, YESTERDAY, "rest", YESTERDAY);
    expect(message.text).toContain("And yesterday?");
    expect(message.text).toContain("Logged already: Not today.");
    expect(buttons(message.keyboard)).toContain("Today instead");
    expect(buttons(message.keyboard)).not.toContain("Log yesterday instead");
  });
});

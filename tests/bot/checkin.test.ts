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

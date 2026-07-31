import { FOLLOWUP_AFTER_IGNORES, REMINDER_GRACE_HOURS } from "../config.ts";

/** What a due user should be sent, if anything. */
export type ReminderAction = "daily" | "followup" | "none";

export interface ReminderDecision {
  action: ReminderAction;
  /** The value to write back to users.ignored_streak. */
  nextStreak: number;
}

export interface ReminderInput {
  /** users.ignored_streak: consecutive reminders sent with no response. */
  ignoredStreak: number;
  /** Whether anything was logged since the last reminder went out. */
  responded: boolean;
  /** Defaults to FOLLOWUP_AFTER_IGNORES from config. */
  followupAfter?: number;
}

/**
 * FR-21 and FR-22, the whole of the rule.
 *
 * Pure, and unit tested end to end, for a reason that is specific rather than
 * stylistic: five consecutive ignores takes five days to reproduce, so this is
 * the one rule in the project that docs/SMOKE.md cannot be the acceptance
 * basis for. It must not live in a Telegram-facing file (phase 3 design 3).
 *
 * The count reaches the threshold only by five sends that were each ignored,
 * so the threshold means "the sixth daily is due" and the follow-up takes its
 * place. That is FR-22's acceptance test read literally: the sixth consecutive
 * daily is never sent, and exactly one follow-up is.
 *
 * Past the threshold the user is paused. db/reminders.ts already excludes them
 * from the candidate query, so this branch is a second gate rather than the
 * primary one: the paused state is an absence of candidacy, not an action.
 * Keeping it here anyway means a caller that forgets the SQL filter fails
 * safe, by sending nothing.
 */
export function reminderAction(input: ReminderInput): ReminderDecision {
  const followupAfter = input.followupAfter ?? FOLLOWUP_AFTER_IGNORES;

  // Phase 3 design 3.3. A response clears the count only BEFORE the follow-up
  // has gone out. Once it has, the user was asked whether to continue and did
  // not answer, and logging is engagement with the competition rather than
  // consent to be messaged. Only "Keep them" or /remind lifts a pause, and
  // both do it by writing ignored_streak directly.
  const effective = input.responded && input.ignoredStreak <= followupAfter
    ? 0
    : input.ignoredStreak;

  if (effective > followupAfter) return { action: "none", nextStreak: effective };
  if (effective === followupAfter) return { action: "followup", nextStreak: effective + 1 };
  return { action: "daily", nextStreak: effective + 1 };
}

export interface GraceInput {
  /** The hour 0 to 23 in TIMEZONE, from the SQL calendar. */
  localHour: number;
  /** users.reminder_hour, 0 to 23. */
  reminderHour: number;
  /** Defaults to REMINDER_GRACE_HOURS from config. */
  graceHours?: number;
}

/**
 * Phase 3 design 4.1. Whether now is still inside the window in which a
 * reminder for this hour may be delivered.
 *
 * Cannot wrap past midnight by construction: localHour is 0 to 23, so a
 * reminderHour of 23 yields a window of {23} and 22 yields {22, 23}. Stated as
 * a property and tested, rather than assumed from REMINDER_HOURS, because the
 * column and the callback decoder both accept the full 0 to 23 range.
 *
 * The db query applies the same rule in SQL so that the candidate set stays
 * small. This function is the definition; that is a copy of it under a WHERE
 * clause, and tests/db/reminders.test.ts pins the two together at the edges.
 */
export function isWithinGrace(input: GraceInput): boolean {
  const graceHours = input.graceHours ?? REMINDER_GRACE_HOURS;
  return input.localHour >= input.reminderHour
    && input.localHour < input.reminderHour + graceHours;
}

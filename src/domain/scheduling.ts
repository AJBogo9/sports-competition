import { COMPETITION_START, MONDAY_POST_HOUR } from "../config.ts";

export interface MondayPostDecision {
  /** Monday of the current week, yyyy-mm-dd, from the SQL calendar. */
  weekStart: string;
  /** chats.last_monday_week: the week whose post has already gone out. */
  lastPosted: string;
  /** Today in TIMEZONE, yyyy-mm-dd, from the SQL calendar. */
  localDate: string;
  /** The hour in TIMEZONE, 0 to 23, from the SQL calendar. */
  localHour: number;
  /** The hour to post on Monday; defaults to MONDAY_POST_HOUR from config. */
  postHour?: number;
  /** The competition start date; defaults to COMPETITION_START from config. */
  competitionStart?: string;
}

/**
 * The day before a given yyyy-mm-dd label.
 *
 * Same deliberate exception as previousWeek() in scoring.ts, and safe for the
 * same reason: these are calendar labels rather than instants, parsed and
 * formatted at UTC midnight with no timezone conversion anywhere, so minus one
 * day is exact regardless of what Europe/Helsinki's offset is on either date.
 * The project rule that date buckets come from SQL exists to stop a timezone
 * conversion drifting a boundary across a clock change, and there is no
 * conversion here.
 */
export function dayBefore(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/**
 * FR-20. Whether this chat is owed a Monday post right now.
 *
 * Pure so that the interesting half of the ticker is testable without Telegram
 * and without a clock (phase 2 design 4.6). Every date is a yyyy-mm-dd label in the
 * competition timezone, which compares correctly as a plain string.
 *
 * Three rulings live here:
 *
 * - The condition is "no post for this week and past Monday's hour", NOT
 *   "today is Monday" (phase 2 design 4.4). A bot that was down for all of Monday
 *   posts on Tuesday. Over an eight-week competition, missing a post entirely
 *   is worse than one arriving late, and the alternative fails silently in
 *   exactly the case where something has already gone wrong.
 * - No post when the previous week ENDS before the competition starts
 *   (phase 2 design 4.5). On the first Monday there is no last week, and the generic
 *   path would announce a winner at 0.0 minutes per member as the first thing
 *   every guild sees. Testing the end rather than the start keeps it correct
 *   if COMPETITION_START ever stops being a Monday.
 * - lastPosted is initialised to the binding week, so a chat bound mid-week is
 *   not owed a post for that week (phase 2 design 2.4).
 */
export function shouldPostMonday(input: MondayPostDecision): boolean {
  const postHour = input.postHour ?? MONDAY_POST_HOUR;
  const competitionStart = input.competitionStart ?? COMPETITION_START;

  if (input.lastPosted >= input.weekStart) return false;
  if (dayBefore(input.weekStart) < competitionStart) return false;
  if (input.localDate === input.weekStart && input.localHour < postHour) return false;
  return true;
}

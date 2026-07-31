import { COMPETITION_END, COMPETITION_START, MONDAY_POST_HOUR } from "../config.ts";
import { previousWeek } from "./scoring.ts";

export interface CompetitionWeek {
  /** Monday of the current week, yyyy-mm-dd, from the SQL calendar. */
  weekStart: string;
  /** The competition start date; defaults to COMPETITION_START from config. */
  competitionStart?: string;
  /** The competition end date; defaults to COMPETITION_END from config. */
  competitionEnd?: string;
}

export interface MondayPostDecision extends CompetitionWeek {
  /** chats.last_monday_week: the week whose post has already gone out. */
  lastPosted: string;
  /** Today in TIMEZONE, yyyy-mm-dd, from the SQL calendar. */
  localDate: string;
  /** The hour in TIMEZONE, 0 to 23, from the SQL calendar. */
  localHour: number;
  /** The hour to post on Monday; defaults to MONDAY_POST_HOUR from config. */
  postHour?: number;
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
 * Whether the week before weekStart overlaps the competition at all, which is
 * to say whether this Monday has any result worth announcing.
 *
 * Both bounds are tested against the PREVIOUS week rather than against
 * weekStart, because the previous week is what the post reports. That is what
 * keeps them correct when the competition starts or ends mid-week, and the two
 * are exact mirrors of each other:
 *
 * - It ends before the competition starts (phase 2 design 4.5). On the first
 *   Monday there is no last week, and the generic path would announce a winner
 *   at 0.0 minutes per member as the first thing every guild sees. Testing the
 *   previous week's end rather than its start keeps this correct if
 *   COMPETITION_START ever stops being a Monday.
 * - It starts after the competition ends (phase 2 design 4.8). COMPETITION_END
 *   is a Sunday, so the final week's result falls due on the Monday AFTER the
 *   window closes. Exactly one Monday past the end still has something to say;
 *   the one after that does not, which is what stops this from being an
 *   open-ended licence to keep posting forever.
 *
 * Exported because startTicker needs the same question answered to decide
 * whether it has any work left once the window has closed. One definition
 * rather than two, because a boundary rule stated in two places drifts.
 */
export function previousWeekInCompetition(input: CompetitionWeek): boolean {
  const competitionStart = input.competitionStart ?? COMPETITION_START;
  const competitionEnd = input.competitionEnd ?? COMPETITION_END;

  if (dayBefore(input.weekStart) < competitionStart) return false;
  if (previousWeek(input.weekStart) > competitionEnd) return false;
  return true;
}

/**
 * Phase 2 design 4.8. Whether this Monday's post is the competition's closing
 * one, which swaps the "new week" copy for a close (render.ts's mondayPost).
 *
 * Decided from weekStart, deliberately NOT from isInWindow(today). The two
 * agree when the competition ends on a Sunday and diverge the moment it does
 * not: with an end on Wednesday 2026-10-28, Thursday the 29th is already
 * outside the window while that same week's Monday post is still an ordinary
 * one reporting the week before, with a partial week still to come. Reading
 * today's date here would print "That's the competition" while the competition
 * was still running.
 */
export function isFinalMondayPost(input: CompetitionWeek): boolean {
  return input.weekStart > (input.competitionEnd ?? COMPETITION_END);
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
 * - The previous week has to be inside the competition at either end, which is
 *   previousWeekInCompetition above (phase 2 design 4.5 and 4.8).
 * - lastPosted is initialised to the binding week, so a chat bound mid-week is
 *   not owed a post for that week (phase 2 design 2.4).
 */
export function shouldPostMonday(input: MondayPostDecision): boolean {
  const postHour = input.postHour ?? MONDAY_POST_HOUR;

  if (input.lastPosted >= input.weekStart) return false;
  if (!previousWeekInCompetition(input)) return false;
  if (input.localDate === input.weekStart && input.localHour < postHour) return false;
  return true;
}

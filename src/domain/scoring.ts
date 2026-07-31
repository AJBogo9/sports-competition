import { TIER_MINUTES, WEEKLY_TARGET_MINUTES, COMPETITION_END, COMPETITION_START, type Tier } from "../config.ts";

/** Minutes are always derived, never stored. See SPEC.md section 4.4. */
export function tierMinutes(tier: Tier): number {
  return TIER_MINUTES[tier];
}

/** Guards callback payloads, which arrive as untrusted strings. */
export function isTier(value: string): value is Tier {
  return Object.hasOwn(TIER_MINUTES, value);
}

/** Ten slots, matching prototype/bot-flows.html exactly. */
export function progressBar(done: number, total: number): string {
  const slots = 10;
  const ratio = total > 0 ? done / total : 0;
  const filled = Math.min(slots, Math.max(0, Math.round(ratio * slots)));
  return "█".repeat(filled) + "░".repeat(slots - filled);
}

/**
 * FR-26. All three arguments are yyyy-mm-dd strings in the competition
 * timezone, which compare correctly as plain strings.
 */
export function isInWindow(
  date: string,
  start: string = COMPETITION_START,
  end: string = COMPETITION_END,
): boolean {
  return date >= start && date <= end;
}

/**
 * Standard competition ranking: equal values share the best rank and the next
 * distinct value skips ahead, so ties render 1, 1, 3 rather than 1, 2, 3.
 * Input must already be sorted best first. Returns one rank per input index.
 */
export function competitionRanks(values: readonly number[]): number[] {
  const ranks: number[] = [];
  let previousValue: number | undefined;
  let previousRank = 0;
  values.forEach((value, index) => {
    const rank = value === previousValue ? previousRank : index + 1;
    ranks.push(rank);
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

export interface WeekTotal {
  weekStart: string;
  minutes: number;
}

/**
 * Steps one week back. These are calendar labels rather than instants, so the
 * arithmetic is anchored at UTC midnight and a daylight saving change cannot
 * shift the result. See design 4.2.
 *
 * This is a deliberate exception to the project rule that date buckets are
 * computed in SQL and never with JavaScript date arithmetic (design 4.2):
 * that rule protects against timezone conversion drifting a boundary across
 * a clock change, and there is no timezone conversion here at all. The input
 * and output are both yyyy-mm-dd calendar labels, parsed and formatted at
 * UTC midnight, so minus seven days is exact regardless of what Europe/
 * Helsinki's offset happens to be on either date.
 */
export function previousWeek(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

/**
 * FR-13. Counted in weeks, never days, because the WHO guideline is weekly and
 * a daily streak would teach that a rest day is a failure.
 *
 * The current week counts only once its target is already met, so a week still
 * in progress never breaks a streak the user has not yet had time to extend.
 */
export function weeklyStreak(
  weeks: readonly WeekTotal[],
  currentWeekStart: string,
  target: number = WEEKLY_TARGET_MINUTES,
): number {
  const byWeek = new Map(weeks.map((week) => [week.weekStart, week.minutes]));
  let cursor = currentWeekStart;
  if ((byWeek.get(cursor) ?? 0) < target) cursor = previousWeek(cursor);

  let streak = 0;
  while ((byWeek.get(cursor) ?? 0) >= target) {
    streak += 1;
    cursor = previousWeek(cursor);
  }
  return streak;
}

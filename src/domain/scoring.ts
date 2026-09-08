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
export function competitionRanks(values: readonly (number | string)[]): number[] {
  const ranks: number[] = [];
  let previousValue: number | string | undefined;
  let previousRank = 0;
  values.forEach((value, index) => {
    const rank = value === previousValue ? previousRank : index + 1;
    ranks.push(rank);
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

/**
 * FR-28 and phase 5 design 5.1. Whether this log is the one that took the week
 * from below the target to at or above it, which is the only moment the bot
 * celebrates: not a tier, not a day, not a rank.
 *
 * `after` is the week's total once the log is stored, `stored` the tier it
 * wrote and `displaced` the tier it replaced, all three of which logDay
 * already returns. The total before the log is derived from them rather than
 * stored anywhere (SPEC.md section 4.4): after, minus the stored tier's
 * minutes, plus the displaced tier's. So a re-log crosses only by the
 * difference it adds, a rest day never crosses, and a week that was already
 * over the target before the tap is not celebrated a second time.
 */
export function crossedTarget(
  after: number,
  stored: Tier,
  displaced: Tier | null,
  target: number = WEEKLY_TARGET_MINUTES,
): boolean {
  const before = after - tierMinutes(stored) + (displaced ? tierMinutes(displaced) : 0);
  return before < target && after >= target;
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

/** Phase 5 design 11.2. The adjacent guild in a standings table and the gap to it. */
export interface Race {
  name: string;
  /** "up" when the named guild sits one place above the reader's, "down" for the winner. */
  direction: "up" | "down";
  /** Active days over the reader's roster that would close the gap; 0 is a tie. */
  days: number;
}

/**
 * FR-20, phase 5 design 11.2 and 12.2. The local race for the guild at `index`
 * of a table already sorted best first: the guild one place up, or one place
 * down for the winner, and the gap converted into the number of active days
 * the reader's guild would have needed, which is the one figure a member can
 * act on ("two of us logging every day closes it"). Rank feedback is U-shaped
 * (Gill et al. 2019) and the middle is where the standings alone go quiet, so
 * the gap to one neighbour is what the Monday post adds there.
 *
 * perMember is active days per member, a float from SQL, so the product is
 * rounded to a thousandth of a day before the ceiling: 26.000000000000004
 * must not become 27, while a genuine tenth of a day still rounds up to one.
 * An exact tie is 0 rather than one day, so the renderer can say "level".
 */
export function localRace(
  table: readonly { name: string; perMember: number; memberCount: number }[],
  index: number,
): Race | null {
  const own = table[index];
  const other = index === 0 ? table[1] : table[index - 1];
  if (!own || !other) return null;
  const gap = Math.abs(other.perMember - own.perMember) * own.memberCount;
  return {
    name: other.name,
    direction: index === 0 ? "down" : "up",
    days: Math.ceil(Math.round(gap * 1000) / 1000),
  };
}

/**
 * Phase 5 design 13.1. Ranks that break ties exactly as standings() orders:
 * active days per member first, minutes per member second. Ranking on
 * perMember alone made two guilds level on days joint 1st while the Monday
 * post named one of them as having "took it". competitionRanks compares with
 * ===, so the composite key is a string; both figures come from the same SQL
 * row, so equal rows produce equal keys.
 */
export function standingRanks(
  rows: readonly { perMember: number; minutes: number; memberCount: number }[],
): number[] {
  return competitionRanks(rows.map((row) => `${row.perMember}|${row.minutes / row.memberCount}`));
}

/** Phase 5 design 13.2. Which stretch of the competition a day falls in. */
export type CompetitionPhase = "before" | "during" | "after";

/**
 * Phase 5 design 13.2. Label comparison like isInWindow, no date arithmetic.
 * The standings header and the check-in prompt branch on this rather than on
 * the week number, which a mid-week start would put at 1 on the Monday
 * before the window.
 */
export function competitionPhase(
  today: string,
  start: string = COMPETITION_START,
  end: string = COMPETITION_END,
): CompetitionPhase {
  if (today < start) return "before";
  return today > end ? "after" : "during";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Phase 5 design 13.2. A yyyy-mm-dd label for a person: "27 July 2026". The
 * label is already in the competition timezone (design 4.2), so this reads
 * its parts and never builds a Date, which would shift it.
 */
export function longDate(label: string): string {
  const [year, month, day] = label.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

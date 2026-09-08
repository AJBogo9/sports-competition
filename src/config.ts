/**
 * The only place guild names, member counts, competition dates, tier values
 * and the weekly target exist (FR-25). Changing a value here and restarting
 * recomputes all history, because nothing derived from these is ever stored.
 */

export type Tier = "short" | "medium" | "long" | "rest";

export interface Guild {
  slug: string;
  name: string;
  memberCount: number;
}

/**
 * Carried over from SPEC.md section 1.
 *
 * These counts are the per-capita denominator, so a stale count silently
 * distorts every comparison in the competition. SPEC.md requires them to be
 * re-verified with each guild before launch. That is a launch task, not a
 * code task, and it has not been done yet.
 */
export const GUILDS: readonly Guild[] = [
  { slug: "tik", name: "TiK", memberCount: 700 },
  { slug: "prodeko", name: "Prodeko", memberCount: 650 },
  { slug: "as", name: "AS", memberCount: 650 },
  { slug: "fk", name: "FK", memberCount: 600 },
  { slug: "sik", name: "SIK", memberCount: 450 },
  { slug: "accounting", name: "Aalto Accounting", memberCount: 450 },
  { slug: "mk", name: "MK", memberCount: 400 },
  { slug: "inkubio", name: "Inkubio", memberCount: 400 },
  { slug: "athene", name: "Athene", memberCount: 350 },
];

export function guildBySlug(slug: string): Guild | undefined {
  return GUILDS.find((guild) => guild.slug === slug);
}

/**
 * SPEC.md section 4.1. The top tier is capped at 75 minutes deliberately:
 * health benefit plateaus past about 300 minutes per week, and the cap bounds
 * dishonesty to roughly 3x an honest report.
 */
export const TIER_MINUTES: Record<Tier, number> = {
  short: 22,
  medium: 45,
  long: 75,
  rest: 0,
};

/** Keyboard order. Rest is last, as in prototype/bot-flows.html. */
export const TIER_ORDER: readonly Tier[] = ["short", "medium", "long", "rest"];

/** SPEC.md section 4.2. The WHO guideline for adults 18 to 64. */
export const WEEKLY_TARGET_MINUTES = 150;

/**
 * FR-29 and phase 5 design 11.3. The weekly targets a member may choose from
 * with /target, ascending, the WHO figure first because it is where everyone
 * starts. None below it: SPEC.md section 4.2 keeps the guideline as the floor
 * until the owner rules otherwise, and adding one is an entry here. The top
 * option is six long days, the most a week can count under the daily cap.
 */
export const TARGET_OPTIONS: readonly number[] = [WEEKLY_TARGET_MINUTES, 225, 300, 450];

/**
 * FR-20. Monday morning, in TIMEZONE. Monday because that is the temporal
 * landmark where student gym attendance measurably rises, which is the whole
 * reason the post exists on that day rather than Sunday night.
 */
export const MONDAY_POST_HOUR = 9;

/** Design 4.1. One timezone for the whole competition, not one per user. */
export const TIMEZONE = "Europe/Helsinki";

/**
 * PLACEHOLDER. SPEC.md section 9 Q1 is unresolved: the real competition dates
 * are still under discussion.
 *
 * Design 4.6 requires this window to contain the present. FR-26 excludes
 * anything outside it, so a window in the past or future silently makes every
 * log count for nothing, with no error anywhere. A test asserts that today
 * falls inside it.
 *
 * 2026-07-27 is a Monday. 2026-09-20 is the Sunday eight weeks later,
 * inclusive. Replace both when Q1 resolves.
 */
export const COMPETITION_START = "2026-07-27";
export const COMPETITION_END = "2026-09-20";

/**
 * FR-22. Five consecutive reminders with no response stop the daily send and
 * buy exactly one message asking whether to continue (phase 3 design 3.2).
 *
 * A constant rather than configuration: FR-22 states the number, so a machine
 * that used a different one would not be running this competition's rules.
 */
export const FOLLOWUP_AFTER_IGNORES = 5;

/**
 * Phase 3 design 4.1. A reminder missed at its hour (a deploy, a short outage,
 * a slow tick) still goes out for this many hours, and after that the day is
 * skipped in silence.
 *
 * Deliberately NOT the Monday post's "late rather than never" rule (phase 2
 * design 4.4). Nobody blocks a group chat, and a 17:00 user pinged at 23:50 is
 * the annoyance case SPEC.md section 11 rates High, which ends in a
 * permanently unreachable user (SPEC.md section 3.2).
 */
export const REMINDER_GRACE_HOURS = 2;

/**
 * Phase 3 design 4.2. Reminder sends per tick. SPEC.md section 3.6 puts
 * Telegram's broadcast limit at 30 per second; this paces at 25 per MINUTE,
 * and the grace window above gives roughly 3,000 sends of capacity against a
 * few hundred users.
 *
 * Rejected: a throttler dependency, and a sleep between sends. Both add a
 * lifecycle to a problem the existing 60-second loop solves by doing less each
 * time it runs, and a sleep would hold the tick open across the interval,
 * colliding with startTicker's running guard.
 */
export const MAX_REMINDERS_PER_TICK = 25;

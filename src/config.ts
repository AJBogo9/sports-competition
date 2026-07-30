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

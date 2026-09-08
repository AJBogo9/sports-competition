import {
  progressBar,
  standingRanks,
  tierMinutes,
  type CompetitionPhase,
  type Race,
} from "../domain/scoring.ts";
import { PIN_NEEDS_ADMIN, STANDINGS_FOOTER, TIER_HEADS } from "../strings.ts";
import { escapeHtml } from "../html.ts";
import { WEEKLY_TARGET_MINUTES, type Tier } from "../config.ts";
import type { GuildStanding, Neighbour } from "../db/standings.ts";

/**
 * Which week a progress block is about.
 *
 * Not always the current one. FR-10's backdate writes to yesterday, and on a
 * Monday yesterday is Sunday, which belongs to the week that just ended. The
 * minutes that come back are then last week's, and labelling them "This week"
 * printed a filled bar and "Target hit" for a week the user had logged nothing
 * in, hours after the Monday post told their guild chat that everyone was back
 * to zero (FR-20). Every other day of the week, yesterday and today share a
 * week and this is "current".
 *
 * Two values rather than a week-start string: the renderer needs to know which
 * of two labels to print, not which Monday it is, and keeping the date
 * comparison in the caller keeps both week starts coming from SQL (design 4.2).
 */
export type LoggedWeek = "current" | "previous";

/**
 * FR-12. Monospace so the bar and the numbers line up on a narrow phone.
 *
 * "This week" and "Last week" are deliberately the same width. The label sits
 * in a fixed column ahead of the minutes inside a <pre>, so a longer one would
 * step the numbers out of line with the bar underneath.
 */
export function progressBlock(
  minutes: number,
  target: number,
  week: LoggedWeek = "current",
): string {
  const label = week === "previous" ? "Last week" : "This week";
  return (
    `<pre>${label}   ${minutes} / ${target} min\n` +
    `            ${progressBar(minutes, target)}</pre>`
  );
}

function tail(minutes: number, target: number, week: LoggedWeek, streak: number): string {
  const left = target - minutes;
  // FR-13 and phase 5 design 5.2. The streak is named only once the target is
  // met and only while it is intact: a highlighted broken streak is the one
  // streak display with evidence of harm (docs/evidence.md 5.3), and a single
  // week is not yet a streak. The prototype carried this line ("Target hit.
  // Fourth week running.") and Phase 1 dropped it.
  if (left <= 0) return streak > 1 ? `Target hit. ${streak} weeks in a row.` : "Target hit.";
  // A week that has already ended has nothing left to act on, so both nudges
  // below would be asking for a session that cannot count toward the number
  // printed above it.
  if (week === "previous") return "That week is closed.";
  // 45 is the medium tier's value, from the design mockup at prototype/bot-flows.html:1009
  if (left <= 45) return "One more session does it.";
  return `${left} minutes to go.`;
}

/**
 * FR-12. Every confirmation shows progress against the weekly target.
 *
 * The head scales with the tier (phase 5 design 5.3) and the tail names the
 * streak once the target is met (5.2). The tail is the last line on purpose:
 * the best line goes where the peak-end rule says it is remembered.
 */
export function confirmation(
  tier: Tier,
  minutes: number,
  target: number,
  week: LoggedWeek = "current",
  streak = 0,
  guildName?: string,
): string {
  // Phase 5 design 12.3. The day is framed as the guild's, once, as a fact:
  // groupcentric individual goals in interdependent groups carry d = +1.20
  // and egocentric ones d = -1.75 (Kleingeld et al. 2011), and under active-day
  // scoring the sentence is literally true whatever the tier. A rest day
  // contributes nothing and says nothing. guildName comes from config.ts and
  // is trusted today; escaped defensively.
  const forGuild = guildName ? ` A day for ${escapeHtml(guildName)}.` : "";
  const head = tier === "rest"
    ? TIER_HEADS.rest
    : `<b>${tierMinutes(tier)} min.</b> ${TIER_HEADS[tier]}${forGuild}`;
  return `${head}\n\n${progressBlock(minutes, target, week)}\n${tail(minutes, target, week, streak)}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13
    ? "th"
    : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

export interface MeInput {
  weekMinutes: number;
  target: number;
  streak: number;
  guildName: string;
  guildRank: number;
  guildCount: number;
  neighbours: readonly Neighbour[];
  /** Phase 5 design 13.2. After the end the caller passes the final week's
   *  figures, and the label says so. Defaults to the running competition. */
  phase?: CompetitionPhase;
}

/** FR-14. Weekly progress, the streak, and the rank of the user's guild. */
export function meMessage(input: MeInput): string {
  // Same width as "This week" so the columns hold, like the FR-12 labels.
  const label = input.phase === "after" ? "Final week" : "This week ";
  const lines = [
    `${label}   ${input.weekMinutes} / ${input.target} min`,
    `             ${progressBar(input.weekMinutes, input.target)}`,
  ];
  if (input.streak > 0) {
    const weeks = input.streak === 1 ? "week" : "weeks";
    lines.push(`Streak       ${input.streak} ${weeks} at target`);
  }
  // guildName comes from config.ts and is trusted today; escaped defensively.
  const when = input.phase === "after" ? "in the final week" : "this week";
  lines.push(
    `Guild        ${escapeHtml(input.guildName)}, ${ordinal(input.guildRank)} of ${input.guildCount} ${when}`,
  );

  let message = `<pre>${lines.join("\n")}</pre>`;

  // FR-15 permits neighbours but never a global ranking. With nobody either
  // side of the user there is nothing to show. Nor while all three are at
  // zero (phase 5 design 10.2): the query then orders by first name, so the
  // block is two strangers at zero beside the reader's own zero, which
  // identifies nobody's contribution and repeats a failure signal. It returns
  // the moment one of the three has minutes, including when that one is not
  // the reader.
  if (input.neighbours.length > 1 && input.neighbours.some((n) => n.minutes > 0)) {
    const rows = input.neighbours.map((n) => {
      const name = n.isSelf ? "you" : n.firstName;
      // Pad the raw name first, then escape: an escape sequence like &lt;
      // renders as one character, so padding after escaping would count
      // those extra source bytes as column width and misalign the table.
      // Cut to the column first (phase 5 design 13.3): a longer name stepped
      // the minutes out of line.
      return `  ${escapeHtml(name.slice(0, 10).padEnd(10))} ${String(n.minutes).padStart(3)} min`;
    });
    message += `\n\n<b>Around you</b>\n<pre>${rows.join("\n")}</pre>`;
  }
  return message;
}

export interface StandingsInput {
  week: readonly GuildStanding[];
  season: readonly GuildStanding[];
  /** Phase 5 design 11.1. From calendar(); shown only while phase is "during". */
  weekNumber: number;
  weekCount: number;
  /** Phase 5 design 13.2. Decides the header, not the week number: a
   *  mid-week start puts weekNumber at 1 on the Monday before the window. */
  phase: CompetitionPhase;
}

/**
 * Phase 5 design 11.1 and 13.2. "Week 5 of 8" is the visible arc: the goal
 * gradient needs an end in sight, and the fresh start needs to say how many
 * are left. Before the start there is no week to number, so the plain label;
 * after the end the caller passes the final week's table (/standings is
 * unguarded and answers at any time), and the header says which week that is
 * rather than showing a fresh empty week that contradicts the frozen pin.
 */
function clock(phase: CompetitionPhase, weekNumber: number, weekCount: number): string {
  if (phase === "during") return `Week ${weekNumber} of ${weekCount}`;
  return phase === "after" ? "Final week" : "This week";
}

/** Phase 5 design 13.1. "1 active days" was reachable for any small guild. */
function activeDays(n: number): string {
  return `${n} active ${n === 1 ? "day" : "days"}`;
}

function table(rows: readonly GuildStanding[]): string {
  // standings() orders by days per member, then minutes per member, then
  // name and slug, so rows already arrive sorted best first, which is what
  // the ranking requires. Not re-sorted here. standingRanks breaks ties the
  // same way the query does (phase 5 design 13.1).
  const ranks = standingRanks(rows);
  return rows
    .map((row, index) => {
      // guild names come from config.ts and are trusted today; escaped
      // defensively. Pad the raw name first, then escape: an escape
      // sequence like &amp; renders as one character, so padding after
      // escaping would count those extra source bytes as column width and
      // misalign the table.
      const name = escapeHtml(row.name.padEnd(18));
      // competitionRanks returns exactly one rank per input value, so ranks
      // and rows are always the same length.
      // Phase 5 design 12.2. The count of active days, never the per-member
      // average the rank comes from: an average over the roster is a low
      // descriptive norm broadcast to everyone above it (Chen et al. 2010,
      // Schultz et al. 2007). The footer explains why a bigger count can
      // sit lower.
      return `${String(ranks[index]!).padStart(2)}  ${name}${String(row.activeDays).padStart(4)}`;
    })
    .join("\n");
}

/**
 * FR-16. The weekly table comes first, deliberately: a guild ninth for the
 * season can still be winning the week, and without that the bottom guilds
 * receive nothing but repeated failure signals.
 */
export function standingsMessage(input: StandingsInput): string {
  return (
    `<b>${clock(input.phase, input.weekNumber, input.weekCount)}</b> · active days\n<pre>${table(input.week)}</pre>\n\n` +
    `<b>Season</b> · active days\n<pre>${table(input.season)}</pre>\n\n` +
    STANDINGS_FOOTER
  );
}

/**
 * FR-19. The pinned message is the same two tables /standings renders, through
 * the same renderer, so the pinned number and the on-demand number can never
 * disagree.
 */
export function pinnedStandings(input: StandingsInput & { pinFailed: boolean }): string {
  const base = standingsMessage(input);
  return input.pinFailed ? `${base}\n\n${PIN_NEEDS_ADMIN}` : base;
}

export interface MondayPostInput {
  /** Every guild at rank 1 with at least one active day (phase 5 design
   *  13.1): one name is "took it", several "shared it", none "nobody logged". */
  winners: readonly string[];
  guildName: string;
  guildRank: number;
  guildCount: number;
  /** The reader's guild's active days last week (phase 5 design 12.2): the
   *  count is displayed, the per-member figure that ranked it never is. */
  guildDays: number;
  /** How many of the reader's guild logged at least once, from participation(). */
  loggers: number;
  /** Phase 5 design 11.1. The week the post opens, from calendar(). */
  weekNumber: number;
  weekCount: number;
  /** Phase 5 design 11.2. The adjacent guild and the gap, from localRace();
   *  null when the table has no second guild. */
  race: Race | null;
  /**
   * Phase 2 design 4.8 and phase 5 design 10.1. Present only on the
   * competition's closing post, decided by isFinalMondayPost() from weekStart,
   * never from the reader or from today's date. It carries the season result,
   * so a closing post without one cannot be built: until Phase 5 the last
   * notifying message of the competition named last week's winner and never
   * the season's, which lived only in the silent pin.
   */
  final?: { winnerName: string; guildRank: number };
}

/**
 * FR-20. A new message rather than an edit, so it notifies. That contrast with
 * the pinned message in the same chat is deliberate: the pin is ambient and
 * silent, and this is the one interruption per week.
 *
 * Framed as a fresh start rather than a report card. SPEC.md section 11 rates a
 * guild disengaging from a hopeless position as the competition's top risk, so
 * the guilds at the bottom must read an opening here rather than a fourth
 * consecutive notice that they are losing. Nothing in the copy varies on how
 * badly the reader's guild did.
 *
 * The participation figure is about the reader's own guild, not the winner's
 * (phase 2 design 3.3): it is the number the reader can actually change this week.
 * It is a count of people and never a share of the roster (phase 5 design
 * 5.4). At the base rate SPEC.md section 1 expects, a share is a low
 * descriptive norm broadcast to a whole guild chat every Monday, and a
 * broadcast low norm pulls the people above it down toward it
 * (docs/evidence.md 5.2). A count names the people who did it without stating
 * that most did not.
 *
 * Guild names come from config.ts and are trusted today; escaped defensively,
 * because this message reaches a whole guild chat.
 *
 * The closing post (phase 2 design 4.8) varies only the opening and closing
 * sentences. Everything between them is shared rather than duplicated into a
 * second template, because the figures mean exactly the same thing on the last
 * post as on any other, and two separately maintained templates would drift.
 * The ordinary copy cannot simply be reused: it fires the Monday AFTER
 * COMPETITION_END, where "Week N of M. Everyone back to zero." and "This week
 * is open." are both false, and there is no week for anyone to act on. Its
 * opening names the season winner and the reader's season rank (phase 5
 * design 10.1), which the phase 2 design had rejected on cost; the last week's
 * sentence follows unchanged, so the two results are told apart by "season"
 * and "Last week".
 *
 * The variant is not rank-conditional and must never become so. Both branches
 * are held to the skeleton-equality test in tests/bot/render.test.ts, for the
 * SPEC.md section 11 reason above.
 *
 * The closing line is written for the newcomers (phase 5 design 5.5): the
 * habit that survives a competition belongs to the previous non-exerciser, so
 * the last thing the competition says hands the target back as theirs, states
 * the configured figure (FR-25), and asks for nothing.
 */
export function mondayPost(input: MondayPostInput): string {
  // The season winner reading its own post is not told "with Prodeko 1st of
  // 9" after "Prodeko wins the season" (smoke run 2026-09-08). Identity, not
  // rank, decides the clause, so the closing skeleton test holds.
  const placing = input.final && input.final.winnerName !== input.guildName
    ? `, with ${escapeHtml(input.guildName)} ${ordinal(input.final.guildRank)} of ${input.guildCount}`
    : "";
  const opening = input.final
    ? `<b>That's the competition.</b> ${escapeHtml(input.final.winnerName)} wins the season${placing}.`
    : `<b>Week ${input.weekNumber} of ${input.weekCount}. Everyone back to zero.</b>`;
  // Phase 5 design 12.3. A specific group goal: last week's own count is the
  // mark to beat (Kleingeld et al. 2011, d = 0.80 for specific difficult group
  // goals against do-your-best). Omitted at zero, where "beat 0" is not a
  // goal, and on the closing post, where no week is left to beat it in. The
  // branch is on the count, never on the rank, so the skeleton tests hold.
  const mark = input.guildDays > 0 ? ` The mark to beat: ${activeDays(input.guildDays)}.` : "";
  const closing = input.final
    ? `Thanks for moving. The standings stop here. ${WEEKLY_TARGET_MINUTES} minutes a week is yours to keep.`
    : `Nothing carries over. This week is open.${mark}`;
  return (
    `${opening}\n\n` +
    `${lastWeek(input.winners)}\n\n` +
    `${escapeHtml(input.guildName)} finished ${ordinal(input.guildRank)} of ${input.guildCount} ` +
    `with ${activeDays(input.guildDays)} and ${input.loggers} of you logging at least once.` +
    `${race(input.race)}\n\n` +
    closing
  );
}

/**
 * Phase 5 design 13.1. Under day counts two guilds with equal rosters tie
 * more easily than they did under minutes, and a week nobody logged is not
 * a week anyone won. Winner names come from config.ts and are trusted today;
 * escaped defensively because this reaches a whole guild chat.
 */
function lastWeek(winners: readonly string[]): string {
  const names = winners.map((name) => escapeHtml(name));
  if (names.length === 0) return "Last week nobody logged a day.";
  if (names.length === 1) return `Last week ${names[0]} took it.`;
  return `Last week ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} shared it.`;
}

/**
 * Phase 5 design 11.2. One sentence, the same shape for the winner (racing
 * downward) and for everyone else (racing upward), so both skeleton tests
 * still hold once the name, the direction word and the count are stripped. A
 * tie is "level", never "0 active days away". The adjacent guild's name comes
 * from config.ts and is trusted today; escaped defensively like the others.
 */
function race(input: Race | null): string {
  if (!input) return "";
  const name = escapeHtml(input.name);
  if (input.days === 0) return ` ${name} finished level with you on days.`;
  const unit = input.days === 1 ? "active day" : "active days";
  return ` ${name}, one place ${input.direction}, was ${input.days} ${unit} away.`;
}

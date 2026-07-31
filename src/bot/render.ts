import { competitionRanks, progressBar, tierMinutes } from "../domain/scoring.ts";
import { PIN_NEEDS_ADMIN, STANDINGS_FOOTER } from "../strings.ts";
import { escapeHtml } from "../html.ts";
import type { Tier } from "../config.ts";
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

function tail(minutes: number, target: number, week: LoggedWeek): string {
  const left = target - minutes;
  if (left <= 0) return "Target hit.";
  // A week that has already ended has nothing left to act on, so both nudges
  // below would be asking for a session that cannot count toward the number
  // printed above it.
  if (week === "previous") return "That week is closed.";
  // 45 is the medium tier's value, from the design mockup at prototype/bot-flows.html:1009
  if (left <= 45) return "One more session does it.";
  return `${left} minutes to go.`;
}

/** FR-12. Every confirmation shows progress against the weekly target. */
export function confirmation(
  tier: Tier,
  minutes: number,
  target: number,
  week: LoggedWeek = "current",
): string {
  const head = tier === "rest"
    ? "Noted. Rest days don't break anything."
    : `<b>${tierMinutes(tier)} min.</b> Good.`;
  return `${head}\n\n${progressBlock(minutes, target, week)}\n${tail(minutes, target, week)}`;
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
}

/** FR-14. Weekly progress, the streak, and the rank of the user's guild. */
export function meMessage(input: MeInput): string {
  const lines = [
    `This week    ${input.weekMinutes} / ${input.target} min`,
    `             ${progressBar(input.weekMinutes, input.target)}`,
  ];
  if (input.streak > 0) {
    const weeks = input.streak === 1 ? "week" : "weeks";
    lines.push(`Streak       ${input.streak} ${weeks} at target`);
  }
  // guildName comes from config.ts and is trusted today; escaped defensively.
  lines.push(
    `Guild        ${escapeHtml(input.guildName)}, ${ordinal(input.guildRank)} of ${input.guildCount} this week`,
  );

  let message = `<pre>${lines.join("\n")}</pre>`;

  // FR-15 permits neighbours but never a global ranking. With nobody either
  // side of the user there is nothing to show.
  if (input.neighbours.length > 1) {
    const rows = input.neighbours.map((n) => {
      const name = n.isSelf ? "you" : n.firstName;
      // Pad the raw name first, then escape: an escape sequence like &lt;
      // renders as one character, so padding after escaping would count
      // those extra source bytes as column width and misalign the table.
      return `  ${escapeHtml(name.padEnd(10))} ${String(n.minutes).padStart(3)} min`;
    });
    message += `\n\n<b>Around you</b>\n<pre>${rows.join("\n")}</pre>`;
  }
  return message;
}

export interface StandingsInput {
  week: readonly GuildStanding[];
  season: readonly GuildStanding[];
}

function table(rows: readonly GuildStanding[]): string {
  // standings() orders by perMember DESC (with name/slug tiebreakers), so
  // rows already arrive sorted best first, which is what competitionRanks
  // requires. Not re-sorted here.
  const ranks = competitionRanks(rows.map((row) => row.perMember));
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
      return `${String(ranks[index]!).padStart(2)}  ${name}${row.perMember.toFixed(1)}`;
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
    `<b>This week</b> · minutes per member\n<pre>${table(input.week)}</pre>\n\n` +
    `<b>Season</b>\n<pre>${table(input.season)}</pre>\n\n` +
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
  winnerName: string;
  winnerPerMember: number;
  guildName: string;
  guildRank: number;
  guildCount: number;
  guildPerMember: number;
  /** A share between 0 and 1, from participation(). Rendered as a percentage. */
  participation: number;
  /**
   * Phase 2 design 4.8. This is the competition's closing post, decided by
   * isFinalMondayPost() from weekStart, never from the reader or from today's
   * date. Optional and defaulting to false so every existing call site keeps
   * the ordinary copy.
   */
  final?: boolean;
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
 *
 * Guild names come from config.ts and are trusted today; escaped defensively,
 * because this message reaches a whole guild chat.
 *
 * The closing post (phase 2 design 4.8) varies only the opening and closing
 * sentences. Everything between them is shared rather than duplicated into a
 * second template, because the figures mean exactly the same thing on the last
 * post as on any other, and two separately maintained templates would drift.
 * The ordinary copy cannot simply be reused: it fires the Monday AFTER
 * COMPETITION_END, where "New week. Everyone back to zero." and "This week is
 * open." are both false, and there is no week for anyone to act on.
 *
 * The variant is not rank-conditional and must never become so. Both branches
 * are held to the skeleton-equality test in tests/bot/render.test.ts, for the
 * SPEC.md section 11 reason above.
 */
export function mondayPost(input: MondayPostInput): string {
  const percent = Math.round(input.participation * 100);
  const opening = input.final
    ? "<b>That's the competition.</b>"
    : "<b>New week. Everyone back to zero.</b>";
  const closing = input.final
    ? "Thanks for moving."
    : "Nothing carries over. This week is open.";
  return (
    `${opening}\n\n` +
    `Last week ${escapeHtml(input.winnerName)} took it, ` +
    `${input.winnerPerMember.toFixed(1)} minutes per member.\n\n` +
    `${escapeHtml(input.guildName)} finished ${ordinal(input.guildRank)} of ${input.guildCount}, ` +
    `${input.guildPerMember.toFixed(1)}, with ${percent}% of the guild logging at least once.\n\n` +
    closing
  );
}

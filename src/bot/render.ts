import { competitionRanks, progressBar, tierMinutes } from "../domain/scoring.ts";
import { PIN_NEEDS_ADMIN, STANDINGS_FOOTER } from "../strings.ts";
import { escapeHtml } from "../html.ts";
import type { Tier } from "../config.ts";
import type { GuildStanding, Neighbour } from "../db/standings.ts";

/** FR-12. Monospace so the bar and the numbers line up on a narrow phone. */
export function progressBlock(minutes: number, target: number): string {
  return (
    `<pre>This week   ${minutes} / ${target} min\n` +
    `            ${progressBar(minutes, target)}</pre>`
  );
}

function tail(minutes: number, target: number): string {
  const left = target - minutes;
  if (left <= 0) return "Target hit.";
  // 45 is the medium tier's value, from the design mockup at prototype/bot-flows.html:1009
  if (left <= 45) return "One more session does it.";
  return `${left} minutes to go.`;
}

/** FR-12. Every confirmation shows progress against the weekly target. */
export function confirmation(tier: Tier, minutes: number, target: number): string {
  const head = tier === "rest"
    ? "Noted. Rest days don't break anything."
    : `<b>${tierMinutes(tier)} min.</b> Good.`;
  return `${head}\n\n${progressBlock(minutes, target)}\n${tail(minutes, target)}`;
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
 * (phase 2 design 4.3): it is the number the reader can actually change this week.
 *
 * Guild names come from config.ts and are trusted today; escaped defensively,
 * because this message reaches a whole guild chat.
 */
export function mondayPost(input: MondayPostInput): string {
  const percent = Math.round(input.participation * 100);
  return (
    "<b>New week. Everyone back to zero.</b>\n\n" +
    `Last week ${escapeHtml(input.winnerName)} took it, ` +
    `${input.winnerPerMember.toFixed(1)} minutes per member.\n\n` +
    `${escapeHtml(input.guildName)} finished ${ordinal(input.guildRank)} of ${input.guildCount}, ` +
    `${input.guildPerMember.toFixed(1)}, with ${percent}% of the guild logging at least once.\n\n` +
    "Nothing carries over. This week is open."
  );
}

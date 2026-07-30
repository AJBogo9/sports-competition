import { progressBar, tierMinutes } from "../domain/scoring.ts";
import { STANDINGS_FOOTER } from "../strings.ts";
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
  lines.push(
    `Guild        ${input.guildName}, ${ordinal(input.guildRank)} of ${input.guildCount} this week`,
  );

  let message = `<pre>${lines.join("\n")}</pre>`;

  // FR-15 permits neighbours but never a global ranking. With nobody either
  // side of the user there is nothing to show.
  if (input.neighbours.length > 1) {
    const rows = input.neighbours.map((n) => {
      const name = n.isSelf ? "you" : n.firstName;
      return `  ${name.padEnd(10)} ${String(n.minutes).padStart(3)} min`;
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
  return rows
    .map((row, index) =>
      `${String(index + 1).padStart(2)}  ${row.name.padEnd(18)}${row.perMember.toFixed(1)}`)
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

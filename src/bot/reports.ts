import type { Bot, Context } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_END, COMPETITION_START, guildBySlug } from "../config.ts";
import { calendar, weekStartOf } from "../db/calendar.ts";
import { weekMinutes } from "../db/days.ts";
import { neighbours, standings, weeklyTotals } from "../db/standings.ts";
import { findUser } from "../db/users.ts";
import { competitionPhase, standingRanks, weeklyStreak } from "../domain/scoring.ts";
import { meMessage, standingsMessage } from "./render.ts";
import { decode } from "./callbacks.ts";
import { NOT_REGISTERED } from "../strings.ts";

/** FR-14. Read-only: this path performs no write of any kind. */
async function replyMe(ctx: Context, sql: Sql, telegramId: number): Promise<void> {
  const user = await findUser(sql, telegramId);
  if (!user) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }

  const { today, weekStart: currentWeek } = await calendar(sql);
  // Phase 5 design 13.2. After the end, the final week rather than a fresh
  // empty one that would rank every guild jointly 1st under the frozen pin.
  const phase = competitionPhase(today);
  const [weekStart, to] = phase === "after"
    ? [await weekStartOf(sql, COMPETITION_END), COMPETITION_END]
    : [currentWeek, today];
  const [minutes, totals, week, around] = await Promise.all([
    weekMinutes(sql, telegramId, weekStart),
    weeklyTotals(sql, telegramId),
    standings(sql, weekStart, to),
    neighbours(sql, telegramId, user.guildSlug, weekStart, to),
  ]);

  // users.guild_slug carries a foreign key onto guilds.slug, and standings()
  // selects FROM guilds, so the user's own guild is always one of these rows.
  // A miss here would mean the two tables have drifted apart, which is a bug
  // worth surfacing loudly (bot.catch logs it and the update simply fails)
  // rather than papering over with a guessed rank that renders as a
  // plausible but false number.
  const index = week.findIndex((row) => row.slug === user.guildSlug);
  if (index === -1) {
    throw new Error(`guild "${user.guildSlug}" missing from standings`);
  }

  const guild = guildBySlug(user.guildSlug);

  // standings() orders by days per member, then minutes per member, so week
  // already arrives sorted best first, which is what the ranking requires.
  // Not re-sorted here. Ties share the best rank (owner decision): every
  // guild sits jointly 1st before anyone has logged, rather than an arbitrary
  // 1-to-9 ordering of identical zeros. standingRanks breaks ties exactly as
  // the query orders (phase 5 design 13.1).
  const ranks = standingRanks(week);

  await ctx.reply(
    meMessage({
      weekMinutes: minutes,
      // FR-29. The reader's own target; the streak is counted against it too,
      // so raising the target rereads the season's weeks against the new bar.
      target: user.targetMinutes,
      streak: weeklyStreak(totals, weekStart, user.targetMinutes),
      guildName: guild?.name ?? user.guildSlug,
      // competitionRanks returns exactly one rank per input value, so ranks
      // and week are always the same length.
      guildRank: ranks[index]!,
      guildCount: week.length,
      neighbours: around,
      phase,
    }),
    { parse_mode: "HTML" },
  );
}

/** FR-16. The weekly table first, then the season, both per member. */
async function replyStandings(ctx: Context, sql: Sql): Promise<void> {
  const { today, weekStart: currentWeek, weekNumber, weekCount } = await calendar(sql);
  // Phase 5 design 13.2. After the end the final week is shown under a "Final
  // week" header, so /standings agrees with the frozen pin instead of showing
  // nine zeros jointly 1st.
  const phase = competitionPhase(today);
  const [weekStart, to] = phase === "after"
    ? [await weekStartOf(sql, COMPETITION_END), COMPETITION_END]
    : [currentWeek, today];
  const [week, season] = await Promise.all([
    standings(sql, weekStart, to),
    standings(sql, COMPETITION_START, to),
  ]);
  await ctx.reply(standingsMessage({ week, season, weekNumber, weekCount, phase }), {
    parse_mode: "HTML",
  });
}

export function installReports(bot: Bot, sql: Sql): void {
  // SPEC.md 3.1: reporting happens in a private chat, not the group. /me's
  // "Around you" block names other guild members, so answering it in a group
  // would publish their first names and minutes to whoever is in that chat.
  bot.command("me", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    await replyMe(ctx, sql, ctx.from.id);
  });

  // Deliberately unguarded, unlike /me above: /standings carries no personal
  // data, only guild totals, and FR-17 wants it usable in the group chat too
  // once Phase 2 adds one. Guarding it now would only have to be undone later.
  bot.command("standings", async (ctx) => {
    await replyStandings(ctx, sql);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    if (!callback || !ctx.from) return await next();

    if (callback.kind === "me") {
      await ctx.answerCallbackQuery();
      await replyMe(ctx, sql, ctx.from.id);
      return;
    }
    if (callback.kind === "standings") {
      await ctx.answerCallbackQuery();
      await replyStandings(ctx, sql);
      return;
    }
    return await next();
  });
}

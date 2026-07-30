import type { Bot, Context } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_START, WEEKLY_TARGET_MINUTES, guildBySlug } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { weekMinutes } from "../db/days.ts";
import { neighbours, standings, weeklyTotals } from "../db/standings.ts";
import { findUser } from "../db/users.ts";
import { weeklyStreak } from "../domain/scoring.ts";
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

  const { today, weekStart } = await calendar(sql);
  const [minutes, totals, week, around] = await Promise.all([
    weekMinutes(sql, telegramId, weekStart),
    weeklyTotals(sql, telegramId),
    standings(sql, weekStart, today),
    neighbours(sql, telegramId, user.guildSlug, weekStart, today),
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

  await ctx.reply(
    meMessage({
      weekMinutes: minutes,
      target: WEEKLY_TARGET_MINUTES,
      streak: weeklyStreak(totals, weekStart),
      guildName: guild?.name ?? user.guildSlug,
      guildRank: index + 1,
      guildCount: week.length,
      neighbours: around,
    }),
    { parse_mode: "HTML" },
  );
}

/** FR-16. The weekly table first, then the season, both per member. */
async function replyStandings(ctx: Context, sql: Sql): Promise<void> {
  const { today, weekStart } = await calendar(sql);
  const [week, season] = await Promise.all([
    standings(sql, weekStart, today),
    standings(sql, COMPETITION_START, today),
  ]);
  await ctx.reply(standingsMessage({ week, season }), { parse_mode: "HTML" });
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

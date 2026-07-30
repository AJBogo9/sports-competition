import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { GUILDS, guildBySlug } from "../config.ts";
import { createUser, findUser, moveUser, setReminderHour } from "../db/users.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_REMINDER_OFF,
  CHOOSE_GUILD,
  REMINDER_HOURS,
  alreadyRegistered,
  confirmMove,
  moved,
  reminderOff,
  reminderSet,
  stayed,
  welcome,
} from "../strings.ts";
import { sendCheckIn } from "./checkin.ts";

/** FR-2. Three per row over nine guilds. */
function guildKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  GUILDS.forEach((guild, index) => {
    keyboard.text(guild.name, encode({ kind: "guild", slug: guild.slug }));
    if (index % 3 === 2) keyboard.row();
  });
  return keyboard;
}

/** FR-4. A real choice between two named outcomes, with no silent default. */
function reminderKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  REMINDER_HOURS.forEach((hour, index) => {
    keyboard.text(`${String(hour).padStart(2, "0")}:00`, encode({ kind: "hour", hour }));
    if (index % 2 === 1) keyboard.row();
  });
  return keyboard.row().text(BUTTON_REMINDER_OFF, encode({ kind: "hour", hour: null }));
}

export function installRegistration(bot: Bot, sql: Sql): void {
  /**
   * FR-1: a guild deep link registers immediately with zero further input.
   * FR-2: a bare or unrecognised payload falls back to the picker.
   * FR-3: an existing user is never moved silently.
   */
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const from = ctx.from;
    if (!from) return;

    const payload = ctx.match.trim();
    const target = payload ? guildBySlug(payload) : undefined;
    const existing = await findUser(sql, from.id);

    if (existing) {
      const current = guildBySlug(existing.guildSlug);
      if (target && target.slug !== existing.guildSlug) {
        await ctx.reply(confirmMove(current?.name ?? existing.guildSlug, target.name), {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(`Move to ${target.name}`, encode({ kind: "move", slug: target.slug }))
            .row()
            .text(`Stay in ${current?.name ?? existing.guildSlug}`, encode({ kind: "stay" })),
        });
        return;
      }
      await ctx.reply(alreadyRegistered(current?.name ?? existing.guildSlug), {
        parse_mode: "HTML",
      });
      await sendCheckIn(ctx, sql, from.id);
      return;
    }

    if (!target) {
      await ctx.reply(CHOOSE_GUILD, { reply_markup: guildKeyboard() });
      return;
    }

    await registerAndAsk(ctx, sql, target.slug);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;

    if (!callback || !from) return await next();

    if (callback.kind === "guild") {
      const guild = guildBySlug(callback.slug);
      if (!guild) return void (await ctx.answerCallbackQuery());
      await ctx.answerCallbackQuery();
      const existing = await findUser(sql, from.id);
      if (existing) {
        await ctx.editMessageText(alreadyRegistered(guild.name), { parse_mode: "HTML" });
        return;
      }
      await registerAndAsk(ctx, sql, guild.slug, true);
      return;
    }

    if (callback.kind === "hour") {
      await ctx.answerCallbackQuery(
        callback.hour === null ? "Reminders off" : `Reminder set for ${callback.hour}:00`,
      );
      const user = await findUser(sql, from.id);
      if (!user) return;
      const guild = guildBySlug(user.guildSlug);
      const guildName = guild?.name ?? user.guildSlug;

      await setReminderHour(sql, from.id, callback.hour);
      await ctx.editMessageText(
        callback.hour === null ? reminderOff(guildName) : reminderSet(callback.hour, guildName),
        { parse_mode: "HTML" },
      );
      await sendCheckIn(ctx, sql, from.id);
      return;
    }

    if (callback.kind === "move") {
      const guild = guildBySlug(callback.slug);
      if (!guild) return void (await ctx.answerCallbackQuery());
      await moveUser(sql, from.id, guild.slug);
      await ctx.answerCallbackQuery("Moved");
      await ctx.editMessageText(moved(guild.name), { parse_mode: "HTML" });
      return;
    }

    if (callback.kind === "stay") {
      const user = await findUser(sql, from.id);
      const guild = user ? guildBySlug(user.guildSlug) : undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(stayed(guild?.name ?? "your guild"), { parse_mode: "HTML" });
      return;
    }

    return await next();
  });
}

async function registerAndAsk(
  ctx: Context,
  sql: Sql,
  guildSlug: string,
  edit = false,
): Promise<void> {
  const from = ctx.from;
  const guild = guildBySlug(guildSlug);
  if (!guild || !from) return;

  await createUser(sql, {
    telegramId: from.id,
    guildSlug,
    firstName: from.first_name,
    username: from.username ?? null,
  });

  const text = welcome(from.first_name, guild.name);
  const options = { parse_mode: "HTML" as const, reply_markup: reminderKeyboard() };
  if (edit) await ctx.editMessageText(text, options);
  else await ctx.reply(text, options);
}

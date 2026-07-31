import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { GUILDS, guildBySlug } from "../config.ts";
import { createUser, findUser, moveUser, setReminderHour } from "../db/users.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_REMINDER_OFF,
  CHOOSE_GUILD,
  FALLBACK_GUILD,
  REMINDER_HOURS,
  TOAST_MOVED,
  TOAST_REMINDERS_OFF,
  alreadyRegistered,
  buttonMoveTo,
  buttonStayIn,
  confirmMove,
  moved,
  reminderOff,
  reminderSet,
  stayed,
  toastReminderSet,
  welcome,
} from "../strings.ts";
import { sendCheckIn } from "./checkin.ts";

/** FR-2. Three per row over nine guilds. */
function guildKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  GUILDS.forEach((guild, index) => {
    keyboard.text(guild.name, encode({ kind: "guild", slug: guild.slug }));
    if (index % 3 === 2 && index < GUILDS.length - 1) keyboard.row();
  });
  return keyboard;
}

/** FR-4. A real choice between two named outcomes, with no silent default. */
function reminderKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  REMINDER_HOURS.forEach((hour, index) => {
    keyboard.text(`${String(hour).padStart(2, "0")}:00`, encode({ kind: "hour", hour }));
    if (index % 2 === 1 && index < REMINDER_HOURS.length - 1) keyboard.row();
  });
  return keyboard.row().text(BUTTON_REMINDER_OFF, encode({ kind: "hour", hour: null }));
}

/**
 * FR-3. The same explicit Move or Stay choice, whether the intent to switch
 * guilds arrives via a fresh /start deep link or a tap on a stale picker
 * button. There must be exactly one place this keyboard is built.
 */
function moveOrStayKeyboard(
  targetSlug: string,
  targetName: string,
  currentName: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(buttonMoveTo(targetName), encode({ kind: "move", slug: targetSlug }))
    .row()
    .text(buttonStayIn(currentName), encode({ kind: "stay" }));
}

/**
 * FR-4. Offered until the question has actually been put, which is what
 * reminder_asked records (phase 3 design 4.6).
 *
 * Phase 1 tested reminderHour === null instead, because reminder_hour was NULL
 * both for "never asked" and for "asked and declined", which cost a decliner
 * the question again on every /start. Migration 003 separates them and this is
 * the test that replaces it.
 */
function reminderKeyboardIfUnasked(reminderAsked: boolean): InlineKeyboard | undefined {
  return reminderAsked ? undefined : reminderKeyboard();
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
          reply_markup: moveOrStayKeyboard(
            target.slug,
            target.name,
            current?.name ?? existing.guildSlug,
          ),
        });
        return;
      }
      await ctx.reply(alreadyRegistered(current?.name ?? existing.guildSlug), {
        parse_mode: "HTML",
        reply_markup: reminderKeyboardIfUnasked(existing.reminderAsked),
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
        const current = guildBySlug(existing.guildSlug);
        if (existing.guildSlug !== guild.slug) {
          await ctx.editMessageText(confirmMove(current?.name ?? existing.guildSlug, guild.name), {
            parse_mode: "HTML",
            reply_markup: moveOrStayKeyboard(
              guild.slug,
              guild.name,
              current?.name ?? existing.guildSlug,
            ),
          });
          return;
        }
        await ctx.editMessageText(alreadyRegistered(current?.name ?? existing.guildSlug), {
          parse_mode: "HTML",
          reply_markup: reminderKeyboardIfUnasked(existing.reminderAsked),
        });
        return;
      }
      await registerAndAsk(ctx, sql, guild.slug, true);
      return;
    }

    if (callback.kind === "hour") {
      const user = await findUser(sql, from.id);
      if (!user) return void (await ctx.answerCallbackQuery());
      const guild = guildBySlug(user.guildSlug);
      const guildName = guild?.name ?? user.guildSlug;

      await setReminderHour(sql, from.id, callback.hour);
      await ctx.answerCallbackQuery(
        callback.hour === null ? TOAST_REMINDERS_OFF : toastReminderSet(callback.hour),
      );
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
      const before = await findUser(sql, from.id);
      await moveUser(sql, from.id, guild.slug);
      await ctx.answerCallbackQuery(TOAST_MOVED);
      await ctx.editMessageText(moved(guild.name), {
        parse_mode: "HTML",
        // See reminderKeyboardIfUnasked: moving guilds never touches the
        // reminder question, so a mover who was never asked still needs asking.
        reply_markup: reminderKeyboardIfUnasked(before?.reminderAsked ?? false),
      });
      return;
    }

    if (callback.kind === "stay") {
      const user = await findUser(sql, from.id);
      const guild = user ? guildBySlug(user.guildSlug) : undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(stayed(guild?.name ?? FALLBACK_GUILD), {
        parse_mode: "HTML",
        // See reminderKeyboardIfUnasked: staying never touches it either.
        reply_markup: user ? reminderKeyboardIfUnasked(user.reminderAsked) : undefined,
      });
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

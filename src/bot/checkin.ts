import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { TIER_ORDER, WEEKLY_TARGET_MINUTES, type Tier } from "../config.ts";
import { calendar, weekStartOf } from "../db/calendar.ts";
import { logDay, undoDay, weekMinutes } from "../db/days.ts";
import { findUser } from "../db/users.ts";
import { isInWindow } from "../domain/scoring.ts";
import { confirmation, progressBlock } from "./render.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_LOG_AGAIN,
  BUTTON_ME,
  BUTTON_STANDINGS,
  BUTTON_UNDO,
  BUTTON_YESTERDAY,
  CHECK_IN_PROMPT,
  CHECK_IN_PROMPT_YESTERDAY,
  NOT_REGISTERED,
  OUTSIDE_WINDOW,
  TIER_LABELS,
  TOAST_LOGGED,
  TOAST_PUT_BACK,
  TOAST_REMOVED,
  UNDO_DONE,
  UNDO_RESTORED,
} from "../strings.ts";

/**
 * FR-5. One tier per row, so a tap is unambiguous on a phone, and no
 * confirmation step: the tap itself is the commit.
 *
 * FR-10. Backdating is one extra row, so today stays one tap and yesterday
 * costs two.
 */
function checkInKeyboard(date: string, yesterday: string | null): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const tier of TIER_ORDER) {
    keyboard.text(TIER_LABELS[tier], encode({ kind: "log", date, tier })).row();
  }
  if (yesterday) {
    keyboard.text(BUTTON_YESTERDAY, encode({ kind: "yesterday", date: yesterday }));
  }
  return keyboard;
}

/** The undo button carries the tier this log displaced, so FR-9 can put it
 *  back rather than merely deleting the day. See design 4.5. */
function afterLogKeyboard(date: string, displaced: Tier | null): InlineKeyboard {
  return new InlineKeyboard()
    .text(BUTTON_UNDO, encode({ kind: "undo", date, restore: displaced }))
    .text(BUTTON_ME, encode({ kind: "me" }))
    .text(BUTTON_STANDINGS, encode({ kind: "standings" }));
}

/** FR-6. The same check-in message, on demand. Also reused after registration. */
export async function sendCheckIn(ctx: Context, sql: Sql, telegramId: number): Promise<void> {
  const user = await findUser(sql, telegramId);
  if (!user) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }
  const { today, yesterday } = await calendar(sql);
  await ctx.reply(CHECK_IN_PROMPT, {
    parse_mode: "HTML",
    reply_markup: checkInKeyboard(today, yesterday),
  });
}

export function installCheckIn(bot: Bot, sql: Sql): void {
  bot.command("log", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    await sendCheckIn(ctx, sql, ctx.from.id);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || !from) return await next();

    if (callback.kind === "yesterday") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(CHECK_IN_PROMPT_YESTERDAY, {
        parse_mode: "HTML",
        reply_markup: checkInKeyboard(callback.date, null),
      });
      return;
    }

    // Offered after an undo, to log the same day again. The prompt must
    // match the date being re-offered: after a backdated undo, callback.date
    // is yesterday, and showing "Moved today?" while the buttons commit to
    // yesterday would let the user believe a yesterday write was for today.
    if (callback.kind === "checkin") {
      await ctx.answerCallbackQuery();
      const { today } = await calendar(sql);
      const prompt = callback.date === today ? CHECK_IN_PROMPT : CHECK_IN_PROMPT_YESTERDAY;
      await ctx.editMessageText(prompt, {
        parse_mode: "HTML",
        reply_markup: checkInKeyboard(callback.date, null),
      });
      return;
    }

    if (callback.kind === "log") {
      const user = await findUser(sql, from.id);
      if (!user) {
        await ctx.answerCallbackQuery(NOT_REGISTERED);
        return;
      }

      // FR-26. Nothing outside the competition window is ever written.
      if (!isInWindow(callback.date)) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(OUTSIDE_WINDOW);
        return;
      }

      const { displaced } = await logDay(sql, from.id, callback.date, callback.tier);
      await ctx.answerCallbackQuery(TOAST_LOGGED);

      const weekStart = await weekStartOf(sql, callback.date);
      const minutes = await weekMinutes(sql, from.id, weekStart);
      await ctx.editMessageText(
        confirmation(callback.tier, minutes, WEEKLY_TARGET_MINUTES),
        {
          parse_mode: "HTML",
          reply_markup: afterLogKeyboard(callback.date, displaced),
        },
      );
      return;
    }

    if (callback.kind === "undo") {
      const user = await findUser(sql, from.id);
      if (!user) {
        await ctx.answerCallbackQuery(NOT_REGISTERED);
        return;
      }

      // FR-26. The same guard as the log path: callback data is not
      // guaranteed well-formed, and this must not write outside the
      // competition window even though the official client never offers an
      // undo button for a date it wouldn't have let you log.
      if (!isInWindow(callback.date)) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(OUTSIDE_WINDOW);
        return;
      }

      // FR-9. Restores the displaced tier when the log overwrote one, so the
      // exact prior weekly total comes back rather than merely vanishing.
      await undoDay(sql, from.id, callback.date, callback.restore);
      const restored = callback.restore !== null;
      await ctx.answerCallbackQuery(restored ? TOAST_PUT_BACK : TOAST_REMOVED);

      const weekStart = await weekStartOf(sql, callback.date);
      const minutes = await weekMinutes(sql, from.id, weekStart);
      // A restore leaves the previous tier's minutes still counted below, so
      // saying "Removed." there (and in the toast above) would contradict the
      // progress block.
      const message = restored ? UNDO_RESTORED : UNDO_DONE;
      await ctx.editMessageText(
        `${message}\n\n${progressBlock(minutes, WEEKLY_TARGET_MINUTES)}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(BUTTON_LOG_AGAIN, encode({ kind: "checkin", date: callback.date })),
        },
      );
      return;
    }

    return await next();
  });
}

import { InlineKeyboard, type Bot } from "grammy";
import type { Sql } from "postgres";
import { TARGET_OPTIONS } from "../config.ts";
import { findUser, setTarget } from "../db/users.ts";
import { decode, encode } from "./callbacks.ts";
import {
  NOT_REGISTERED,
  targetButton,
  targetSet,
  targetStatus,
  toastTargetSet,
} from "../strings.ts";

/** FR-29. Two per row, in config order, the WHO figure first; the current
 *  choice is marked (phase 5 design 13.3). */
function targetKeyboard(current: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  TARGET_OPTIONS.forEach((minutes, index) => {
    const label = minutes === current ? `✓ ${targetButton(minutes)}` : targetButton(minutes);
    keyboard.text(label, encode({ kind: "target", minutes }));
    if (index % 2 === 1 && index < TARGET_OPTIONS.length - 1) keyboard.row();
  });
  return keyboard;
}

/**
 * FR-29 and phase 5 design 11.3. The self-chosen weekly target, the strongest
 * missing element in the evidence file (ENGAGE 2021: the only goal-setting
 * arm that worked let people choose) and the answer to the member who trains
 * daily and had nothing left to reach after Tuesday. It changes what the bar,
 * the streak and the celebration compare against, and nothing the guild is
 * credited with: SPEC.md section 4.3 counts days, not minutes, and the reply
 * says so.
 *
 * Not asked at registration. Newcomers start at the WHO line, which is the
 * standard the evidence wants attainable (phase 5 design principle 4), and
 * the extra tap would fall on the people least likely to want it. The
 * registration reply points here instead.
 *
 * Private-chat only, like /remind: a personal setting.
 */
export function installTarget(bot: Bot, sql: Sql): void {
  bot.command("target", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const user = await findUser(sql, ctx.from.id);
    if (!user) {
      await ctx.reply(NOT_REGISTERED);
      return;
    }
    await ctx.reply(targetStatus(user.targetMinutes), {
      parse_mode: "HTML",
      reply_markup: targetKeyboard(user.targetMinutes),
    });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || !from || callback.kind !== "target") return await next();

    // A /target message stays live indefinitely (NFR-5), so the row may be
    // gone by the time a button is tapped.
    const user = await findUser(sql, from.id);
    if (!user) {
      await ctx.answerCallbackQuery(NOT_REGISTERED);
      return;
    }
    // decode() admitted only a configured option, so this is a choice the
    // product offers today, whatever the message it sits on once said.
    await setTarget(sql, from.id, callback.minutes);
    await ctx.answerCallbackQuery(toastTargetSet(callback.minutes));
    await ctx.editMessageText(targetSet(callback.minutes), { parse_mode: "HTML" });
  });
}

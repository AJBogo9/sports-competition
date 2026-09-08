import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_END, COMPETITION_START, TIER_ORDER, guildBySlug, type Tier } from "../config.ts";
import { calendar, weekStartOf } from "../db/calendar.ts";
import { dayTier, logDay, undoDay, weekMinutes } from "../db/days.ts";
import { weeklyTotals } from "../db/standings.ts";
import { findUser } from "../db/users.ts";
import { competitionPhase, crossedTarget, isInWindow, weeklyStreak } from "../domain/scoring.ts";
import { confirmation, progressBlock, type LoggedWeek } from "./render.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_LOG_AGAIN,
  BUTTON_ME,
  BUTTON_STANDINGS,
  BUTTON_TODAY,
  BUTTON_UNDO,
  BUTTON_YESTERDAY,
  CHECK_IN_PROMPT,
  CHECK_IN_PROMPT_YESTERDAY,
  NOT_REGISTERED,
  OUTSIDE_WINDOW,
  STALE_CHECK_IN,
  TIER_LABELS,
  TOAST_LOGGED,
  TOAST_PUT_BACK,
  TOAST_REMOVED,
  UNDO_DONE,
  UNDO_RESTORED,
  UNDO_SUPERSEDED,
  afterEnd,
  beforeStart,
  loggedAlready,
} from "../strings.ts";

/**
 * FR-5. One tier per row, so a tap is unambiguous on a phone, and no
 * confirmation step: the tap itself is the commit.
 *
 * FR-10. Backdating is one extra row, so today stays one tap and yesterday
 * costs two.
 */
function checkInKeyboard(
  date: string,
  yesterday: string | null,
  backToToday: string | null = null,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const tier of TIER_ORDER) {
    keyboard.text(TIER_LABELS[tier], encode({ kind: "log", date, tier })).row();
  }
  if (yesterday) {
    keyboard.text(BUTTON_YESTERDAY, encode({ kind: "yesterday", date: yesterday }));
  }
  // Phase 5 design 13.3. The yesterday prompt had no way back; the existing
  // "checkin" kind re-renders today's prompt.
  if (backToToday) {
    keyboard.text(BUTTON_TODAY, encode({ kind: "checkin", date: backToToday }));
  }
  return keyboard;
}

export interface CheckIn {
  text: string;
  keyboard: InlineKeyboard;
}

/**
 * FR-6 and FR-21. One definition of the check-in message, rendered from the
 * live calendar dates.
 *
 * FR-21 says the daily reminder MUST send the check-in message, not a message
 * that resembles it. The reminder pass has bot.api and a chat id but no ctx,
 * so without this there would be two constructions that agree today and drift
 * later. Pure, and takes the dates as arguments, so the ticker can render once
 * per tick instead of issuing a calendar query per user.
 */
export function checkInMessage(
  today: string,
  yesterday: string,
  logged: Tier | null = null,
  date: string = today,
): CheckIn {
  // Phase 5 design 13.3. When the day is already logged the prompt says what
  // is there, because FR-7's replacement is otherwise invisible until the
  // undo toast says "Put back". The reminder path passes nothing: reminders
  // reach only people who have not logged.
  const already = logged ? `\n${loggedAlready(logged)}` : "";
  // FR-10. The yesterday prompt (reached from "Log yesterday instead", and
  // from "Log again" on an undone backdate) offers the way back to today and
  // no second backdate. The smoke run of 2026-09-08 found "Today instead"
  // and "Log again" rendering a bare prompt with neither line nor button;
  // every prompt now comes from here.
  if (date !== today) {
    return { text: `${CHECK_IN_PROMPT_YESTERDAY}${already}`, keyboard: checkInKeyboard(date, null, today) };
  }
  // FR-10. Only offer the backdate button when yesterday is itself loggable.
  // On the competition's first day, yesterday falls outside the window, and
  // offering the button anyway would cost the user two taps (Yesterday, then
  // any tier) to reach the same OUTSIDE_WINDOW refusal a single tap gives.
  const backdateTo = isInWindow(yesterday) ? yesterday : null;
  return { text: `${CHECK_IN_PROMPT}${already}`, keyboard: checkInKeyboard(today, backdateTo) };
}

/** The undo button carries the tier this log displaced, so FR-9 can put it
 *  back rather than merely deleting the day (design 4.5), and the tier it
 *  stored, so a tap on a superseded confirmation is refused rather than
 *  reverting a newer entry. See the Callback type and db/days.ts. */
function afterLogKeyboard(date: string, stored: Tier, displaced: Tier | null): InlineKeyboard {
  return new InlineKeyboard()
    .text(BUTTON_UNDO, encode({ kind: "undo", date, restore: displaced, stored }))
    .text(BUTTON_ME, encode({ kind: "me" }))
    .text(BUTTON_STANDINGS, encode({ kind: "standings" }));
}

/**
 * FR-12. Which week the progress block under a confirmation is about.
 *
 * FR-10's backdate writes to yesterday, and on a Monday yesterday is Sunday,
 * so the minutes read back are the previous week's. Both week starts come from
 * SQL, weekStartOf for the logged day and calendar for now, so no JavaScript
 * date arithmetic decides this (design 4.2).
 */
function loggedWeek(loggedWeekStart: string, currentWeekStart: string): LoggedWeek {
  return loggedWeekStart === currentWeekStart ? "current" : "previous";
}

/** FR-6. The same check-in message, on demand. Also reused after registration. */
export async function sendCheckIn(ctx: Context, sql: Sql, telegramId: number): Promise<void> {
  const user = await findUser(sql, telegramId);
  if (!user) {
    await ctx.reply(NOT_REGISTERED);
    return;
  }
  const { today, yesterday } = await calendar(sql);
  // Phase 5 design 13.2. Links are posted before the start, so a newcomer's
  // first tap must not be a refusal: say when instead, and skip the keyboard.
  const phase = competitionPhase(today);
  if (phase !== "during") {
    await ctx.reply(phase === "before" ? beforeStart(COMPETITION_START) : afterEnd(COMPETITION_END));
    return;
  }
  const message = checkInMessage(today, yesterday, await dayTier(sql, telegramId, today));
  await ctx.reply(message.text, { parse_mode: "HTML", reply_markup: message.keyboard });
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

    // Payload dates are never trusted for rendering either: a check-in
    // message persists and its buttons stay live long after the day it was
    // sent for, so callback.date can be stale by the time it's tapped. Both
    // branches below recompute against the live calendar rather than the
    // payload.
    if (callback.kind === "yesterday") {
      await ctx.answerCallbackQuery();
      // Ignore the payload date entirely: this button only ever means "the
      // day before today", so bind to the live yesterday regardless of what
      // date the message happened to carry when it was rendered.
      const { today, yesterday } = await calendar(sql);
      const prompt = checkInMessage(today, yesterday, await dayTier(sql, from.id, yesterday), yesterday);
      await ctx.editMessageText(prompt.text, { parse_mode: "HTML", reply_markup: prompt.keyboard });
      return;
    }

    // Offered after an undo, to log the same day again. The prompt must
    // match the date being re-offered: after a backdated undo, callback.date
    // is yesterday, and showing "Moved today?" while the buttons commit to
    // yesterday would let the user believe a yesterday write was for today.
    //
    // The payload date is kept only if it still equals the live today or
    // yesterday; otherwise it falls back to today. This preserves undoing a
    // backdated entry offering to re-log that same day, while a message gone
    // stale beyond that falls back to something sensible rather than
    // re-offering an arbitrary past date.
    if (callback.kind === "checkin") {
      await ctx.answerCallbackQuery();
      const { today, yesterday } = await calendar(sql);
      const date = callback.date === today || callback.date === yesterday ? callback.date : today;
      const prompt = checkInMessage(today, yesterday, await dayTier(sql, from.id, date), date);
      await ctx.editMessageText(prompt.text, { parse_mode: "HTML", reply_markup: prompt.keyboard });
      return;
    }

    if (callback.kind === "log") {
      const user = await findUser(sql, from.id);
      if (!user) {
        await ctx.answerCallbackQuery(NOT_REGISTERED);
        return;
      }

      // FR-26. Nothing outside the competition window is ever written, and
      // neither is a day that has not happened yet: callback data is not
      // guaranteed well-formed, even though the check-in UI only ever offers
      // today and yesterday.
      //
      // The future-date half of this guard is not merely defensive: weekMinutes
      // sums the full Monday-to-Sunday week, while standings() and neighbours()
      // sum only up to today, and those two only ever agree because no
      // future-dated row can exist. Removing this guard would let a future
      // write slip in and silently disagree with /me's own "Around you" row.
      //
      // Payload dates are also never trusted for staleness: a /log message
      // sent on day N carries "today" and "yesterday" as they were on day N,
      // but the message and its buttons stay live indefinitely. A tap on
      // day N+3 must not be allowed to write three days back just because
      // the payload still names that date, so today and yesterday are
      // recomputed against the live calendar and anything else is refused.
      const { today, yesterday, weekStart: currentWeek } = await calendar(sql);
      if (
        !isInWindow(callback.date) ||
        callback.date > today ||
        (callback.date !== today && callback.date !== yesterday)
      ) {
        await ctx.answerCallbackQuery();
        // Two distinct refusals share this guard, so they must not share a
        // message: a date genuinely outside the competition, and a date
        // inside it that is only stale. Telling someone their date is
        // outside the competition when it is not sends them looking for a
        // problem that does not exist.
        await ctx.editMessageText(isInWindow(callback.date) ? STALE_CHECK_IN : OUTSIDE_WINDOW);
        return;
      }

      const { stored, displaced } = await logDay(sql, from.id, callback.date, callback.tier);
      await ctx.answerCallbackQuery(TOAST_LOGGED);

      const weekStart = await weekStartOf(sql, callback.date);
      const minutes = await weekMinutes(sql, from.id, weekStart);
      // FR-13 and phase 5 design 5.2. The streak of the week the logged day
      // falls in, the same week the FR-12 label names, so a Monday backdate
      // into last week reports last week's streak rather than this week's.
      // FR-29: the target is the user's own, here and in the crossing below.
      const streak = weeklyStreak(await weeklyTotals(sql, from.id), weekStart, user.targetMinutes);
      await ctx.editMessageText(
        confirmation(
          callback.tier,
          minutes,
          user.targetMinutes,
          loggedWeek(weekStart, currentWeek),
          streak,
          // Phase 5 design 12.3: the day is named as the guild's.
          guildBySlug(user.guildSlug)?.name ?? user.guildSlug,
        ),
        {
          parse_mode: "HTML",
          reply_markup: afterLogKeyboard(callback.date, stored, displaced),
        },
      );
      // FR-28 and phase 5 design 5.1. The one celebration in the product: the
      // log that took the week over the target gets a big reaction on its own
      // confirmation, 🔥 when it extends a streak and 🎉 otherwise.
      //
      // After the edit, never before, so a refused reaction can never cost the
      // user their confirmation. Fire-and-forget with a logged failure rather
      // than awaited, so a rejected reaction never reaches bot.catch as a
      // failed update. (grammY's react throws synchronously only when the
      // callback carries no chat or message id, which no non-inline callback
      // lacks, and this bot has no inline mode.)
      // Whether a bot may react to a message it sent itself in a private chat
      // is documented nowhere; docs/SMOKE.md settles it, and the design
      // records the effect-message fallback if it is refused.
      if (crossedTarget(minutes, callback.tier, displaced, user.targetMinutes)) {
        void ctx.react(streak > 1 ? "🔥" : "🎉", { is_big: true })
          .catch((error) => console.warn(`reaction for ${from.id} failed`, error));
      }
      return;
    }

    if (callback.kind === "undo") {
      const user = await findUser(sql, from.id);
      if (!user) {
        await ctx.answerCallbackQuery(NOT_REGISTERED);
        return;
      }

      // FR-26. The same guard as the log path above, including the
      // future-date/weekMinutes coupling and the staleness check: callback
      // data is not guaranteed well-formed, and this must not write outside
      // the competition window, for a day that has not happened yet, or for
      // a stale date a persisted message still carries, even though the
      // official client never offers an undo button for a date it wouldn't
      // have let you log.
      const { today, yesterday, weekStart: currentWeek } = await calendar(sql);
      if (
        !isInWindow(callback.date) ||
        callback.date > today ||
        (callback.date !== today && callback.date !== yesterday)
      ) {
        await ctx.answerCallbackQuery();
        // Same split as the log path above.
        await ctx.editMessageText(isInWindow(callback.date) ? STALE_CHECK_IN : OUTSIDE_WINDOW);
        return;
      }

      // FR-9. Restores the displaced tier when the log overwrote one, so the
      // exact prior weekly total comes back rather than merely vanishing.
      //
      // Refuses when the day no longer holds what this message's log stored:
      // a second confirmation for the same day can be live in the chat, and
      // applying this one's payload over it would revert an entry it knows
      // nothing about. The guard is in the SQL, so there is no read-then-write
      // window. See undoDay.
      const applied = await undoDay(sql, from.id, callback.date, {
        expected: callback.stored,
        restore: callback.restore,
      });
      if (!applied) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(UNDO_SUPERSEDED);
        return;
      }

      const restored = callback.restore !== null;
      await ctx.answerCallbackQuery(restored ? TOAST_PUT_BACK : TOAST_REMOVED);

      const weekStart = await weekStartOf(sql, callback.date);
      const minutes = await weekMinutes(sql, from.id, weekStart);
      // A restore leaves the previous tier's minutes still counted below, so
      // saying "Removed." there (and in the toast above) would contradict the
      // progress block.
      const message = restored ? UNDO_RESTORED : UNDO_DONE;
      await ctx.editMessageText(
        `${message}\n\n${progressBlock(minutes, user.targetMinutes, loggedWeek(weekStart, currentWeek))}`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(BUTTON_LOG_AGAIN, encode({ kind: "checkin", date: callback.date })),
        },
      );
      // FR-28. An undone log takes its celebration with it. Cleared whether or
      // not this message carried one: an empty reaction list is a no-op on a
      // message without reactions, and reading first would spend a round trip
      // to save a no-op. Same fire-and-forget shape as the log path.
      void ctx.react([]).catch((error) => console.warn(`reaction clear for ${from.id} failed`, error));
      return;
    }

    return await next();
  });
}

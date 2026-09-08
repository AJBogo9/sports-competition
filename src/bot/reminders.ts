import { GrammyError, InlineKeyboard, type Bot } from "grammy";
import type { Sql } from "postgres";
import { FOLLOWUP_AFTER_IGNORES } from "../config.ts";
import { reminderAction } from "../domain/reminders.ts";
import {
  dueReminders,
  recordReminder,
  resumeReminders,
  setBlocked,
} from "../db/reminders.ts";
import { findUser, setReminderHour } from "../db/users.ts";
import { checkInMessage } from "./checkin.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BUTTON_REMINDER_KEEP,
  BUTTON_REMINDER_STOP,
  NOT_REGISTERED,
  REMIND_OFF,
  REMIND_STATUS_OFF,
  REMINDER_FOLLOWUP,
  REMINDER_HOURS,
  TOAST_REMINDERS_KEPT,
  TOAST_REMINDERS_OFF,
  remindSet,
  remindStatusOn,
  remindStatusPaused,
  remindersKept,
  toastReminderSet,
} from "../strings.ts";

/**
 * FR-24. The same hours as registration, so there is one set of choices in the
 * product, but carrying the "remind" callback kind rather than "hour" (phase 3
 * design 4.4).
 */
function remindKeyboard(withOff = true): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  REMINDER_HOURS.forEach((hour, index) => {
    keyboard.text(`${String(hour).padStart(2, "0")}:00`, encode({ kind: "remind", hour }));
    if (index % 2 === 1 && index < REMINDER_HOURS.length - 1) keyboard.row();
  });
  // Phase 5 design 13.3. No "Turn them off" under "Reminders are off".
  return withOff ? keyboard.row().text(BUTTON_REMINDER_STOP, encode({ kind: "remind", hour: null })) : keyboard;
}

/**
 * FR-22. Both outcomes as real buttons. "Keep them" resumes without asking the
 * user to choose an hour again, which is why it is its own callback kind and
 * not a remind:<hour> carrying the hour they already have.
 */
function followupKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(BUTTON_REMINDER_KEEP, encode({ kind: "keep" }))
    .text(BUTTON_REMINDER_STOP, encode({ kind: "remind", hour: null }));
}

/** FR-23. Telegram's answer when the user has blocked the bot. */
function isBlockedError(error: unknown): boolean {
  return error instanceof GrammyError && error.error_code === 403;
}

/** Telegram's answer when we are sending too fast (SPEC.md section 3.6). */
function isRateLimited(error: unknown): boolean {
  return error instanceof GrammyError && error.error_code === 429;
}

export function installReminders(bot: Bot, sql: Sql): void {
  /**
   * FR-24. Off and on at any time, and the hour changeable, through a command
   * in the menu rather than buried in help text.
   *
   * Private-chat only, like /me: it is a personal setting, and answering it in
   * a group would publish one member's reminder hour to the whole chat. Unlike
   * /me this carries no other member's data, so the reason is smaller, but the
   * shape matches.
   */
  bot.command("remind", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const user = await findUser(sql, ctx.from.id);
    if (!user) {
      await ctx.reply(NOT_REGISTERED);
      return;
    }
    // FR-22 pause and FR-4 off both leave reminderHour untouched or null
    // respectively, but they are different states: findUser did not use to
    // expose ignoredStreak at all, so this handler could not tell a paused
    // user apart from one whose hour was simply on, and told them reminders
    // were live when dueReminders was excluding them (phase 3 design 3.3).
    const status = user.reminderHour === null
      ? REMIND_STATUS_OFF
      : user.ignoredStreak > FOLLOWUP_AFTER_IGNORES
      ? remindStatusPaused(user.reminderHour)
      : remindStatusOn(user.reminderHour);
    await ctx.reply(status, {
      parse_mode: "HTML",
      reply_markup: remindKeyboard(user.reminderHour !== null),
    });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || !from) return await next();

    if (callback.kind === "remind") {
      // FR-24. Takes effect immediately, including for a reminder already due
      // later today: setReminderHour writes reminder_hour, and dueReminders
      // reads it live on the next tick rather than from anything cached.
      await setReminderHour(sql, from.id, callback.hour);
      await ctx.answerCallbackQuery(
        callback.hour === null ? TOAST_REMINDERS_OFF : toastReminderSet(callback.hour),
      );
      await ctx.editMessageText(
        callback.hour === null ? REMIND_OFF : remindSet(callback.hour),
        { parse_mode: "HTML" },
      );
      return;
    }

    if (callback.kind === "keep") {
      const user = await findUser(sql, from.id);
      // A follow-up message stays live indefinitely, so this can be tapped by
      // someone whose row is gone, or who turned reminders off in the
      // meantime. Neither is an error worth an alarming message: resuming an
      // hour that is not set would leave them on nothing.
      if (!user || user.reminderHour === null) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(REMIND_STATUS_OFF, {
          parse_mode: "HTML",
          reply_markup: remindKeyboard(false),
        });
        return;
      }
      // FR-22: "a user who taps 'keep them' resumes immediately". The hour is
      // untouched, so resuming never silently means choosing again.
      await resumeReminders(sql, from.id);
      await ctx.answerCallbackQuery(TOAST_REMINDERS_KEPT);
      await ctx.editMessageText(remindersKept(user.reminderHour), { parse_mode: "HTML" });
      return;
    }

    return await next();
  });
}

/**
 * FR-21, FR-22 and FR-23. One pass of the reminder loop, called once per tick
 * from ticker.ts.
 *
 * The dates arrive from the caller's single calendar() read, so the message is
 * rendered once for the whole batch rather than once per user.
 *
 * Per-user isolation matches the ticker's per-chat isolation: one person's
 * failure must not abandon the rest of the batch. The one deliberate exception
 * is a 429, which is Telegram saying the batch itself is the problem, so the
 * pass stops and the next tick picks up inside the same grace window.
 */
export async function sendDueReminders(
  bot: Bot,
  sql: Sql,
  today: string,
  yesterday: string,
): Promise<void> {
  const due = await dueReminders(sql);
  if (due.length === 0) return;

  const message = checkInMessage(today, yesterday);

  for (const user of due) {
    const { action, nextStreak } = reminderAction(user);
    // dueReminders already excludes the paused, so this cannot normally fire.
    // Kept because the alternative to a redundant guard here is sending a
    // reminder to someone who asked not to receive one.
    if (action === "none") continue;

    try {
      if (action === "daily") {
        await bot.api.sendMessage(String(user.telegramId), message.text, {
          parse_mode: "HTML",
          reply_markup: message.keyboard,
        });
      } else {
        await bot.api.sendMessage(String(user.telegramId), REMINDER_FOLLOWUP, {
          parse_mode: "HTML",
          reply_markup: followupKeyboard(),
        });
      }
      // Only after Telegram accepted it. A send that succeeds and then fails
      // to record re-sends next tick, bounded by the grace window; that gap is
      // accepted rather than solved (phase 3 design 6).
      await recordReminder(sql, user.telegramId, nextStreak);
    } catch (error) {
      if (isBlockedError(error)) {
        // FR-23. Recorded, and dueReminders never selects this row again
        // unless the user comes back and messages us (phase 3 design 3.5).
        console.warn(`user ${user.telegramId} has blocked the bot`);
        try {
          await setBlocked(sql, user.telegramId);
        } catch (blockError) {
          // Guarded for the same reason the ticker guards unbindChat: an
          // error here would escape the per-user catch and abandon the rest
          // of the batch, which is exactly what the isolation exists to stop.
          console.error(`failed to record block for ${user.telegramId}`, blockError);
        }
        continue;
      }
      if (isRateLimited(error)) {
        // Not a per-user failure: continuing would make it worse. The
        // remaining users stay due and the next tick retries them, still
        // inside the grace window (phase 3 design 4.1).
        console.warn("rate limited, stopping this tick's reminders");
        return;
      }
      console.error(`reminder to ${user.telegramId} failed`, error);
    }
  }
}

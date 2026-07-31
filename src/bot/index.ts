import { Bot, GrammyError } from "grammy";
import type { Sql } from "postgres";
import { installRegistration } from "./registration.ts";
import { installCheckIn } from "./checkin.ts";
import { installReports } from "./reports.ts";
import { installGroup } from "./group.ts";
import { installReminders } from "./reminders.ts";
import { clearBlocked } from "../db/reminders.ts";
import { COMMAND_DESCRIPTIONS } from "../strings.ts";

export function createBot(sql: Sql, token: string): Bot {
  const bot = new Bot(token);

  /**
   * FR-23 and phase 3 design 3.5. An incoming update, other than the one that
   * announces a block, is proof Telegram has stopped refusing us, and FR-23's
   * "never retried" still holds exactly: no send is ever retried INTO a
   * block. Without this, one transient 403 removes a user from the only
   * re-engagement mechanism the competition has, for the rest of the season.
   *
   * The exception: Telegram sends `my_chat_member` for a private chat when
   * the user blocks OR unblocks the bot, and ctx.chat/ctx.from both resolve
   * for it like any other update, so it is not proof of reachability the way
   * every other update type is. Left unexcluded, a block mid-batch (the send
   * 403s and setBlocked writes TRUE) can race the queued my_chat_member
   * (status kicked) that immediately clears it back to FALSE, costing one
   * redundant failed send next tick before the row settles. Bounded and
   * self-healing, but avoidable, so my_chat_member is skipped here rather than
   * inspected for status; that would be explicit kicked/member handling,
   * a larger change this fix does not make.
   *
   * First, before every command handler, because it must see the update
   * whichever handler ends up consuming it. Private chats only: a group
   * message says nothing about whether its sender has blocked the bot.
   *
   * The write is guarded, deliberately. This is reachability bookkeeping, and
   * it must never be the reason a user's /log fails: on a database blip the
   * interaction proceeds and the flag is cleared by their next message.
   */
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private" && ctx.from && !ctx.myChatMember) {
      try {
        await clearBlocked(sql, ctx.from.id);
      } catch (error) {
        console.error(`failed to clear blocked for ${ctx.from.id}`, error);
      }
    }
    await next();
  });

  // Group handlers install FIRST. grammY stops the middleware chain at the
  // first command handler that does not call next(), and registration's
  // /start returns early on non-private chats without calling it, so a group
  // /start would never reach group.ts if the order were reversed. group.ts's
  // own /start calls next() for private chats, so registration still sees
  // every private /start exactly as before.
  installGroup(bot, sql);

  // Registration installs the callback_query:data handler that falls through
  // to the others, so its order matters.
  installRegistration(bot, sql);
  installCheckIn(bot, sql);
  installReports(bot, sql);
  // Installs a callback_query:data listener too, so it must stay above the
  // catch-all below, which answers anything unclaimed and stops the chain.
  installReminders(bot, sql);

  // Any unclaimed callback still needs answering, or the client spins forever.
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  /**
   * An error inside one update must never kill the process. Long polling
   * would otherwise stop for everyone because of one bad message.
   *
   * error.ctx carries the update, so the update id and the reporting user's
   * id go into the log line: without them a stack trace gives no way to tell
   * who hit it or which update to look up.
   */
  bot.catch((error) => {
    const updateId = error.ctx.update.update_id;
    const userId = error.ctx.from?.id ?? "unknown";

    // Repeat taps (the same button pressed twice before Telegram's edit lands,
    // or a tap on a message already in the state it would edit to) make
    // Telegram's editMessageText reply 400 "message is not modified". It is
    // harmless, but during the manual smoke run it fires often enough to bury
    // real failures in noise, so it is logged at a lower level instead of as
    // an error. Every other error is still logged in full.
    if (error.error instanceof GrammyError && error.error.description.includes("message is not modified")) {
      console.warn(`update ${updateId} from ${userId}: message not modified (ignored)`);
      return;
    }

    console.error(`update ${updateId} from ${userId} failed`, error.error);
  });

  return bot;
}

/**
 * FR-17. Reporting commands appear only in private chats, standings appear in
 * group chats. The requirement's own acceptance test is that the menu in a
 * guild group offers /standings but not /log.
 */
export async function installCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands(
    [
      { command: "log", description: COMMAND_DESCRIPTIONS.log },
      { command: "me", description: COMMAND_DESCRIPTIONS.me },
      { command: "standings", description: COMMAND_DESCRIPTIONS.standings },
      { command: "remind", description: COMMAND_DESCRIPTIONS.remind },
    ],
    { scope: { type: "all_private_chats" } },
  );
  await bot.api.setMyCommands(
    [{ command: "standings", description: COMMAND_DESCRIPTIONS.standings }],
    { scope: { type: "all_group_chats" } },
  );
}

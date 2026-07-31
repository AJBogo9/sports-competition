import { Bot, GrammyError } from "grammy";
import type { Sql } from "postgres";
import { installRegistration } from "./registration.ts";
import { installCheckIn } from "./checkin.ts";
import { installReports } from "./reports.ts";
import { installGroup } from "./group.ts";
import { COMMAND_DESCRIPTIONS } from "../strings.ts";

export function createBot(sql: Sql, token: string): Bot {
  const bot = new Bot(token);

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
    ],
    { scope: { type: "all_private_chats" } },
  );
  await bot.api.setMyCommands(
    [{ command: "standings", description: COMMAND_DESCRIPTIONS.standings }],
    { scope: { type: "all_group_chats" } },
  );
}

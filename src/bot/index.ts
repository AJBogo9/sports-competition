import { Bot } from "grammy";
import type { Sql } from "postgres";
import { installRegistration } from "./registration.ts";
import { installCheckIn } from "./checkin.ts";
import { installReports } from "./reports.ts";
import { COMMAND_DESCRIPTIONS } from "../strings.ts";

export function createBot(sql: Sql, token: string): Bot {
  const bot = new Bot(token);

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
   */
  bot.catch((error) => {
    console.error("update failed", error.error);
  });

  return bot;
}

/**
 * FR-17, private-chat half. Group scopes land in Phase 2 along with the group
 * chat itself.
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
}

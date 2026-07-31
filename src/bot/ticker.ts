import { GrammyError, type Bot } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_START } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { listChats, recordMondayPost, recordPin, unbindChat, type Chat } from "../db/chats.ts";
import { participation, standings } from "../db/standings.ts";
import { competitionRanks, isInWindow, previousWeek } from "../domain/scoring.ts";
import { dayBefore, shouldPostMonday } from "../domain/scheduling.ts";
import { mondayPost, pinnedStandings } from "./render.ts";

const TICK_MS = 60_000;
const PIN_REFRESH_MS = 15 * 60_000;

/**
 * Telegram errors that mean the chat is gone for good. The row is deleted so
 * the ticker stops retrying it forever (phase 2 design 6). A supergroup upgrade
 * lands here too: the chat_id changes, the old one stops resolving, and the
 * board re-adds via the link. Not migrated silently, because the new id
 * arrives on a field the bot may never see if it was down at the time.
 */
function isGone(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  const description = error.description.toLowerCase();
  return (
    error.error_code === 403 ||
    description.includes("chat not found") ||
    description.includes("upgraded to a supergroup")
  );
}

/** FR-19. Render, then edit only if the text actually changed. */
async function refreshPin(bot: Bot, sql: Sql, chat: Chat, weekStart: string, today: string) {
  const [week, season] = await Promise.all([
    standings(sql, weekStart, today),
    standings(sql, COMPETITION_START, today),
  ]);
  const text = pinnedStandings({ week, season, pinFailed: chat.pinFailed });

  if (chat.pinnedMessageId === null) {
    const sent = await bot.api.sendMessage(chat.chatId, text, { parse_mode: "HTML" });
    const messageId = String(sent.message_id);
    // FR-19. The pin is the requirement, but the live number is the value, so
    // a refused pin keeps the message and flags itself instead of failing
    // (phase 2 design 3.2).
    const pinFailed = !(await tryPin(bot, chat.chatId, messageId));
    await recordPin(sql, chat.chatId, { messageId, text, pinFailed });
    return;
  }

  // Phase 2 design 2.3. Skipping the unchanged edit removes the API call entirely
  // rather than making it and swallowing Telegram's 400. Overnight, when
  // nobody logs, this means the refresh does nothing at all.
  //
  // The two conditions are separate on purpose. A chat whose text has not
  // changed but whose pin previously failed still has work to do: retry the
  // pin. Editing it with identical text to get there would produce exactly
  // the 400 this check exists to avoid.
  const unchanged = chat.pinnedText === text;
  if (unchanged && !chat.pinFailed) return;

  if (!unchanged) {
    // message_id is an int32 in the Bot API and grammY types it as a number.
    // Unlike chat_id it is small by construction, so the conversion is safe.
    await bot.api.editMessageText(chat.chatId, Number(chat.pinnedMessageId), text, {
      parse_mode: "HTML",
    });
  }

  // Retry the pin on every refresh until it takes, so the board's fix applies
  // without anyone restarting anything.
  const pinFailed = chat.pinFailed
    ? !(await tryPin(bot, chat.chatId, chat.pinnedMessageId))
    : false;
  await recordPin(sql, chat.chatId, { messageId: chat.pinnedMessageId, text, pinFailed });
}

async function tryPin(bot: Bot, chatId: string, messageId: string): Promise<boolean> {
  try {
    // disable_notification: FR-19 requires the pinned standings to generate no
    // notification, and pinning notifies by default.
    await bot.api.pinChatMessage(chatId, Number(messageId), { disable_notification: true });
    return true;
  } catch (error) {
    if (isGone(error)) throw error;
    return false;
  }
}

/** FR-20. A new message, so it notifies. Exactly once per chat per week. */
async function sendMondayPost(bot: Bot, sql: Sql, chat: Chat, weekStart: string) {
  // Last week runs from the previous Monday to the Sunday before this one.
  const lastWeekStart = previousWeek(weekStart);
  const lastWeekEnd = dayBefore(weekStart);
  const [table, share] = await Promise.all([
    standings(sql, lastWeekStart, lastWeekEnd),
    participation(sql, chat.guildSlug, lastWeekStart, lastWeekEnd),
  ]);

  const winner = table[0];
  const index = table.findIndex((row) => row.slug === chat.guildSlug);
  // chats.guild_slug carries a foreign key onto guilds.slug and standings()
  // selects FROM guilds, so a miss means the two have drifted. Surfacing it
  // beats posting a guessed rank to a whole guild chat.
  if (!winner || index === -1) throw new Error(`guild "${chat.guildSlug}" missing from standings`);
  const own = table[index]!;
  const ranks = competitionRanks(table.map((row) => row.perMember));

  await bot.api.sendMessage(
    chat.chatId,
    mondayPost({
      winnerName: winner.name,
      winnerPerMember: winner.perMember,
      guildName: own.name,
      guildRank: ranks[index]!,
      guildCount: table.length,
      guildPerMember: own.perMember,
      participation: share,
    }),
    { parse_mode: "HTML" },
  );
  await recordMondayPost(sql, chat.chatId, weekStart);
}

/**
 * FR-19 and FR-20. One 60-second loop, started in main.ts and stopped on
 * shutdown (phase 2 design 4.1).
 *
 * Rejected: a third container or a host cron entry. NFR-1 and NFR-2 hold the
 * deployment to two containers and one process, and an external scheduler
 * would need its own path to both the Bot API and the database to do work this
 * process is already positioned to do.
 *
 * Rejected: two intervals, one per feature. One loop asking two questions has
 * one lifecycle to stop cleanly and one place the calendar is read.
 *
 * Everything that must survive a restart is on the chats row. The only
 * in-memory state is the last pin refresh, and losing it costs one extra
 * render that the unchanged-text check turns into a no-op.
 */
export function startTicker(bot: Bot, sql: Sql): () => void {
  let lastPinRefresh = 0;

  async function tick(): Promise<void> {
    const { today, weekStart, hour } = await calendar(sql);
    // Phase 2 design 4.7. Inert outside the competition, which leaves the closing
    // numbers pinned as the resting state of a competition that is over.
    if (!isInWindow(today)) return;

    const chats = await listChats(sql);
    const refreshPins = Date.now() - lastPinRefresh >= PIN_REFRESH_MS;
    if (refreshPins) lastPinRefresh = Date.now();

    for (const chat of chats) {
      // One chat's failure must not stop the other eight and must not kill the
      // interval, so every chat is isolated.
      try {
        if (refreshPins) await refreshPin(bot, sql, chat, weekStart, today);
        if (
          shouldPostMonday({
            weekStart,
            lastPosted: chat.lastMondayWeek,
            localDate: today,
            localHour: hour,
          })
        ) {
          await sendMondayPost(bot, sql, chat, weekStart);
        }
      } catch (error) {
        if (isGone(error)) {
          console.warn(`chat ${chat.chatId} is gone, unbinding`);
          await unbindChat(sql, chat.chatId);
          continue;
        }
        console.error(`tick failed for chat ${chat.chatId}`, error);
      }
    }
  }

  const timer = setInterval(() => {
    void tick().catch((error) => console.error("tick failed", error));
  }, TICK_MS);

  return () => clearInterval(timer);
}

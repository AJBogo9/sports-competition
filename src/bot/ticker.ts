import { GrammyError, type Bot } from "grammy";
import type { Sql } from "postgres";
import { COMPETITION_START } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { listChats, recordMondayPost, recordPin, unbindChat, type Chat } from "../db/chats.ts";
import { participation, standings, type GuildStanding } from "../db/standings.ts";
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
 *
 * Deliberately narrow: only a 403 and the supergroup-upgrade 400 qualify,
 * matching the failure table in phase 2 design 6 exactly. A generic "chat not
 * found" is Telegram's catch-all for "this id did not resolve", which a
 * transient lookup failure can also produce, and treating it as gone-for-good
 * would delete a perfectly good chat's row on a false positive. Worse, a
 * later rebind resets last_monday_week to the current week (phase 2 design
 * 2.4), which would silently suppress that week's Monday post with no signal
 * anywhere. A bot actually removed from a chat gets a 403, which stays in
 * this set, so nothing real goes unhandled by dropping the generic case; it
 * is logged as an ordinary error instead and the next tick retries.
 */
function isGone(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  const description = error.description.toLowerCase();
  return error.error_code === 403 || description.includes("upgraded to a supergroup");
}

/**
 * Telegram's 400 when the message the pin refresh is editing has itself been
 * deleted: an admin deleted it, or the chat's auto-delete timer expired it.
 * This is not the chat being gone (isGone() above): the chat is fine, only
 * the stored message reference is stale. Kept as its own check, separate from
 * isGone(), so the two failures get different recoveries: forgetting the
 * message id (refreshPin) rather than deleting the chat's row.
 */
function isMessageGone(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  return error.description.toLowerCase().includes("message to edit not found");
}

/**
 * FR-19. Render, then edit only if the text actually changed.
 *
 * week and season are computed once per tick by the caller and passed in
 * (minor 3, fix round 1): neither query depends on the chat, so hoisting them
 * above the per-chat loop turns what was 2 identical queries times 9 chats
 * into 2 total.
 */
async function refreshPin(
  bot: Bot,
  sql: Sql,
  chat: Chat,
  week: readonly GuildStanding[],
  season: readonly GuildStanding[],
): Promise<void> {
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
    try {
      // message_id is an int32 in the Bot API and grammY types it as a
      // number. Unlike chat_id it is small by construction, so the
      // conversion is safe.
      await bot.api.editMessageText(chat.chatId, Number(chat.pinnedMessageId), text, {
        parse_mode: "HTML",
      });
    } catch (error) {
      // Fix round 1, important 1. The referenced message can be deleted out
      // from under the bot: an admin deletes it, or the chat's auto-delete
      // timer expires it. That is not the chat being gone, so it must not
      // unbind (isGone() does not match this description at all). Nulling
      // pinned_message_id instead makes the next refresh retake the
      // "no pinned message yet" branch above and send and pin a fresh
      // message, rather than leaving this chat stuck on the same 400 every
      // 15 minutes forever with no path back.
      if (isMessageGone(error)) {
        await recordPin(sql, chat.chatId, { messageId: null, text, pinFailed: false });
        return;
      }
      throw error;
    }
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
    // message_id is an int32 in the Bot API and grammY types it as a number;
    // unlike chat_id it is small by construction, so this conversion is safe
    // (fix round 1, minor 1, matching the sibling conversion above).
    await bot.api.pinChatMessage(chatId, Number(messageId), { disable_notification: true });
    return true;
  } catch (error) {
    if (isGone(error)) throw error;
    return false;
  }
}

/**
 * FR-20. A new message, so it notifies. Exactly once per chat per week: the
 * ledger (chats.last_monday_week, updated by recordMondayPost below) makes
 * that guarantee hold across restarts, and startTicker's running guard makes
 * it hold across overlapping ticks within one process (fix round 1,
 * critical). Neither guarantee alone was sufficient.
 */
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
 * Everything that must survive a restart is on the chats row. The in-memory
 * state is the last pin refresh timestamp and whether a tick is currently
 * running; losing either on restart is harmless. Losing the timestamp costs
 * one extra render that the unchanged-text check (2.3) turns into a no-op.
 * Losing the running flag just resets it to not-running, which is correct.
 *
 * Guaranteed: at most one tick's worth of work runs at a time (the running
 * guard below), each chat's failure is isolated from every other chat's, and
 * a chat found to be permanently gone is unbound without derailing the rest
 * of that tick. NOT guaranteed by this file alone: a second OS process running
 * the same ticker against the same database would still double-post, because
 * the running flag is per-process memory, not a database lock. That case is
 * out of scope per phase 2 design 6's failure table ("Two processes running
 * at once"), which rules it out at the deployment level (NFR-2: one machine,
 * one process) rather than in code.
 */
export function startTicker(bot: Bot, sql: Sql): () => void {
  let lastPinRefresh = 0;

  // Fix round 1, critical. setInterval starts a new tick every 60 seconds
  // regardless of whether the previous one finished, and grammY's default
  // per-call API timeout is 500 seconds, so a single slow Telegram call can
  // leave several ticks in flight underneath it at once. Concurrent ticks
  // each read chat.lastMondayWeek before any of them has called
  // recordMondayPost, so each one independently decides the Monday post is
  // owed and each one sends it: the chats.last_monday_week ledger only
  // guarantees "exactly once per week" across restarts, not across
  // overlapping ticks in the same process, and this flag is what closes that
  // gap. A skipped tick is not silently dropped: shouldPostMonday and the pin
  // refresh both operate on live state (the calendar, the chats table), so
  // the next tick a minute later picks up exactly where a skipped one would
  // have started, at the cost of the post landing up to a minute later than
  // it otherwise would (still within phase 2 design 4.4's "late rather than
  // never" tolerance).
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      // Logged rather than silent: a tick that is still running a full
      // minute after it started is a signal worth seeing (a hung API call,
      // a slow query), even though skipping is the safe response to it.
      console.warn("tick skipped: previous tick is still running");
      return;
    }
    running = true;
    try {
      const { today, weekStart, hour } = await calendar(sql);
      // Phase 2 design 4.7. Inert outside the competition, which leaves the closing
      // numbers pinned as the resting state of a competition that is over.
      if (!isInWindow(today)) return;

      const chats = await listChats(sql);
      const refreshPins = Date.now() - lastPinRefresh >= PIN_REFRESH_MS;
      if (refreshPins) lastPinRefresh = Date.now();

      // Fix round 1, minor 3. Neither query depends on the chat, only on
      // weekStart/today, which are the same for every chat this tick, so
      // they are computed once here instead of once per chat inside
      // refreshPin. Skipped entirely when this tick is not a pin-refresh
      // tick, since nothing below would read them.
      const [week, season]: [readonly GuildStanding[], readonly GuildStanding[]] = refreshPins
        ? await Promise.all([standings(sql, weekStart, today), standings(sql, COMPETITION_START, today)])
        : [[], []];

      for (const chat of chats) {
        // One chat's failure must not stop the other eight and must not kill the
        // interval, so every chat is isolated.
        try {
          if (refreshPins) await refreshPin(bot, sql, chat, week, season);
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
            try {
              await unbindChat(sql, chat.chatId);
            } catch (unbindError) {
              // Fix round 1, minor 2. Guarded so a failure here (e.g. the
              // database connection dropping) cannot escape this per-chat
              // catch: unguarded, it would propagate out of the for loop and
              // abandon every remaining chat this tick, exactly the failure
              // per-chat isolation exists to prevent.
              console.error(`failed to unbind chat ${chat.chatId}`, unbindError);
            }
            continue;
          }
          console.error(`tick failed for chat ${chat.chatId}`, error);
        }
      }
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void tick().catch((error) => console.error("tick failed", error));
  }, TICK_MS);

  return () => clearInterval(timer);
}

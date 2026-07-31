import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Sql } from "postgres";
import { GUILDS, guildBySlug } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { bindChat, findChat, unbindChat } from "../db/chats.ts";
import { decode, encode } from "./callbacks.ts";
import {
  BIND_GUILD_GONE,
  CHOOSE_GUILD_GROUP,
  TOAST_ADMINS_ONLY,
  chatAlreadyBound,
  chatBound,
} from "../strings.ts";

/** FR-18. The same three-per-row shape the private guild picker uses. */
function bindKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  GUILDS.forEach((guild, index) => {
    keyboard.text(guild.name, encode({ kind: "bind", slug: guild.slug }));
    if (index % 3 === 2 && index < GUILDS.length - 1) keyboard.row();
  });
  return keyboard;
}

/**
 * FR-18. Binding decides which guild's numbers a whole chat sees, so it is
 * restricted to chat administrators.
 *
 * The check cannot live on the picker callback alone: `/start@bot <slug>` is an
 * ordinary message, so without this any member of a several-hundred-person
 * chat could re-point the chat at a rival guild by typing one line
 * (phase 2 design 3.1).
 *
 * Adding a bot to a group does not require admin in every group configuration,
 * so a non-admin who opens the link is refused here and the picker is left up
 * for an admin.
 */
async function isChatAdmin(ctx: Context, userId: number): Promise<boolean> {
  const member = await ctx.getChatMember(userId);
  return member.status === "administrator" || member.status === "creator";
}

async function bind(ctx: Context, sql: Sql, chatId: string, slug: string): Promise<void> {
  const guild = guildBySlug(slug);
  if (!guild) {
    // A stale payload: config.ts is the only source of slugs, and a picker
    // button or a /start <slug> link can be tapped long after a guild is
    // renamed or removed there. registration.ts's equivalent guard can get
    // away with an empty answerCallbackQuery because its keyboard stays up
    // as the recovery path; this callback has already been answered by the
    // time bind() runs, so silence here would leave the tapper with nothing
    // at all.
    await ctx.reply(BIND_GUILD_GONE);
    return;
  }
  // The binding week starts the Monday ledger at the current week, so a chat
  // bound on a Thursday is not immediately owed a "new week" post
  // (phase 2 design 2.4). Rebinding ignores it, see bindChat.
  const { weekStart } = await calendar(sql);
  await bindChat(sql, chatId, guild.slug, weekStart);
  await ctx.reply(chatBound(guild.name), { parse_mode: "HTML" });
}

export function installGroup(bot: Bot, sql: Sql): void {
  /**
   * FR-18, the primary path. Opening ?startgroup=<slug> makes the client
   * invoke messages.startBot against the group, which reaches the bot as
   * `/start <slug>` here. Privacy mode does not interfere: bots receive
   * messages beginning with a slash regardless.
   *
   * This handler MUST be installed before installRegistration and MUST call
   * next() for private chats. grammY stops the middleware chain at the first
   * command handler that does not call next(), and registration.ts's own
   * /start handler returns early on non-private chats without calling it, so
   * installing this one second would mean it never runs at all.
   */
  bot.command("start", async (ctx, next) => {
    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return await next();
    const from = ctx.from;
    if (!from) return;
    const chatId = String(ctx.chat.id);

    const slug = ctx.match.trim();
    if (!slug || !guildBySlug(slug)) {
      // Phase 2 design 3.1: the picker binds an unbound chat and nothing
      // else, so a bare or unrecognised /start cannot be used to spam a
      // fresh re-point control into a chat that already has one. Same
      // refusal as the callback path below.
      const bound = await findChat(sql, chatId);
      if (bound) {
        const guild = guildBySlug(bound.guildSlug);
        await ctx.reply(chatAlreadyBound(guild?.name ?? bound.guildSlug), { parse_mode: "HTML" });
        return;
      }
      await ctx.reply(CHOOSE_GUILD_GROUP, { reply_markup: bindKeyboard() });
      return;
    }
    if (!(await isChatAdmin(ctx, from.id))) {
      await ctx.reply(TOAST_ADMINS_ONLY);
      return;
    }
    await bind(ctx, sql, chatId, slug);
  });

  /**
   * FR-18, the fallback path and the unbind path.
   *
   * my_chat_member is in Telegram's default update types, so this needs no
   * allowed_updates change.
   *
   * The picker covers a client that skips the startBot call and the ordinary
   * case of someone adding the bot from the group's own Add Member screen,
   * where there is no deep link at all. It is only offered when the chat has
   * no binding yet, so a bot promoted to admin later does not re-ask.
   */
  bot.on("my_chat_member", async (ctx) => {
    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;
    const chatId = String(ctx.chat.id);
    const status = ctx.myChatMember.new_chat_member.status;

    if (status === "left" || status === "kicked") {
      await unbindChat(sql, chatId);
      return;
    }
    if (status !== "member" && status !== "administrator") return;
    if (await findChat(sql, chatId)) return;

    await ctx.reply(CHOOSE_GUILD_GROUP, { reply_markup: bindKeyboard() });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const callback = decode(ctx.callbackQuery.data);
    const from = ctx.from;
    if (!callback || callback.kind !== "bind" || !from) return await next();
    if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
      return await next();
    }
    const chatId = String(ctx.chat.id);

    // Phase 2 design 3.1: the picker binds an unbound chat and nothing
    // else, rebinding goes through the link only. Checked before the admin
    // RPC and regardless of who is tapping, because Telegram delivers
    // my_chat_member before /start <slug>, so this picker is briefly live
    // in every chat the primary path is about to bind, and with no session
    // state to retract it (NFR-5) it would otherwise sit there as a
    // permanent re-point control. This recheck is what keeps a stale tap
    // inert.
    const bound = await findChat(sql, chatId);
    if (bound) {
      await ctx.answerCallbackQuery();
      const guild = guildBySlug(bound.guildSlug);
      await ctx.reply(chatAlreadyBound(guild?.name ?? bound.guildSlug), { parse_mode: "HTML" });
      return;
    }

    if (!(await isChatAdmin(ctx, from.id))) {
      await ctx.answerCallbackQuery(TOAST_ADMINS_ONLY);
      return;
    }
    await ctx.answerCallbackQuery();
    await bind(ctx, sql, chatId, callback.slug);
  });
}

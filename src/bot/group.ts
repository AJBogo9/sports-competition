import { InlineKeyboard, type Bot, type Context, type NextFunction } from "grammy";
import type { Sql } from "postgres";
import { GUILDS, guildBySlug } from "../config.ts";
import { calendar } from "../db/calendar.ts";
import { bindChat, findChat, unbindChat } from "../db/chats.ts";
import { decode, encode } from "./callbacks.ts";
import { CHOOSE_GUILD_GROUP, TOAST_ADMINS_ONLY, chatBound } from "../strings.ts";

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
  if (!guild) return;
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
  bot.command("start", async (ctx, next: NextFunction) => {
    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return await next();
    const from = ctx.from;
    if (!from) return;

    const slug = ctx.match.trim();
    if (!slug || !guildBySlug(slug)) {
      await ctx.reply(CHOOSE_GUILD_GROUP, { reply_markup: bindKeyboard() });
      return;
    }
    if (!(await isChatAdmin(ctx, from.id))) {
      await ctx.reply(TOAST_ADMINS_ONLY);
      return;
    }
    await bind(ctx, sql, String(ctx.chat.id), slug);
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

    if (!(await isChatAdmin(ctx, from.id))) {
      await ctx.answerCallbackQuery(TOAST_ADMINS_ONLY);
      return;
    }
    await ctx.answerCallbackQuery();
    await bind(ctx, sql, String(ctx.chat.id), callback.slug);
  });
}

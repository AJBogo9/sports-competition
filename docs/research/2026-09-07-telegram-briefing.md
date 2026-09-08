# Telegram Bot API and grammY capability survey

Verified 2026-09-07 against the live Bot API reference (Bot API 10.3, August 24, 2026), the changelog, the Bot FAQ, MTProto docs where the Bot API is silent, grammY's docs and its `main` sources. grammY `main` is 1.46.0 and pins `@grammyjs/types` 5.0.0 (Bot API 10.3); a project on types 4.0.0 has older typings, so some parameters below need an upgrade before they type-check (section 14). Assumed constraints: long polling, HTML parse mode, no session or in-memory state, callback data under 64 bytes, private chats plus one admin-bot group per team with a pinned standings message edited in place. Quotations are verbatim from the bracketed sources.

## 1. Message effects

| Item | Finding |
|---|---|
| Parameter | `message_effect_id` (String, Optional): "Unique identifier of the message effect to be added to the message; for private chats only" [1] |
| Methods | sendMessage, sendPhoto, sendLivePhoto, sendAudio, sendDocument, sendVideo, sendAnimation, sendVoice, sendVideoNote, sendMediaGroup, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendSticker, sendRichMessage, sendInvoice, sendGame (all "for private chats only"); forwardMessage and copyMessage ("only available when forwarding to private chats"); sendChecklist (business-only) [1] |
| Edits | No edit method has it: editMessageText, editMessageCaption, editMessageMedia, editMessageReplyMarkup contain no effect parameter [1]; `editMessageText` in `@grammyjs/types` main has exactly `business_connection_id, chat_id, message_id, inline_message_id, text, parse_mode, entities, link_preview_options, rich_message, reply_markup` [26]. This confirms the local types 4.0.0 finding: an effect rides only on a newly sent message. |
| Echo | `Message.effect_id`: "Optional. Unique identifier of the message effect added to the message" [1] |
| Chats | Private only; MTProto: effects apply to "messages you send in 1-on-1 chats" [4]. Behaviour in groups is undocumented; do not send it there. |
| Effect IDs | No Bot API method or list exists. IDs come from MTProto `messages.getAvailableEffects` (`availableEffect` with `id`, `emoticon`, `premium_required`) [4]. Community list [8]: 👍 `5107584321108051014`, 👎 `5104858069142078462`, ❤ `5159385139981059251`, 🔥 `5104841245755180586`, 🎉 `5046509860389126442`, 💩 `5046589136895476101`. Unofficial: verify once by sending to yourself and reading `effect_id` back. |
| grammY | `ctx.reply(text, { message_effect_id: "5104841245755180586" })`, `bot.api.sendMessage(chatId, text, { message_effect_id })` [9, 25] |
| Introduced | 7.4 (May 28, 2024) "Added the parameter message_effect_id to the methods sendMessage, ... sendGame, and sendMediaGroup."; forward/copy 9.3 [2] |

## 2. Reactions

| Item | Finding |
|---|---|
| Method | `setMessageReaction(chat_id, message_id, reaction?, is_big?)` returns True. "Service messages of some types can't be reacted to. ... Bots can't use paid reactions." [1] |
| `reaction` | "Currently, as non-premium users, bots can set up to one reaction per message. A custom emoji reaction can be used if it is either already present on the message or explicitly allowed by chat administrators." Empty list removes. [1] |
| `is_big` | "Pass True to set the reaction with a big animation" [1] |
| Allowed emoji (73) | "❤", "👍", "👎", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱", "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊", "🤡", "🥱", "🥴", "😍", "🐳", "❤‍🔥", "🌚", "🌭", "💯", "🤣", "⚡", "🍌", "🏆", "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈", "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈", "😇", "😨", "🤝", "✍", "🤗", "🫡", "🎅", "🎄", "☃", "💅", "🤪", "🗿", "🆒", "💘", "🙉", "🦄", "😘", "💊", "🙊", "😎", "👾", "🤷‍♂", "🤷", "🤷‍♀", "😡" [1]. The heart is U+2764 without U+FE0F; `@grammyjs/types` uses the same 73 strings, so "❤️" fails `ctx.react`'s type [26]. |
| Chats and rights | `chat_id` may be a bot (private), supergroup or channel; subject to `ChatFullInfo.available_reactions` ("If omitted, then all emoji reactions are allowed") and `max_reaction_count`. No admin right is documented for setting; 10.0 `ChatPermissions.can_react_to_messages` covers restricted members. Removing others' reactions (`deleteMessageReaction`, 10.0) needs `can_delete_messages`. [1] |
| Receiving | `Update.message_reaction`: "The bot must be an administrator in the chat and must explicitly specify "message_reaction" in the list of allowed_updates to receive these updates. The update isn't received for reactions set by bots." `message_reaction_count`: same, "grouped and can be sent with delay up to a few minutes". Default `allowed_updates` is "all update types except chat_member, message_reaction, and message_reaction_count" [1]. grammY: "In private chats and group chats, your bot will receive a message_reaction update if a user changes their reaction to a message." and "only received if the bot is an administrator in the chat" [10]; the private-chat case is grammY's assertion, not a Bot API carve-out. |
| grammY send | `ctx.react("🔥")`; `react(reaction: MaybeArray<ReactionTypeEmoji["emoji"] \| ReactionType>, other?: Other<"setMessageReaction", "chat_id" \| "message_id" \| "reaction">)`, so `ctx.react("🔥", { is_big: true })`; `bot.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: "🎉" }], { is_big: true })` [25, 10] |
| grammY receive | `bot.start({ allowed_updates: [...API_CONSTANTS.DEFAULT_UPDATE_TYPES, "message_reaction"] })`; unspecified means `[]` ("reset to default if unspecified"), so reactions stay off unless listed [25]. `bot.reaction("🎉", h)`, `bot.reaction(["👍", "👎"], h)`, `bot.on("message_reaction:new_reaction:emoji")`, `ctx.reactions()` giving `emojiAdded`, `emojiRemoved` [10]. |
| (a) Own message, private chat | Not documented either way: the method restricts only service messages, paid and custom emoji, and the chat's available reactions, never the author. Issue tdlib/telegram-bot-api#260 (70 comments, closed on 7.0) has no maintainer word on it [29]; tracker searches for `setMessageReaction` (only #260) and `is_big` (none) and grammY's tracker found nothing [25, 29]. Known only from practice; one runtime test settles it. |
| (b) `is_big` | MTProto `messages.sendReaction` `big`: "Whether a bigger and longer reaction should be shown" [6]; the per-user record delivered to peers, `messagePeerReaction`, carries `big`: "Whether the specified message reaction should elicit a bigger and longer reaction" plus `unread` [7]. So the flag travels with the reaction and the recipient's client plays the bigger animation; "Message authors will receive an updateMessageReactions update when a user reacts to their message", subject to their reaction notification setting [5]. No Bot API, MTProto or grammY text says whether a bot's reaction in a private chat renders or animates differently. Partially verified. |
| Introduced | 7.0 (Dec 29, 2023); paid reactions 7.9; reactions on service messages 8.3; deletion and `can_react_to_messages` 10.0 [2] |

## 3. Dice

| Item | Finding |
|---|---|
| Method | `sendDice(chat_id, emoji?)` with `disable_notification`, `protect_content`, `message_effect_id` (private only); "On success, the sent Message is returned." [1] |
| `emoji` | "must be one of “🎲”, “🎯”, “🏀”, “⚽”, “🎳”, or “🎰”. Dice can have values 1-6 for “🎲”, “🎯” and “🎳”, values 1-5 for “🏀” and “⚽”, and values 1-64 for “🎰”. Defaults to “🎲”." [1] |
| Result | Returned at once in `Message.dice { emoji, value }`; the bot knows the outcome before the client animation ends [1]. "A dice message in a private chat can only be deleted if it was sent more than 24 hours ago." [1] |
| grammY | `ctx.replyWithDice("🎯")`, `bot.api.sendDice(chatId, "🎲")`, then `msg.dice.value` [25] |
| Introduced | darts 4.8 (Apr 24, 2020), basketball 4.9, football and slot machine Nov 4, 2020, bowling Mar 9, 2021 [2]; sendDice itself 4.7, from memory |

## 4. Stickers and animations

| Item | Finding |
|---|---|
| sendSticker | "static .WEBP, animated .TGS, or video .WEBM stickers"; `sticker`: "Pass a file_id as String to send a file that exists on the Telegram servers (recommended), pass an HTTP URL as a String for Telegram to get a .WEBP sticker from the Internet, or upload ... Video and animated stickers can't be sent via an HTTP URL." [1] |
| sendAnimation | "GIF or H.264/MPEG-4 AVC video without sound ... up to 50 MB"; file_id, URL or upload [1] |
| file_id rules | "There are no limits for files sent this way." "file_id is unique for each individual bot and can't be transferred from one bot to another." URL sends: 5 MB photos, 20 MB other; uploads 10 MB / 50 MB [1] |
| Public sets | `getStickerSet(name)` returns `StickerSet { name, title, sticker_type, stickers[] }`, each `Sticker.file_id` "can be used to download or reuse the file" [1]. Fetch the set once with this bot, keep `stickers[i].file_id`, pass it to `sendSticker`: no upload. `file_unique_id` is cross-bot stable but "Can't be used to download or reuse the file." |
| grammY | `ctx.replyWithSticker(fileId)`, `bot.api.getStickerSet(name)`, `ctx.replyWithAnimation(fileIdOrUrl)` [25] |

## 5. Polls

| Item | Finding |
|---|---|
| sendPoll | `question` 1-300; `options` "1-12 answer options"; `is_anonymous` "defaults to True"; `type` "“quiz” or “regular”, defaults to “regular”"; `allows_multiple_answers`; `allows_revoting` "defaults to False for quizzes and to True for regular polls"; `correct_option_ids` "required for polls in quiz mode"; `explanation` 0-200; `open_period` "5-2628000. Can't be used together with close_date."; `close_date` Unix time 5 to 2628000 s ahead; `is_closed`; plus `disable_notification`, `protect_content`, `message_effect_id` (private only). "Polls can't be sent to channel direct messages chats." [1] |
| stopPoll | `stopPoll(chat_id, message_id, reply_markup?)`: "stop a poll which was sent by the bot. On success, the stopped Poll is returned." [1] |
| Updates | `poll`: "Bots receive only updates about manually stopped polls and polls, which are sent by the bot." `poll_answer`: "A user changed their answer in a non-anonymous poll. Bots receive new votes only in polls that were sent by the bot itself." `PollAnswer { poll_id, voter_chat?, user?, option_ids, option_persistent_ids }` [1]. Both are default update types [1, 25]. |
| State | `poll_id` is server-assigned, so answers map back to a meaning only if the DB stored the poll_id at send time. |
| grammY | `ctx.replyWithPoll(question, options, { type: "quiz", correct_option_ids: [0], is_anonymous: false })`, `bot.api.stopPoll(chatId, messageId)`, `bot.on("poll_answer")` [25]. Types 4.0.0 may still spell `correct_option_id`; 9.6 renamed it [2]. |

## 6. HTML formatting

| Item | Finding |
|---|---|
| Tags | `<b>`/`<strong>`, `<i>`/`<em>`, `<u>`/`<ins>`, `<s>`/`<strike>`/`<del>`, `<span class="tg-spoiler">`/`<tg-spoiler>`, `<a href="...">` (also `tg://user?id=`), `<tg-emoji emoji-id="...">👍</tg-emoji>`, `<tg-time unix="1647531900" format="wDT">`, `<code>`, `<pre>`, `<pre><code class="language-python">`, `<blockquote>`, `<blockquote expandable>` [1] |
| Rules | "Only the tags mentioned above are currently supported." "All <, > and & symbols that are not a part of a tag or an HTML entity must be replaced with the corresponding HTML entities". "The API currently supports only the following named HTML entities: &lt;, &gt;, &amp; and &quot;." "Programming language can't be specified for standalone code tags." Nesting: bold, italic, underline, strikethrough, spoiler "can contain and can be part of any other entities, except pre and code"; "blockquote and expandable_blockquote entities can't be nested."; "All other entities can't contain each other." [1] |
| Custom emoji | "Custom emoji entities can only be used by bots that purchased additional usernames on Fragment or in the messages directly sent by the bot to private, group and supergroup chats if the owner of the bot has a Telegram Premium subscription." [1]; Fragment rule 6.7 (Apr 21, 2023), Premium-owner relaxation 9.4 (Feb 9, 2026) [2] |
| Date-time | 9.5 `date_time` entity; format "r\|w?[dD]?[tT]?" (r relative, w weekday, d/D date, t/T time), shown in the reader's local time [1, 2] |
| Limits | `text` "1-4096 characters after entities parsing" (send and edit); captions 0-1024; `InputTextMessageContent.message_text` 1-4096 [1] |
| grammY | `ctx.reply(html, { parse_mode: "HTML" })`, or the parse-mode plugin's `parseMode("HTML")` transformer as a default |

## 7. Pins, edits and limits

| Item | Finding |
|---|---|
| pinChatMessage | "the bot must be an administrator with the 'can_pin_messages' right or the 'can_edit_messages' right to pin messages in groups and channels respectively"; in private chats "all non-service messages can be pinned". `disable_notification`: "Pass True if it is not necessary to send a notification to all chat members about the new pinned message. Notifications are always disabled in channels and private chats." [1] |
| unpinChatMessage | Same rights; without `message_id` "the most recent pinned message (by sending date) will be unpinned" [1] |
| editMessageText | "Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within 48 hours"; no limit on the bot's own messages, no notification parameter. Params: `business_connection_id, chat_id, message_id, inline_message_id, text, parse_mode, entities, link_preview_options, rich_message, reply_markup` [1] |
| Not-modified error | HTTP 400 "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message" [28, 31]. levlam: "They compare the current message content and the new content provided by the bot. If they match, then the request is aborted and edit isn't performed. But you may handle the error as if the edit succeeded" and "You must not do anything additionally with the message." [28]. Surfaces as `GrammyError` with `error_code`, `description`, `parameters` [25]; skipping unchanged edits avoids it. |
| Send limits | FAQ: "In a single chat, avoid sending more than one message per second. We may allow short bursts that go over this limit, but eventually you'll begin receiving 429 errors." "In a group, bots are not be able to send more than 20 messages per minute." "For bulk notifications, bots are not able to broadcast more than about 30 messages per second, unless they enable paid broadcasts to increase the limit." [3]. `retry_after`: "the number of seconds left to wait before the request can be repeated" [1]. `allow_paid_broadcast`: "up to 1000 messages per second ... for a fee of 0.1 Telegram Stars per message" [1] |
| Edit limits | Not in the FAQ. Aliaksei Levin, @tdlibchat, Jun 4, 2024: "Currently, bots can do up to 20 message edits in a minute per group chat which should be acceptable for usage by one user." [30], cited by grammY's flood guide [22]. Throttler docs: "Telegram implements unspecified and undocumented rate limits for some API calls." [19] |
| grammY | `ctx.pinChatMessage(id, { disable_notification: true })`, `bot.api.editMessageText(chatId, id, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } })` [25] |

## 8. Silent delivery and protected content

| Item | Finding |
|---|---|
| `disable_notification` | "Sends the message silently. Users will receive a notification with no sound." Every send method, not edits [1] |
| `protect_content` | "Protects the contents of the sent message from forwarding and saving" [1]; 5.6 (Dec 30, 2021) [2] |
| grammY | `ctx.reply(text, { disable_notification: true, protect_content: true })`; all chat types |

## 9. Link previews

| Item | Finding |
|---|---|
| `LinkPreviewOptions` | `is_disabled` "True, if the link preview is disabled"; `url`; `prefer_small_media`; `prefer_large_media`; `show_above_text` [1] |
| Where | sendMessage, editMessageText, InputTextMessageContent; 7.0 "replaced the parameter disable_web_page_preview with link_preview_options" [2] |
| grammY | `{ link_preview_options: { is_disabled: true } }` [25] |

## 10. Inline mode

| Item | Finding |
|---|---|
| Enable | "/setinline command to @BotFather"; queries arrive as `inline_query` updates over getUpdates, no port [1] |
| answerInlineQuery | `inline_query_id`, `results` ("No more than 50 results per query"), `cache_time` "Defaults to 300", `is_personal` "results may be cached on the server side only for the user that sent the query", `next_offset`, `button` [1] |
| Objects | `InlineQuery { id, from, query (up to 256 characters), offset, chat_type ("sender", "private", "group", "supergroup", "channel") }`; `InlineQueryResultArticle { type: "article", id (1-64 Bytes), title, input_message_content, reply_markup?, description? }`; `InputTextMessageContent { message_text 1-4096, parse_mode, entities, link_preview_options }` [1] |
| Feedback | `ChosenInlineResult.inline_message_id` "Available only if there is an inline keyboard attached to the message ... can be used to edit the message"; "It is necessary to enable inline feedback via @BotFather" [1]. Entry buttons: `switch_inline_query`, `switch_inline_query_current_chat` ("Not supported in channels"), `switch_inline_query_chosen_chat` [1] |
| Stateless design | The query carries `from.id`: compute the card from the DB and answer one article with `is_personal: true, cache_time: 0`. Nothing stored. Editing the posted card later needs `inline_message_id`; its buttons arrive as callback queries with `inline_message_id` instead of `chat_id`. The user may post the card into any chat, under their own name "via @bot". |
| grammY | `bot.inlineQuery(trigger, h)`, `ctx.answerInlineQuery(results, other)`, `InlineQueryResultBuilder.article(id, title).text(message_text, { parse_mode: "HTML" })`, `bot.chosenInlineResult(...)` [25] |

## 11. Forum topics and chat metadata

| Item | Finding |
|---|---|
| `message_thread_id` | "for forum supergroups and private chats of bots with forum topic mode enabled only" [1]; grammY `ctx.reply` fills it when `msg.is_topic_message` [25]; forums 6.3 (Nov 5, 2022), private-chat topics 9.3 [2] |
| createForumTopic | "in a forum supergroup chat or a private chat with a user ... must have the can_manage_topics administrator right"; `name` 1-128 [1] |
| setChatTitle | "Titles can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights."; `title` 1-128; the right is `can_change_info` "change the chat title, photo and other settings" [1] |
| setChatDescription | "a group, a supergroup or a channel ... appropriate administrator rights"; `description` 0-255 [1] |
| grammY | `bot.api.setChatTitle(chatId, title)`, `bot.api.setChatDescription(chatId, text)`, `bot.api.createForumTopic(chatId, name)` [25] |

## 12. Newer Bot API features since 7.0

| Version (date) | Feature | Scope | Use here |
|---|---|---|---|
| 7.0 (Dec 29, 2023) | Reactions, `LinkPreviewOptions`, blockquote, `ReplyParameters`, bulk delete/copy | All bots | Sections 2, 6, 9 |
| 7.2 (Mar 31, 2024) | Business accounts, `business_connection_id` | Business-only | No |
| 7.4 (May 28, 2024) | Effects, expandable blockquote, Stars payments | Effects private only | Section 1 |
| 7.6, 7.9 (2024) | `sendPaidMedia` (`star_count` 1-25000); paid reactions | Costs viewers Stars; bots cannot pay-react | No |
| 7.11 (Oct 31, 2024) | `allow_paid_broadcast` (0.1 Stars per message); `CopyTextButton` (`copy_text.text` 1-256) | Broadcast costs Stars | Copy button, maybe |
| 8.0 to 8.3 (Nov 2024 to Feb 2025) | `sendGift` (bot's Stars balance), subscriptions, `verifyUser`, reactions on service messages | Gifts cost Stars | No |
| 9.0 (Apr 11, 2025) | Business account management, stories for business accounts | Business-only | No |
| 9.1 (Jul 3, 2025) | `sendChecklist` "on behalf of a connected business account", `business_connection_id` Required; polls to 12 options; `getMyStarBalance` | Checklists business-only | No |
| 9.2 (Aug 15, 2025) | Channel direct messages; suggested posts "for direct messages chats only" | Channels only | No |
| 9.3 (Dec 31, 2025) | Private-chat topics; `sendMessageDraft` ("temporary 30-second preview"); effects on forward/copy | Drafts private only | No |
| 9.4 (Feb 9, 2026) | Custom emoji if the owner has Premium; button `style` "danger", "success", "primary"; `icon_custom_emoji_id`; `setMyProfilePhoto` | All bots | Coloured tier buttons |
| 9.5 (Mar 1, 2026) | `date_time` entity (`<tg-time>`); drafts for all bots; member tags | All bots | Local-time reminders |
| 9.6 (Apr 3, 2026) | Managed bots; quizzes with several correct answers, `allows_revoting`, `shuffle_options` | All bots | Polls, if used |
| 10.0 (May 8, 2026) | Guest mode; `can_react_to_messages`; `deleteMessageReaction`; poll media, min 1 option; live photos; bot-to-bot messages | Deletion needs `can_delete_messages` | Reaction cleanup |
| 10.1 (Jun 11, 2026) | Rich messages (`sendRichMessage`, `rich_message` on editMessageText); join request queries | All bots | No |
| 10.2 (Jul 14, 2026) | Ephemeral messages, `is_ephemeral` commands; Communities | Groups and supergroups | Per-user card in the team chat |
| 10.3 (Aug 24, 2026) | `EphemeralMessageParameters { receiver_user_id, callback_query_id?, replace_callback_query_message? }`; `DisabledButton` (`disabled`); `force_reply` on InlineKeyboardMarkup; `stopped_message_generation` | All bots | Disabled buttons after an undo |

Ephemeral rules [1]: "Other members of the group or supergroup chat will not see the message." "It is not guaranteed that the ephemeral message will be received, especially if the user is offline." "Any bot can send an ephemeral message to a user within 15 seconds of the incoming eligible action" given a `callback_query_id` or `reply_parameters.ephemeral_message_id`; "If the bot is a chat administrator, it can send an ephemeral message to any non-bot member of the chat at any time". "They may disappear automatically after some time, or if the app is restarted." They are edited only through `editEphemeralMessage...` methods.

## 13. grammY plugins

| Plugin | What it does | State |
|---|---|---|
| emoji | `bot.use(emojiParser())` with `EmojiFlavor`; `ctx.emoji\`Hi ${"fire"}\``, `ctx.replyWithEmoji`, `Reactions.thumbs_up` constants for `ctx.react` [15] | None |
| hydrate | `bot.use(hydrate())`; returned messages and `ctx.msg` gain `editText`, `delete`, `editReplyMarkup` [16] | None |
| menu | "The menu plugin works completely without storing any data."; callback data encodes menu id, row/column, payload, fingerprint flag and a 4-byte hash; menus registered before `bot.start`; dynamic ranges must be side-effect-free; outdated menus via heuristic or `fingerprint`, `onMenuOutdated`; "Payloads cannot be used to actually store any significant amounts of data." [12] | None, but its header shares the 64-byte budget and labels are rebuilt from the DB per tap |
| runner | `run(bot)` concurrent long polling (long polling only); `sequentialize((ctx) => [chat, user])` keeps per-chat order; `handle.stop()` [17] | None |
| auto-retry | `bot.api.config.use(autoRetry())`: waits `retry_after` on 429 and retries; retries 5xx and network errors with backoff from 3 s capped at one hour; `maxRetryAttempts`, `maxDelaySeconds`, `rethrowInternalServerErrors`, `rethrowHttpErrors` [18] | None |
| transformer-throttler | Bottleneck queues, 30/s global, 20/min per group, 1/s per private chat; "Consider using the auto-retry plugin instead."; undocumented limits "are not accounted for" [19] | None |
| ratelimiter | `bot.use(limit())` drops incoming updates per `from.id` over `limit` per `timeFrame` (1 per 1000 ms); `storageClient` Map or Redis; "DOES NOT rate limit the incoming requests from Telegram servers" [20] | In-memory Map by default |
| parse-mode | `fmt` plus `b`, `i`, `u`, `s`, `code`, `pre`, `link`, `blockquote`, `expandableBlockquote`, `spoiler` yield `{ text, entities }` (no escaping needed); `parseMode("HTML")` transformer defaults `parse_mode`; `hydrateReply` adds `ctx.replyWithHTML` [21] | None |
| chat-members | `bot.use(chatMembers(adapter))` with a `StorageAdapter<ChatMember>`; needs `"chat_member"` in `allowed_updates` and the bot as admin; `ctx.chatMembers.getChatMember()`; Telegram "doesn't offer a method in the Bot API to retrieve the members of a chat" [14] | A member store (Postgres possible) |
| stateless-question | `messageSuffixHTML(state)` appends `<a href="http://t.me/#<identifier>#<urlencoded state>">` around U+200C, sent with `reply_markup: { force_reply: true }`; middleware matches the last `text_link` entity of `reply_to_message` and hands the decoded state to the handler [13, 27] | None; the state lives in the question message |

## 14. The `Other` type and unknown parameters

`export type Other<R extends RawApi, M extends Methods<R>, X extends string = never> = Omit<Payload<M, R>, X>;`, where `Payload` is the raw method's first parameter and `RawApi` mirrors `@grammyjs/types` [25]. So `ctx.reply(text, other)` accepts every optional sendMessage parameter the installed types know; FAQ: "grammY will collect it in the options object called other. Pass { parameter_name: value } in that place and it'll work." [24]. For a parameter the typings lack: upgrade grammY (main 1.46.0, types 5.0.0); or `bot.api.raw.sendMessage({ chat_id, text, new_param } as any)`, raw calls merge all fields into one payload and only JSON-serialise nested objects [9]; or a transformer `bot.api.config.use((prev, method, payload, signal) => prev(method, { ...payload, new_param }, signal))` [23]. Object literals trip the excess-property check, so build options in a variable or cast; grammY forwards unknown keys untouched.

## Sources

1. https://core.telegram.org/bots/api (Bot API 10.3, fetched 2026-09-07)
2. https://core.telegram.org/bots/api-changelog
3. https://core.telegram.org/bots/faq ("My bot is hitting limits, how do I avoid this?")
4. https://core.telegram.org/api/effects
5. https://core.telegram.org/api/reactions
6. https://core.telegram.org/method/messages.sendReaction
7. https://core.telegram.org/constructor/messagePeerReaction
8. https://gist.github.com/wiz0u/2a6d40c8f635687be363d72251a264da (community effect IDs)
9. https://grammy.dev/guide/api
10. https://grammy.dev/guide/reactions
11. https://grammy.dev/plugins/
12. https://grammy.dev/plugins/menu
13. https://grammy.dev/plugins/stateless-question
14. https://grammy.dev/plugins/chat-members
15. https://grammy.dev/plugins/emoji
16. https://grammy.dev/plugins/hydrate
17. https://grammy.dev/plugins/runner
18. https://grammy.dev/plugins/auto-retry
19. https://grammy.dev/plugins/transformer-throttler
20. https://grammy.dev/plugins/ratelimiter
21. https://grammy.dev/plugins/parse-mode
22. https://grammy.dev/advanced/flood
23. https://grammy.dev/advanced/transformers
24. https://grammy.dev/resources/faq
25. https://github.com/grammyjs/grammY (README badge; src/core/api.ts, client.ts, error.ts, context.ts, composer.ts, bot.ts, convenience/inline_query.ts; package.json 1.46.0)
26. https://github.com/grammyjs/types (methods.ts, message.ts; 5.0.0)
27. https://github.com/grammyjs/stateless-question (source/identifier.ts, index.ts)
28. https://github.com/tdlib/telegram-bot-api/issues/624 (maintainer on "message is not modified")
29. https://github.com/tdlib/telegram-bot-api/issues/260 (reactions feature request)
30. https://t.me/tdlibchat/146123 (Aliaksei Levin, Jun 4, 2024)
31. https://github.com/y2k/purescript-telegram-bot/issues/13 (full error string)

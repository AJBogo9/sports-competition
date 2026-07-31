-- FR-18. The guild-to-chat mapping SPEC.md section 6 leaves open.
--
-- A table rather than the column on guilds that section 6 also offers
-- (phase 2 design 2.1): pinned_message_id, pinned_text, pin_failed and
-- last_monday_week are facts about a chat and not about a guild, one guild
-- plausibly has both a board chat and a general chat, and unbinding a chat the
-- bot was removed from must not touch a guilds row that syncGuilds rewrites on
-- every boot.
--
-- last_monday_week is NOT NULL because NULL would read as "owed a post" and fire
-- a "new week, back to zero" message at a chat bound on a Thursday
-- (phase 2 design 2.4). Binding sets it to the current week.
CREATE TABLE chats (
  chat_id           BIGINT PRIMARY KEY,
  guild_slug        TEXT NOT NULL REFERENCES guilds(slug),
  pinned_message_id BIGINT,
  pinned_text       TEXT,
  pin_failed        BOOLEAN NOT NULL DEFAULT FALSE,
  last_monday_week  DATE NOT NULL,
  bound_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

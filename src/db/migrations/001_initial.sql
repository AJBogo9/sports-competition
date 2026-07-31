CREATE TABLE guilds (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  member_count  INTEGER NOT NULL CHECK (member_count > 0)
);

CREATE TABLE users (
  telegram_id     BIGINT PRIMARY KEY,
  guild_slug      TEXT NOT NULL REFERENCES guilds(slug),
  first_name      TEXT NOT NULL,
  username        TEXT,
  reminder_hour   SMALLINT CHECK (reminder_hour BETWEEN 0 AND 23),
  ignored_streak  SMALLINT NOT NULL DEFAULT 0,
  blocked         BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE days (
  telegram_id   BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('short', 'medium', 'long', 'rest')),
  tag           TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_id, date)
);

CREATE INDEX days_date_idx ON days (date);

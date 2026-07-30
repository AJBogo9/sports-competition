import postgres, { type Sql } from "postgres";

/**
 * postgres.js returns BIGINT as a JS string and DATE as a Date object at UTC
 * midnight. Both are hazards here: a Telegram ID is a BIGINT and every day
 * bucket is a DATE. Rather than install global type parsers, every query in
 * src/db selects those columns as ::text. See the global constraints.
 */
export function connect(url: string | undefined = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("DATABASE_URL is unset");
  return postgres(url, { max: 5, onnotice: () => {} });
}

/**
 * Compose starts the bot and Postgres together, and Postgres is sometimes
 * slower to accept connections than the bot is to ask. Retrying beats a
 * crash-loop, which would look identical to a real configuration error.
 */
export async function waitForDatabase(
  sql: Sql,
  attempts = 30,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await sql`SELECT 1`;
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

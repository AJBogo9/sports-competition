import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "postgres";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url).pathname;

/**
 * Applies every numbered migration not yet recorded, each inside its own
 * transaction. Re-running is a no-op, so a restart is free (NFR-5).
 *
 * Returns the filenames applied on this run, which is empty on a warm start.
 */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const recorded = await sql<{ name: string }[]>`SELECT name FROM migrations`;
  const applied = new Set(recorded.map((row) => row.name));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO migrations (name) VALUES (${file})`;
    });
    ran.push(file);
  }
  return ran;
}

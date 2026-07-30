import { afterAll, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { migrate } from "../../src/db/migrate.ts";

const sql = await freshDatabase("migrate");
afterAll(async () => { await sql.end(); });

describe("migrate", () => {
  test("creates the three tables from SPEC.md section 6", async () => {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()
      ORDER BY table_name
    `;
    expect(tables.map((t) => t.table_name)).toEqual(["days", "guilds", "migrations", "users"]);
  });

  test("is idempotent, so a restart applies nothing (NFR-5)", async () => {
    const applied = await migrate(sql);
    expect(applied).toEqual([]);
  });

  test("records what it applied", async () => {
    const rows = await sql<{ name: string }[]>`SELECT name FROM migrations ORDER BY name`;
    expect(rows.map((r) => r.name)).toContain("001_initial.sql");
  });

  // SPEC.md section 6: the composite primary key makes double-logging
  // structurally impossible, which is what avoids defect 5 in section 2.
  // No duplicate-detection logic exists anywhere, so this must hold.
  test("the days primary key is (telegram_id, date)", async () => {
    await sql`INSERT INTO guilds (slug, name, member_count) VALUES ('t', 'T', 100)`;
    await sql`INSERT INTO users (telegram_id, guild_slug, first_name) VALUES (1, 't', 'A')`;
    await sql`INSERT INTO days (telegram_id, date, tier) VALUES (1, '2026-07-30', 'short')`;

    await expect(
      (async () => sql`INSERT INTO days (telegram_id, date, tier) VALUES (1, '2026-07-30', 'long')`)(),
    ).rejects.toThrow(/duplicate key/);
  });

  test("rejects a tier that is not one of the four", async () => {
    await expect(
      (async () => sql`INSERT INTO days (telegram_id, date, tier) VALUES (1, '2026-07-31', 'enormous')`)(),
    ).rejects.toThrow(/violates check constraint/);
  });

  test("rejects a guild with a non-positive member count, since it is a divisor", async () => {
    await expect(
      (async () => sql`INSERT INTO guilds (slug, name, member_count) VALUES ('z', 'Z', 0)`)(),
    ).rejects.toThrow(/violates check constraint/);
  });

  test("deleting a user removes their days, leaving no orphans", async () => {
    await sql`DELETE FROM users WHERE telegram_id = 1`;
    const rows = await sql`SELECT 1 FROM days WHERE telegram_id = 1`;
    expect(rows).toHaveLength(0);
  });
});

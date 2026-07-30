import postgres, { type Sql } from "postgres";
import { migrate } from "../../src/db/migrate.ts";

const TEST_URL = process.env.TEST_DATABASE_URL
  ?? "postgres://bot:test@localhost:5433/bot_test";

/**
 * Returns a connection scoped to a freshly migrated schema of its own.
 * Call once per test file with a unique name, and end it in afterAll.
 */
export async function freshDatabase(name: string): Promise<Sql> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`test schema name must be a bare identifier, got ${name}`);
  }
  const schema = `test_${name}`;

  const admin = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
  await admin.end();

  const sql = postgres(TEST_URL, {
    max: 2,
    onnotice: () => {},
    connection: { search_path: schema },
  });
  await migrate(sql);
  return sql;
}

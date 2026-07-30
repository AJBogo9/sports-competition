import type { Sql } from "postgres";
import { TIMEZONE } from "../config.ts";

export interface Calendar {
  today: string;
  yesterday: string;
  weekStart: string;
}

/**
 * Every date bucket in the competition comes from here.
 *
 * Postgres owns the calendar rather than the application (design 4.2): it has
 * a real timezone database, so the October clock change cannot drift a week
 * boundary the way adding 7 times 24 hours would. date_trunc('week', ...) is
 * already ISO Monday-based, which is what FR-16's weekly reset needs.
 *
 * Everything is cast to ::text because postgres.js otherwise returns DATE as a
 * Date object at UTC midnight, which shifts under formatting.
 */
export async function calendar(sql: Sql): Promise<Calendar> {
  const [row] = await sql<{ today: string; yesterday: string; week_start: string }[]>`
    WITH local AS (SELECT (now() AT TIME ZONE ${TIMEZONE}) AS ts)
    SELECT (ts)::date::text                              AS today,
           (ts::date - INTERVAL '1 day')::date::text     AS yesterday,
           date_trunc('week', ts)::date::text            AS week_start
    FROM local
  `;
  if (!row) throw new Error("calendar query returned no row");
  return { today: row.today, yesterday: row.yesterday, weekStart: row.week_start };
}

/** The Monday that starts the week containing the given yyyy-mm-dd date. */
export async function weekStartOf(sql: Sql, date: string): Promise<string> {
  const [row] = await sql<{ week_start: string }[]>`
    SELECT date_trunc('week', ${date}::date)::date::text AS week_start
  `;
  if (!row) throw new Error("weekStartOf query returned no row");
  return row.week_start;
}

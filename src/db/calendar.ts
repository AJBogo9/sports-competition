import type { Sql } from "postgres";
import { COMPETITION_END, COMPETITION_START, TIMEZONE } from "../config.ts";

export interface Calendar {
  today: string;
  yesterday: string;
  weekStart: string;
  /** The hour 0 to 23 in TIMEZONE. FR-20's post fires against this, never UTC. */
  hour: number;
  /**
   * Phase 5 design 11.1. Which week of the competition today's week is, 1 on
   * the week COMPETITION_START falls in. Not clamped: before the start it is 0
   * or less and after the end it exceeds weekCount, and the renderer hides the
   * clock in both cases rather than this pretending.
   */
  weekNumber: number;
  /** How many weeks the competition spans, counted the same way. */
  weekCount: number;
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
 *
 * The optional `at` parameter is for testing only: it pins a fixed instant
 * instead of reading the live clock. Production callers pass nothing and get
 * now() exactly as before.
 */
export async function calendar(sql: Sql, at: string | null = null): Promise<Calendar> {
  const [row] = await sql<
    {
      today: string;
      yesterday: string;
      week_start: string;
      hour: number;
      week_number: number;
      week_count: number;
    }[]
  >`
    WITH local AS (SELECT (COALESCE(${at}::timestamptz, now()) AT TIME ZONE ${TIMEZONE}) AS ts),
         span AS (
           SELECT date_trunc('week', ${COMPETITION_START}::date)::date AS first_monday,
                  date_trunc('week', ${COMPETITION_END}::date)::date   AS last_monday
         )
    SELECT (ts)::date::text                                          AS today,
           (ts::date - INTERVAL '1 day')::date::text                 AS yesterday,
           date_trunc('week', ts)::date::text                        AS week_start,
           EXTRACT(HOUR FROM ts)::int                                AS hour,
           ((date_trunc('week', ts)::date - first_monday) / 7 + 1)::int AS week_number,
           ((last_monday - first_monday) / 7 + 1)::int               AS week_count
    FROM local, span
  `;
  if (!row) throw new Error("calendar query returned no row");
  return {
    today: row.today,
    yesterday: row.yesterday,
    weekStart: row.week_start,
    hour: row.hour,
    weekNumber: row.week_number,
    weekCount: row.week_count,
  };
}

/** The Monday that starts the week containing the given yyyy-mm-dd date. */
export async function weekStartOf(sql: Sql, date: string): Promise<string> {
  const [row] = await sql<{ week_start: string }[]>`
    SELECT date_trunc('week', ${date}::date)::date::text AS week_start
  `;
  if (!row) throw new Error("weekStartOf query returned no row");
  return row.week_start;
}

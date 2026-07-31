import { afterAll, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { calendar } from "../../src/db/calendar.ts";

const sql = await freshDatabase("calendar");
afterAll(async () => { await sql.end(); });

describe("calendar hour (FR-20)", () => {
  // The ticker compares this against MONDAY_POST_HOUR, so it must be the hour in
  // Europe/Helsinki, not UTC. 2026-08-03T00:30:00Z is 03:30 in Helsinki (UTC+3
  // in summer).
  test("reports the hour in the competition timezone", async () => {
    const at = await calendar(sql, "2026-08-03T00:30:00Z");
    expect(at.hour).toBe(3);
    expect(at.today).toBe("2026-08-03");
  });

  // Winter, UTC+2.
  test("reports the hour correctly after the clock change", async () => {
    const at = await calendar(sql, "2026-11-03T00:30:00Z");
    expect(at.hour).toBe(2);
  });
});

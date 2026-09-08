import { afterAll, describe, expect, test } from "bun:test";
import { freshDatabase } from "../helpers/db.ts";
import { calendar } from "../../src/db/calendar.ts";
import { COMPETITION_END, COMPETITION_START } from "../../src/config.ts";

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

// Phase 5 design 11.1. The competition clock: which week of how many, from the
// same SQL calendar as every other bucket, never from JavaScript date
// arithmetic. Anchored to config so a changed window moves the expectations.
describe("competition clock (phase 5 design 11.1)", () => {
  const noon = (date: string) => `${date}T12:00:00+03:00`;
  const plusDays = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  test("the first day of the competition is week 1", async () => {
    const at = await calendar(sql, noon(COMPETITION_START));
    expect(at.weekNumber).toBe(1);
  });

  test("the last day of the competition is the last week", async () => {
    const at = await calendar(sql, noon(COMPETITION_END));
    expect(at.weekNumber).toBe(at.weekCount);
    expect(at.weekCount).toBeGreaterThan(1);
  });

  test("a week later is week 2, on any day of that week", async () => {
    expect((await calendar(sql, noon(plusDays(COMPETITION_START, 7)))).weekNumber).toBe(2);
    expect((await calendar(sql, noon(plusDays(COMPETITION_START, 13)))).weekNumber).toBe(2);
  });

  test("the week count is stable whatever day is asked", async () => {
    const early = await calendar(sql, noon(COMPETITION_START));
    const late = await calendar(sql, noon(COMPETITION_END));
    expect(early.weekCount).toBe(late.weekCount);
  });

  // The renderer decides the header from the competition phase, not from this
  // number (phase 5 design 13.2); the calendar itself reports honestly, so a
  // full week before the start is week 0 and a full week after the end is one
  // past the count, whatever weekday the window starts or ends on.
  test("outside the window the number runs past the ends rather than clamping", async () => {
    expect((await calendar(sql, noon(plusDays(COMPETITION_START, -7)))).weekNumber).toBe(0);
    const after = await calendar(sql, noon(plusDays(COMPETITION_END, 7)));
    expect(after.weekNumber).toBe(after.weekCount + 1);
  });
});

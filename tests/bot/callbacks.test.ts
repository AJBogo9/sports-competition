import { describe, expect, test } from "bun:test";
import { decode, encode, type Callback } from "../../src/bot/callbacks.ts";

const SAMPLES: Callback[] = [
  { kind: "guild", slug: "prodeko" },
  { kind: "guild", slug: "accounting" },
  { kind: "hour", hour: 20 },
  { kind: "hour", hour: null },
  { kind: "log", date: "2026-07-30", tier: "short" },
  { kind: "log", date: "2026-07-30", tier: "rest" },
  { kind: "undo", date: "2026-07-30", restore: null },
  { kind: "undo", date: "2026-07-30", restore: "medium" },
  { kind: "yesterday", date: "2026-07-29" },
  { kind: "checkin", date: "2026-07-30" },
  { kind: "move", slug: "tik" },
  { kind: "stay" },
  { kind: "me" },
  { kind: "standings" },
  { kind: "bind", slug: "prodeko" },
];

describe("callback encoding", () => {
  test("every sample round-trips unchanged", () => {
    for (const sample of SAMPLES) {
      expect(decode(encode(sample))).toEqual(sample);
    }
  });

  // Telegram rejects callback_data longer than 64 bytes, and the failure is a
  // runtime API error rather than anything the type system catches.
  test("every payload fits inside Telegram's 64-byte limit", () => {
    for (const sample of SAMPLES) {
      expect(Buffer.byteLength(encode(sample), "utf8")).toBeLessThanOrEqual(64);
    }
  });

  test("rejects malformed data rather than throwing", () => {
    for (const bad of ["", "nonsense", "log", "log:2026-07-30", "hour:banana", "log:2026-07-30:enormous"]) {
      expect(decode(bad)).toBeNull();
    }
  });

  test("rejects a tier that is not one of the four", () => {
    expect(decode("log:2026-07-30:gigantic")).toBeNull();
  });

  test("rejects a date that is not yyyy-mm-dd", () => {
    expect(decode("log:30-07-2026:short")).toBeNull();
    expect(decode("log:2026-7-3:short")).toBeNull();
  });

  test("an undo payload with no displaced tier decodes to null, not to a string", () => {
    const decoded = decode(encode({ kind: "undo", date: "2026-07-30", restore: null }));
    expect(decoded).toEqual({ kind: "undo", date: "2026-07-30", restore: null });
  });

  // Offering the check-in again after an undo is a different intent from
  // switching the keyboard to yesterday, even though both re-render a
  // keyboard. The reminder pass sends the check-in message daily, so a payload
  // that means "offer the check-in again" and one that means "switch to
  // yesterday" are now both in live circulation.
  test("a checkin payload is distinct from a yesterday payload", () => {
    expect(encode({ kind: "checkin", date: "2026-07-30" }))
      .not.toBe(encode({ kind: "yesterday", date: "2026-07-30" }));
  });
});

describe("bind (FR-18)", () => {
  test("round-trips a guild slug", () => {
    expect(decode(encode({ kind: "bind", slug: "prodeko" }))).toEqual({
      kind: "bind",
      slug: "prodeko",
    });
  });

  // Bytes, not UTF-16 units: the SAMPLES-driven test above already covers
  // this correctly (Buffer.byteLength), this checks the same thing for a
  // longer slug than the SAMPLES entry carries.
  test("stays inside Telegram's 64-byte callback_data limit", () => {
    expect(Buffer.byteLength(encode({ kind: "bind", slug: "accounting" }), "utf8")).toBeLessThanOrEqual(64);
  });

  test("rejects a malformed slug", () => {
    expect(decode("bind:NOT A SLUG")).toBeNull();
    expect(decode("bind:")).toBeNull();
    expect(decode("bind")).toBeNull();
  });
});

describe("remind and keep (FR-22, FR-24)", () => {
  // Phase 3 design 4.4. A separate kind from "hour", which registration owns:
  // that one's confirmation carries the 150 minute target and the privacy
  // notice SPEC.md section 6 requires at registration, and /remind must repeat
  // neither. One kind would mean one handler guessing which message it is
  // editing, which it cannot know.
  test("a remind hour round-trips", () => {
    expect(decode(encode({ kind: "remind", hour: 20 }))).toEqual({ kind: "remind", hour: 20 });
  });

  test("remind off round-trips", () => {
    expect(decode(encode({ kind: "remind", hour: null }))).toEqual({ kind: "remind", hour: null });
  });

  test("keep round-trips", () => {
    expect(decode(encode({ kind: "keep" }))).toEqual({ kind: "keep" });
  });

  test("midnight is a real hour, not a falsy one", () => {
    expect(decode(encode({ kind: "remind", hour: 0 }))).toEqual({ kind: "remind", hour: 0 });
  });

  test("an out-of-range hour is rejected", () => {
    expect(decode("remind:24")).toBeNull();
    expect(decode("remind:-1")).toBeNull();
    expect(decode("remind:")).toBeNull();
    expect(decode("remind:evening")).toBeNull();
  });

  test("keep takes no payload", () => {
    expect(decode("keep:1")).toBeNull();
  });

  // Telegram rejects callback_data over 64 bytes.
  test("both payloads are well inside Telegram's limit", () => {
    expect(encode({ kind: "remind", hour: 20 }).length).toBeLessThan(64);
    expect(encode({ kind: "keep" }).length).toBeLessThan(64);
  });
});

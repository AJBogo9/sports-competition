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

// Phase 4 design 5.1. decode() destructures only the first three colon-separated
// parts, so every kind silently ignored trailing junk: decode("remind:20:30")
// returned a valid remind. Harmless in itself, since a forged payload can only
// set the forger's own hour to a range-checked value, but it meant seven kinds
// each had their own unchecked tail. One round-trip assertion closes all seven,
// which is why this is tested per kind rather than once.
describe("decode rejects anything it would not itself have encoded", () => {
  test("every kind rejects a trailing segment", () => {
    for (const bad of [
      "guild:prodeko:extra",
      "move:tik:extra",
      "bind:prodeko:extra",
      "hour:20:extra",
      "remind:20:30",
      "yesterday:2026-07-29:extra",
      "checkin:2026-07-30:extra",
      "log:2026-07-30:short:extra",
      "undo:2026-07-30:medium:extra",
    ]) {
      expect(decode(bad)).toBeNull();
    }
  });

  // "off" is the encoded form of hour: null for both kinds, so the round-trip
  // has to survive the null case rather than only the numeric one.
  test("the off payloads still decode", () => {
    expect(decode("hour:off")).toEqual({ kind: "hour", hour: null });
    expect(decode("remind:off")).toEqual({ kind: "remind", hour: null });
  });

  // encode() emits "hour:7", never "hour:07", so a zero-padded hour is a payload
  // no build of this bot has sent. Pinned rather than left implicit: it is the
  // one input whose behaviour this change deliberately alters.
  test("a zero-padded hour is not a payload this bot produces", () => {
    expect(decode("hour:07")).toBeNull();
    expect(decode("hour:7")).toEqual({ kind: "hour", hour: 7 });
  });

  test("every sample still round-trips, so the assertion is not too strict", () => {
    for (const sample of SAMPLES) {
      expect(decode(encode(sample))).toEqual(sample);
    }
    for (const sample of [
      { kind: "remind", hour: 20 },
      { kind: "remind", hour: 0 },
      { kind: "remind", hour: null },
      { kind: "keep" },
    ] as const satisfies readonly Callback[]) {
      expect(decode(encode(sample))).toEqual(sample);
    }
  });
});

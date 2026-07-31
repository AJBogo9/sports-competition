import { isTier } from "../domain/scoring.ts";
import type { Tier } from "../config.ts";

/**
 * Every button carries its full meaning, so a tap on a message sent before a
 * restart still works and the process holds no session state (NFR-5).
 *
 * Telegram rejects callback_data over 64 bytes. The longest payload here is an
 * undo carrying a date and two tiers, at 29 bytes.
 */
export type Callback =
  | { kind: "guild"; slug: string }
  | { kind: "hour"; hour: number | null }
  /** FR-24. /remind's own hour choice. Distinct from "hour" above, which
   *  registration owns: that confirmation carries the target and privacy copy
   *  and /remind must repeat neither (phase 3 design 4.4). */
  | { kind: "remind"; hour: number | null }
  /** FR-22. "Keep them" on the follow-up: resume without re-choosing an hour. */
  | { kind: "keep" }
  | { kind: "log"; date: string; tier: Tier }
  /**
   * FR-9. Two tiers, and both are load-bearing.
   *
   * `restore` is what this log displaced, so undo puts back the exact prior
   * weekly total rather than merely deleting the day (design 4.5).
   *
   * `stored` is what this log wrote, and it is the guard. A confirmation stays
   * in the chat with a live Undo button indefinitely (NFR-5), so two
   * confirmations for the same day can coexist: one from the daily reminder,
   * one from a later /log that corrected the tier. Without `stored`, tapping
   * the older one applied its stale `restore` unconditionally and reverted the
   * newer entry. db/days.ts refuses when the day no longer holds this tier.
   * The date was always rechecked against the live calendar; this closes the
   * same hole on the tier.
   */
  | { kind: "undo"; date: string; restore: Tier | null; stored: Tier }
  | { kind: "yesterday"; date: string }
  | { kind: "checkin"; date: string }
  | { kind: "move"; slug: string }
  | { kind: "stay" }
  | { kind: "me" }
  | { kind: "standings" }
  | { kind: "bind"; slug: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z][a-z0-9-]{0,30}$/;

export function encode(callback: Callback): string {
  switch (callback.kind) {
    case "guild":     return `guild:${callback.slug}`;
    case "hour":      return `hour:${callback.hour ?? "off"}`;
    case "remind":    return `remind:${callback.hour ?? "off"}`;
    case "keep":      return "keep";
    case "log":       return `log:${callback.date}:${callback.tier}`;
    case "undo":      return `undo:${callback.date}:${callback.restore ?? "none"}:${callback.stored}`;
    case "yesterday": return `yesterday:${callback.date}`;
    case "checkin":   return `checkin:${callback.date}`;
    case "move":      return `move:${callback.slug}`;
    case "stay":      return "stay";
    case "me":        return "me";
    case "standings": return "standings";
    case "bind":      return `bind:${callback.slug}`;
  }
}

/**
 * Returns null for anything malformed. Callback data is user-controllable.
 *
 * Phase 4 design 5.1. The parse below destructures only the first three
 * colon-separated parts, so on its own it accepts trailing junk on seven of the
 * kinds: "remind:20:30" parsed as a valid remind for 20:00. Rather than add a
 * length check to each branch, decode() re-encodes what it parsed and demands
 * the result be identical to the input. encode() is total over Callback and is
 * already the inverse of this parse, so one assertion closes every kind at once
 * and cannot drift out of step with a new one.
 *
 * Rejected: checking `data.split(":").length` per branch. It is the same test
 * written nine times, and a tenth kind added later would silently not have it.
 */
export function decode(data: string): Callback | null {
  const parsed = parse(data);
  // A payload this bot would not itself have produced is not one it should act
  // on. "hour:07" is the only realistic example, and encode() emits "hour:7".
  return parsed && encode(parsed) === data ? parsed : null;
}

function parse(data: string): Callback | null {
  // Undo is the only kind with three parts of its own. Everything past the
  // parts a kind actually uses is caught by decode()'s re-encode assertion
  // rather than by a per-kind length check.
  const [kind, first, second, third] = data.split(":");

  switch (kind) {
    case "stay":
    case "me":
    case "standings":
    case "keep":
      return data === kind ? { kind } : null;

    case "guild":
      return first && SLUG.test(first) ? { kind: "guild", slug: first } : null;

    case "move":
      return first && SLUG.test(first) ? { kind: "move", slug: first } : null;

    case "bind":
      return first && SLUG.test(first) ? { kind: "bind", slug: first } : null;

    case "hour": {
      if (first === "off") return { kind: "hour", hour: null };
      if (!first || !/^\d{1,2}$/.test(first)) return null;
      const hour = Number(first);
      return hour >= 0 && hour <= 23 ? { kind: "hour", hour } : null;
    }

    case "remind": {
      if (first === "off") return { kind: "remind", hour: null };
      if (!first || !/^\d{1,2}$/.test(first)) return null;
      const hour = Number(first);
      return hour >= 0 && hour <= 23 ? { kind: "remind", hour } : null;
    }

    case "yesterday":
      return first && DATE.test(first) ? { kind: "yesterday", date: first } : null;

    case "checkin":
      return first && DATE.test(first) ? { kind: "checkin", date: first } : null;

    case "log":
      if (!first || !DATE.test(first) || !second || !isTier(second)) return null;
      return { kind: "log", date: first, tier: second };

    case "undo": {
      // `third` is required, so a payload from the build before undo carried
      // the stored tier decodes to null rather than to a half-populated undo.
      // Nothing is deployed, so there are none in circulation; a bot upgraded
      // mid-session simply has its older Undo buttons answered and ignored by
      // index.ts's catch-all rather than acting on a payload it cannot check.
      if (!first || !DATE.test(first) || !second || !third || !isTier(third)) return null;
      if (second === "none") return { kind: "undo", date: first, restore: null, stored: third };
      return isTier(second) ? { kind: "undo", date: first, restore: second, stored: third } : null;
    }

    default:
      return null;
  }
}

import { WEEKLY_TARGET_MINUTES, type Tier } from "./config.ts";
import { escapeHtml } from "./html.ts";

export const TIER_LABELS: Record<Tier, string> = {
  short: "15 to 30 min",
  medium: "30 to 60 min",
  long: "60+ min",
  rest: "Not today",
};

export const CHECK_IN_PROMPT = "<b>Moved today?</b>";
export const CHECK_IN_PROMPT_YESTERDAY = "<b>And yesterday?</b>";
export const BUTTON_YESTERDAY = "Log yesterday instead";
export const BUTTON_UNDO = "Undo";
export const BUTTON_ME = "My week";
export const BUTTON_STANDINGS = "Standings";
export const BUTTON_LOG_AGAIN = "Log again";
export const BUTTON_REMINDER_OFF = "No, I'll remember";

export const REMINDER_HOURS = [17, 18, 20, 21] as const;

/**
 * firstName is attacker-controlled (a Telegram display name); guildName comes
 * from config.ts and is trusted today, but is escaped defensively so a future
 * guild legitimately named something like "X & Y" cannot break this message.
 */
export function welcome(firstName: string, guildName: string): string {
  return (
    `Moi ${escapeHtml(firstName)}. You're in, for <b>${escapeHtml(guildName)}</b>.\n\n` +
    "One tap a day, that's it. Most people forget by week three unless " +
    "something asks, so: should I?"
  );
}

/**
 * FR-4 requires a real choice with no silent default in either direction, and
 * SPEC.md section 6 requires the privacy notice at registration.
 *
 * The "change it any time" sentence is deliberately absent: /remind doesn't
 * exist until Phase 3. Restore it there, alongside the command itself.
 */
/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function reminderSet(hour: number, guildName: string): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions.\n\n` +
    `Your first name and how much you move are visible to others in ${escapeHtml(guildName)}.`
  );
}

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function reminderOff(guildName: string): string {
  return (
    "No reminders. Log whenever you like with /log.\n\n" +
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions.\n\n` +
    `Your first name and how much you move are visible to others in ${escapeHtml(guildName)}.`
  );
}

export const CHOOSE_GUILD = "Which guild are you in?";

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function alreadyRegistered(guildName: string): string {
  return `You're already counted for <b>${escapeHtml(guildName)}</b>.`;
}

/** Both names come from config.ts and are trusted today; escaped defensively. */
export function confirmMove(fromGuild: string, toGuild: string): string {
  return (
    `You're currently counted for <b>${escapeHtml(fromGuild)}</b>. ` +
    `Move to <b>${escapeHtml(toGuild)}</b>?\n\n` +
    "Everything you've logged stays with you."
  );
}

/**
 * The two buttons offered alongside confirmMove. Button labels are plain
 * text on Telegram's side (no parse_mode ever applies to inline keyboard
 * buttons), so escaping here would show a literal "&amp;" on the button
 * instead of "&". Left unescaped by design.
 */
export function buttonMoveTo(guildName: string): string {
  return `Move to ${guildName}`;
}

export function buttonStayIn(guildName: string): string {
  return `Stay in ${guildName}`;
}

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function moved(guildName: string): string {
  return `Moved. You're counted for <b>${escapeHtml(guildName)}</b> now.`;
}

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function stayed(guildName: string): string {
  return `Fine. Still <b>${escapeHtml(guildName)}</b>.`;
}

export const TOAST_MOVED = "Moved";
export const TOAST_REMINDERS_OFF = "Reminders off";
export const TOAST_LOGGED = "Logged";
export const TOAST_REMOVED = "Removed";

export function toastReminderSet(hour: number): string {
  return `Reminder set for ${hour}:00`;
}

/** Used when a guild lookup fails and the message still needs some name. */
export const FALLBACK_GUILD = "your guild";

/** FR-17, private-chat command menu. */
export const COMMAND_DESCRIPTIONS = {
  log: "Log today",
  me: "My week",
  standings: "Guild standings",
} as const;

export const UNDO_DONE = "Removed.";
export const OUTSIDE_WINDOW =
  "That date is outside the competition, so it wouldn't count. Nothing was saved.";
export const NOT_REGISTERED =
  "Start with your guild's link first, or send /start to pick a guild.";
export const STANDINGS_FOOTER = "Everyone in the guild counts, logging or not.";

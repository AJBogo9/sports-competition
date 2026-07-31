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
    `Hi ${escapeHtml(firstName)}. You're in, for <b>${escapeHtml(guildName)}</b>.\n\n` +
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
/** Provisional wording, paired with UNDO_RESTORED; easy to reword since all
 *  copy lives here. */
export const TOAST_PUT_BACK = "Put back";

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
/**
 * Shown instead of UNDO_DONE when undo restored a displaced tier rather than
 * deleting the day outright, so the message doesn't claim the entry is gone
 * while the progress block below still counts it. Provisional wording,
 * chosen rather than asked; easy to reword since all copy lives here.
 */
export const UNDO_RESTORED = "Put back.";
export const OUTSIDE_WINDOW =
  "That date is outside the competition, so it wouldn't count. Nothing was saved.";
/**
 * The other half of the FR-26 refusal in checkin.ts: a date that is inside the
 * competition but is no longer today or yesterday, which is what a check-in
 * message left untapped for two days carries. OUTSIDE_WINDOW was reused here
 * and told the user the date was outside the competition when it was not.
 *
 * A forged future date reaches this string too and is described wrongly by it.
 * Accepted deliberately: no real client can produce one, and a third string
 * would spend copy on a case only a hand-built callback payload can reach.
 */
export const STALE_CHECK_IN =
  "That check-in is from an earlier day, so it can no longer be logged. Send /log to check in for today. Nothing was saved.";
export const NOT_REGISTERED =
  "Start with your guild's link first, or send /start to pick a guild.";
export const STANDINGS_FOOTER = "Everyone in the guild counts, logging or not.";

/**
 * FR-19. Appended to the pinned message when the bot could not pin it. The
 * message itself keeps working and keeps updating unpinned (phase 2 design 3.2), so
 * this is one line of explanation rather than an error state: the board makes
 * the bot an admin when convenient and the next refresh pins it.
 */
export const PIN_NEEDS_ADMIN =
  "Make me an admin with permission to pin, and I'll pin this to the top.";

/** FR-18. Shown in a group the bot was added to without a guild in the link. */
export const CHOOSE_GUILD_GROUP =
  "Which guild is this chat for? An admin of this chat can pick.";

/** FR-18. Answered to a non-admin who taps the guild picker in a group. */
export const TOAST_ADMINS_ONLY = "Only an admin of this chat can set the guild.";

/** FR-18. Confirms a binding, naming the guild so a wrong one is obvious. */
export function chatBound(guildName: string): string {
  return (
    `This chat is now following <b>${escapeHtml(guildName)}</b>.\n\n` +
    "Standings will appear here and stay updated. An admin can change the guild " +
    "by opening the guild's link again."
  );
}

/**
 * FR-18. Phase 2 design 3.1: rebinding goes through the link only, and the
 * picker binds an unbound chat and nothing else. Without this refusal, a
 * picker left over from the primary path (Telegram delivers my_chat_member
 * before /start <slug>, so the picker is briefly live in every chat that
 * path is about to bind) sits there as a permanent re-point control: inline
 * keyboards never expire and the process holds no state to retract one
 * (NFR-5). Names the current guild so an admin who does want to change it
 * still learns how.
 */
export function chatAlreadyBound(guildName: string): string {
  return (
    `This chat already follows <b>${escapeHtml(guildName)}</b>.\n\n` +
    "An admin can change it by opening that guild's link again."
  );
}

/**
 * FR-18. A bind payload (a picker tap or a /start <slug> link) can outlive
 * the guild it names: config.ts is the only source of slugs, and either can
 * be used long after a guild is renamed or removed there. Told rather than
 * left silent, particularly on the callback path, where the tap has already
 * been acknowledged with nothing else to show for it.
 */
export const BIND_GUILD_GONE =
  "That guild isn't available anymore. Nothing was saved. Send /start to pick again.";

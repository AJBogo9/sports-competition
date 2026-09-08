import { TIER_MINUTES, WEEKLY_TARGET_MINUTES, type Tier } from "./config.ts";
import { escapeHtml } from "./html.ts";
import { longDate } from "./domain/scoring.ts";

/**
 * Phase 5 design 13.3. What Telegram shows before /start: the short line under
 * the name (120 characters at most) and the "What can this bot do?" panel (512).
 * Set at every boot by installCommands, so they never need BotFather.
 */
export const BOT_SHORT_DESCRIPTION = "Aalto guild activity competition. One tap a day.";
export const BOT_DESCRIPTION =
  "Log how much you moved, once a day, in one tap. Your guild is ranked on active days per member " +
  "against the other guilds, and your first name and activity are visible to guildmates. " +
  "Open your guild's link to join.";

/** Phase 5 design 13.3. A typed message in a private chat is never met with silence. */
export const UNKNOWN_TEXT =
  "I only understand taps and commands. /log to check in, /me for your week, /standings for the guilds.";

/** Phase 5 design 13.3. bot.catch answers the person, not only the log. */
export const SOMETHING_WRONG = "Something went wrong on my side. Try again in a minute.";

/**
 * Phase 5 design 13.2. The check-in before the start and after the end, so a
 * member who registered early is told when rather than refused (FR-26's
 * OUTSIDE_WINDOW stays for stale payloads). Dates are the config labels,
 * rendered by longDate; no date arithmetic.
 */
export function beforeStart(start: string): string {
  return `The competition starts on ${longDate(start)}. Nothing to log until then; I'll be here.`;
}

export function afterEnd(end: string): string {
  return `The competition ended on ${longDate(end)}. Thanks for moving.`;
}

export const TIER_LABELS: Record<Tier, string> = {
  short: "15 to 30 min",
  medium: "30 to 60 min",
  long: "60+ min",
  rest: "Not today",
};

/**
 * FR-12 and phase 5 design 5.3. The line above the bar, scaled to the session:
 * the small one is told it counted, and the tenth confirmation does not read
 * like the first. Deterministic on purpose; nothing in this project is random.
 * Informational rather than pressuring, which is the praise the evidence says
 * raises intrinsic motivation rather than lowering it (docs/evidence.md 5.1).
 */
export const TIER_HEADS: Record<Tier, string> = {
  short: "Counts.",
  medium: "Good.",
  long: "Big one.",
  rest: "Noted. Rest days don't break anything.",
};

export const CHECK_IN_PROMPT = "<b>Moved today?</b>";
export const CHECK_IN_PROMPT_YESTERDAY = "<b>And yesterday?</b>";
export const BUTTON_YESTERDAY = "Log yesterday instead";
export const BUTTON_TODAY = "Today instead";

/**
 * Phase 5 design 13.3. FR-7 replaces silently, and the prompt now says so: an
 * evening tap after a lunchtime one is a correction, not an addition.
 */
export function loggedAlready(tier: Tier): string {
  return `Logged already: ${TIER_LABELS[tier]}. A tap replaces it.`;
}
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
 *
 * The reminder is recommended (FR-4) without a descriptive norm: the earlier
 * "Most people forget by week three" told every newcomer that lapsing is what
 * most people do, and a message that says most people do the undesirable
 * thing also says most people do it (Cialdini 2003, docs/evidence.md 5.2).
 * Phase 5 design 10.2.
 */
export function welcome(firstName: string, guildName: string): string {
  return (
    `Hi ${escapeHtml(firstName)}. You're in, for <b>${escapeHtml(guildName)}</b>.\n\n` +
    `One tap a day, that's it. ${REMINDER_QUESTION}`
  );
}

/**
 * FR-4's question, shared by every message the hour keyboard can sit under
 * (phase 5 design 13.3): the welcome, and the already-counted, moved and
 * stayed replies when the question was never answered. Buttons under a
 * sentence that asks nothing read as a glitch.
 */
export const REMINDER_QUESTION =
  "It's easy to forget by week three unless something asks, so: should I?";

/**
 * FR-4 requires a real choice with no silent default in either direction, and
 * SPEC.md section 6 requires the privacy notice at registration.
 *
 * The "change it any time" sentence was cut in Phase 1 because /remind did not
 * exist yet, and is restored here alongside the command (FR-24, which requires
 * the control to be discoverable rather than only documented in help text).
 *
 * The scoring sentence (phase 5 design 10.2) is the only place the bot states
 * how guilds are ranked. Without it, "70 active days" on the pin has no
 * meaning to someone never told that the whole roster is the denominator, and
 * the roster is what makes one more person logging the winning move (SPEC.md
 * section 4.3). It sits on both branches of the reminder answer because every
 * newcomer reads exactly one of them.
 */
/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function reminderSet(hour: number, guildName: string, link: string): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>. Change it any time with /remind.\n\n` +
    rules(guildName, link)
  );
}

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function reminderOff(guildName: string, link: string): string {
  return (
    "No reminders. Log whenever you like with /log, and /remind turns them on.\n\n" +
    rules(guildName, link)
  );
}

/**
 * The rules, once, on whichever reminder answer the newcomer reads. The
 * scoring sentence states the rule as a group interest in active days (phase
 * 5 design 12.2): a day counts the same whoever logs it, so the guild climbs
 * by more people, not longer sessions. The last sentence is the nomination
 * ask (12.4): friendship-nominated seeds outperform the most connected ones
 * (Kim et al. 2015), and the FR-1 deep link lands the recruit in the right
 * guild with no extra tap. The link is built by the caller from the bot's own
 * username; it is not user input.
 */
function rules(guildName: string, link: string): string {
  const guild = escapeHtml(guildName);
  return (
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions. ` +
    `Each tap counts ${TIER_MINUTES.short}, ${TIER_MINUTES.medium} or ${TIER_MINUTES.long} minutes toward it. Train more than that? /target raises it.\n\n` +
    `${guild} is ranked on active days per member. A day you log counts exactly as much as anyone's, and everyone on the roster counts, so the guild climbs by more people moving, not longer sessions.\n\n` +
    `Know someone in ${guild} who'd do this? Send them the link: ${link}\n\n` +
    `Your first name and how much you move are visible to others in ${guild}.`
  );
}

export const CHOOSE_GUILD = "Which guild are you in?";

/**
 * FR-3 and phase 5 design 13.3. The one place a returning member can re-read
 * the rules and find the recruit link again, so the rules paragraph rides
 * here too. askReminder is whether the hour keyboard is attached, in which
 * case the question it answers is asked. guildName comes from config.ts and
 * is trusted today; escaped defensively.
 */
export function alreadyRegistered(guildName: string, link: string, askReminder: boolean): string {
  return (
    `You're already counted for <b>${escapeHtml(guildName)}</b>.\n\n` +
    rules(guildName, link) +
    (askReminder ? `\n\n${REMINDER_QUESTION}` : "")
  );
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

/** guildName comes from config.ts and is trusted today; escaped defensively.
 *  askReminder: see alreadyRegistered. */
export function moved(guildName: string, askReminder: boolean): string {
  return (
    `Moved. You're counted for <b>${escapeHtml(guildName)}</b> now.` +
    (askReminder ? `\n\n${REMINDER_QUESTION}` : "")
  );
}

/** guildName comes from config.ts and is trusted today; escaped defensively. */
export function stayed(guildName: string, askReminder: boolean): string {
  return (
    `Staying in <b>${escapeHtml(guildName)}</b>.` +
    (askReminder ? `\n\n${REMINDER_QUESTION}` : "")
  );
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

/**
 * FR-24. /remind's own screens. Deliberately shorter than the registration
 * pair above: the 150 minute target and the privacy notice belong to the
 * moment of registering (SPEC.md section 6), and repeating them every time
 * someone changes an hour would train people to skip them.
 */
export function remindStatusOn(hour: number): string {
  return (
    `Reminders are on for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    "Pick a different hour, or turn them off."
  );
}

export const REMIND_STATUS_OFF =
  "Reminders are off.\n\nPick an hour and I'll ask on days you haven't logged.";

/**
 * FR-22 and phase 3 design 3.3. /remind's third status: paused by the
 * five-ignore auto-stop rather than turned off. reminderHour survives a pause
 * untouched, so it is named here, and picking any hour below (that one or a
 * new one) is what lifts the pause, exactly as it would from the follow-up.
 */
export function remindStatusPaused(hour: number): string {
  return (
    "Reminders are stopped: five days went unanswered.\n\n" +
    `They'd resume at <b>${String(hour).padStart(2, "0")}:00</b>. Pick that hour again, ` +
    "or a different one, and they start right away."
  );
}

export function remindSet(hour: number): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    "I'll only ask on days you haven't logged."
  );
}

/**
 * "Turns them on again" rather than "turns them back on": the latter reads as
 * a promise that the old hour returns on its own, which it does not. See
 * SPEC.md section 9 Q4 (the FR-24 restore clause is not met by decision), and
 * phase 3 design section 9.
 */
export const REMIND_OFF =
  "Reminders off, starting now. /remind turns them on again whenever you want.";

/**
 * FR-22. Sent once, in place of the sixth consecutive daily reminder.
 *
 * Three things it has to do. Say what happened, so the silence that follows is
 * explained rather than read as the bot breaking. Offer both outcomes as real
 * buttons, because the point of asking is that they might simply have been
 * away. And name the way back in the text itself, which FR-22 requires
 * explicitly, so an ignored follow-up still leaves a route to reminders
 * through a message they can scroll back to.
 */
export const REMINDER_FOLLOWUP =
  "<b>Five days, no answer.</b>\n\n" +
  "I've stopped the daily nudge so it doesn't become noise. Want them back?\n\n" +
  "Either way, /remind changes this any time.";

export const BUTTON_REMINDER_KEEP = "Keep them";
export const BUTTON_REMINDER_STOP = "Turn them off";
export const TOAST_REMINDERS_KEPT = "Reminders back on";

export function remindersKept(hour: number): string {
  return (
    `Back on for <b>${String(hour).padStart(2, "0")}:00</b>.\n\n` +
    "I'll only ask on days you haven't logged."
  );
}

/** Used when a guild lookup fails and the message still needs some name. */
export const FALLBACK_GUILD = "your guild";

/** FR-17, private-chat command menu. */
export const COMMAND_DESCRIPTIONS = {
  log: "Log today",
  me: "My week",
  standings: "Guild standings",
  // FR-24 requires the reminder control to be discoverable from the command
  // menu, not merely documented in help text.
  remind: "Reminder settings",
  target: "Weekly target",
} as const;

/**
 * FR-29 and phase 5 design 11.3. The target is personal: the bar, the streak
 * and the celebration follow it, the guild's score never does. The WHO figure
 * is named as the start, not as a minimum anyone is judged against.
 */
export const TARGET_PROMPT =
  `<b>${WEEKLY_TARGET_MINUTES}</b> is the WHO guideline and where everyone starts. ` +
  `Raise it if you train more than that, or come back to ${WEEKLY_TARGET_MINUTES} any time. ` +
  "It's yours alone: the guild's score doesn't change.";

export function targetStatus(minutes: number): string {
  return `Your target is <b>${minutes} minutes a week</b>.\n\n${TARGET_PROMPT}`;
}

/**
 * The person raising their target is the person who trains most, so this is
 * where the guild's unit is stated, once, with its reason (SPEC.md section
 * 4.3): in their own reply, never in a group chat. The celebration is not
 * named; nobody has been told there is one (phase 5 design 13.3).
 */
export function targetSet(minutes: number): string {
  return (
    `Target set to <b>${minutes} minutes a week</b>. Your bar and your streak follow it.\n\n` +
    "The guild's number is unchanged: a day you log counts as one active day for it whatever its " +
    "length, so the way to win is more people moving, not more hours."
  );
}

export function targetButton(minutes: number): string {
  return `${minutes} min`;
}

export function toastTargetSet(minutes: number): string {
  return `Target set to ${minutes} min`;
}

export const UNDO_DONE = "Removed.";
/**
 * Shown instead of UNDO_DONE when undo restored a displaced tier rather than
 * deleting the day outright, so the message doesn't claim the entry is gone
 * while the progress block below still counts it. Provisional wording,
 * chosen rather than asked; easy to reword since all copy lives here.
 */
export const UNDO_RESTORED = "Put back.";
/**
 * FR-9. The undo refused because the day no longer holds what this message's
 * log put there: it was logged again from a newer check-in, or already undone.
 *
 * Its own message rather than a silent no-op. The tap has to produce something,
 * and the two things the user needs to know are that nothing changed and that
 * the day is not in the state this message describes.
 */
export const UNDO_SUPERSEDED =
  "That day has been logged again since this message, so there is nothing here to undo. Nothing was changed. Send /me to see where you are.";
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
/** Phase 5 design 12.2. Says why a smaller guild can sit above a bigger count. */
export const STANDINGS_FOOTER =
  "Ranked per member of the whole roster, so a small guild can beat a big one. " +
  "Everyone in the guild counts, logging or not.";

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
export const TOAST_ADMINS_ONLY = "Only an admin of this chat can set the guild";

/** FR-18. Confirms a binding, naming the guild so a wrong one is obvious. */
export function chatBound(guildName: string): string {
  return (
    `This chat is now following <b>${escapeHtml(guildName)}</b>.\n\n` +
    "Standings will appear here within 15 minutes and keep themselves updated. Make me an admin " +
    "with permission to pin so they stay at the top. An admin can change the guild by opening the " +
    "group link again."
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

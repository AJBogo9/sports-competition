import { WEEKLY_TARGET_MINUTES, type Tier } from "./config.ts";

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
export const BUTTON_REMINDER_OFF = "No, I'll remember";

export const REMINDER_HOURS = [17, 18, 20, 21] as const;

export function welcome(firstName: string, guildName: string): string {
  return (
    `Moi ${firstName}. You're in, for <b>${guildName}</b>.\n\n` +
    "One tap a day, that's it. Most people forget by week three unless " +
    "something asks, so: should I?"
  );
}

/**
 * FR-4 requires a real choice with no silent default in either direction, and
 * SPEC.md section 6 requires the privacy notice at registration.
 */
export function reminderSet(hour: number, guildName: string): string {
  return (
    `Set for <b>${String(hour).padStart(2, "0")}:00</b>. Change it any time with /remind.\n\n` +
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions.\n\n` +
    `Your first name and how much you move are visible to others in ${guildName}.`
  );
}

export function reminderOff(guildName: string): string {
  return (
    "No reminders. Log whenever you like with /log.\n\n" +
    `Target is <b>${WEEKLY_TARGET_MINUTES} minutes a week</b>, the WHO guideline. That's about four sessions.\n\n` +
    `Your first name and how much you move are visible to others in ${guildName}.`
  );
}

export const CHOOSE_GUILD = "Which guild are you in?";

export function alreadyRegistered(guildName: string): string {
  return `You're already counted for <b>${guildName}</b>.`;
}

export function confirmMove(fromGuild: string, toGuild: string): string {
  return (
    `You're currently counted for <b>${fromGuild}</b>. ` +
    `Move to <b>${toGuild}</b>?\n\n` +
    "Everything you've logged stays with you."
  );
}

export function moved(guildName: string): string {
  return `Moved. You're counted for <b>${guildName}</b> now.`;
}

export function stayed(guildName: string): string {
  return `Fine. Still <b>${guildName}</b>.`;
}

export const UNDO_DONE = "Removed.";
export const OUTSIDE_WINDOW =
  "That date is outside the competition, so it wouldn't count. Nothing was saved.";
export const NOT_REGISTERED =
  "Start with your guild's link first, or send /start to pick a guild.";
export const STANDINGS_FOOTER = "Everyone in the guild counts, logging or not.";

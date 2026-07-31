/**
 * Escapes text for Telegram's HTML parse mode.
 *
 * Telegram first names are attacker-controlled, and they reach other users
 * through the neighbours block in /me. Unescaped, a crafted name can inject a
 * link into someone else's message, or contain a bare < or & that makes
 * Telegram reject the whole message with a 400, which bot.catch swallows.
 *
 * Escape only interpolated values, never a whole message: the templates
 * contain intentional <b> and <pre> tags that must survive.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import { COMPETITION_END, COMPETITION_START } from "./config.ts";
import { calendar } from "./db/calendar.ts";
import { competitionPhase } from "./domain/scoring.ts";
import { createBot, installCommands } from "./bot/index.ts";
import { startTicker } from "./bot/ticker.ts";
import { connect, waitForDatabase } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";
import { syncGuilds } from "./db/users.ts";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is unset");

const sql = connect();
await waitForDatabase(sql);

const applied = await migrate(sql);
if (applied.length > 0) console.log(`applied migrations: ${applied.join(", ")}`);
await syncGuilds(sql);

// Phase 5 design 13.3. The configured window is the placeholder CLAUDE.md
// warns about, so it is printed at every boot, with a warning when today is
// outside it: the ticker is then inert and the check-in refuses, quietly.
const { today } = await calendar(sql);
console.log(`competition ${COMPETITION_START} to ${COMPETITION_END}, today ${today}`);
if (competitionPhase(today) !== "during") {
  console.warn("today is outside the competition window: no pins, no posts, no reminders");
}

const bot = createBot(sql, token);
await installCommands(bot);

// FR-19 and FR-20. Stopped before the bot: clearInterval only blocks the next
// tick from starting, it cannot abort one already running. What the ordering
// buys is that no new tick starts while bot.stop() is draining in-flight
// updates. The window it does NOT close: a tick already running when
// SIGINT/SIGTERM arrives keeps executing underneath this, and if the process
// is killed before it finishes, a tick caught between sendMessage and
// recordMondayPost in ticker.ts's sendMondayPost re-posts that week's Monday
// message on the next boot, because recordMondayPost never ran to record it.
const stopTicker = startTicker(bot, sql);

function shutdown(signal: string): void {
  console.log(`${signal}: stopping`);
  stopTicker();
  void bot.stop();
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

await bot.start({
  onStart: (me) => console.log(`@${me.username} polling`),
});

await sql.end();

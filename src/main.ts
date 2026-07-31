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

process.once("SIGINT", () => { stopTicker(); void bot.stop(); });
process.once("SIGTERM", () => { stopTicker(); void bot.stop(); });

await bot.start({
  onStart: (me) => console.log(`@${me.username} polling`),
});

await sql.end();

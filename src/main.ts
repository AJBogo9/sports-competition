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

// FR-19 and FR-20. Stopped before the bot, so a shutdown cannot leave a tick
// half-way through an API call the polling loop is no longer serving.
const stopTicker = startTicker(bot, sql);

process.once("SIGINT", () => { stopTicker(); void bot.stop(); });
process.once("SIGTERM", () => { stopTicker(); void bot.stop(); });

await bot.start({
  onStart: (me) => console.log(`@${me.username} polling`),
});

await sql.end();

import { createBot, installCommands } from "./bot/index.ts";
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

process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());

await bot.start({
  onStart: (me) => console.log(`@${me.username} polling`),
});

await sql.end();

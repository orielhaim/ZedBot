import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Missing BOT_TOKEN in env");

const bot = new Bot(token);

// /start
bot.command("start", async (ctx) => {
  await ctx.reply("היי! אני בוט grammY 🤖\nשלח לי הודעה ואני אחזיר לך אקו.");
});

// /help
bot.command("help", async (ctx) => {
  await ctx.reply("פקודות:\n/start\n/help");
});

// אקו לטקסט
bot.on("message:text", async (ctx) => {
  await ctx.reply("Echo: " + ctx.message.text);
});

// לוג שגיאות
bot.catch((err) => {
  console.error("Bot error:", err);
});

// הרצה בלונג-פולינג
bot.start();

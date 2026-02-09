import { db } from "./db.js";

console.log("[DB] Initializing database schema...");

db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'stopped',
      credentials TEXT DEFAULT '{}',
      settings TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);

console.log("[DB] Schema initialized.");

const result = db.query("SELECT COUNT(*) as count FROM channels").get();
if (result.count === 0) {
  console.log("[DB] Seeding default Telegram channel...");
  const insert = db.prepare(`
        INSERT INTO channels (id, type, enabled, credentials, settings, status)
        VALUES ($id, $type, $enabled, $credentials, $settings, 'stopped')
      `);

  insert.run({
    $id: 'telegram-main',
    $type: 'telegram',
    $enabled: 1,
    $credentials: JSON.stringify({ token: process.env.TELEGRAM_TOKEN || '' }),
    $settings: JSON.stringify({ runner: { concurrency: 10 } })
  });
}
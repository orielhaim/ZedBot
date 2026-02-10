import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';

export class SessionManager {
  getOrCreate(profileId) {
    const existing = db.query(
      "SELECT * FROM sessions WHERE profile_id = ?"
    ).get(profileId);

    if (existing) {
      return existing;
    }

    const id = uuidv4();
    const threadId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT INTO sessions (id, profile_id, thread_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, profileId, threadId, '{}', now, now]
    );

    return db.query("SELECT * FROM sessions WHERE id = ?").get(id);
  }
  
  getByThreadId(threadId) {
    return db.query("SELECT * FROM sessions WHERE thread_id = ?").get(threadId);
  }
}

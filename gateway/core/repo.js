import { db } from "../../db.js";

export class ChannelRepository {
  async getAll() {
    const rows = db.query("SELECT * FROM channels").all();
    return rows.map(row => ({
      ...row,
      enabled: Boolean(row.enabled),
      credentials: JSON.parse(row.credentials),
      settings: JSON.parse(row.settings)
    }));
  }

  async getEnabled() {
    const rows = db.query("SELECT * FROM channels WHERE enabled = 1").all();
    return rows.map(row => ({
      ...row,
      enabled: Boolean(row.enabled),
      credentials: JSON.parse(row.credentials),
      settings: JSON.parse(row.settings)
    }));
  }

  async updateStatus(id, status) {
    db.run("UPDATE channels SET status = ?, updated_at = unixepoch() WHERE id = ?", [status, id]);
  }
  
  async resetAllStatuses() {
    db.run("UPDATE channels SET status = 'stopped' WHERE status != 'stopped'");
  }
}

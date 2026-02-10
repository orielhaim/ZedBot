import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';

export class ProfileManager {
  /**
   * Resolves a profile based on platform identity.
   * Creates a new profile and connection if one doesn't exist.
   */
  getOrCreate(platformId, platformType, userData = {}) {
    // 1. Look for existing connection
    const connection = db.query(
      "SELECT * FROM connections WHERE platform_id = ? AND platform_type = ?"
    ).get(platformId, platformType);

    if (connection) {
      // 2. Fetch Profile
      const profile = db.query(
        "SELECT * FROM profiles WHERE id = ?"
      ).get(connection.profile_id);
      
      // Update Profile Info if changed (e.g. name update)
      if (profile && userData.name && profile.name !== userData.name) {
         db.run(
          "UPDATE profiles SET name = ?, updated_at = unixepoch() WHERE id = ?",
          [userData.name, profile.id]
        );
        profile.name = userData.name;
      }
      
      return profile;
    }

    // 3. Create New Profile and Connection
    const profileId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    
    const createTransaction = db.transaction(() => {
        db.run(
          `INSERT INTO profiles (id, name, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            profileId, 
            userData.name || null, 
            JSON.stringify(userData.metadata || {}),
            now,
            now
          ]
        );

        const connectionId = uuidv4();
        db.run(
            `INSERT INTO connections (id, profile_id, platform_type, platform_id, metadata, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
             [
                connectionId,
                profileId,
                platformType,
                platformId,
                JSON.stringify(userData.metadata || {}),
                now,
                now
             ]
        );
    });
    
    createTransaction();

    return db.query("SELECT * FROM profiles WHERE id = ?").get(profileId);
  }
  
  get(id) {
    return db.query("SELECT * FROM profiles WHERE id = ?").get(id);
  }
  
  linkConnection(profileId, platformId, platformType, metadata = {}) {
     const existing = db.query(
        "SELECT * FROM connections WHERE platform_id = ? AND platform_type = ?"
     ).get(platformId, platformType);
     
     if (existing) {
         if (existing.profile_id === profileId) return existing;
         throw new Error("Platform account already linked to another profile");
     }
     
     const id = uuidv4();
     const now = Math.floor(Date.now() / 1000);
     
     db.run(
        `INSERT INTO connections (id, profile_id, platform_type, platform_id, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
         [id, profileId, platformType, platformId, JSON.stringify(metadata), now, now]
     );
     
     return db.query("SELECT * FROM connections WHERE id = ?").get(id);
  }
}

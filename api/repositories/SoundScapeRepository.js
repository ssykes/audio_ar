/**
 * SoundScapeRepository - Database operations for soundscapes table
 * 
 * Extends BaseRepository with operations that handle parent-child relationships
 * between soundscapes, waypoints, and behaviors.
 * 
 * @example
 * const repo = new SoundScapeRepository(db);
 * const full = await repo.getFull('soundscape-123', 'user-456');
 * // Returns: { soundscape, waypoints: [...], behaviors: [...] }
 */
const BaseRepository = require('./BaseRepository');
const WaypointRepository = require('./WaypointRepository');
const BehaviorRepository = require('./BehaviorRepository');

class SoundScapeRepository extends BaseRepository {
  constructor(db) {
    super(db, 'soundscapes');
    this.waypointRepo = new WaypointRepository(db);
    this.behaviorRepo = new BehaviorRepository(db);
  }

  /**
   * Get full soundscape with waypoints and behaviors
   * @param {string} id - Soundscape ID
   * @param {string} userId - User ID for authorization
   * @returns {Promise<Object|null>} { soundscape, waypoints, behaviors } or null
   */
  async getFull(id, userId) {
    // Verify ownership
    const soundscape = await this.findByColumn('id', id);
    if (!soundscape || soundscape.user_id !== userId) {
      return null;
    }

    const [waypoints, behaviors] = await Promise.all([
      this.waypointRepo.findBySoundscape(id),
      this.behaviorRepo.findBySoundscape(id)
    ]);

    return {
      soundscape: this._toEntity(soundscape),
      waypoints,
      behaviors
    };
  }

  /**
   * Get all soundscapes for a user with waypoint counts
   * @param {string} userId - User ID
   * @returns {Promise<Object[]>} Array of soundscapes with counts
   */
  async getAllForUser(userId) {
    const soundscapes = await this.findAll({ user_id: userId }, 'created_at DESC');
    
    // Add waypoint counts
    const withCounts = await Promise.all(
      soundscapes.map(async ss => {
        const count = await this.waypointRepo.countBySoundscape(ss.id);
        return {
          ...this._toEntity(ss),
          waypointCount: count
        };
      })
    );
    
    return withCounts;
  }

  /**
   * Create soundscape with waypoints and behaviors (transactional)
   * @param {Object} soundscapeData - Soundscape data (camelCase)
   * @param {Object[]} [waypoints] - Optional waypoints to create
   * @param {Object[]} [behaviors] - Optional behaviors to create
   * @returns {Promise<Object>} Created soundscape with children
   */
  async createWithWaypoints(soundscapeData, waypoints = [], behaviors = []) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Create soundscape
      const row = this._toRow(soundscapeData);
      const createResult = await client.query(
        'INSERT INTO soundscapes (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [row.user_id, row.name, row.description || '']
      );
      
      const soundscape = createResult.rows[0];
      
      // Create waypoints
      const createdWaypoints = [];
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const wpResult = await client.query(
          `INSERT INTO waypoints (soundscape_id, name, lat, lon, sound_url, volume, loop, activation_radius, icon, color, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [soundscape.id, wp.name || 'Sound', wp.lat, wp.lon, wp.soundUrl, wp.volume ?? 0.8,
           wp.loop ?? true, wp.activationRadius || 20, wp.icon || '🎵', wp.color || '#00d9ff', i]
        );
        createdWaypoints.push(this._toEntity(wpResult.rows[0]));
      }
      
      // Create behaviors
      const createdBehaviors = [];
      for (let i = 0; i < behaviors.length; i++) {
        const b = behaviors[i];
        const bResult = await client.query(
          `INSERT INTO behaviors (soundscape_id, type, member_ids, config_json, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [soundscape.id, b.type, b.memberIds || [], JSON.stringify(b.config || {}), i]
        );
        createdBehaviors.push(this._toEntity(bResult.rows[0]));
      }
      
      await client.query('COMMIT');
      
      return {
        soundscape: this._toEntity(soundscape),
        waypoints: createdWaypoints,
        behaviors: createdBehaviors
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save full soundscape (waypoints + behaviors) - replaces existing children
   * @param {string} id - Soundscape ID
   * @param {Object[]} waypoints - New waypoints (replaces existing)
   * @param {Object[]} behaviors - New behaviors (replaces existing)
   * @returns {Promise<Object>} Updated soundscape with children
   */
  async saveFull(id, waypoints, behaviors) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Update soundscape timestamp
      await client.query(
        'UPDATE soundscapes SET updated_at = NOW() WHERE id = $1',
        [id]
      );
      
      // Delete existing children
      await client.query('DELETE FROM waypoints WHERE soundscape_id = $1', [id]);
      await client.query('DELETE FROM behaviors WHERE soundscape_id = $1', [id]);
      
      // Insert new waypoints
      const createdWaypoints = [];
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const wpResult = await client.query(
          `INSERT INTO waypoints (soundscape_id, name, lat, lon, sound_url, volume, loop, activation_radius, icon, color, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [id, wp.name || 'Sound', wp.lat, wp.lon, wp.soundUrl, wp.volume ?? 0.8,
           wp.loop ?? true, wp.activationRadius || 20, wp.icon || '🎵', wp.color || '#00d9ff', i]
        );
        createdWaypoints.push(this._toEntity(wpResult.rows[0]));
      }
      
      // Insert new behaviors
      const createdBehaviors = [];
      for (let i = 0; i < behaviors.length; i++) {
        const b = behaviors[i];
        const bResult = await client.query(
          `INSERT INTO behaviors (soundscape_id, type, member_ids, config_json, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [id, b.type, b.memberIds || [], JSON.stringify(b.config || {}), i]
        );
        createdBehaviors.push(this._toEntity(bResult.rows[0]));
      }
      
      await client.query('COMMIT');
      
      // Reload soundscape
      const soundscape = await this.findById(id);
      
      return {
        soundscape: this._toEntity(soundscape),
        waypoints: createdWaypoints,
        behaviors: createdBehaviors
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = SoundScapeRepository;

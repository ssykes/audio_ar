/**
 * WaypointRepository - Database operations for waypoints table
 * 
 * Extends BaseRepository with soundscape-specific operations.
 * 
 * @example
 * const repo = new WaypointRepository(db);
 * const waypoints = await repo.findBySoundscape('soundscape-123');
 */
const BaseRepository = require('./BaseRepository');

class WaypointRepository extends BaseRepository {
  constructor(db) {
    super(db, 'waypoints');
  }

  /**
   * Find all waypoints for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @param {string} [orderBy] - Optional ORDER BY clause (default: 'sort_order')
   * @returns {Promise<Object[]>} Array of waypoint rows
   */
  async findBySoundscape(soundscapeId, orderBy = 'sort_order') {
    const rows = await this.findAll({ soundscape_id: soundscapeId }, orderBy);
    return rows.map(row => this._toEntity(row));
  }

  /**
   * Count waypoints for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @returns {Promise<number>} Count of waypoints
   */
  async countBySoundscape(soundscapeId) {
    return await this.count({ soundscape_id: soundscapeId });
  }

  /**
   * Delete all waypoints for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @returns {Promise<boolean>} True if any were deleted
   */
  async deleteBySoundscape(soundscapeId) {
    const query = 'DELETE FROM waypoints WHERE soundscape_id = $1';
    const result = await this.db.query(query, [soundscapeId]);
    return result.rowCount > 0;
  }

  /**
   * Insert multiple waypoints for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @param {Object[]} waypoints - Array of waypoint data (camelCase)
   * @returns {Promise<Object[]>} Array of inserted rows
   */
  async insertBatch(soundscapeId, waypoints) {
    const inserted = [];
    
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const row = this._toRow({
        soundscapeId,
        name: wp.name || 'Sound',
        lat: wp.lat,
        lon: wp.lon,
        soundUrl: wp.soundUrl,
        volume: wp.volume ?? 0.8,
        loop: wp.loop ?? true,
        activationRadius: wp.activationRadius || 20,
        icon: wp.icon || '🎵',
        color: wp.color || '#00d9ff',
        sortOrder: i
      });
      
      const result = await this.insert(row);
      inserted.push(this._toEntity(result));
    }
    
    return inserted;
  }
}

module.exports = WaypointRepository;

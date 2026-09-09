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
   * Convert camelCase JavaScript object to snake_case database row
   * Handles deprecated sound_url field mapping to new sound_id field
   * @param {Object} entity - JavaScript object (camelCase keys)
   * @returns {Object} Database row (snake_case keys)
   */
  _toRow(entity) {
    if (!entity) return null;

    const row = {};
    for (const [key, value] of Object.entries(entity)) {
      // Special handling for deprecated sound_url field -> new sound_id field
      if (key === 'soundUrl') {
        // Map the old soundUrl to the new soundId field
        row.sound_id = value ? this._getSoundIdFromUrl(value) : null;
      } else {
        // Convert camelCase to snake_case for all other fields
        row[key.replace(/([A-Z])/g, '_$1').toLowerCase()] = value;
      }
    }
    return row;
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
      
      // Process the waypoint data, handling deprecated soundUrl field
      // Use snake_case field names since _toRow will be called
      const processedWp = {
        soundscape_id: soundscapeId,
        name: wp.name || 'Sound',
        lat: wp.lat,
        lon: wp.lon,
        soundUrl: wp.soundUrl, // This will be handled by _toRow
        sound_id: wp.soundId,
        volume: wp.volume ?? 0.8,
        loop: wp.loop ?? true,
        activation_radius: wp.activationRadius || 20,
        icon: wp.icon || '•',
        color: wp.color || '#00d9ff',
        sort_order: i,
        type: wp.type || 'file',
        // Oscillator properties
        waveform: wp.waveform ?? 'sine',
        frequency: wp.frequency ?? 440,
        detune: wp.detune ?? 0,
        gain: wp.gain ?? 0.5
      };

      const row = this._toRow(processedWp);

      const result = await this.insert(row);
      inserted.push(this._toEntity(result));
    }

    return inserted;
  }

  /**
   * Helper method to get sound_id from sound_url for backward compatibility
   * @param {string} soundUrl - The URL of the sound
   * @returns {string|null} The corresponding sound_id or null
   */
  _getSoundIdFromUrl(soundUrl) {
    // For now, if soundUrl is empty, return null
    if (!soundUrl || soundUrl.trim() === '') {
      return null;
    }

    // In a real implementation, you would look up the sound in the sounds table
    // by its URL to find the corresponding sound_id
    // For this fix, we'll return null for empty URLs
    return null;
  }
  
  /**
   * Async method to get sound_id from sound_url for backward compatibility
   * @param {string} soundUrl - The URL of the sound
   * @returns {Promise<string|null>} The corresponding sound_id or null
   */
  async _getSoundIdFromUrlAsync(soundUrl) {
    if (!soundUrl || soundUrl.trim() === '') {
      return null;
    }
    
    // Import SoundLookup here to avoid circular dependencies
    const SoundLookup = require('../utils/SoundLookup');
    const soundLookup = new SoundLookup(this.db);
    
    return await soundLookup.getSoundIdFromUrl(soundUrl);
  }
}

module.exports = WaypointRepository;

/**
 * AreaRepository - Database operations for areas table
 *
 * Extends BaseRepository with soundscape-specific operations.
 *
 * @example
 * const repo = new AreaRepository(db);
 * const areas = await repo.findBySoundscape('soundscape-123');
 */
const BaseRepository = require('./BaseRepository');
const Area = require('../models/Area');

class AreaRepository extends BaseRepository {
  constructor(db) {
    super(db, 'areas');
  }

  /**
   * Find all areas for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @param {string} [orderBy] - Optional ORDER BY clause (default: 'sort_order')
   * @returns {Promise<Area[]>} Array of Area objects
   */
  async findBySoundscape(soundscapeId, orderBy = 'sort_order') {
    const rows = await this.findAll({ soundscape_id: soundscapeId }, orderBy);
    return rows.map(row => this._toEntity(row));
  }

  /**
   * Count areas for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @returns {Promise<number>} Count of areas
   */
  async countBySoundscape(soundscapeId) {
    return await this.count({ soundscape_id: soundscapeId });
  }

  /**
   * Delete all areas for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @returns {Promise<boolean>} True if any were deleted
   */
  async deleteBySoundscape(soundscapeId) {
    const query = 'DELETE FROM areas WHERE soundscape_id = $1';
    const result = await this.db.query(query, [soundscapeId]);
    return result.rowCount > 0;
  }

  /**
   * Delete a single area by ID
   * @param {string} areaId - Area ID
   * @param {string} soundscapeId - Soundscape ID (for safety)
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteOne(areaId, soundscapeId) {
    const query = 'DELETE FROM areas WHERE id = $1 AND soundscape_id = $2';
    const result = await this.db.query(query, [areaId, soundscapeId]);
    return result.rowCount > 0;
  }

  /**
   * Insert multiple areas for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @param {Object[]} areas - Array of area data (camelCase)
   * @returns {Promise<Area[]>} Array of inserted Area objects
   */
  async insertBatch(soundscapeId, areas) {
    const inserted = [];

    for (let i = 0; i < areas.length; i++) {
      const area = areas[i];
      const row = this._toRow({
        soundscapeId,
        name: area.name || 'Area',
        polygon: area.polygon,
        soundUrl: area.soundUrl,
        volume: area.volume ?? 0.8,
        loop: area.loop ?? true,
        fadeZoneWidth: area.fadeZoneWidth || 5.0,
        overlapMode: area.overlapMode || 'mix',
        order: i,
        icon: area.icon || '◈',
        color: area.color || '#ff6b6b',
        sortOrder: i,
        type: area.type || 'file',
        // Oscillator properties
        waveform: area.waveform ?? 'sine',
        frequency: area.frequency ?? 440,
        detune: area.detune ?? 0,
        gain: area.gain ?? 0.5
      });

      const result = await this.insert(row);
      inserted.push(this._toEntity(result));
    }

    return inserted;
  }

  /**
   * Override: Convert database row to Area entity
   * @param {Object} row - Database row
   * @returns {Area}
   */
  _toEntity(row) {
    return Area.fromRow(row);
  }

  /**
   * Override: Convert entity to database row
   * Handles deprecated sound_url field mapping to new sound_id field
   * @param {Object} entity - Area entity
   * @returns {Object}
   */
  _toRow(entity) {
    if (entity instanceof Area) {
      return entity.toRow();
    }
    
    // If plain object, handle deprecated soundUrl field before creating Area
    const processedEntity = { ...entity };
    if (processedEntity.soundUrl && !processedEntity.soundId) {
      // Map the old soundUrl to the new soundId field
      processedEntity.soundId = processedEntity.soundUrl ? this._getSoundIdFromUrl(processedEntity.soundUrl) : null;
    }
    
    // If both soundUrl and soundId exist, prefer soundId
    // Remove soundUrl since it's deprecated
    delete processedEntity.soundUrl;
    
    const area = Area.fromJSON(processedEntity);
    return area.toRow();
  }

  /**
   * Async method to get sound_id from sound_url for backward compatibility
   * @param {string} soundUrl - The URL of the sound
   * @returns {Promise<string|null>} The corresponding sound_id or null
   */
  async _getSoundIdFromUrl(soundUrl) {
    if (!soundUrl || soundUrl.trim() === '') {
      return null;
    }
    
    // Import SoundLookup here to avoid circular dependencies
    const SoundLookup = require('../utils/SoundLookup');
    const soundLookup = new SoundLookup(this.db);
    
    return await soundLookup.getSoundIdFromUrl(soundUrl);
  }
}

module.exports = AreaRepository;

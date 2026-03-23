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
        sortOrder: i
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
   * @param {Object} entity - Area entity
   * @returns {Object}
   */
  _toRow(entity) {
    if (entity instanceof Area) {
      return entity.toRow();
    }
    // If plain object, create Area first
    const area = Area.fromJSON(entity);
    return area.toRow();
  }
}

module.exports = AreaRepository;

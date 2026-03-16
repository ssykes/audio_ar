/**
 * BehaviorRepository - Database operations for behaviors table
 * 
 * Extends BaseRepository with soundscape-specific operations.
 * Handles JSON parsing/serialization for config_json column.
 * 
 * @example
 * const repo = new BehaviorRepository(db);
 * const behaviors = await repo.findBySoundscape('soundscape-123');
 */
const BaseRepository = require('./BaseRepository');

class BehaviorRepository extends BaseRepository {
  constructor(db) {
    super(db, 'behaviors');
  }

  /**
   * Find all behaviors for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @param {string} [orderBy] - Optional ORDER BY clause (default: 'sort_order')
   * @returns {Promise<Object[]>} Array of behavior rows (with parsed config)
   */
  async findBySoundscape(soundscapeId, orderBy = 'sort_order') {
    const rows = await this.findAll({ soundscape_id: soundscapeId }, orderBy);
    
    // Parse config_json for each row
    return rows.map(row => {
      const entity = this._toEntity(row);
      if (entity.configJson && typeof entity.configJson === 'string') {
        entity.configJson = JSON.parse(entity.configJson);
      }
      return entity;
    });
  }

  /**
   * Count behaviors for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @returns {Promise<number>} Count of behaviors
   */
  async countBySoundscape(soundscapeId) {
    return await this.count({ soundscape_id: soundscapeId });
  }

  /**
   * Delete all behaviors for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @returns {Promise<boolean>} True if any were deleted
   */
  async deleteBySoundscape(soundscapeId) {
    const query = 'DELETE FROM behaviors WHERE soundscape_id = $1';
    const result = await this.db.query(query, [soundscapeId]);
    return result.rowCount > 0;
  }

  /**
   * Insert multiple behaviors for a soundscape
   * @param {string} soundscapeId - Soundscape ID
   * @param {Object[]} behaviors - Array of behavior data (camelCase)
   * @returns {Promise<Object[]>} Array of inserted rows
   */
  async insertBatch(soundscapeId, behaviors) {
    const inserted = [];
    
    for (let i = 0; i < behaviors.length; i++) {
      const b = behaviors[i];
      const row = this._toRow({
        soundscapeId,
        type: b.type,
        memberIds: b.memberIds || [],
        configJson: JSON.stringify(b.config || {}),
        sortOrder: i
      });
      
      const result = await this.insert(row);
      inserted.push(this._toEntity(result));
    }
    
    return inserted;
  }
}

module.exports = BehaviorRepository;

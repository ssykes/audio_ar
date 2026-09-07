const BaseRepository = require('./BaseRepository');
const Sound = require('../models/Sound');

class SoundRepository extends BaseRepository {
  constructor(db) {
    super(db, 'sounds');
  }

  /**
   * Get all sounds for a specific user
   * @param {string} userId - User ID to filter by
   * @returns {Promise<Array<Sound>>} Array of Sound instances
   */
  async getAllForUser(userId) {
    const rows = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    
    return rows.map(row => Sound.fromRow(row));
  }

  /**
   * Get a specific sound by ID and user
   * @param {string} id - Sound ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Sound|null>} Sound instance or null if not found
   */
  async getByIdAndUser(id, userId) {
    const row = await this.db.queryOne(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    return row ? Sound.fromRow(row) : null;
  }

  /**
   * Create a new sound
   * @param {Sound} sound - Sound instance to create
   * @returns {Promise<Sound>} Created Sound instance
   */
  async create(sound) {
    // Convert sound to database row format (snake_case)
    const soundRow = sound.toRow();
    
    const result = await this.db.queryOne(
      `INSERT INTO ${this.tableName} 
       (user_id, name, type, file_path, url, config_json, file_size, duration) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        soundRow.user_id, 
        soundRow.name, 
        soundRow.type, 
        soundRow.file_path, 
        soundRow.url, 
        soundRow.config_json, 
        soundRow.file_size, 
        soundRow.duration
      ]
    );
    
    return Sound.fromRow(result);
  }

  /**
   * Update an existing sound
   * @param {string} id - Sound ID to update
   * @param {Object} updates - Fields to update (camelCase)
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Sound|null>} Updated Sound instance or null if not found
   */
  async update(id, updates, userId) {
    // Convert camelCase field names to snake_case for database
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      // Use the BaseRepository's conversion method
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      
      // Only allow specific fields to be updated
      if (this.allowedUpdateFields.includes(key) || this.allowedUpdateFields.includes(dbField)) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add userId and id to the values
    values.push(userId, id);
    const userIdParamIndex = paramIndex;
    const idParamIndex = paramIndex + 1;

    const query = `
      UPDATE ${this.tableName} 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParamIndex} AND user_id = $${userIdParamIndex}
      RETURNING *
    `;

    const result = await this.db.queryOne(query, values);
    return result ? Sound.fromRow(result) : null;
  }

  /**
   * Delete a sound by ID and user
   * @param {string} id - Sound ID to delete
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id, userId) {
    const result = await this.db.queryOne(
      `DELETE FROM ${this.tableName} WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    
    return !!result;
  }

  /**
   * Count how many waypoints use a specific sound
   * @param {string} soundId - Sound ID to check
   * @returns {Promise<number>} Number of waypoints using this sound
   */
  async countWaypointUsage(soundId) {
    const result = await this.db.queryOne(
      `SELECT COUNT(*) as count FROM waypoints WHERE sound_id = $1`,
      [soundId]
    );
    
    return parseInt(result.count);
  }

  /**
   * Get allowed fields for updates (camelCase)
   * @returns {Array<string>} List of allowed field names
   */
  get allowedUpdateFields() {
    return ['name', 'type', 'filepath', 'url', 'configJson', 'fileSize', 'duration'];
  }
}

module.exports = SoundRepository;
const BaseRepository = require('./BaseRepository');
const Sound = require('../models/Sound');

class SoundRepository extends BaseRepository {
  constructor(db) {
    super(db, 'sounds');
    this.table = 'sounds';
  }

  /**
   * Get all sounds for a specific user
   * @param {string} userId - User ID to filter by
   * @returns {Promise<Array<Sound>>} Array of Sound instances
   */
  async getAllForUser(userId) {
    const result = await this.db.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    // Debug: Log the result structure to understand what we're getting
    console.log(`[SoundRepository] Query result type: ${typeof result}, isArray: ${Array.isArray(result)}`);
    if (result && typeof result === 'object') {
      console.log(`[SoundRepository] Result keys: ${Object.keys(result)}, has rows: ${'rows' in result}`);
    }
    
    // Ensure we're working with an array of rows
    let rows;
    if (Array.isArray(result)) {
      rows = result;
    } else if (result && typeof result === 'object' && 'rows' in result) {
      // Handle pg.Pool result format
      rows = Array.isArray(result.rows) ? result.rows : [];
    } else if (!result) {
      rows = [];
    } else {
      // If result is neither an array nor an object with a rows property, log an error and return empty array
      console.error(`[SoundRepository] Unexpected query result format:`, result);
      console.error(`[SoundRepository] Type of result:`, typeof result);
      rows = [];
    }

    // Ensure rows is an array before calling map
    if (!Array.isArray(rows)) {
      console.error(`[SoundRepository] Rows is not an array:`, rows);
      return [];
    }

    return rows.map(row => Sound.fromRow(row));
  }

  /**
   * Get a specific sound by ID and user
   * @param {string} id - Sound ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Sound|null>} Sound instance or null if not found
   */
  async getByIdAndUser(id, userId) {
    const result = await this.db.queryOne(
      `SELECT * FROM ${this.table} WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return result ? Sound.fromRow(result) : null;
  }

  /**
   * Create a new sound
   * @param {Sound} sound - Sound instance to create
   * @returns {Promise<Sound>} Created Sound instance
   */
  async create(sound) {
    const result = await this.db.queryOne(
      `INSERT INTO ${this.table}
       (user_id, name, type, filepath, url, config_json, file_size, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        sound.userId,
        sound.name,
        sound.type,
        sound.filepath,
        sound.url,
        sound.configJson,
        sound.fileSize,
        sound.duration
      ]
    );

    return result ? Sound.fromRow(result) : null;
  }

  /**
   * Update an existing sound
   * @param {string} id - Sound ID to update
   * @param {Object} updates - Fields to update
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Sound|null>} Updated Sound instance or null if not found
   */
  async update(id, updates, userId) {
    // Build dynamic query based on provided updates
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (this.allowedUpdateFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
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
      UPDATE ${this.table} 
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
      `DELETE FROM ${this.table} WHERE id = $1 AND user_id = $2 RETURNING id`,
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
   * Get allowed fields for updates
   * @returns {Array<string>} List of allowed field names
   */
  get allowedUpdateFields() {
    return ['name', 'type', 'filepath', 'url', 'config_json', 'file_size', 'duration'];
  }
}

module.exports = SoundRepository;
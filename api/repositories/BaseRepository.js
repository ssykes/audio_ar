/**
 * BaseRepository - Abstract base class for database repositories
 * 
 * Provides automatic snake_case ↔ camelCase mapping between database rows
 * and JavaScript objects, plus common CRUD operations.
 * 
 * @example
 * class SoundScapeRepository extends BaseRepository {
 *   constructor(db) {
 *     super(db, 'soundscapes');
 *   }
 *   
 *   async getAllForUser(userId) {
 *     const rows = await this.findAll({ user_id: userId });
 *     return rows.map(row => this._toEntity(row));
 *   }
 * }
 */
class BaseRepository {
  /**
   * @param {Object} db - Database connection object with query() method
   * @param {string} tableName - Name of the database table
   */
  constructor(db, tableName) {
    if (this.constructor === BaseRepository) {
      throw new Error('BaseRepository is abstract - extend it to use');
    }
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Convert snake_case database row to camelCase JavaScript object
   * @param {Object} row - Database row (snake_case keys)
   * @returns {Object} JavaScript object (camelCase keys)
   */
  _toEntity(row) {
    if (!row) return null;
    
    const entity = {};
    for (const [key, value] of Object.entries(row)) {
      // Convert snake_case to camelCase
      entity[key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())] = value;
    }
    return entity;
  }

  /**
   * Convert camelCase JavaScript object to snake_case database row
   * @param {Object} entity - JavaScript object (camelCase keys)
   * @returns {Object} Database row (snake_case keys)
   */
  _toRow(entity) {
    if (!entity) return null;
    
    const row = {};
    for (const [key, value] of Object.entries(entity)) {
      // Convert camelCase to snake_case
      row[key.replace(/([A-Z])/g, '_$1').toLowerCase()] = value;
    }
    return row;
  }

  /**
   * Find all rows matching optional filter
   * @param {Object} [filter] - Key-value pairs for WHERE clause
   * @param {string} [orderBy] - ORDER BY clause (e.g., 'created_at DESC')
   * @returns {Promise<Object[]>} Array of database rows
   */
  async findAll(filter = {}, orderBy = null) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filter)) {
      conditions.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = orderBy ? `ORDER BY ${orderBy}` : '';
    
    const query = `SELECT * FROM ${this.tableName} ${whereClause} ${orderClause}`;
    const result = await this.db.query(query, values);
    
    return result.rows;
  }

  /**
   * Find single row by ID
   * @param {string|number} id - Primary key value
   * @returns {Promise<Object|null>} Database row or null
   */
  async findById(id) {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const result = await this.db.query(query, [id]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find single row by column value
   * @param {string} column - Column name
   * @param {any} value - Value to match
   * @returns {Promise<Object|null>} Database row or null
   */
  async findByColumn(column, value) {
    const query = `SELECT * FROM ${this.tableName} WHERE ${column} = $1`;
    const result = await this.db.query(query, [value]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Insert new row
   * @param {Object} data - Data to insert (camelCase or snake_case)
   * @returns {Promise<Object>} Inserted row
   */
  async insert(data) {
    const row = this._toRow(data);
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Update existing row by ID
   * @param {string|number} id - Primary key value
   * @param {Object} data - Data to update (camelCase or snake_case)
   * @returns {Promise<Object|null>} Updated row or null
   */
  async update(id, data) {
    const row = this._toRow(data);
    const columns = Object.keys(row);
    const values = Object.values(row);
    
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
    
    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = NOW()
      WHERE id = $${values.length + 1}
      RETURNING *
    `;

    const result = await this.db.query(query, [...values, id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Delete row by ID
   * @param {string|number} id - Primary key value
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING *`;
    const result = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  /**
   * Count rows matching optional filter
   * @param {Object} [filter] - Key-value pairs for WHERE clause
   * @returns {Promise<number>} Count of matching rows
   */
  async count(filter = {}) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filter)) {
      conditions.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const query = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
    const result = await this.db.query(query, values);
    
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = BaseRepository;

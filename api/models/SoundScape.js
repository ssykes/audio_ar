/**
 * SoundScape - Domain model
 * 
 * Represents a soundscape with waypoints and behaviors.
 * Used for validation and serialization in server-side code.
 * 
 * @example
 * const soundscape = SoundScape.fromJSON({ id: '1', name: 'My Soundscape' });
 * const json = soundscape.toJSON();
 */
class SoundScape {
    constructor(id, userId, name, description = '', createdAt = null, updatedAt = null) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.description = description;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    /**
     * Create SoundScape from database row (snake_case)
     * @param {Object} row - Database row
     * @returns {SoundScape}
     */
    static fromRow(row) {
        return new SoundScape(
            row.id,
            row.user_id,
            row.name,
            row.description || '',
            row.created_at,
            row.updated_at
        );
    }

    /**
     * Create SoundScape from JSON object (camelCase)
     * @param {Object} json - JSON object
     * @returns {SoundScape}
     */
    static fromJSON(json) {
        return new SoundScape(
            json.id,
            json.userId || json.user_id,
            json.name,
            json.description || '',
            json.createdAt || json.created_at,
            json.updatedAt || json.updated_at
        );
    }

    /**
     * Convert to database row format (snake_case)
     * @returns {Object}
     */
    toRow() {
        return {
            id: this.id,
            user_id: this.userId,
            name: this.name,
            description: this.description,
            created_at: this.createdAt,
            updated_at: this.updatedAt
        };
    }

    /**
     * Convert to JSON object (camelCase)
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            userId: this.userId,
            name: this.name,
            description: this.description,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = SoundScape;

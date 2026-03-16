/**
 * Behavior - Domain model
 * 
 * Represents a sound behavior (tempo_sync, time_sync, etc.).
 * Used for validation and serialization in server-side code.
 * 
 * @example
 * const behavior = Behavior.fromRow({ id: '1', soundscape_id: 'sc1', type: 'tempo_sync' });
 * const json = behavior.toJSON();
 */
class Behavior {
    constructor(
        id,
        soundscapeId,
        type,
        memberIds = [],
        config = {},
        sortOrder = 0
    ) {
        this.id = id;
        this.soundscapeId = soundscapeId;
        this.type = type;
        this.memberIds = memberIds;
        this.config = config;
        this.sortOrder = sortOrder;
    }

    /**
     * Create Behavior from database row (snake_case, config_json parsed)
     * @param {Object} row - Database row
     * @returns {Behavior}
     */
    static fromRow(row) {
        let config = row.config_json || {};
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch (e) {
                console.error('[Behavior] Failed to parse config_json:', e);
                config = {};
            }
        }

        return new Behavior(
            row.id,
            row.soundscape_id,
            row.type,
            row.member_ids || [],
            config,
            row.sort_order ?? 0
        );
    }

    /**
     * Create Behavior from JSON object (camelCase)
     * @param {Object} json - JSON object
     * @returns {Behavior}
     */
    static fromJSON(json) {
        return new Behavior(
            json.id,
            json.soundscapeId || json.soundscape_id,
            json.type,
            json.memberIds || json.member_ids || [],
            json.config || {},
            json.sortOrder ?? 0
        );
    }

    /**
     * Convert to database row format (snake_case, config_json stringified)
     * @returns {Object}
     */
    toRow() {
        return {
            id: this.id,
            soundscape_id: this.soundscapeId,
            type: this.type,
            member_ids: this.memberIds,
            config_json: JSON.stringify(this.config),
            sort_order: this.sortOrder
        };
    }

    /**
     * Convert to JSON object (camelCase)
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            soundscapeId: this.soundscapeId,
            type: this.type,
            memberIds: this.memberIds,
            config: this.config,
            sortOrder: this.sortOrder
        };
    }
}

module.exports = Behavior;

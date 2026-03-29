/**
 * Waypoint - Domain model
 * 
 * Represents a sound waypoint on the map.
 * Used for validation and serialization in server-side code.
 * 
 * @example
 * const wp = Waypoint.fromRow({ id: '1', soundscape_id: 'sc1', name: 'Sound 1' });
 * const json = wp.toJSON();
 */
class Waypoint {
    constructor(
        id,
        soundscapeId,
        name,
        lat,
        lon,
        soundUrl,
        volume = 0.8,
        loop = true,
        activationRadius = 20,
        icon = '•',
        color = '#00d9ff',
        sortOrder = 0,
        type = 'file'
    ) {
        this.id = id;
        this.soundscapeId = soundscapeId;
        this.name = name;
        this.lat = lat;
        this.lon = lon;
        this.soundUrl = soundUrl;
        this.volume = volume;
        this.loop = loop;
        this.activationRadius = activationRadius;
        this.icon = icon;
        this.color = color;
        this.sortOrder = sortOrder;
        this.type = type;
    }

    /**
     * Create Waypoint from database row (snake_case)
     * @param {Object} row - Database row
     * @returns {Waypoint}
     */
    static fromRow(row) {
        return new Waypoint(
            row.id,
            row.soundscape_id,
            row.name,
            row.lat,
            row.lon,
            row.sound_url,
            row.volume ?? 0.8,
            row.loop ?? true,
            row.activation_radius ?? 20,
            row.icon || '•',
            row.color || '#00d9ff',
            row.sort_order ?? 0,
            row.type || 'file'
        );
    }

    /**
     * Create Waypoint from JSON object (camelCase)
     * @param {Object} json - JSON object
     * @returns {Waypoint}
     */
    static fromJSON(json) {
        return new Waypoint(
            json.id,
            json.soundscapeId || json.soundscape_id,
            json.name,
            json.lat,
            json.lon,
            json.soundUrl || json.sound_url,
            json.volume ?? 0.8,
            json.loop ?? true,
            json.activationRadius || json.activation_radius || 20,
            json.icon || '•',
            json.color || '#00d9ff',
            json.sortOrder ?? 0,
            json.type || 'file'
        );
    }

    /**
     * Convert to database row format (snake_case)
     * @returns {Object}
     */
    toRow() {
        return {
            id: this.id,
            soundscape_id: this.soundscapeId,
            name: this.name,
            lat: this.lat,
            lon: this.lon,
            sound_url: this.soundUrl,
            volume: this.volume,
            loop: this.loop,
            activation_radius: this.activationRadius,
            icon: this.icon,
            color: this.color,
            sort_order: this.sortOrder,
            type: this.type
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
            name: this.name,
            lat: this.lat,
            lon: this.lon,
            soundUrl: this.soundUrl,
            volume: this.volume,
            loop: this.loop,
            activationRadius: this.activationRadius,
            icon: this.icon,
            color: this.color,
            sortOrder: this.sortOrder,
            type: this.type
        };
    }
}

module.exports = Waypoint;

/**
 * Area - Domain model
 *
 * Represents a sound area (polygon) on the map.
 * Used for validation and serialization in server-side code.
 *
 * @example
 * const area = Area.fromRow({ id: '1', soundscape_id: 'sc1', name: 'Forest Zone' });
 * const json = area.toJSON();
 */
class Area {
    constructor(
        id,
        soundscapeId,
        name,
        polygon,           // [{lat, lng}, ...]
        soundUrl,
        volume = 0.8,
        loop = true,
        fadeZoneWidth = 5.0,
        overlapMode = 'mix',  // 'mix' | 'opaque'
        order = 0,            // placement order for opaque priority
        icon = '◈',           // diamond for Areas
        color = '#ff6b6b',    // red-ish
        sortOrder = 0
    ) {
        this.id = id;
        this.soundscapeId = soundscapeId;
        this.name = name;
        this.polygon = polygon;
        this.soundUrl = soundUrl;
        this.volume = volume;
        this.loop = loop;
        this.fadeZoneWidth = fadeZoneWidth;
        this.overlapMode = overlapMode;
        this.order = order;
        this.icon = icon;
        this.color = color;
        this.sortOrder = sortOrder;
    }

    /**
     * Create Area from database row (snake_case)
     * @param {Object} row - Database row
     * @returns {Area}
     */
    static fromRow(row) {
        // PostgreSQL JSONB returns objects, not strings - only parse if string
        const polygon = typeof row.polygon === 'string' ? JSON.parse(row.polygon) : row.polygon;
        
        return new Area(
            row.id,
            row.soundscape_id,
            row.name,
            polygon,
            row.sound_url,
            row.volume ?? 0.8,
            row.loop ?? true,
            row.fade_zone_width ?? 5.0,
            row.overlap_mode ?? 'mix',
            row.order ?? 0,
            row.icon || '◈',
            row.color || '#ff6b6b',
            row.sort_order ?? 0
        );
    }

    /**
     * Create Area from JSON object (camelCase)
     * @param {Object} json - JSON object
     * @returns {Area}
     */
    static fromJSON(json) {
        return new Area(
            json.id,
            json.soundscapeId || json.soundscape_id,
            json.name,
            json.polygon,
            json.soundUrl || json.sound_url,
            json.volume ?? 0.8,
            json.loop ?? true,
            json.fadeZoneWidth ?? json.fade_zone_width ?? 5.0,
            json.overlapMode ?? json.overlap_mode ?? 'mix',
            json.order ?? 0,
            json.icon || '◈',
            json.color || '#ff6b6b',
            json.sortOrder ?? 0
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
            polygon: JSON.stringify(this.polygon),
            sound_url: this.soundUrl,
            volume: this.volume,
            loop: this.loop,
            fade_zone_width: this.fadeZoneWidth,
            overlap_mode: this.overlapMode,
            order: this.order,
            icon: this.icon,
            color: this.color,
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
            name: this.name,
            polygon: this.polygon,
            soundUrl: this.soundUrl,
            volume: this.volume,
            loop: this.loop,
            fadeZoneWidth: this.fadeZoneWidth,
            overlapMode: this.overlapMode,
            order: this.order,
            icon: this.icon,
            color: this.color,
            sortOrder: this.sortOrder
        };
    }
}

module.exports = Area;

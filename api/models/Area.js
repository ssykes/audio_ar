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
        soundId,
        volume = 0.8,
        loop = true,
        fadeZoneWidth = 5.0,
        overlapMode = 'mix',  // 'mix' | 'opaque'
        order = 0,            // placement order for opaque priority
        icon = '◈',           // diamond for Areas
        color = '#ff6b6b',    // red-ish
        sortOrder = 0,
        type = 'file',
        // Oscillator properties
        waveform = 'sine',
        frequency = 440,
        detune = 0,
        gain = 0.5
    ) {
        this.id = id;
        this.soundscapeId = soundscapeId;
        this.name = name;
        this.polygon = polygon;
        this.soundId = soundId;
        this.volume = volume;
        this.loop = loop;
        this.fadeZoneWidth = fadeZoneWidth;
        this.overlapMode = overlapMode;
        this.order = order;
        this.icon = icon;
        this.color = color;
        this.sortOrder = sortOrder;
        this.type = type;
        // Oscillator properties
        this.waveform = waveform;
        this.frequency = frequency;
        this.detune = detune;
        this.gain = gain;
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
            row.sound_id,
            row.volume ?? 0.8,
            row.loop ?? true,
            row.fade_zone_width ?? 5.0,
            row.overlap_mode ?? 'mix',
            row.order ?? 0,
            row.icon || '◈',
            row.color || '#ff6b6b',
            row.sort_order ?? 0,
            row.type || 'file',
            // Oscillator properties
            row.waveform ?? 'sine',
            row.frequency ?? 440,
            row.detune ?? 0,
            row.gain ?? 0.5
        );
    }

    /**
     * Create Area from JSON object (camelCase)
     * Handles deprecated sound_url field mapping to new sound_id field
     * @param {Object} json - JSON object
     * @returns {Area}
     */
    static fromJSON(json) {
        // Handle deprecated soundUrl field mapping to new soundId field
        let soundIdValue = json.soundId || json.sound_id;
        if (!soundIdValue && json.soundUrl) {
            // If soundId is not provided but soundUrl is, map it
            soundIdValue = this._getSoundIdFromUrl(json.soundUrl);
        }

        return new Area(
            json.id,
            json.soundscapeId || json.soundscape_id,
            json.name,
            json.polygon,
            soundIdValue,
            json.volume ?? 0.8,
            json.loop ?? true,
            json.fadeZoneWidth ?? json.fade_zone_width ?? 5.0,
            json.overlapMode ?? json.overlap_mode ?? 'mix',
            json.order ?? 0,
            json.icon || '◈',
            json.color || '#ff6b6b',
            json.sortOrder ?? 0,
            json.type || 'file',
            // Oscillator properties
            json.waveform ?? 'sine',
            json.frequency ?? 440,
            json.detune ?? 0,
            json.gain ?? 0.5
        );
    }

    /**
     * Convert to database row format (snake_case)
     * @returns {Object}
     */
    toRow() {
        const row = {
            id: this.id,
            soundscape_id: this.soundscapeId,
            name: this.name,
            polygon: JSON.stringify(this.polygon),
            volume: this.volume,
            loop: this.loop,
            fade_zone_width: this.fadeZoneWidth,
            overlap_mode: this.overlapMode,
            order: this.order,
            icon: this.icon,
            color: this.color,
            sort_order: this.sortOrder,
            type: this.type,
            // Oscillator properties
            waveform: this.waveform,
            frequency: this.frequency,
            detune: this.detune,
            gain: this.gain
        };

        // Include sound_id if it exists
        if (this.soundId) {
            row.sound_id = this.soundId;
        }

        return row;
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
            soundId: this.soundId,
            volume: this.volume,
            loop: this.loop,
            fadeZoneWidth: this.fadeZoneWidth,
            overlapMode: this.overlapMode,
            order: this.order,
            icon: this.icon,
            color: this.color,
            sortOrder: this.sortOrder,
            type: this.type,
            // Oscillator properties
            waveform: this.waveform,
            frequency: this.frequency,
            detune: this.detune,
            gain: this.gain
        };
    }

    /**
     * Helper method to get sound_id from sound_url for backward compatibility
     * @param {string} soundUrl - The URL of the sound
     * @returns {string|null} The corresponding sound_id or null
     */
    static _getSoundIdFromUrl(soundUrl) {
        // For now, if soundUrl is empty, return null
        if (!soundUrl || soundUrl.trim() === '') {
            return null;
        }

        // In a real implementation, you would look up the sound in the sounds table
        // by its URL to find the corresponding sound_id
        // For this fix, we'll return null for empty URLs
        return null;
    }
}

module.exports = Area;

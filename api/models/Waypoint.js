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
        soundId,
        volume = 0.8,
        loop = true,
        activationRadius = 20,
        icon = '•',
        color = '#00d9ff',
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
        this.lat = lat;
        this.lon = lon;
        this.soundId = soundId;
        this.volume = volume;
        this.loop = loop;
        this.activationRadius = activationRadius;
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
            row.sound_id,
            row.volume ?? 0.8,
            row.loop ?? true,
            row.activation_radius ?? 20,
            row.icon || '•',
            row.color || '#00d9ff',
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
     * Create Waypoint from JSON object (camelCase)
     * Handles deprecated sound_url field mapping to new sound_id field
     * @param {Object} json - JSON object
     * @returns {Waypoint}
     */
    static fromJSON(json) {
        // Handle deprecated soundUrl field mapping to new soundId field
        let soundIdValue = json.soundId || json.sound_id;
        if (!soundIdValue && json.soundUrl) {
            // If soundId is not provided but soundUrl is, map it
            soundIdValue = this._getSoundIdFromUrl(json.soundUrl);
        }

        return new Waypoint(
            json.id,
            json.soundscapeId || json.soundscape_id,
            json.name,
            json.lat,
            json.lon,
            soundIdValue,
            json.volume ?? 0.8,
            json.loop ?? true,
            json.activationRadius || json.activation_radius || 20,
            json.icon || '•',
            json.color || '#00d9ff',
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
            lat: this.lat,
            lon: this.lon,
            volume: this.volume,
            loop: this.loop,
            activation_radius: this.activationRadius,
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
            lat: this.lat,
            lon: this.lon,
            soundId: this.soundId,
            volume: this.volume,
            loop: this.loop,
            activationRadius: this.activationRadius,
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

module.exports = Waypoint;

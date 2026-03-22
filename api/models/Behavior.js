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

    /**
     * Validate behavior config based on type
     * @returns {{valid: boolean, errors: string[]}}
     */
    validate() {
        const errors = [];

        // Common validation
        if (!this.type) {
            errors.push('Behavior type is required');
        }
        if (!Array.isArray(this.memberIds)) {
            errors.push('memberIds must be an array');
        }

        // Type-specific validation
        switch (this.type) {
            case 'distance_envelope':
                this._validateDistanceEnvelope(errors);
                break;
            case 'tempo_sync':
                this._validateTempoSync(errors);
                break;
            case 'time_sync':
                this._validateTimeSync(errors);
                break;
            case 'volume_group':
                this._validateVolumeGroup(errors);
                break;
            // Add more type-specific validation as needed
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate distance_envelope config
     * @param {string[]} errors - Error array to push to
     * @private
     */
    _validateDistanceEnvelope(errors) {
        const { enterAttack, exitDecay, sustainVolume, curve } = this.config;

        // Validate enterAttack
        if (enterAttack !== undefined) {
            if (typeof enterAttack !== 'number' || enterAttack < 0) {
                errors.push('enterAttack must be a non-negative number');
            }
        }

        // Validate exitDecay
        if (exitDecay !== undefined) {
            if (typeof exitDecay !== 'number' || exitDecay < 0) {
                errors.push('exitDecay must be a non-negative number');
            }
        }

        // Validate sustainVolume
        if (sustainVolume !== undefined) {
            if (typeof sustainVolume !== 'number' || sustainVolume < 0 || sustainVolume > 1) {
                errors.push('sustainVolume must be between 0 and 1');
            }
        }

        // Validate curve
        const validCurves = ['linear', 'exponential', 'logarithmic', 'easeInOut'];
        if (curve !== undefined && !validCurves.includes(curve)) {
            errors.push(`curve must be one of: ${validCurves.join(', ')}`);
        }

        // Warn if attack + decay might exceed radius (not fatal)
        if (enterAttack !== undefined && exitDecay !== undefined) {
            const radius = this.config._activationRadius || 30;
            if (enterAttack + exitDecay > radius) {
                console.warn(
                    `Behavior validation: enterAttack (${enterAttack}m) + exitDecay (${exitDecay}m) > radius (${radius}m). ` +
                    'This may cause unexpected behavior.'
                );
            }
        }
    }

    /**
     * Validate tempo_sync config
     * @param {string[]} errors - Error array to push to
     * @private
     */
    _validateTempoSync(errors) {
        const { bpm, offsets, loop } = this.config;

        if (bpm !== undefined && (typeof bpm !== 'number' || bpm <= 0)) {
            errors.push('bpm must be a positive number');
        }

        if (offsets !== undefined && !Array.isArray(offsets)) {
            errors.push('offsets must be an array');
        }

        if (loop !== undefined && typeof loop !== 'boolean') {
            errors.push('loop must be a boolean');
        }
    }

    /**
     * Validate time_sync config
     * @param {string[]} errors - Error array to push to
     * @private
     */
    _validateTimeSync(errors) {
        const { startTime, stagger } = this.config;

        if (startTime !== undefined && (typeof startTime !== 'number' || startTime < 0)) {
            errors.push('startTime must be a non-negative number');
        }

        if (stagger !== undefined && (typeof stagger !== 'number' || stagger < 0)) {
            errors.push('stagger must be a non-negative number');
        }
    }

    /**
     * Validate volume_group config
     * @param {string[]} errors - Error array to push to
     * @private
     */
    _validateVolumeGroup(errors) {
        const { curve, fade, targetVolume } = this.config;

        if (curve !== undefined && !['linear', 'exponential', 'logarithmic'].includes(curve)) {
            errors.push('curve must be linear, exponential, or logarithmic');
        }

        if (fade !== undefined && (typeof fade !== 'number' || fade < 0)) {
            errors.push('fade must be a non-negative number');
        }

        if (targetVolume !== undefined && (typeof targetVolume !== 'number' || targetVolume < 0 || targetVolume > 1)) {
            errors.push('targetVolume must be between 0 and 1');
        }
    }
}

module.exports = Behavior;

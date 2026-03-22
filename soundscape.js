/**
 * SoundScape Architecture
 * Core classes for managing spatial audio experiences
 *
 * @version 4.1 - Distance-Based Effects Framework (Feature 17)
 * @changelog
 *   v1.0 - SoundScape, SoundBehavior, BehaviorExecutor classes
 *   v3.0 - Added waypointData persistence, SoundScapeStorage
 *   v4.0 - Added DistanceBasedEffect base class + DistanceEffectCurves utility
 *   v4.1 - Updated BehaviorExecutor.create() to accept listener parameter
 *
 * Architecture:
 * - SoundScape: Persisted container with soundIds and behaviors
 * - SoundBehavior: Data spec (type, memberIds, config)
 * - BehaviorExecutor: Runtime coordinator (not persisted)
 *
 * Data Flow:
 *   PC Editor → SoundScape → localStorage → Phone Player → BehaviorExecutor → Audio
 */

console.log('[soundscape.js] Loading v4.1...');

/**
 * SoundBehavior - Stored specification for coordinating sounds
 *
 * Defines what to do with a subset of sounds in a soundscape.
 * Multiple behaviors per soundscape allowed (one sound can be in multiple behaviors).
 */
class SoundBehavior {
    /**
     * @param {string} type - Behavior type ('tempo_sync', 'time_sync', 'reverb_group', etc.)
     * @param {string[]} memberIds - Subset of soundIds this behavior affects
     * @param {object} config - Type-specific configuration
     */
    constructor(type, memberIds, config = {}) {
        this.type = type;
        this.memberIds = memberIds;
        this.config = config;
    }

    /**
     * Serialize to plain object for JSON storage
     * @returns {object}
     */
    toJSON() {
        return {
            type: this.type,
            memberIds: this.memberIds,
            config: this.config
        };
    }

    /**
     * Deserialize from plain object
     * @param {object} data
     * @returns {SoundBehavior}
     */
    static fromJSON(data) {
        return new SoundBehavior(data.type, data.memberIds, data.config);
    }
}

/**
 * SoundScape - Persisted container for an audio experience
 *
 * Contains all sound waypoint IDs, waypoint data, and their behaviors.
 * Empty behaviors array = start all sounds together (implicit default).
 * 
 * ARCHITECTURE NOTE: Waypoint Data Storage
 * =========================================
 * This class stores both soundIds AND waypointData for self-containment:
 * - soundIds: Ordered list of waypoint IDs (for behavior references)
 * - waypointData: Full waypoint data {id, lat, lon, name, soundUrl, volume, loop, etc.}
 * 
 * This allows the soundscape to be fully self-contained for persistence and export.
 * The MapPlacerApp maintains the authoritative waypoint list during editing.
 */
class SoundScape {
    /**
     * @param {string} id - Unique identifier
     * @param {string} name - Human-readable name
     * @param {string[]} soundIds - Array of waypoint IDs
     * @param {SoundBehavior[]} behaviors - Array of behavior specifications
     * @param {Object[]} waypointData - Optional: Full waypoint data for persistence
     */
    constructor(id, name, soundIds = [], behaviors = [], waypointData = []) {
        this.id = id;
        this.name = name;
        this.soundIds = soundIds;
        this.behaviors = behaviors;
        this.waypointData = waypointData;  // Full waypoint data for persistence
        
        // === Dirty Flag (Session 6: Auto-save with dirty tracking) ===
        this.isDirty = false;  // Tracks unsaved changes
    }

    /**
     * Add a sound to the soundscape
     * @param {string} soundId
     * @param {Object} waypointData - Optional: Full waypoint data
     */
    addSound(soundId, waypointData = null) {
        if (!this.soundIds.includes(soundId)) {
            this.soundIds.push(soundId);
        }
        if (waypointData && !this.waypointData.find(wp => wp.id === soundId)) {
            this.waypointData.push(waypointData);
        }
    }

    /**
     * Remove a sound from the soundscape
     * @param {string} soundId
     */
    removeSound(soundId) {
        this.soundIds = this.soundIds.filter(id => id !== soundId);
        this.waypointData = this.waypointData.filter(wp => wp.id !== soundId);
        // Also remove from any behaviors
        this.behaviors.forEach(b => {
            b.memberIds = b.memberIds.filter(id => id !== soundId);
        });
    }

    /**
     * Add a behavior to the soundscape
     * @param {SoundBehavior} behavior
     */
    addBehavior(behavior) {
        this.behaviors.push(behavior);
    }

    /**
     * Remove a behavior by index
     * @param {number} index
     */
    removeBehavior(index) {
        if (index >= 0 && index < this.behaviors.length) {
            this.behaviors.splice(index, 1);
        }
    }

    /**
     * Serialize to plain object for JSON storage
     * @returns {object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            soundIds: this.soundIds,
            behaviors: this.behaviors.map(b => b.toJSON()),
            waypointData: this.waypointData  // Include full waypoint data
        };
    }

    /**
     * Deserialize from plain object
     * @param {object} data
     * @returns {SoundScape}
     */
    static fromJSON(data) {
        const behaviors = (data.behaviors || []).map(b => SoundBehavior.fromJSON(b));
        return new SoundScape(data.id, data.name, data.soundIds, behaviors, data.waypointData || []);
    }
}

/**
 * BehaviorExecutor - Runtime coordinator for executing behaviors
 *
 * Created at runtime from stored behavior specs.
 * Not persisted - recreated each time soundscape starts.
 */
class BehaviorExecutor {
    /**
     * Factory method: create type-specific executor
     *
     * @param {SoundBehavior|object} spec - Behavior specification
     * @param {Sound[]} sounds - Array of Sound instances
     * @param {SpatialAudioEngine} audioEngine - Audio engine instance
     * @param {Listener} listener - Listener for position tracking (optional, for distance-based effects)
     * @returns {BehaviorExecutor} Type-specific executor
     */
    static create(spec, sounds, audioEngine, listener = null) {
        // Get type from spec (handle both SoundBehavior and plain object)
        const type = spec.type || (spec instanceof SoundBehavior ? spec.type : null);

        switch (type) {
            case 'distance_envelope':
                return new DistanceEnvelopeExecutor(spec, sounds, audioEngine, listener);
            case 'tempo_sync':
                return new TempoSyncExecutor(spec, sounds, audioEngine);
            case 'time_sync':
                return new TimeSyncExecutor(spec, sounds, audioEngine);
            case 'reverb_group':
                return new ReverbGroupExecutor(spec, sounds, audioEngine);
            case 'random_sequence':
                return new RandomSequenceExecutor(spec, sounds, audioEngine);
            case 'volume_group':
                return new VolumeGroupExecutor(spec, sounds, audioEngine);
            case 'filter_group':
                return new FilterGroupExecutor(spec, sounds, audioEngine);
            default:
                // No behavior type or unknown type = default (start all together)
                return new DefaultExecutor(spec, sounds, audioEngine);
        }
    }
}

/**
 * DefaultExecutor - Implicit default behavior (start all sounds together)
 *
 * Used when:
 * - No behaviors specified (empty behaviors array)
 * - Unknown behavior type
 */
class DefaultExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
    }

    /**
     * Start all sounds together
     */
    start() {
        console.log('[BehaviorExecutor] DefaultExecutor: starting all sounds together');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                sound.sourceNode.start();
            }
            sound.isPlaying = true;
        });
    }

    /**
     * Stop all sounds
     */
    stop() {
        console.log('[BehaviorExecutor] DefaultExecutor: stopping all sounds');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
    }
}

/**
 * TempoSyncExecutor - Sync sounds to a beat grid
 *
 * Config:
 * - bpm: Beats per minute (default: 120)
 * - offsets: Array of beat offsets for each member (e.g., [0, 0.5, 1, 1.5])
 * - loop: Whether to loop the pattern (default: true)
 */
class TempoSyncExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.bpm = spec.config?.bpm || 120;
        this.offsets = spec.config?.offsets || [0];
        this.loop = spec.config?.loop !== false;
        this.beatInterval = null;
        this.currentBeat = 0;
    }

    start() {
        const beatTime = 60 / this.bpm;
        console.log(`[BehaviorExecutor] TempoSyncExecutor: starting at ${this.bpm} BPM (beat=${beatTime.toFixed(3)}s)`);

        // Start sounds according to their offsets
        this.offsets.forEach((offset, i) => {
            if (i < this.sounds.length) {
                const delay = offset * beatTime * 1000; // Convert to ms
                setTimeout(() => {
                    const sound = this.sounds[i];
                    if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                        sound.sourceNode.start();
                    }
                    sound.isPlaying = true;
                    console.log(`[BehaviorExecutor] TempoSync: sound ${sound.id} started at offset ${offset}`);
                }, delay);
            }
        });
    }

    stop() {
        console.log('[BehaviorExecutor] TempoSyncExecutor: stopping');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
    }
}

/**
 * TimeSyncExecutor - Start sounds together or with staggered delays
 *
 * Config:
 * - startTime: Absolute start time in ms (default: 0 = immediate)
 * - stagger: Delay between each sound in ms (default: 0 = all together)
 */
class TimeSyncExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.startTime = spec.config?.startTime || 0;
        this.stagger = spec.config?.stagger || 0;
    }

    start() {
        console.log(`[BehaviorExecutor] TimeSyncExecutor: starting (stagger=${this.stagger}ms)`);

        this.sounds.forEach((sound, i) => {
            const delay = this.startTime + (i * this.stagger);
            setTimeout(() => {
                if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                    sound.sourceNode.start();
                }
                sound.isPlaying = true;
                console.log(`[BehaviorExecutor] TimeSync: sound ${sound.id} started (delay=${delay}ms)`);
            }, delay);
        });
    }

    stop() {
        console.log('[BehaviorExecutor] TimeSyncExecutor: stopping');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
    }
}

/**
 * ReverbGroupExecutor - Apply shared reverb to a group of sounds
 *
 * Config:
 * - reverb: Environment preset ('outdoor', 'indoor', 'large', 'cave', 'urban')
 * - mix: Wet/dry mix ratio (0.0 - 1.0, default: 0.3)
 *
 * Note: Currently a placeholder - reverb is handled per-sound in spatial_audio.js
 * Future: Implement shared reverb bus for group processing
 */
class ReverbGroupExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.reverb = spec.config?.reverb || 'outdoor';
        this.mix = spec.config?.mix || 0.3;
    }

    start() {
        console.log(`[BehaviorExecutor] ReverbGroupExecutor: applying ${this.reverb} reverb (mix=${this.mix})`);
        // For now, just start all sounds - reverb is handled per-sound
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                sound.sourceNode.start();
            }
            sound.isPlaying = true;
        });
        // TODO: Future - route all sounds through shared reverb bus
    }

    stop() {
        console.log('[BehaviorExecutor] ReverbGroupExecutor: stopping');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
    }
}

/**
 * RandomSequenceExecutor - Trigger sounds randomly within intervals
 *
 * Config:
 * - interval: Time between triggers in ms (default: 1000)
 * - maxPolyphony: Maximum simultaneous sounds (default: 3)
 * - probability: Chance of trigger per interval (0.0 - 1.0, default: 0.5)
 */
class RandomSequenceExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.interval = spec.config?.interval || 1000;
        this.maxPolyphony = spec.config?.maxPolyphony || 3;
        this.probability = spec.config?.probability || 0.5;
        this.activeSounds = 0;
        this.timer = null;
    }

    start() {
        console.log(`[BehaviorExecutor] RandomSequenceExecutor: starting (interval=${this.interval}ms, maxPolyphony=${this.maxPolyphony})`);

        this.timer = setInterval(() => {
            if (this.activeSounds >= this.maxPolyphony) return;
            if (Math.random() > this.probability) return;

            // Pick a random sound that's not already playing
            const available = this.sounds.filter(s => !s.isPlaying);
            if (available.length === 0) return;

            const sound = available[Math.floor(Math.random() * available.length)];
            if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                sound.sourceNode.start();
            }
            sound.isPlaying = true;
            this.activeSounds++;

            // Stop after a short duration (prevent infinite loop for samples)
            setTimeout(() => {
                if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                    sound.sourceNode.stop();
                }
                sound.isPlaying = false;
                this.activeSounds--;
            }, 500);
        }, this.interval);
    }

    stop() {
        console.log('[BehaviorExecutor] RandomSequenceExecutor: stopping');
        if (this.timer) clearInterval(this.timer);
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
        this.activeSounds = 0;
    }
}

/**
 * VolumeGroupExecutor - Link volume automation across sounds
 *
 * Config:
 * - curve: Volume curve type ('linear', 'exponential', 'logarithmic')
 * - fade: Fade duration in ms (default: 1000)
 * - targetVolume: Target volume (0.0 - 1.0, default: 1.0)
 */
class VolumeGroupExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.curve = spec.config?.curve || 'linear';
        this.fade = spec.config?.fade || 1000;
        this.targetVolume = spec.config?.targetVolume !== undefined ? spec.config.targetVolume : 1.0;
    }

    start() {
        console.log(`[BehaviorExecutor] VolumeGroupExecutor: fading to ${this.targetVolume} over ${this.fade}ms (${this.curve})`);

        // Start all sounds
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                sound.sourceNode.start();
            }
            sound.isPlaying = true;

            // Apply volume fade
            if (sound.gainNode) {
                const startTime = this.audioEngine.ctx.currentTime;
                const endTime = startTime + (this.fade / 1000);

                switch (this.curve) {
                    case 'exponential':
                        sound.gainNode.gain.setValueAtTime(0.001, startTime);
                        sound.gainNode.gain.exponentialRampToValueAtTime(this.targetVolume, endTime);
                        break;
                    case 'logarithmic':
                        sound.gainNode.gain.setValueAtTime(0, startTime);
                        sound.gainNode.gain.linearRampToValueAtTime(this.targetVolume, endTime);
                        break;
                    default: // linear
                        sound.gainNode.gain.setValueAtTime(0, startTime);
                        sound.gainNode.gain.linearRampToValueAtTime(this.targetVolume, endTime);
                }
            }
        });
    }

    stop() {
        console.log('[BehaviorExecutor] VolumeGroupExecutor: stopping');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
    }
}

/**
 * FilterGroupExecutor - Apply shared filter sweep to sounds
 *
 * Config:
 * - filter: Filter type ('lowpass', 'highpass', 'bandpass', 'notch')
 * - frequency: Filter frequency in Hz (default: 1000)
 * - Q: Filter Q/resonance (default: 1)
 * - sweepTo: Target frequency for sweep (default: null = no sweep)
 * - sweepTime: Sweep duration in ms (default: 2000)
 */
class FilterGroupExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.filterType = spec.config?.filter || 'lowpass';
        this.frequency = spec.config?.frequency || 1000;
        this.Q = spec.config?.Q || 1;
        this.sweepTo = spec.config?.sweepTo;
        this.sweepTime = spec.config?.sweepTime || 2000;
    }

    start() {
        console.log(`[BehaviorExecutor] FilterGroupExecutor: applying ${this.filterType} filter @ ${this.frequency}Hz`);

        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.start === 'function') {
                sound.sourceNode.start();
            }
            sound.isPlaying = true;

            // Apply filter if panner exists
            if (sound.pannerNode) {
                // Note: Filter would need to be inserted between gain and panner
                // This is a placeholder for future implementation
                console.log(`[BehaviorExecutor] FilterGroup: sound ${sound.id} ready for filtering`);
            }
        });
        // TODO: Future - implement shared filter bus
    }

    stop() {
        console.log('[BehaviorExecutor] FilterGroupExecutor: stopping');
        this.sounds.forEach(sound => {
            if (sound.sourceNode && typeof sound.sourceNode.stop === 'function') {
                sound.sourceNode.stop();
            }
            sound.isPlaying = false;
        });
    }
}

// =============================================================================
// Distance-Based Effects Framework (Feature 17)
// =============================================================================

/**
 * DistanceEffectCurves - Shared utility for distance-based effect curves
 *
 * Provides curve shaping for smooth, psychoacoustically pleasing transitions.
 * Used by all distance-based effects (envelope, reverb, filter, detune).
 *
 * @example
 * const gain = DistanceEffectCurves.apply(0.5, 'exponential'); // Returns 0.25
 * const value = DistanceEffectCurves.lerp(0, 100, 0.3); // Returns 30
 * const clamped = DistanceEffectCurves.clamp(150, 0, 100); // Returns 100
 */
const DistanceEffectCurves = {
    /**
     * Apply curve shaping to interpolation value
     * @param {number} t - Interpolation value (0.0 - 1.0)
     * @param {string} curve - Curve type ('linear' | 'exponential' | 'logarithmic' | 'easeInOut')
     * @returns {number} Shaped value (0.0 - 1.0)
     */
    apply(t, curve) {
        // Clamp input to valid range
        t = Math.max(0, Math.min(1, t));

        switch (curve) {
            case 'exponential':
                // Slower start, faster end - good for fade-ins
                return Math.pow(t, 2);
            case 'logarithmic':
                // Faster start, slower end - good for fade-outs
                return Math.log(1 + (9 * t)) / Math.log(10);
            case 'easeInOut':
                // Smooth start and end - good for general use
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            case 'linear':
            default:
                return t;
        }
    },

    /**
     * Linear interpolation
     * @param {number} start - Start value
     * @param {number} end - End value
     * @param {number} t - Interpolation value (0.0 - 1.0)
     * @returns {number} Interpolated value
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    },

    /**
     * Clamp value to range
     * @param {number} value - Value to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped value
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
};

/**
 * DistanceBasedEffect - Base class for distance-based audio effects
 *
 * Handles 80% of complexity for all distance-based effects:
 * - Distance calculation with caching (performance optimization)
 * - Parameter smoothing (prevent audio clicks)
 * - Config validation (fail fast on invalid configs)
 * - State cleanup via WeakMap (no memory leaks)
 *
 * Subclass Responsibility (~30 lines):
 * - Override _calculateEffectParams(distance, radius) → effect parameters
 * - Override _applyEffect(sound, params) → apply to AudioParam
 *
 * @example
 * // Distance Envelope Executor
 * class DistanceEnvelopeExecutor extends DistanceBasedEffect {
 *     _calculateEffectParams(distance, radius) {
 *         // Calculate gain based on distance zones
 *         return { gain: 0.8 };
 *     }
 *     _applyEffect(sound, params) {
 *         if (sound.gainNode) {
 *             sound.gainNode.gain.value = params.gain;
 *         }
 *     }
 * }
 *
 * @example
 * // Distance Reverb Executor (future)
 * class DistanceReverbExecutor extends DistanceBasedEffect {
 *     _calculateEffectParams(distance, radius) {
 *         return { wetMix: Math.min(distance / 50, 0.8) };
 *     }
 *     _applyEffect(sound, params) {
 *         sound.wetGain.gain.value = params.wetMix;
 *     }
 * }
 */
class DistanceBasedEffect {
    /**
     * @param {SoundBehavior|object} spec - Behavior specification
     * @param {Sound[]} sounds - Array of Sound instances to affect
     * @param {SpatialAudioEngine} audioEngine - Audio engine instance
     * @param {Listener} listener - Listener for position tracking
     */
    constructor(spec, sounds, audioEngine, listener) {
        // Validate config at construction (fail fast)
        this._validateConfig(spec);

        this.spec = spec;
        this.sounds = sounds;
        this.engine = audioEngine;
        this.listener = listener;
        this.config = spec.config;

        // State tracking (WeakMap - auto cleanup when sound disposed)
        this._state = new WeakMap();

        // Distance caching (performance optimization)
        // Avoids recalculating distances when listener is stationary
        this._lastListenerPos = null;
        this._distanceCache = new Map();  // soundId → distance (meters)
        this._stationaryThreshold = 0.1;  // meters - consider stationary if moved < 10cm
    }

    /**
     * Validate config - override in subclasses for effect-specific validation
     * @param {object} spec - Behavior specification
     * @protected
     */
    _validateConfig(spec) {
        if (!spec || !spec.config) {
            throw new Error('DistanceBasedEffect requires spec.config');
        }
        if (!spec.memberIds || !Array.isArray(spec.memberIds)) {
            throw new Error('DistanceBasedEffect requires memberIds array');
        }
    }

    /**
     * Update all sounds based on current listener position
     * Called every frame (~60fps) from SpatialAudioApp._updateSoundPositions()
     *
     * Performance optimizations:
     * - Cache distances when listener stationary (< 10cm movement)
     * - Skip disposed/unloaded sounds
     * - Batch AudioParam updates
     */
    update() {
        if (!this.listener) {
            return;
        }

        // Check if listener moved enough to invalidate distance cache
        const moved = this._checkListenerMovement();

        this.sounds.forEach(sound => {
            // Skip unloaded or disposed sounds
            if (!sound.isLoaded || sound.isDisposed) {
                return;
            }

            // Get cached or fresh distance
            const distance = moved
                ? this._updateDistance(sound)
                : this._getCachedDistance(sound);

            // Calculate effect parameters based on distance
            const params = this._calculateEffectParams(distance, sound.activationRadius);

            // Apply effect to sound
            this._applyEffect(sound, params);
        });
    }

    /**
     * Check if listener moved enough to invalidate distance cache
     * @returns {boolean} True if listener moved beyond threshold
     * @protected
     */
    _checkListenerMovement() {
        const currentPos = { lat: this.listener.lat, lon: this.listener.lon };

        if (!this._lastListenerPos) {
            this._lastListenerPos = currentPos;
            return true;  // First update - always calculate
        }

        const distance = GPSUtils.distance(
            this._lastListenerPos.lat,
            this._lastListenerPos.lon,
            currentPos.lat,
            currentPos.lon
        );

        // If moved less than threshold, consider stationary
        if (distance < this._stationaryThreshold) {
            return false;  // Listener stationary - use cache
        }

        this._lastListenerPos = currentPos;
        return true;  // Listener moved - refresh cache
    }

    /**
     * Update distance cache for a sound
     * @param {Sound} sound - Sound object
     * @returns {number} Distance in meters
     * @protected
     */
    _updateDistance(sound) {
        const distance = GPSUtils.distance(
            this.listener.lat,
            this.listener.lon,
            sound.lat,
            sound.lon
        );
        this._distanceCache.set(sound.id, distance);
        return distance;
    }

    /**
     * Get cached distance for a sound
     * @param {Sound} sound - Sound object
     * @returns {number} Distance in meters
     * @protected
     */
    _getCachedDistance(sound) {
        return this._distanceCache.get(sound.id) || 0;
    }

    /**
     * Get or create state for a sound (used for smoothing)
     * @param {Sound} sound - Sound object
     * @returns {object} State object with lastParams and smoothedParams
     * @protected
     */
    _getState(sound) {
        if (!this._state.has(sound)) {
            this._state.set(sound, { lastParams: {}, smoothedParams: {} });
        }
        return this._state.get(sound);
    }

    /**
     * Calculate effect parameters based on distance
     * OVERRIDE THIS in subclasses!
     *
     * @param {number} distance - Distance to sound (meters)
     * @param {number} radius - Activation radius (meters)
     * @returns {object} Effect parameters (effect-specific)
     * @protected
     */
    _calculateEffectParams(distance, radius) {
        throw new Error('Subclasses must override _calculateEffectParams');
    }

    /**
     * Apply effect parameters to sound
     * OVERRIDE THIS in subclasses!
     *
     * @param {Sound} sound - Sound object
     * @param {object} params - Effect parameters
     * @protected
     */
    _applyEffect(sound, params) {
        throw new Error('Subclasses must override _applyEffect');
    }

    /**
     * Apply smoothing to parameters (prevent audio clicks)
     * @param {Sound} sound - Sound object
     * @param {object} targetParams - Target parameters
     * @param {number} smoothing - Smoothing factor (0-1, higher = faster)
     * @returns {object} Smoothed parameters
     * @protected
     */
    _applySmoothing(sound, targetParams, smoothing = 0.1) {
        const state = this._getState(sound);
        const smoothed = {};

        for (const [key, value] of Object.entries(targetParams)) {
            const lastValue = state.lastParams[key] ?? value;
            smoothed[key] = lastValue + (value - lastValue) * smoothing;
            state.lastParams[key] = smoothed[key];
        }

        return smoothed;
    }

    /**
     * Cleanup when soundscape stops
     * Clears distance cache and state (prevent memory leaks)
     */
    stop() {
        this._distanceCache.clear();
        this._state = new WeakMap();
        this._lastListenerPos = null;
    }
}

// Export to global scope
window.SoundScape = SoundScape;
window.SoundBehavior = SoundBehavior;
window.BehaviorExecutor = BehaviorExecutor;
window.DefaultExecutor = DefaultExecutor;
window.TempoSyncExecutor = TempoSyncExecutor;
window.TimeSyncExecutor = TimeSyncExecutor;
window.ReverbGroupExecutor = ReverbGroupExecutor;
window.RandomSequenceExecutor = RandomSequenceExecutor;
window.VolumeGroupExecutor = VolumeGroupExecutor;
window.FilterGroupExecutor = FilterGroupExecutor;
// Distance-Based Effects Framework (Feature 17)
window.DistanceEffectCurves = DistanceEffectCurves;
window.DistanceBasedEffect = DistanceBasedEffect;

// =============================================================================
// localStorage Persistence Helpers
// =============================================================================

/**
 * SoundScapeStorage - localStorage persistence for soundscapes
 *
 * Usage:
 *   SoundScapeStorage.save(soundscape, waypoints);
 *   const data = SoundScapeStorage.load();
 *   SoundScapeStorage.export(soundscape, waypoints, filename);
 *   SoundScapeStorage.import(file, callback);
 *
 * Session 5A: Multi-Soundscape Support
 *   SoundScapeStorage.getAll();
 *   SoundScapeStorage.saveAll(soundscapes, activeId);
 *   SoundScapeStorage.createDefault();
 */
class SoundScapeStorage {
    static STORAGE_KEY = 'soundscape_config';  // Legacy: single soundscape
    static MULTI_STORAGE_KEY = 'soundscapes';  // Session 5A: multiple soundscapes

    /**
     * Save soundscape and waypoints to localStorage
     * @param {SoundScape} soundscape - Soundscape to save
     * @param {Object[]} waypoints - Array of waypoint objects
     */
    static save(soundscape, waypoints) {
        const data = {
            version: '3.0',
            updatedAt: new Date().toISOString(),
            soundscape: soundscape.toJSON(),
            waypoints: waypoints
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        console.log('[SoundScapeStorage] Saved to localStorage:', soundscape.name);
    }

    /**
     * Load soundscape and waypoints from localStorage
     * @returns {{soundscape: SoundScape, waypoints: Object[]}|null}
     */
    static load() {
        const json = localStorage.getItem(this.STORAGE_KEY);
        if (!json) {
            console.log('[SoundScapeStorage] No saved config found');
            return null;
        }

        try {
            const data = JSON.parse(json);
            const soundscape = SoundScape.fromJSON(data.soundscape);
            console.log('[SoundScapeStorage] Loaded from localStorage:', soundscape.name);
            return {
                soundscape: soundscape,
                waypoints: data.waypoints || []
            };
        } catch (error) {
            console.error('[SoundScapeStorage] Failed to load:', error);
            return null;
        }
    }

    /**
     * Check if config exists in localStorage
     * @returns {boolean}
     */
    static exists() {
        return !!localStorage.getItem(this.STORAGE_KEY);
    }

    /**
     * Clear saved config from localStorage
     */
    static clear() {
        localStorage.removeItem(this.STORAGE_KEY);
        console.log('[SoundScapeStorage] Cleared localStorage');
    }

    /**
     * Export soundscape as JSON file download
     * @param {SoundScape} soundscape - Soundscape to export
     * @param {Object[]} waypoints - Array of waypoint objects
     * @param {string} filename - Optional custom filename
     */
    static export(soundscape, waypoints, filename = null) {
        const data = {
            version: '3.0',
            exportedAt: new Date().toISOString(),
            soundscape: soundscape.toJSON(),
            waypoints: waypoints
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `soundscape_${soundscape.id}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('[SoundScapeStorage] Exported:', a.download);
    }

    /**
     * Import soundscape from JSON file
     * @param {File} file - JSON file to import
     * @param {function({soundscape: SoundScape, waypoints: Object[]})} callback - Callback with imported data
     */
    static import(file, callback) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const soundscape = SoundScape.fromJSON(data.soundscape);
                callback({
                    soundscape: soundscape,
                    waypoints: data.waypoints || []
                });
                console.log('[SoundScapeStorage] Imported:', soundscape.name);
            } catch (error) {
                console.error('[SoundScapeStorage] Import failed:', error);
                callback(null, error);
            }
        };
        reader.readAsText(file);
    }

    // =============================================================================
    // Session 5A: Multi-Soundscape Storage Methods
    // =============================================================================

    /**
     * Get all soundscapes and active selection from localStorage
     * Session 5B: Added migration from single-soundscape format
     * @returns {{activeId: string|null, soundscapes: SoundScape[]}|null}
     */
    static getAll() {
        // Try multi-soundscape format first
        let json = localStorage.getItem(this.MULTI_STORAGE_KEY);

        if (!json) {
            // Migration: Check for old single-soundscape format
            const oldJson = localStorage.getItem(this.STORAGE_KEY);
            if (oldJson) {
                console.log('[SoundScapeStorage] Migrating from single-soundscape format...');
                try {
                    const oldData = JSON.parse(oldJson);
                    if (oldData.soundscape && oldData.waypoints) {
                        const soundscape = SoundScape.fromJSON(oldData.soundscape);
                        // Migrate to multi-soundscape format
                        this.saveAll([soundscape], soundscape.id);
                        // Clear old format
                        localStorage.removeItem(this.STORAGE_KEY);
                        console.log('[SoundScapeStorage] Migration complete');
                        return {
                            activeId: soundscape.id,
                            soundscapes: [soundscape]
                        };
                    }
                } catch (error) {
                    console.error('[SoundScapeStorage] Migration failed:', error);
                }
            }
            console.log('[SoundScapeStorage] No multi-soundscape config found');
            return null;
        }

        try {
            const data = JSON.parse(json);
            console.log('[SoundScapeStorage] Raw loaded data:', data);
            const soundscapes = (data.soundscapes || []).map(s => {
                console.log('[SoundScapeStorage] Converting soundscape:', s);
                const converted = SoundScape.fromJSON(s);
                console.log('[SoundScapeStorage] Converted to SoundScape:', converted, 'has addSound:', typeof converted.addSound);
                return converted;
            });
            console.log(`[SoundScapeStorage] Loaded ${soundscapes.length} soundscapes`);
            return {
                activeId: data.activeId || null,
                soundscapes: soundscapes
            };
        } catch (error) {
            console.error('[SoundScapeStorage] Failed to load all:', error);
            return null;
        }
    }

    /**
     * Save all soundscapes and active selection to localStorage
     * @param {SoundScape[]} soundscapes - Array of all soundscapes
     * @param {string} activeId - ID of currently selected soundscape
     */
    static saveAll(soundscapes, activeId) {
        console.log('[SoundScapeStorage] saveAll called with:', soundscapes);
        soundscapes.forEach((s, i) => {
            console.log(`[SoundScapeStorage] soundscape[${i}]:`, s, 'has toJSON:', typeof s.toJSON);
        });
        
        const data = {
            version: '5.0',
            updatedAt: new Date().toISOString(),
            activeId: activeId,
            soundscapes: soundscapes.map(s => {
                if (typeof s.toJSON !== 'function') {
                    console.error('[SoundScapeStorage] Invalid soundscape - no toJSON method:', s);
                    // If it's already a plain object, use it directly
                    return s;
                }
                return s.toJSON();
            })
        };
        localStorage.setItem(this.MULTI_STORAGE_KEY, JSON.stringify(data));
        console.log(`[SoundScapeStorage] Saved ${soundscapes.length} soundscapes (active: ${activeId})`);
    }

    /**
     * Create default empty soundscape on fresh install
     * @returns {{soundscape: SoundScape, activeId: string}}
     */
    static createDefault() {
        const id = 'soundscape_' + Date.now();
        const soundscape = new SoundScape(id, 'My Soundscape', [], [], []);
        
        const data = {
            version: '5.0',
            updatedAt: new Date().toISOString(),
            activeId: id,
            soundscapes: [soundscape.toJSON()]
        };
        localStorage.setItem(this.MULTI_STORAGE_KEY, JSON.stringify(data));
        console.log('[SoundScapeStorage] Created default soundscape:', id);
        
        return {
            soundscape: soundscape,
            activeId: id
        };
    }

    /**
     * Check if multi-soundscape config exists in localStorage
     * @returns {boolean}
     */
    static exists() {
        return !!localStorage.getItem(this.MULTI_STORAGE_KEY);
    }

    /**
     * Get the active soundscape ID
     * @returns {string|null}
     */
    static getActiveId() {
        const json = localStorage.getItem(this.MULTI_STORAGE_KEY);
        if (!json) return null;
        try {
            const data = JSON.parse(json);
            return data.activeId || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Set the active soundscape ID
     * @param {string} activeId - ID to set as active
     */
    static setActiveId(activeId) {
        const json = localStorage.getItem(this.MULTI_STORAGE_KEY);
        if (!json) return;
        
        try {
            const data = JSON.parse(json);
            data.activeId = activeId;
            data.updatedAt = new Date().toISOString();
            localStorage.setItem(this.MULTI_STORAGE_KEY, JSON.stringify(data));
            console.log('[SoundScapeStorage] Set active soundscape:', activeId);
        } catch (error) {
            console.error('[SoundScapeStorage] Failed to set active:', error);
        }
    }

    /**
     * Delete a soundscape by ID
     * @param {string} id - ID of soundscape to delete
     * @returns {boolean} - True if deleted, false if not found
     */
    static delete(id) {
        const data = this.getAll();
        if (!data) return false;

        const beforeCount = data.soundscapes.length;
        data.soundscapes = data.soundscapes.filter(s => s.id !== id);
        
        if (data.soundscapes.length === beforeCount) {
            console.log('[SoundScapeStorage] Soundscape not found:', id);
            return false;
        }

        // If deleted active, set new active
        if (data.activeId === id) {
            data.activeId = data.soundscapes.length > 0 ? data.soundscapes[0].id : null;
        }

        this.saveAll(data.soundscapes, data.activeId);
        console.log('[SoundScapeStorage] Deleted soundscape:', id);
        return true;
    }

    /**
     * Clear all multi-soundscape data from localStorage
     */
    static clearAll() {
        localStorage.removeItem(this.MULTI_STORAGE_KEY);
        console.log('[SoundScapeStorage] Cleared all multi-soundscape data');
    }
}

// Export storage helper
window.SoundScapeStorage = SoundScapeStorage;

console.log('[soundscape.js] ✅ Loaded - SoundScape architecture ready (v5.0 with multi-soundscape support)');

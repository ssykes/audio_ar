/**
 * SoundScape Architecture
 * Core classes for managing spatial audio experiences
 *
 * @version 3.0 - SoundScape Persistence Support
 * @changelog
 *   v1.0 - SoundScape, SoundBehavior, BehaviorExecutor classes
 *   v3.0 - Added waypointData persistence, SoundScapeStorage
 *
 * Architecture:
 * - SoundScape: Persisted container with soundIds and behaviors
 * - SoundBehavior: Data spec (type, memberIds, config)
 * - BehaviorExecutor: Runtime coordinator (not persisted)
 *
 * Data Flow:
 *   PC Editor → SoundScape → localStorage → Phone Player → BehaviorExecutor → Audio
 */

console.log('[soundscape.js] Loading v3.0...');

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
 * - areas: Array of area data for polygon sound zones (Feature 17)
 *
 * This allows the soundscape to be fully self-contained for persistence and export.
 * The MapPlacerApp maintains the authoritative waypoint list during editing.
 */
class SoundScape {
    /**
     * @param {string} id - Unique identifier
     * @param {string} name - Human-readable name
     * @param {string} description - Soundscape description
     * @param {boolean} isPublic - Whether soundscape is public
     * @param {string[]} soundIds - Array of waypoint IDs
     * @param {SoundBehavior[]} behaviors - Array of behavior specifications
     * @param {Object[]} waypointData - Optional: Full waypoint data for persistence
     * @param {Object[]} areas - Optional: Full area data for polygon zones
     */
    constructor(id, name, description = '', isPublic = true, soundIds = [], behaviors = [], waypointData = [], areas = []) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.isPublic = isPublic;
        this.soundIds = soundIds;
        this.behaviors = behaviors;
        this.waypointData = waypointData;  // Full waypoint data for persistence
        this.areas = areas;  // Full area data for polygon zones (Feature 17)

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

    // =============================================================================
    // Feature 17: Area Management (Polygon Sound Zones)
    // =============================================================================

    /**
     * Add an area to the soundscape
     * @param {Object} areaData - Area data {id, name, polygon, soundUrl, volume, etc.}
     */
    addArea(areaData) {
        if (!this.areas.find(a => a.id === areaData.id)) {
            this.areas.push(areaData);
            this.isDirty = true;
        }
    }

    /**
     * Update an area in the soundscape
     * @param {string} areaId - Area ID to update
     * @param {Object} updates - Fields to update
     */
    updateArea(areaId, updates) {
        const area = this.areas.find(a => a.id === areaId);
        if (area) {
            Object.assign(area, updates);
            this.isDirty = true;
        }
    }

    /**
     * Remove an area from the soundscape
     * @param {string} areaId - Area ID to remove
     */
    deleteArea(areaId) {
        const index = this.areas.findIndex(a => a.id === areaId);
        if (index >= 0) {
            this.areas.splice(index, 1);
            this.isDirty = true;
        }
    }

    /**
     * Get all areas
     * @returns {Object[]} Array of area data
     */
    getAreas() {
        return this.areas.slice();  // Return copy
    }

    /**
     * Get single area by ID
     * @param {string} areaId
     * @returns {Object|null}
     */
    getArea(areaId) {
        return this.areas.find(a => a.id === areaId) || null;
    }

    /**
     * Serialize to plain object for JSON storage
     * @returns {object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            isPublic: this.isPublic,
            soundIds: this.soundIds,
            behaviors: this.behaviors.map(b => b.toJSON()),
            waypointData: this.waypointData,  // Include full waypoint data
            areas: this.areas  // Include full area data (Feature 17)
        };
    }

    /**
     * Deserialize from plain object
     * @param {object} data
     * @returns {SoundScape}
     */
    static fromJSON(data) {
        const behaviors = (data.behaviors || []).map(b => SoundBehavior.fromJSON(b));
        console.log('[SoundScape.fromJSON] Input data:', {
            id: data.id,
            name: data.name,
            description: data.description,
            isPublic: data.isPublic
        });
        const result = new SoundScape(
            data.id,
            data.name,
            data.description || '',
            data.isPublic ?? true,
            data.soundIds,
            behaviors,
            data.waypointData || [],
            data.areas || []  // Load areas (Feature 17)
        );
        console.log('[SoundScape.fromJSON] Created:', {
            id: result.id,
            name: result.name,
            isPublic: result.isPublic
        });
        return result;
    }
}

/**
 * Start one member of a behavior.
 *
 * Executors used to reach straight into the audio node and then mark the member as
 * playing whether or not anything had actually started. Two consequences. A member
 * that was loaded but whose audio failed to start was reported as performing, and the
 * distance-zone logic skips anything it believes is already playing -- so it was never
 * retried and stayed silent for the rest of the session. And a member that *was*
 * playing got started a second time, which tears down its buffer and rebuilds it at
 * zero gain, so every behavior audibly dipped the group it was supposed to coordinate.
 *
 * Loading, gain and the distance model all belong to the app layer, so the app supplies
 * them as hooks and this only reports what happened. Without hooks there is no safe way
 * to start anything: nothing is started and no flag is touched, which leaves the member
 * free to be started normally when the walker reaches it.
 *
 * @param {object} sound - The member
 * @param {object|null} hooks - App-supplied start/stop
 * @returns {boolean} True only if the member is genuinely sounding
 */
function startBehaviorMember(sound, hooks) {
    if (!sound) return false;
    if (!hooks || typeof hooks.start !== 'function') {
        if (!startBehaviorMember.warned) {
            startBehaviorMember.warned = true;
            console.warn('[BehaviorExecutor] No start hook supplied by the app - members will be left for the distance-zone logic to start');
        }
        return false;
    }
    return hooks.start(sound) === true;
}

/**
 * Stop one member of a behavior. Safe to call on a member that never started.
 *
 * @param {object} sound - The member
 * @param {object|null} hooks - App-supplied start/stop
 */
function stopBehaviorMember(sound, hooks) {
    if (!sound) return;
    if (!hooks || typeof hooks.stop !== 'function') {
        sound.isPlaying = false;
        return;
    }
    hooks.stop(sound);
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
     * @param {{start: Function, stop: Function}} [hooks] - App-supplied member start/stop
     * @returns {BehaviorExecutor} Type-specific executor
     */
    static create(spec, sounds, audioEngine, hooks) {
        // Get type from spec (handle both SoundBehavior and plain object)
        const type = spec.type || (spec instanceof SoundBehavior ? spec.type : null);

        switch (type) {
            case 'tempo_sync':
                return new TempoSyncExecutor(spec, sounds, audioEngine, hooks);
            case 'time_sync':
                return new TimeSyncExecutor(spec, sounds, audioEngine, hooks);
            case 'reverb_group':
                return new ReverbGroupExecutor(spec, sounds, audioEngine, hooks);
            case 'random_sequence':
                return new RandomSequenceExecutor(spec, sounds, audioEngine, hooks);
            case 'volume_group':
                return new VolumeGroupExecutor(spec, sounds, audioEngine, hooks);
            case 'filter_group':
                return new FilterGroupExecutor(spec, sounds, audioEngine, hooks);
            default:
                // No behavior type or unknown type = default (start all together)
                return new DefaultExecutor(spec, sounds, audioEngine, hooks);
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
    }

    /**
     * Start all sounds together
     */
    start() {
        console.log('[BehaviorExecutor] DefaultExecutor: starting all sounds together');
        this.sounds.forEach(sound => startBehaviorMember(sound, this.hooks));
    }

    /**
     * Stop all sounds
     */
    stop() {
        console.log('[BehaviorExecutor] DefaultExecutor: stopping all sounds');
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
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
                    const started = startBehaviorMember(sound, this.hooks);
                    console.log(`[BehaviorExecutor] TempoSync: sound ${sound.id} at offset ${offset} ${started ? 'started' : 'not started - left for the distance-zone logic'}`);
                }, delay);
            }
        });
    }

    stop() {
        console.log('[BehaviorExecutor] TempoSyncExecutor: stopping');
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
        this.startTime = spec.config?.startTime || 0;
        this.stagger = spec.config?.stagger || 0;
    }

    start() {
        console.log(`[BehaviorExecutor] TimeSyncExecutor: starting (stagger=${this.stagger}ms)`);

        this.sounds.forEach((sound, i) => {
            const delay = this.startTime + (i * this.stagger);
            setTimeout(() => {
                const started = startBehaviorMember(sound, this.hooks);
                console.log(`[BehaviorExecutor] TimeSync: sound ${sound.id} (delay=${delay}ms) ${started ? 'started' : 'not started - left for the distance-zone logic'}`);
            }, delay);
        });
    }

    stop() {
        console.log('[BehaviorExecutor] TimeSyncExecutor: stopping');
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
        this.reverb = spec.config?.reverb || 'outdoor';
        this.mix = spec.config?.mix || 0.3;
    }

    start() {
        console.log(`[BehaviorExecutor] ReverbGroupExecutor: applying ${this.reverb} reverb (mix=${this.mix})`);
        // For now, just start all sounds - reverb is handled per-sound
        this.sounds.forEach(sound => startBehaviorMember(sound, this.hooks));
        // TODO: Future - route all sounds through shared reverb bus
    }

    stop() {
        console.log('[BehaviorExecutor] ReverbGroupExecutor: stopping');
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
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
            // Only count and schedule a release for a member that really started. Counting
            // one that did not would leave it flagged as playing, shrinking the pool it is
            // drawn from until the sequence runs out of members to choose.
            if (!startBehaviorMember(sound, this.hooks)) return;
            this.activeSounds++;

            // Stop after a short duration (prevent infinite loop for samples)
            setTimeout(() => {
                stopBehaviorMember(sound, this.hooks);
                this.activeSounds--;
            }, 500);
        }, this.interval);
    }

    stop() {
        console.log('[BehaviorExecutor] RandomSequenceExecutor: stopping');
        if (this.timer) clearInterval(this.timer);
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
        this.curve = spec.config?.curve || 'linear';
        this.fade = spec.config?.fade || 1000;
        this.targetVolume = spec.config?.targetVolume !== undefined ? spec.config.targetVolume : 1.0;
    }

    start() {
        console.log(`[BehaviorExecutor] VolumeGroupExecutor: fading to ${this.targetVolume} over ${this.fade}ms (${this.curve})`);

        // Start all sounds
        this.sounds.forEach(sound => {
            if (!startBehaviorMember(sound, this.hooks)) return;

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
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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
    constructor(spec, sounds, audioEngine, hooks) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
        this.hooks = hooks || null;
        this.filterType = spec.config?.filter || 'lowpass';
        this.frequency = spec.config?.frequency || 1000;
        this.Q = spec.config?.Q || 1;
        this.sweepTo = spec.config?.sweepTo;
        this.sweepTime = spec.config?.sweepTime || 2000;
    }

    start() {
        console.log(`[BehaviorExecutor] FilterGroupExecutor: applying ${this.filterType} filter @ ${this.frequency}Hz`);

        this.sounds.forEach(sound => {
            if (!startBehaviorMember(sound, this.hooks)) return;

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
        this.sounds.forEach(sound => stopBehaviorMember(sound, this.hooks));
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

console.log('[soundscape.js] ✅ Loaded - SoundScape architecture ready (v5.0 with multi-soundscape support)');

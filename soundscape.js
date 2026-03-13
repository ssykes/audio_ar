/**
 * SoundScape Architecture
 * Core classes for managing spatial audio experiences
 *
 * @version 1.0 - Initial implementation (Phase 1)
 * @changelog
 *   v1.0 - SoundScape, SoundBehavior, BehaviorExecutor classes
 *
 * Architecture:
 * - SoundScape: Persisted container with soundIds and behaviors
 * - SoundBehavior: Data spec (type, memberIds, config)
 * - BehaviorExecutor: Runtime coordinator (not persisted)
 *
 * Data Flow:
 *   PC Editor → SoundScape → localStorage → Phone Player → BehaviorExecutor → Audio
 */

console.log('[soundscape.js] Loading v1.0...');

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
 * Contains all sound waypoint IDs and their behaviors.
 * Empty behaviors array = start all sounds together (implicit default).
 */
class SoundScape {
    /**
     * @param {string} id - Unique identifier
     * @param {string} name - Human-readable name
     * @param {string[]} soundIds - Array of waypoint IDs
     * @param {SoundBehavior[]} behaviors - Array of behavior specifications
     */
    constructor(id, name, soundIds = [], behaviors = []) {
        this.id = id;
        this.name = name;
        this.soundIds = soundIds;
        this.behaviors = behaviors;
    }

    /**
     * Add a sound to the soundscape
     * @param {string} soundId
     */
    addSound(soundId) {
        if (!this.soundIds.includes(soundId)) {
            this.soundIds.push(soundId);
        }
    }

    /**
     * Remove a sound from the soundscape
     * @param {string} soundId
     */
    removeSound(soundId) {
        this.soundIds = this.soundIds.filter(id => id !== soundId);
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
            behaviors: this.behaviors.map(b => b.toJSON())
        };
    }

    /**
     * Deserialize from plain object
     * @param {object} data
     * @returns {SoundScape}
     */
    static fromJSON(data) {
        const behaviors = data.behaviors.map(b => SoundBehavior.fromJSON(b));
        return new SoundScape(data.id, data.name, data.soundIds, behaviors);
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
     * @returns {BehaviorExecutor} Type-specific executor
     */
    static create(spec, sounds, audioEngine) {
        // Get type from spec (handle both SoundBehavior and plain object)
        const type = spec.type || (spec instanceof SoundBehavior ? spec.type : null);

        switch (type) {
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

console.log('[soundscape.js] ✅ Loaded - SoundScape architecture ready');

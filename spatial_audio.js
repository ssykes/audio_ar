/**
 * Spatial Audio GPS System
 * Reusable library for spatial audio with GPS positioning
 *
 * @version 5.0 (Reverb Zones - distance-based wet/dry mix)
 */

console.log('[spatial_audio.js] Loading v5.0...');

/**
 * GPS Utility Functions
 */
const GPSUtils = {
    toMeters(lat, lon, refLat, refLon) {
        const dLat = lat - refLat;
        const dLon = lon - refLon;
        const x = dLon * 111000 * Math.cos(refLat * Math.PI / 180);
        const z = dLat * 111000;
        return { x, z };
    },

    distance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + 
                  Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    bearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },

    /**
     * Place a sound at specified distance and direction from listener
     * @param {number} listenerLat - Listener latitude
     * @param {number} listenerLon - Listener longitude
     * @param {number} distance - Distance in meters
     * @param {number} direction - Direction in degrees (0=North, 90=East, etc.)
     * @returns {{lat: number, lon: number}} Sound GPS position
     */
    placeSound(listenerLat, listenerLon, distance, direction) {
        const dirRad = direction * Math.PI / 180;
        const dLat = (distance * Math.cos(dirRad)) / 111000;
        const dLon = (distance * Math.sin(dirRad)) / (111000 * Math.cos(listenerLat * Math.PI / 180));
        return {
            lat: listenerLat + dLat,
            lon: listenerLon + dLon
        };
    },

    /**
     * Calculate relative bearing (adjusted for user heading)
     * @param {number} bearing - Absolute bearing (0-360°)
     * @param {number} heading - User heading (0-360°)
     * @returns {number} Relative bearing (0-360°)
     */
    relativeBearing(bearing, heading) {
        return (bearing - heading + 360) % 360;
    }
};

/**
 * EngineListener - Represents the person experiencing the audio (engine-level)
 * Internal to spatial_audio.js - not exported to window
 */
class EngineListener {
    constructor() {
        this.lat = null;
        this.lon = null;
        this.heading = 0;
        this.prevLat = null;
        this.prevLon = null;
    }

    update(lat, lon, heading = null) {
        this.prevLat = this.lat;
        this.prevLon = this.lon;
        this.lat = lat;
        this.lon = lon;
        if (heading !== null) this.heading = heading;
    }

    getDelta() {
        if (this.prevLat === null || this.prevLon === null) {
            return { dx: 0, dz: 0 };
        }
        const dLat = this.lat - this.prevLat;
        const dLon = this.lon - this.prevLon;
        const dx = dLon * 111000 * Math.cos(this.lat * Math.PI / 180);
        const dz = dLat * 111000;
        return { dx, dz };
    }

    getHeadingRad() {
        return this.heading * Math.PI / 180;
    }
}

/**
 * SoundSource - Base class for all sound emitters
 */
class SoundSource {
    constructor(engine, id, options = {}) {
        this.engine = engine;
        this.id = id;
        this.options = options;
        this.x = options.x || 0;
        this.z = options.z || 0;
        this.fixed = options.fixed || false;
        this.gain = null;
        this.panner = null;
        this.isPlaying = false;
        
        // Reverb wet/dry mix nodes
        this.dryGain = null;
        this.wetGain = null;
        this.currentWetValue = 0;
    }

    init() {
        this.gain = this.engine.ctx.createGain();
        this.gain.gain.value = this.options.gain || 0.3;
        
        // Create wet/dry split for reverb
        this.dryGain = this.engine.ctx.createGain();
        this.wetGain = this.engine.ctx.createGain();
        this.dryGain.gain.value = 1.0;  // Start fully dry
        this.wetGain.gain.value = 0.0;
        
        this.panner = this.engine.ctx.createPanner();
        this.panner.panningModel = 'HRTF';
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 1;
        this.panner.maxDistance = 10000;
        this.panner.rolloffFactor = 1;
        this.setPosition(this.x, this.z);
    }

    setPosition(x, z) {
        this.x = x;
        this.z = z;
        if (this.panner) {
            const t = this.engine.ctx.currentTime;
            this.panner.positionX.cancelScheduledValues(t);
            this.panner.positionZ.cancelScheduledValues(t);
            this.panner.positionX.setValueAtTime(x, t);
            this.panner.positionZ.setValueAtTime(z, t);
        }
    }

    moveAlongPath(pathFn, duration) {
        if (!this.panner) return;
        const t0 = this.engine.ctx.currentTime;
        const points = 128;
        for (let i = 0; i <= points; i++) {
            const t = t0 + (i / points) * duration;
            const pos = pathFn(i / points);
            this.panner.positionX.setValueAtTime(pos.x, t);
            this.panner.positionZ.setValueAtTime(pos.z, t);
        }
    }

    start() { this.isPlaying = true; }
    stop() { this.isPlaying = false; }

    dispose() {
        this.stop();
        if (this.gain) { this.gain.disconnect(); this.gain = null; }
        if (this.dryGain) { this.dryGain.disconnect(); this.dryGain = null; }
        if (this.wetGain) { this.wetGain.disconnect(); this.wetGain = null; }
        if (this.panner) { this.panner.disconnect(); this.panner = null; }
    }
}

/**
 * OscillatorSource - Simple single oscillator tone generator
 */
class OscillatorSource extends SoundSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.oscillator = null;
    }

    init() {
        super.init();
        this.oscillator = this.engine.ctx.createOscillator();
        this.oscillator.type = this.options.wave || 'sine';
        this.oscillator.frequency.value = this.options.freq || 440;
        this.oscillator.connect(this.gain);

        // Split signal into dry and wet paths
        this.gain.connect(this.dryGain);
        this.gain.connect(this.wetGain);

        // Dry goes to panner (spatialized)
        this.dryGain.connect(this.panner);
        this.panner.connect(this.engine.masterGain);

        // Wet goes to reverb ONLY if reverb is enabled
        if (this.engine.reverbEnabled && this.engine.reverb) {
            this.wetGain.connect(this.engine.reverb);
            // Reverb already connected to masterGain in engine.init()
        } else {
            // Reverb disabled - mute wet path to prevent signal loss
            this.wetGain.gain.value = 0;
        }
    }

    start() {
        if (this.oscillator && !this.isPlaying) {
            this.oscillator.start();
            super.start();
        }
    }

    stop() {
        if (this.oscillator && this.isPlaying) {
            this.oscillator.stop(this.engine.ctx.currentTime + 0.05);
            super.stop();
        }
    }

    setFrequency(freq) {
        if (this.oscillator) {
            this.oscillator.frequency.setValueAtTime(freq, this.engine.ctx.currentTime);
        }
    }
}

/**
 * GpsSoundSource - Sound source fixed at GPS coordinates
 */
class GpsSoundSource extends OscillatorSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.gpsLat = options.lat || 0;
        this.gpsLon = options.lon || 0;
        this.activationRadius = options.activationRadius || 20;
        this.fixed = true;
    }

    /**
     * Update position based on listener movement (NOT heading)
     * Heading rotation is handled by AudioContext listener
     * @param {number} listenerLat 
     * @param {number} listenerLon 
     * @param {number} listenerHeading - Ignored for position, used for logging
     */
    updatePosition(listenerLat, listenerLon, listenerHeading) {
        // Convert GPS to local coordinates (x, z)
        // No rotation - let AudioContext listener handle orientation
        const { x, z } = GPSUtils.toMeters(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
        this.setPosition(x, z);

        // Debug: Log position updates (throttled)
        if (Math.random() < 0.05) {
            console.log(`[Audio] Panner: x=${x.toFixed(1)}m, z=${z.toFixed(1)}m (listener heading=${listenerHeading.toFixed(0)}°)`);
        }
    }

    getDistance(listenerLat, listenerLon) {
        return GPSUtils.distance(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
    }

    updateGainByDistance(listenerLat, listenerLon, targetGain = 0.5) {
        const dist = this.getDistance(listenerLat, listenerLon);

        if (this.gain) {
            if (dist < this.activationRadius) {
                // Inside activation radius: panner handles smooth falloff via inverse square law
                this.gain.gain.value = targetGain;

                // Apply distance-based reverb wet mix
                // Closer = drier, farther = wetter (within the activation radius)
                this._updateReverbWetMix(dist);

                // Debug: Log gain changes (throttle to avoid spam)
                if (Math.random() < 0.1) {
                    console.log(`[Audio] ${dist.toFixed(1)}m, gain: ${targetGain.toFixed(2)}, wet: ${(this.currentWetValue * 100).toFixed(0)}% (inside ${this.activationRadius}m)`);
                }
            } else {
                // Outside activation radius: smooth fade-out over 15% of radius (min 3m, max 10m)
                // TODO: Make fadeZonePercent configurable via UI (default 15%)
                const fadeZonePercent = 0.15;  // 15% of activation radius
                const fadeZone = Math.max(3, Math.min(10, this.activationRadius * fadeZonePercent));
                const distPastEdge = dist - this.activationRadius;

                if (distPastEdge < fadeZone) {
                    // In transition zone: smooth exponential fade
                    const fadeAmount = Math.pow(distPastEdge / fadeZone, 2);  // Quadratic fade
                    const currentGain = targetGain * (1 - fadeAmount);
                    this.gain.gain.value = currentGain;
                    
                    // Maintain max wet value in fade zone (reverb lingers as sound fades)
                    this._updateReverbWetMix(dist);
                } else {
                    // Beyond transition zone: silent
                    this.gain.gain.value = 0;
                    this.wetGain.gain.value = 0;
                    this.dryGain.gain.value = 0;
                }

                // Debug: Log gain changes (throttle to avoid spam)
                if (Math.random() < 0.1) {
                    console.log(`[Audio] ${dist.toFixed(1)}m, gain: ${this.gain.gain.value.toFixed(2)}, wet: ${(this.currentWetValue * 100).toFixed(0)}% (fade zone: ${fadeZone.toFixed(1)}m)`);
                }
            }
        }
        return dist < this.activationRadius;
    }

    /**
     * Update reverb wet/dry mix based on distance and environment
     * Uses psychoacoustic principle: more reverb = perceived as farther
     * @param {number} distance - Distance in meters
     * @private
     */
    _updateReverbWetMix(distance) {
        if (!this.dryGain || !this.wetGain) return;

        // Get reverb settings for current distance and environment
        const reverb = getReverbForDistance(distance);

        // Apply wet/dry mix (equal power compensation)
        this.wetGain.gain.value = reverb.wet;
        this.dryGain.gain.value = Math.sqrt(1 - reverb.wet * reverb.wet);
        this.currentWetValue = reverb.wet;

        // Debug: Log environment/zone changes (throttled)
        if (Math.random() < 0.05) {
            console.log(`[Reverb] ${distance.toFixed(1)}m, env=${reverb.environment}, zone=${reverb.zone}, wet=${(reverb.wet * 100).toFixed(1)}%`);
        }
    }
}

/**
 * MultiOscillatorSource - Sound source with multiple oscillators (chords, layers)
 */
class MultiOscillatorSource extends GpsSoundSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.oscillators = [];
        this.oscillatorConfigs = options.oscillators || [];
    }

    init() {
        super.init();  // Call parent init to set up gain, dryGain, wetGain, panner

        this.oscillatorConfigs.forEach((oscConfig) => {
            const osc = this.engine.ctx.createOscillator();
            const oscGain = this.engine.ctx.createGain();
            osc.type = oscConfig.wave || 'sine';
            osc.frequency.value = oscConfig.freq || 440;
            oscGain.gain.value = oscConfig.gain || 0.3;
            osc.connect(oscGain);
            oscGain.connect(this.gain);
            this.oscillators.push({ osc, gain: oscGain, config: oscConfig });
        });

        // Split signal into dry and wet paths (same as OscillatorSource)
        this.gain.connect(this.dryGain);
        this.gain.connect(this.wetGain);
        
        // Dry goes to panner (spatialized)
        this.dryGain.connect(this.panner);
        this.panner.connect(this.engine.masterGain);
        
        // Wet goes to reverb (already connected to master in engine.init)
        this.wetGain.connect(this.engine.reverb);
    }

    start() {
        if (!this.isPlaying) {
            this.oscillators.forEach(({ osc }) => osc.start());
            super.start();
        }
    }

    stop() {
        if (this.isPlaying) {
            this.oscillators.forEach(({ osc }) => {
                osc.stop(this.engine.ctx.currentTime + 0.05);
            });
            super.stop();
        }
    }

    dispose() {
        this.stop();
        this.oscillators.forEach(({ osc, gain }) => {
            osc.disconnect();
            gain.disconnect();
        });
        this.oscillators = [];
        if (this.gain) { this.gain.disconnect(); this.gain = null; }
        if (this.dryGain) { this.dryGain.disconnect(); this.dryGain = null; }
        if (this.wetGain) { this.wetGain.disconnect(); this.wetGain = null; }
        if (this.panner) { this.panner.disconnect(); this.panner = null; }
    }
}

/**
 * SampleSource - Plays audio files (MP3, WAV, M4A) at GPS positions
 */
class SampleSource extends GpsSoundSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.url = options.url || '';
        this.loop = options.loop || false;
        this.buffer = null;
        this.sourceNode = null;
        this.loadPromise = null;
    }

    async load() {
        console.log('[SampleSource] load() called for:', this.url);
        if (!this.url) {
            console.error('[SampleSource] No URL provided');
            return false;
        }

        try {
            console.log('[SampleSource] Loading:', this.url);
            const response = await fetch(this.url);
            console.log('[SampleSource] Fetch response:', response.status, response.ok);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            console.log('[SampleSource] Array buffer size:', arrayBuffer.byteLength);
            try {
                this.buffer = await this.engine.ctx.decodeAudioData(arrayBuffer);
                console.log('[SampleSource] Loaded:', this.url, 'Duration:', this.buffer.duration.toFixed(2) + 's');
                console.log('[SampleSource] Buffer sample rate:', this.buffer.sampleRate, 'channels:', this.buffer.numberOfChannels);
            } catch (decodeErr) {
                console.error('[SampleSource] Decode failed:', decodeErr);
                throw new Error('Audio decode failed: ' + decodeErr.message);
            }
            return true;
        } catch (err) {
            console.error('[SampleSource] Load failed:', this.url, err);
            return false;
        }
    }

    init() {
        this.gain = this.engine.ctx.createGain();
        this.gain.gain.value = this.options.gain || 0.5;

        this.panner = this.engine.ctx.createPanner();
        this.panner.panningModel = 'HRTF';

        console.log('[SampleSource] Panner created:', {
            panningModel: this.panner.panningModel,
            distanceModel: this.panner.distanceModel,
            refDistance: this.panner.refDistance,
            maxDistance: this.panner.maxDistance,
            rolloffFactor: this.panner.rolloffFactor
        });

        // Use inverse square law for realistic distance falloff
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 1;
        this.panner.maxDistance = 100;
        this.panner.rolloffFactor = 1.5;

        this.setPosition(this.x, this.z);

        // ALWAYS create wet/dry split (needed for distance-based reverb)
        this.dryGain = this.engine.ctx.createGain();
        this.wetGain = this.engine.ctx.createGain();
        
        // Start with dry only (no reverb)
        this.dryGain.gain.value = 1.0;
        this.wetGain.gain.value = 0.0;
        
        // Connect dry path
        this.gain.connect(this.dryGain);
        this.dryGain.connect(this.panner);
        this.panner.connect(this.engine.masterGain);
        
        // Connect wet path ONLY if reverb exists
        if (this.engine.reverb) {
            this.gain.connect(this.wetGain);
            this.wetGain.connect(this.engine.reverb);
            // Reverb outputs to masterGain (connected in engine.init)
        }
        
        console.log('[SampleSource] Audio chain connected (dry + wet paths ready)');
    }

    start() {
        if (!this.buffer) {
            console.warn('[SampleSource] Cannot start - buffer not loaded');
            return false;
        }

        if (this.sourceNode) {
            this.stop();
        }

        this.sourceNode = this.engine.ctx.createBufferSource();
        this.sourceNode.buffer = this.buffer;
        this.sourceNode.loop = this.loop;
        this.sourceNode.connect(this.gain);
        this.sourceNode.start();

        this.sourceNode.onended = () => {
            if (this.loop && this.isPlaying) {
                this.start();
            }
        };

        super.start();
        console.log('[SampleSource] Started:', this.id);
        return true;
    }

    stop() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop(this.engine.ctx.currentTime + 0.1);
            } catch (e) {}
            this.sourceNode = null;
        }
        super.stop();
    }

    dispose() {
        this.stop();
        if (this.gain) {
            this.gain.disconnect();
            this.gain = null;
        }
        if (this.dryGain) {
            this.dryGain.disconnect();
            this.dryGain = null;
        }
        if (this.wetGain) {
            this.wetGain.disconnect();
            this.wetGain = null;
        }
        if (this.panner) {
            this.panner.disconnect();
            this.panner = null;
        }
        this.buffer = null;
    }

    setLoop(loop) {
        this.loop = loop;
        if (this.sourceNode) {
            this.sourceNode.loop = loop;
        }
    }

    setPlaybackRate(rate) {
        if (this.sourceNode) {
            this.sourceNode.playbackRate.value = rate;
        }
    }
}

/**
 * Sound Presets - Predefined sound configurations
 */
const SoundPresets = {
    ocean: {
        oscillators: [
            { freq: 100, wave: 'sine', gain: 0.3 },
            { freq: 150, wave: 'sine', gain: 0.3 },
            { freq: 200, wave: 'sine', gain: 0.3 }
        ],
        name: 'Ocean'
    },
    alarm: {
        oscillators: [
            { freq: 1200, wave: 'square', gain: 0.2 },
            { freq: 1800, wave: 'square', gain: 0.2 }
        ],
        name: 'Alarm'
    },
    chord: {
        oscillators: [
            { freq: 330, wave: 'triangle', gain: 0.25 },
            { freq: 440, wave: 'triangle', gain: 0.25 },
            { freq: 660, wave: 'triangle', gain: 0.25 }
        ],
        name: 'Chord'
    },
    drone: {
        oscillators: [
            { freq: 110, wave: 'sine', gain: 0.3 },
            { freq: 220, wave: 'sine', gain: 0.3 }
        ],
        name: 'Drone'
    },
    beep: {
        oscillators: [
            { freq: 880, wave: 'square', gain: 0.25 },
            { freq: 1760, wave: 'square', gain: 0.25 }
        ],
        name: 'Beep'
    }
};

/**
 * Reverb Zone Presets - Distance-based reverb settings
 * Based on psychoacoustic research: reverb-to-dry ratio as distance cue
 *
 * Environment Presets:
 *   - outdoor: Open air, fields, desert (minimal reverb)
 *   - indoor: Rooms, offices, small spaces
 *   - large: Halls, cathedrals, warehouses
 *   - cave: Underground, enclosed natural spaces
 *   - urban: City streets, reflections from buildings
 *
 * TODO: Make these configurable via UI
 *   - Add preset selector: 'outdoor' | 'indoor' | 'large' | 'cave' | 'urban'
 *   - Add sliders for: decay (0.1-5.0s), wet (0-100%), preDelay (0-100ms)
 *   - Store preset in localStorage to remember user preference
 *   - Show current settings: "Environment: outdoor, Decay: X.Xs, Wet: XX%"
 */

/**
 * Environment Types - Select the acoustic space
 * Each environment has different reverb characteristics regardless of distance
 */
const REVERB_ENVIRONMENTS = {
    // Name: [decay seconds, max wet%, description]
    // Wet levels tuned for natural spatial audio AR experience
    outdoor: { decay: 0.2, maxWet: 0.15, description: 'Open air, desert, fields' },
    indoor:  { decay: 0.5,  maxWet: 0.30, description: 'Rooms, offices, small spaces' },
    large:   { decay: 1.5,  maxWet: 0.50, description: 'Halls, cathedrals, warehouses' },
    cave:    { decay: 2.5,  maxWet: 0.60, description: 'Underground, enclosed natural' },
    urban:   { decay: 0.6,  maxWet: 0.25, description: 'City streets, building reflections' }
};

/**
 * Distance zones within an environment
 * Fine-tunes reverb based on how far the sound is
 */
const REVERB_DISTANCE_ZONES = {
    close:    { minDistance: 0, maxDistance: 10, wetMultiplier: 0.3 },    // 0-10m: Drier
    medium:   { minDistance: 10, maxDistance: 30, wetMultiplier: 0.6 },   // 10-30m: Moderate
    far:      { minDistance: 30, maxDistance: 60, wetMultiplier: 0.85 },  // 30-60m: Wetter
    distant:  { minDistance: 60, maxDistance: Infinity, wetMultiplier: 1.0 }  // 60m+: Full wet
};

// Default environment (can be overridden by app)
let CURRENT_REVERB_ENVIRONMENT = 'outdoor';

/**
 * Set the current acoustic environment
 * @param {string} envName - Environment name: 'outdoor' | 'indoor' | 'large' | 'cave' | 'urban'
 */
function setReverbEnvironment(envName) {
    if (REVERB_ENVIRONMENTS[envName]) {
        CURRENT_REVERB_ENVIRONMENT = envName;
        console.log(`[Reverb] Environment set to: ${envName} - ${REVERB_ENVIRONMENTS[envName].description}`);
    } else {
        console.warn(`[Reverb] Unknown environment: ${envName}, using ${CURRENT_REVERB_ENVIRONMENT}`);
    }
}

/**
 * Get reverb settings for current distance and environment
 * @param {number} distance - Distance in meters
 * @returns {{decay: number, wet: number, environment: string, zone: string}}
 */
function getReverbForDistance(distance) {
    const env = REVERB_ENVIRONMENTS[CURRENT_REVERB_ENVIRONMENT];
    
    // Find distance zone
    let zone = REVERB_DISTANCE_ZONES.distant;
    for (const [zoneName, zoneData] of Object.entries(REVERB_DISTANCE_ZONES)) {
        if (distance >= zoneData.minDistance && distance < zoneData.maxDistance) {
            zone = zoneData;
            break;
        }
    }
    
    // Calculate wet value: environment max * distance zone multiplier
    const wetValue = env.maxWet * zone.wetMultiplier;
    
    return {
        decay: env.decay,
        wet: wetValue,
        environment: CURRENT_REVERB_ENVIRONMENT,
        zone: zone === REVERB_DISTANCE_ZONES.close ? 'close' :
              zone === REVERB_DISTANCE_ZONES.medium ? 'medium' :
              zone === REVERB_DISTANCE_ZONES.far ? 'far' : 'distant'
    };
}

/**
 * SpatialAudioEngine - Main audio engine
 */
class SpatialAudioEngine {
    constructor(options = {}) {
        this.ctx = null;
        this.masterGain = null;
        this.listener = new EngineListener();
        this.sources = new Map();
        this.isInitialized = false;
        this.keepAliveEnabled = options.keepAlive || false;
        this.keepAliveInterval = null;
        this.keepAliveMs = options.keepAliveInterval || 3000;
        this.onAudioSuspended = options.onAudioSuspended || null;

        // Reverb nodes (distance-based wet/dry mix)
        this.reverb = null;
        this.reverbBuffer = null;
        this.reverbOutputGain = null;  // Controls overall reverb output level
        this.currentReverbPreset = null;
        this.reverbEnabled = options.reverbEnabled !== false;  // Default true, can disable
    }

    /**
     * Create impulse response for reverb effect
     * Uses exponential decay with proper tail behavior
     * @param {number} duration - Reverb decay time in seconds (0.1-5.0)
     * @param {number} decay - Decay factor (higher = faster decay, 8.0-15.0)
     * @returns {AudioBuffer} Impulse response buffer
     */
    _createImpulseResponse(duration = 0.15, decay = 25.0) {
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * duration);
        const impulse = this.ctx.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        // Generate exponential decay noise with proper tail-off
        // Scale down significantly to prevent accumulation/feedback
        const noiseScale = 0.08;  // Keep IR much quieter to prevent buildup
        const silenceThreshold = 0.001;  // Samples below this are silent

        for (let i = 0; i < length; i++) {
            // Exponential decay envelope (T60-style reverb)
            const t = i / sampleRate;
            const envelope = Math.exp(-decay * t);

            // Add randomness for natural reverb texture (scaled down)
            const noise = (Math.random() * 2 - 1) * envelope * noiseScale;
            
            // Hard cutoff - samples below threshold are truly silent
            left[i] = Math.abs(envelope) < silenceThreshold ? 0 : noise;

            // Slight stereo variation with delay (scaled down)
            const stereoDelay = Math.floor(sampleRate * 0.001); // 1ms delay
            if (i > stereoDelay) {
                const rightEnvelope = Math.exp(-decay * (i - stereoDelay) / sampleRate);
                const rightNoise = (Math.random() * 2 - 1) * rightEnvelope * noiseScale * 0.7;
                right[i] = Math.abs(rightEnvelope) < silenceThreshold ? 0 : rightNoise;
            } else {
                right[i] = 0;
            }
        }

        // Verify decay reaches near-zero at end
        const finalEnvelope = Math.exp(-decay * duration);
        console.log(`[Reverb] IR: ${duration}s, decay=${decay}, final amplitude=${(finalEnvelope * 100).toFixed(4)}%`);

        return impulse;
    }

    async init() {
        if (this.isInitialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);

        // ALWAYS create reverb (wet path will be muted if not used)
        // Moderate IR (0.25s) with natural decay (10.0) = pleasant reverb tail
        this.reverb = this.ctx.createConvolver();
        this.reverbBuffer = this._createImpulseResponse(0.25, 10.0);
        this.reverb.buffer = this.reverbBuffer;
        
        // Reverb output gain (limits max level to prevent accumulation)
        this.reverbOutputGain = this.ctx.createGain();
        this.reverbOutputGain.gain.value = 0.5;  // 50% max output (balanced)
        
        // Connect: reverb → output gain → master
        this.reverb.connect(this.reverbOutputGain);
        this.reverbOutputGain.connect(this.masterGain);
        
        this.reverbEnabled = true;  // Reverb available for use

        this._updateListenerOrientation();
        this.isInitialized = true;
        console.log('[SpatialAudioEngine] Initialized with reverb (wet path muted by default)');
    }

    enableKeepAlive(intervalMs = 3000) {
        this.keepAliveEnabled = true;
        this.keepAliveMs = intervalMs;
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
            if (!this.ctx || this.ctx.state === 'closed') {
                this.disableKeepAlive();
                return;
            }
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            gain.gain.value = 0.001;
            osc.frequency.value = 19000;
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        }, intervalMs);
    }

    disableKeepAlive() {
        this.keepAliveEnabled = false;
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    monitorAudioState(checkIntervalMs = 5000) {
        setInterval(() => {
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') {
                if (this.onAudioSuspended) this.onAudioSuspended();
                this.resume();
            }
        }, checkIntervalMs);
    }

    createOscillator(id, options = {}) {
        const source = new OscillatorSource(this, id, options);
        source.init();
        this.sources.set(id, source);
        return source;
    }

    createGpsSource(id, options = {}) {
        const source = new GpsSoundSource(this, id, options);
        source.init();
        this.sources.set(id, source);
        return source;
    }

    createMultiOscillatorSource(id, options = {}) {
        const source = new MultiOscillatorSource(this, id, options);
        source.init();
        this.sources.set(id, source);
        return source;
    }

    createPresetSource(id, presetName, gpsOptions = {}) {
        const preset = SoundPresets[presetName];
        if (!preset) {
            console.error('[SpatialAudioEngine] Unknown preset:', presetName);
            return null;
        }
        const options = { ...gpsOptions, oscillators: preset.oscillators };
        return this.createMultiOscillatorSource(id, options);
    }

    async createSampleSource(id, options = {}) {
        console.log('[SpatialAudioEngine] createSampleSource: creating source:', id);
        const source = new SampleSource(this, id, options);
        console.log('[SpatialAudioEngine] createSampleSource: calling init()');
        source.init();
        console.log('[SpatialAudioEngine] createSampleSource: init() complete, calling load()');
        this.sources.set(id, source);

        // Load the audio file
        const loaded = await source.load();
        console.log('[SpatialAudioEngine] createSampleSource: load() returned:', loaded);
        if (!loaded) {
            console.error('[SpatialAudioEngine] Failed to load sample:', options.url);
            return null;
        }

        return source;
    }

    updateAllGpsSources(lat, lon, heading) {
        this.sources.forEach((source) => {
            if (source instanceof GpsSoundSource) {
                source.updatePosition(lat, lon, heading);
            }
        });
    }

    getSource(id) { return this.sources.get(id); }

    removeSource(id) {
        const source = this.sources.get(id);
        if (source) {
            source.dispose();
            this.sources.delete(id);
        }
    }

    removeAllSources() {
        this.sources.forEach((source) => source.dispose());
        this.sources.clear();
    }

    updateSourcePosition(id, x, z) {
        const source = this.sources.get(id);
        if (source) source.setPosition(x, z);
    }

    moveSource(id, pathFn, duration) {
        const source = this.sources.get(id);
        if (source) source.moveAlongPath(pathFn, duration);
    }

    updateListenerPosition(lat, lon, heading = null) {
        const oldLat = this.listener.lat;
        const oldLon = this.listener.lon;
        this.listener.update(lat, lon, heading);
        if (oldLat === null) {
            this._updateListenerOrientation();
            return;
        }
        const { dx, dz } = this.listener.getDelta();
        this.sources.forEach((source) => {
            if (source.fixed) {
                source.setPosition(source.x - dx, source.z - dz);
            }
        });
        this._updateListenerOrientation();
    }

    _updateListenerOrientation() {
        if (!this.ctx) return;
        const rad = this.listener.getHeadingRad();
        const listener = this.ctx.listener;
        
        // Store old values for debug logging
        const oldForwardX = listener.forwardX.value;
        const oldForwardZ = listener.forwardZ.value;
        
        listener.forwardX.value = Math.sin(rad);
        listener.forwardY.value = 0;
        listener.forwardZ.value = -Math.cos(rad);
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
        
        // Debug: Log listener orientation changes (throttled)
        if (Math.random() < 0.1) {
            console.log(`[Audio] Listener: heading=${this.listener.heading.toFixed(0)}°, forwardX=${listener.forwardX.value.toFixed(2)}, forwardZ=${listener.forwardZ.value.toFixed(2)}`);
        }
    }

    getState() { return this.ctx ? this.ctx.state : 'not-initialized'; }

    async resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    getCurrentTime() { return this.ctx ? this.ctx.currentTime : 0; }

    dispose() {
        this.disableKeepAlive();
        this.removeAllSources();
        if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
    }
}

/**
 * GPS Tracker - Smooths GPS coordinates and auto-locks when stationary
 * Reduces GPS drift/jitter for more stable audio positioning
 * 
 * Current Tuning (optimized for walking + stopping):
 *   - historySize: 5 samples (~2.5s smoothing)
 *   - minMovement: 0.5m (ignores small drift)
 *   - stationaryTime: 3000ms (locks after 3s still)
 *   - unlockThreshold: 3x (1.5m to unlock)
 * 
 * TODO: Future Enhancements
 *   - Auto-switch smoothing based on GPS speed (walk vs drive)
 *   - Speed thresholds: Standing <0.5m/s, Walking 0.5-2m/s, Driving >5m/s
 *   - Add hysteresis to prevent rapid mode switching at boundaries
 *   - Handle null GPS speed (fallback to distance/time estimate)
 *   - Make configurable via UI preset selector
 *   - Add presets: Walking, Casual, Standing, Running, Driving
 *   - Store preset in localStorage to remember user preference
 *   - Add UI slider for fine-tuning: historySize (2-10), minMovement (0.2-5.0m)
 *   - Add "Lock enabled" toggle for standing vs walking modes
 *   - Show current settings: "X samples, ~Ys lag, ±Zm drift"
 */
class GPSTracker {
    constructor(options = {}) {
        this.history = [];
        this.historySize = options.historySize || 10;      // Track last N readings
        this.minMovement = options.minMovement || 0.5;     // Meters - ignore smaller movements
        this.stationaryThreshold = options.stationaryThreshold || 0.3; // Meters variance
        this.stationaryTime = options.stationaryTime || 3000; // ms to lock
        // TODO: Add this.lockEnabled = options.lockEnabled !== false;

        // Lock state
        this.isLocked = false;
        this.lockedLat = null;
        this.lockedLon = null;
        this.lastMoveTime = Date.now();
        this.stationarySince = null;
    }

    /**
     * Update with new GPS reading
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {{lat: number, lon: number, locked: boolean}} Smoothed/locked position
     */
    update(lat, lon) {
        const now = Date.now();

        // Calculate time since last reading
        let timeSinceLast = 0;
        if (this.history.length > 0) {
            timeSinceLast = now - this.history[this.history.length - 1].time;
        }

        // Add to history
        this.history.push({ lat, lon, time: now });

        // Keep only last N readings
        if (this.history.length > this.historySize) {
            this.history.shift();
        }

        // Need minimum readings before we can detect stationary
        if (this.history.length < 3) {
            console.log(`[GPS] ${timeSinceLast}ms, ${0.00}m, 🔓 Live`);
            return { lat, lon, locked: false };
        }

        // Calculate movement from previous reading
        const prevPos = this.history[this.history.length - 2];
        const movement = GPSUtils.distance(prevPos.lat, prevPos.lon, lat, lon);

        // Track when user was last moving significantly
        if (movement > this.minMovement) {
            this.lastMoveTime = now;
            this.stationarySince = null;
            this.isLocked = false;
        }

        // Check if user has been stationary long enough
        const stationaryDuration = now - this.lastMoveTime;

        if (stationaryDuration >= this.stationaryTime && !this.isLocked) {
            // Just became stationary - lock position
            this.isLocked = true;
            this.stationarySince = this.lastMoveTime;

            // Calculate average position for lock
            let avgLat = 0, avgLon = 0;
            this.history.forEach(pos => {
                avgLat += pos.lat;
                avgLon += pos.lon;
            });
            this.lockedLat = avgLat / this.history.length;
            this.lockedLon = avgLon / this.history.length;
            
            console.log(`[GPS] ${timeSinceLast}ms, ${movement.toFixed(2)}m, 🔒 Locked @ ${this.lockedLat.toFixed(6)}, ${this.lockedLon.toFixed(6)}`);
        }

        // If locked, check if we should unlock (user moved from locked position)
        // Use 3x threshold for unlock to prevent rapid lock/unlock from GPS drift
        // TODO: Make multiplier configurable (current: 3x = 1.5m unlock for walking)
        // Walking: 2-3x (1.0-1.5m), Driving: 5-6x (2.5-3.0m)
        if (this.isLocked) {
            const distFromLock = GPSUtils.distance(this.lockedLat, this.lockedLon, lat, lon);
            if (distFromLock > this.minMovement * 3) {
                // User moved significantly from locked position - unlock
                this.isLocked = false;
                this.stationarySince = null;
                this.lastMoveTime = now;
                console.log(`[GPS] ${timeSinceLast}ms, ${distFromLock.toFixed(2)}m, 🔓 Unlocked`);
                // Fall through to return smoothed position
            } else {
                // Still locked - return locked position
                console.log(`[GPS] ${timeSinceLast}ms, ${distFromLock.toFixed(2)}m, 🔒 Locked`);
                return { lat: this.lockedLat, lon: this.lockedLon, locked: true };
            }
        }

        // Calculate smoothed position (not locked yet)
        let avgLat = 0, avgLon = 0;
        this.history.forEach(pos => {
            avgLat += pos.lat;
            avgLon += pos.lon;
        });
        avgLat /= this.history.length;
        avgLon /= this.history.length;

        const smoothed = { lat: avgLat, lon: avgLon, locked: false };
        console.log(`[GPS] ${timeSinceLast}ms, ${movement.toFixed(2)}m, 🔓 Live`);
        return smoothed;
    }

    /**
     * Reset tracker (clear history, unlock)
     */
    reset() {
        this.history = [];
        this.isLocked = false;
        this.lockedLat = null;
        this.lockedLon = null;
        this.lastMoveTime = Date.now();
        this.stationarySince = null;
    }

    /**
     * Get tracker status
     * @returns {{isLocked: boolean, historySize: number, stationaryDuration: number}}
     */
    getStatus() {
        const stationaryDuration = this.isLocked ? Date.now() - this.stationarySince : 0;
        return {
            isLocked: this.isLocked,
            historySize: this.history.length,
            stationaryDuration: stationaryDuration,
            lockedLat: this.lockedLat,
            lockedLon: this.lockedLon
        };
    }
}

/**
 * DeviceOrientation Helper - Uses iOS webkitCompassHeading for true magnetic compass
 */
const DeviceOrientationHelper = {
    isAvailable: typeof DeviceOrientationEvent !== 'undefined',
    isPermissionRequired: typeof DeviceOrientationEvent !== 'undefined' && 
                          typeof DeviceOrientationEvent.requestPermission === 'function',
    callback: null,

    async start(onOrientationChange) {
        this.callback = onOrientationChange;
        
        if (this.isPermissionRequired) {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this._enableListener();
                    return true;
                }
                console.warn('[DeviceOrientation] Permission denied');
                return false;
            } catch (err) {
                console.error('[DeviceOrientation] Error:', err);
                return false;
            }
        } else {
            this._enableListener();
            return true;
        }
    },

    _enableListener() {
        // iOS 13+ uses deviceorientationabsolute or webkitCompassHeading
        const handler = (event) => {
            let heading;

            // iOS: Use webkitCompassHeading (true magnetic compass)
            if (event.webkitCompassHeading !== undefined) {
                heading = event.webkitCompassHeading;
                // Removed verbose logging - heading is logged in app when it changes
            }
            // Android: Use alpha (may need adjustment)
            else if (event.alpha !== null) {
                heading = event.alpha;
                // Removed verbose logging - heading is logged in app when it changes
            }

            if (heading !== undefined && this.callback) {
                this.callback(heading);
            }
        };

        window.addEventListener('deviceorientation', handler, true);
        // Removed verbose logging - permission result is logged in app
    },

    stop() { 
        this.callback = null;
        window.removeEventListener('deviceorientation', null, true);
    }
};

/**
 * HeadingManager - Combines GPS heading and device compass
 * Intelligently switches between sources based on reliability
 */
class HeadingManager {
    constructor(options = {}) {
        this.gpsHeading = null;
        this.compassHeading = 0;
        this.gpsSamples = [];
        this.maxSamples = options.maxSamples || 10;
        this.minSpeed = options.minSpeed || 1.0;      // m/s - must exceed to trust GPS
        this.stopSpeed = options.stopSpeed || 0.3;    // m/s - below this = stationary
        this.stabilityThreshold = options.stabilityThreshold || 15; // degrees variance
        this.minStableCount = options.minStableCount || 3;
        this.stableCount = 0;
        this.useGPS = false;
        this.lastSwitchTime = 0;
        this.switchDebounce = 2000; // ms - don't switch sources more than every 2s
    }

    /**
     * Update with GPS data
     * @param {number} heading - GPS heading (0-360°) or null
     * @param {number} speed - GPS speed in m/s
     * @returns {string} 'gps' or 'compass' - which source to use
     */
    updateGPS(heading, speed) {
        const now = Date.now();
        
        // Store sample
        if (heading !== null) {
            this.gpsHeading = heading;
            this.gpsSamples.push({ heading, speed, time: now });
            
            // Keep buffer at maxSamples
            if (this.gpsSamples.length > this.maxSamples) {
                this.gpsSamples.shift();
            }
        }
        
        // If speed too low, don't trust GPS (likely drift)
        if (speed < this.minSpeed) {
            this.stableCount = 0;
            this.useGPS = false;
            return 'compass';
        }
        
        // Need minimum samples before trusting GPS
        if (this.gpsSamples.length < 5) {
            return 'compass';
        }
        
        // Prevent rapid switching
        if (now - this.lastSwitchTime < this.switchDebounce) {
            return this.useGPS ? 'gps' : 'compass';
        }
        
        // Calculate heading variance (stability)
        const variance = this._calculateVariance();
        
        if (variance < this.stabilityThreshold) {
            this.stableCount++;
            
            if (this.stableCount >= this.minStableCount && !this.useGPS) {
                this.useGPS = true;
                this.lastSwitchTime = now;
                console.log('[HeadingManager] Switched to GPS (variance:', variance.toFixed(1) + '°)');
                return 'gps';
            }
        } else {
            this.stableCount = 0;
            if (this.useGPS) {
                this.useGPS = false;
                this.lastSwitchTime = now;
                console.log('[HeadingManager] GPS unstable, switched to compass (variance:', variance.toFixed(1) + '°)');
            }
            return 'compass';
        }
        
        return this.useGPS ? 'gps' : 'compass';
    }

    /**
     * Update with compass data
     * @param {number} alpha - Compass heading (0-360°)
     * @returns {string} 'gps' or 'compass' - which source to use
     */
    updateCompass(alpha) {
        this.compassHeading = alpha;
        
        // DEBUG
        console.log('[HeadingManager] Compass update:', alpha.toFixed(1) + '°, useGPS:', this.useGPS, 'gpsHeading:', this.gpsHeading);

        // If GPS is active and stable, keep using it
        if (this.useGPS) {
            return 'gps';
        }

        return 'compass';
    }

    /**
     * Get current best heading
     * @returns {number} Heading in degrees (0-360°)
     */
    getHeading() {
        if (this.useGPS && this.gpsHeading !== null) {
            return this.gpsHeading;
        }
        return this.compassHeading;
    }

    /**
     * Get current heading source
     * @returns {string} 'gps' or 'compass'
     */
    getSource() {
        return this.useGPS ? 'gps' : 'compass';
    }

    /**
     * Get diagnostic info
     * @returns {object} Status information
     */
    getStatus() {
        return {
            source: this.getSource(),
            heading: this.getHeading(),
            gpsHeading: this.gpsHeading,
            compassHeading: this.compassHeading,
            samples: this.gpsSamples.length,
            stableCount: this.stableCount,
            variance: this._calculateVariance()
        };
    }

    /**
     * Calculate variance of recent GPS headings
     * @returns {number} Variance in degrees
     * @private
     */
    _calculateVariance() {
        if (this.gpsSamples.length < 2) return 360;
        
        const headings = this.gpsSamples.map(s => s.heading);
        const avg = headings.reduce((a, b) => a + b, 0) / headings.length;
        
        // Handle wraparound (359° vs 1°)
        let variance = 0;
        for (const h of headings) {
            let diff = Math.abs(h - avg);
            if (diff > 180) diff = 360 - diff;
            variance += diff;
        }
        
        return variance / headings.length;
    }

    /**
     * Reset all state
     */
    reset() {
        this.gpsHeading = null;
        this.gpsSamples = [];
        this.stableCount = 0;
        this.useGPS = false;
        this.lastSwitchTime = 0;
    }
}

// Export (don't export Listener - it's internal to engine)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        SpatialAudioEngine, SoundSource, OscillatorSource, 
        GpsSoundSource, MultiOscillatorSource, SampleSource, SoundPresets,
        GPSUtils, DeviceOrientationHelper, HeadingManager, GPSTracker
    };
} else {
    window.SpatialAudioEngine = SpatialAudioEngine;
    window.SoundSource = SoundSource;
    window.OscillatorSource = OscillatorSource;
    window.GpsSoundSource = GpsSoundSource;
    window.MultiOscillatorSource = MultiOscillatorSource;
    window.SampleSource = SampleSource;
    window.SoundPresets = SoundPresets;
    window.GPSUtils = GPSUtils;
    window.DeviceOrientationHelper = DeviceOrientationHelper;
    window.HeadingManager = HeadingManager;
    window.GPSTracker = GPSTracker;
    window.setReverbEnvironment = setReverbEnvironment;
    window.getReverbForDistance = getReverbForDistance;
    window.REVERB_ENVIRONMENTS = REVERB_ENVIRONMENTS;
    console.log('[spatial_audio.js] v5.0 (Reverb Zones) loaded');
    console.log('[spatial_audio.js] Available presets:', Object.keys(SoundPresets).join(', '));
    console.log('[spatial_audio.js] SampleSource: Ready for MP3/WAV/M4A files');
    console.log('[spatial_audio.js] HeadingManager: GPS + Compass hybrid');
    console.log('[spatial_audio.js] GPSTracker: Auto-lock when stationary');
    console.log('[spatial_audio.js] SpatialAudioApp: High-level app orchestration');
    console.log('[spatial_audio.js] Reverb Environments:', Object.keys(REVERB_ENVIRONMENTS).join(', '));
    console.log('[spatial_audio.js] Usage: setReverbEnvironment("outdoor"|"indoor"|"large"|"cave"|"urban")');
}

/**
 * Spatial Audio GPS System
 * Reusable library for spatial audio with GPS positioning
 *
 * @version 5.1 (Z-Axis Coordinate Fix - GPS to Web Audio conversion)
 * @changelog
 *   v5.1 - Fixed Z-axis flip for correct GPS to Web Audio coordinate conversion
 *   v5.0 - Reverb zones (distance-based wet/dry mix)
 */

console.log('[spatial_audio.js] Loading v5.1...');

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
 * 
 * ARCHITECTURE NOTE: GPS Position Redundancy
 * ===========================================
 * This class stores `gpsLat` and `gpsLon`, and Sound (in spatial_audio_app.js)
 * also stores `lat` and `lon`. This is INTENTIONAL redundancy:
 * 
 * See Sound class documentation for full rationale. In summary:
 * - Sound (app layer): Source of truth for UI, config, distance/bearing queries
 * - GpsSoundSource (audio layer): Cached position for 60fps audio rendering
 * 
 * This allows the audio engine to update panner positions independently
 * without requiring the app layer to pass coordinates on every update.
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
     * 
     * =============================================================================
     * COORDINATE SYSTEM CONVERSION (CRITICAL!)
     * =============================================================================
     * 
     * GPS Coordinates (lat/lon):
     *   - +lat = North, -lat = South
     *   - +lon = East, -lon = West
     * 
     * GPSUtils.toMeters() returns:
     *   - +x = East, -x = West
     *   - +z = North, -z = South
     * 
     * Web Audio API PannerNode expects:
     *   - +x = Right, -x = Left
     *   - +y = Up, -y = Down
     *   - +z = Behind listener, -z = In front of listener
     *   - Listener faces toward -Z direction
     * 
     * CONVERSION:
     *   - x stays the same (East = Right when facing North)
     *   - z is FLIPPED: North (+z GPS) becomes Front (-z Web Audio)
     *   - this.setPosition(x, -z) ← Z-axis flip is critical!
     * 
     * EXAMPLE:
     *   Sound is 10m North of listener
     *   GPSUtils returns: x=0, z=10 (10m North)
     *   Web Audio needs: x=0, z=-10 (10m in front)
     *   Result: this.setPosition(0, -10)
     * 
     * BUG HISTORY:
     *   v5.0: Sounds were 180° flipped (North sounded like South)
     *   v5.1: Fixed with Z-axis flip: this.setPosition(x, -z)
     * =============================================================================
     * 
     * @param {number} listenerLat
     * @param {number} listenerLon
     * @param {number} listenerHeading - Ignored for position, used for logging
     */
    updatePosition(listenerLat, listenerLon, listenerHeading) {
        // Convert GPS to local coordinates (x, z)
        // GPSUtils returns: +x=East, +z=North
        // Web Audio expects: +x=Right, +z=Behind, -z=Front
        // So we need: x stays same, z needs to be flipped for proper orientation
        const { x, z } = GPSUtils.toMeters(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
        
        // Flip Z axis: North should be -Z (front), South should be +Z (back)
        this.setPosition(x, -z);

        // Debug: Log position updates (throttled to 5%)
        if (Math.random() < 0.05) {
            console.log(`[Audio] Panner: x=${x.toFixed(1)}m, z=${(-z).toFixed(1)}m (listener heading=${listenerHeading.toFixed(0)}°)`);
        }
    }

    getDistance(listenerLat, listenerLon) {
        return GPSUtils.distance(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
    }

    updateGainByDistance(listenerLat, listenerLon, targetGain = 0.5) {
        const dist = this.getDistance(listenerLat, listenerLon);

        // Apply 2-meter floor: never calculate gain for closer than 2 meters
        // This is the realistic "closest approach" and gives us maximum volume here
        const gainDistance = Math.max(dist, 2);

        if (this.gain) {
            // === HYBRID FADE ZONE (20m transition) ===
            // Works with any activation radius
            const fadeZone = 20; // meters
            const fadeStart = Math.max(0, this.activationRadius - fadeZone);

            if (gainDistance < fadeStart) {
                // Full volume zone (inside activation radius, away from edge)
                // Boost gain when very close (< 2m) for maximum volume at closest approach
                const distanceBoost = dist < 2 ? 1.5 : 1.0;  // +3.5dB boost when within 2m
                this.gain.gain.value = targetGain * distanceBoost;

                // Apply distance-based reverb wet mix
                // Closer = drier, farther = wetter (within the activation radius)
                this._updateReverbWetMix(dist);

                // Debug: Log gain changes (throttle to avoid spam)
                if (Math.random() < 0.05) {
                    console.log(`[Audio] ${dist.toFixed(1)}m, gain: ${(targetGain * distanceBoost).toFixed(2)}, wet: ${(this.currentWetValue * 100).toFixed(0)}% (full volume zone)`);
                }
            } else {
                // FADE ZONE: Smooth transition from fadeStart to activationRadius+fadeZone
                // Total fade distance: 20m inside + 20m outside = 40m total
                const totalFadeDistance = fadeZone * 2;
                const distFromFadeStart = Math.max(0, dist - fadeStart);
                const fadeProgress = Math.min(1, distFromFadeStart / totalFadeDistance);

                // Smooth exponential fade: 100% → 0% over 40m
                // Using pure exponential for smoothness (no hybrid complexity)
                const exponentialFade = Math.pow(1 - fadeProgress, 2);  // Quadratic falloff

                const currentGain = targetGain * exponentialFade;
                this.gain.gain.value = currentGain;

                // Apply distance-based reverb wet mix
                this._updateReverbWetMix(dist);

                // Beyond fade zone: silent
                if (dist >= this.activationRadius + fadeZone) {
                    this.gain.gain.value = 0;
                    this.wetGain.gain.value = 0;
                    this.dryGain.gain.value = 0;
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

    async load(timeout = 30000) {
        console.log('[SampleSource] load() called for:', this.url);
        if (!this.url) {
            console.error('[SampleSource] No URL provided');
            return false;
        }

        try {
            console.log('[SampleSource] Loading:', this.url, '(timeout:', timeout + 'ms)');
            
            // Fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('[SampleSource] Fetch timeout after', timeout + 'ms for:', this.url);
                controller.abort();
            }, timeout);
            
            const response = await fetch(this.url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            console.log('[SampleSource] Fetch response:', response.status, response.ok);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            console.log('[SampleSource] Array buffer size:', arrayBuffer.byteLength, 'bytes', '(~' + (arrayBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB)');
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
            if (err.name === 'AbortError') {
                console.error('[SampleSource] Load timeout (> ' + timeout + 'ms):', this.url);
            } else {
                console.error('[SampleSource] Load failed:', this.url, err);
            }
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

        // === RANDOM MICRO-VARIATIONS (Organic Playback) ===
        // Prevents mechanical repetition and "machine gun" effect
        // Each loop iteration has subtle variations (like live performance)

        // ±2 cents random detune (0.9998 to 1.0002)
        // Prevents exact unison when multiple similar sounds play
        const randomDetune = 0.9998 + Math.random() * 0.0004;
        this.sourceNode.playbackRate.value = randomDetune;

        // CRITICAL: Set initial gain to 0 to prevent burst
        // updateGainByDistance() will be called immediately after start
        // to set proper distance-based volume
        if (this.gain) {
            this.gain.gain.value = 0;  // Start silent, prevent burst
        }
        // ===================================================

        this.sourceNode.connect(this.gain);
        this.sourceNode.start();

        this.sourceNode.onended = () => {
            if (this.loop && this.isPlaying) {
                this.start();  // Re-apply random variations on each loop
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
 * CachedSampleSource - SampleSource with offline cache support
 * 
 * Checks Cache API before fetching from network.
 * If cached response found, plays from cache (works offline).
 * If not cached, fetches from network and caches for next time.
 * 
 * @version 1.0 (Feature 15: Offline Soundscape Download)
 * @extends SampleSource
 */
class CachedSampleSource extends SampleSource {
    async load(timeout = 30000) {
        console.log('[CachedSampleSource] load() called for:', this.url);
        
        if (!this.url) {
            console.error('[CachedSampleSource] No URL provided');
            return false;
        }

        try {
            // === STEP 1: Check Cache API ===
            const cachedResponse = await this._getCachedResponse();
            
            if (cachedResponse) {
                console.log('[CachedSampleSource] ✅ Found in cache:', this.url);
                return this._playFromResponse(cachedResponse);
            }

            // === STEP 2: Fallback to network ===
            console.log('[CachedSampleSource] 🌐 Not cached - fetching from network:', this.url);
            
            // Fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('[CachedSampleSource] Fetch timeout after', timeout + 'ms for:', this.url);
                controller.abort();
            }, timeout);

            const response = await fetch(this.url, { signal: controller.signal });
            clearTimeout(timeoutId);

            console.log('[CachedSampleSource] Network response:', response.status, response.ok);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Note: We don't cache here - OfflineDownloadManager handles caching
            // This is just for playback during online sessions
            return this._playFromResponse(response);

        } catch (err) {
            if (err.name === 'AbortError') {
                console.error('[CachedSampleSource] Load timeout (> ' + timeout + 'ms):', this.url);
            } else {
                console.error('[CachedSampleSource] Load failed:', this.url, err);
            }
            return false;
        }
    }

    /**
     * Check all soundscapes caches for this URL
     * @returns {Promise<Response|null>} Cached response or null
     * @private
     */
    async _getCachedResponse() {
        try {
            const cacheNames = await caches.keys();
            
            for (const cacheName of cacheNames) {
                // Only check soundscape caches
                if (!cacheName.startsWith('soundscape-')) {
                    continue;
                }

                try {
                    const cache = await caches.open(cacheName);
                    const response = await cache.match(this.url);
                    
                    if (response) {
                        console.log(`[CachedSampleSource] Found in ${cacheName}`);
                        return response;
                    }
                } catch (cacheErr) {
                    // Ignore individual cache errors, try next
                    console.warn('[CachedSampleSource] Cache error:', cacheErr);
                }
            }
            
            return null;  // Not found in any cache
        } catch (err) {
            console.error('[CachedSampleSource] Error checking caches:', err);
            return null;
        }
    }

    /**
     * Decode and play from response
     * @param {Response} response
     * @returns {Promise<boolean>}
     * @private
     */
    async _playFromResponse(response) {
        try {
            const arrayBuffer = await response.arrayBuffer();
            console.log('[CachedSampleSource] Array buffer size:', arrayBuffer.byteLength, 'bytes', 
                       '(~' + (arrayBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB)');
            
            const audioBuffer = await this.engine.ctx.decodeAudioData(arrayBuffer.slice(0));
            
            this.buffer = audioBuffer;
            console.log('[CachedSampleSource] ✅ Loaded:', this.url, 
                       'Duration:', audioBuffer.duration.toFixed(2) + 's',
                       'Sample rate:', audioBuffer.sampleRate,
                       'Channels:', audioBuffer.numberOfChannels);
            
            return true;
        } catch (decodeErr) {
            console.error('[CachedSampleSource] Decode failed:', decodeErr);
            throw new Error('Audio decode failed: ' + decodeErr.message);
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
        
        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;  // Increased from 0.5 for louder playback

        // Dynamics compressor to prevent clipping from multiple concurrent sources
        // This allows individual sources to be boosted without worrying about digital distortion
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -6;    // Start compressing at -6dB
        this.compressor.knee.value = 12;         // Smooth knee (12dB)
        this.compressor.ratio.value = 4;         // 4:1 compression ratio
        this.compressor.attack.value = 0.003;    // Fast attack (3ms)
        this.compressor.release.value = 0.25;    // Medium release (250ms)

        // Connect: masterGain → compressor → destination
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

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
        console.log('[SpatialAudioEngine] Initialized with compressor (threshold: -6dB, ratio: 4:1)');
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
        
        // Use CachedSampleSource for offline support (Feature 15)
        const source = new CachedSampleSource(this, id, options);
        
        console.log('[SpatialAudioEngine] createSampleSource: calling init()');
        source.init();
        console.log('[SpatialAudioEngine] createSampleSource: init() complete, calling load()');
        this.sources.set(id, source);

        // Load the audio file (from cache or network)
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
        // Delta-based position updates removed - causes accumulation drift
        // Sound positions are now updated directly in updateAllGpsSources()
        // using GPSUtils.toMeters() for accurate fixed positioning
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

        // Verbose debug: Log every orientation update (uncomment for debugging)
        // console.log(`[Audio] Listener UPDATE: heading=${this.listener.heading.toFixed(1)}°, rad=${rad.toFixed(3)}, forwardX=${listener.forwardX.value.toFixed(3)}, forwardZ=${listener.forwardZ.value.toFixed(3)}`);
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
 * =============================================================================
 * CURRENT TUNING: Optimized for WALKING (1-2 m/s)
 * =============================================================================
 *   - historySize: 3 samples (~1.5s smoothing at 2Hz GPS)
 *   - minMovement: 0.3m (ignores drift < 30cm)
 *   - stationaryTime: 1500ms (locks after 1.5s still)
 *   - unlockThreshold: 2x (0.6m to unlock)
 *
 * Expected behavior:
 *   - Locks in ~1.5s when you stop (vs 3s before)
 *   - Unlocks immediately when you walk (vs 0.5m threshold before)
 *   - Less lag when walking (1.5s vs 2.5s smoothing)
 *   - Smaller position jumps between locked/live modes
 *
 * =============================================================================
 * TODO: FUTURE - Dynamic Profile Switching for Multiple Speeds
 * =============================================================================
 * When we support cycling/driving (15-35 m/s), add auto-detection:
 *
 *   - standing: <0.3 m/s  → 10 samples, 0.2m, 1s lock
 *   - walking:  0.3-2 m/s → 3 samples,  0.3m, 1.5s lock (CURRENT)
 *   - running:  2-6 m/s   → 2 samples,  1.0m, never lock
 *   - cycling:  6-15 m/s  → 1 sample,   2.0m, never lock
 *   - driving:  15+ m/s   → 1 sample,   5.0m, never lock
 *
 * Implementation: Use GPS speed property to auto-switch profiles.
 * See architecture notes for full profile specifications.
 * =============================================================================
 */
class GPSTracker {
    constructor(options = {}) {
        // Walking-optimized defaults (can be overridden via options)
        this.history = [];
        this.historySize = options.historySize || 3;           // ~1.5s smoothing
        this.minMovement = options.minMovement || 0.3;         // 30cm threshold
        this.stationaryThreshold = options.stationaryThreshold || 0.3;
        this.stationaryTime = options.stationaryTime || 1500;  // 1.5s to lock
        this.unlockThreshold = options.unlockThreshold || 2;   // 2x minMovement to unlock

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
        // Uses configurable unlockThreshold to prevent rapid lock/unlock from GPS drift
        if (this.isLocked) {
            const distFromLock = GPSUtils.distance(this.lockedLat, this.lockedLon, lat, lon);
            if (distFromLock > this.minMovement * this.unlockThreshold) {
                // User moved significantly from locked position - unlock
                
                // =============================================================
                // FIX: Reset history to locked position to prevent position jump
                // =============================================================
                // PROBLEM: When transitioning from locked → live, the first few
                // GPS readings include movement jitter, causing smoothed position
                // to differ from locked position → sound "teleports"
                //
                // SOLUTION: Reset history to locked position, so smoothing starts
                // from the stable locked position rather than jittery first reading
                //
                // PREVIOUS BEHAVIOR (before fix):
                //   this.isLocked = false;
                //   this.stationarySince = null;
                //   this.lastMoveTime = now;
                //   // History kept accumulating → first movement reading contaminated smoothing
                //
                // NEW BEHAVIOR (after fix):
                //   this.isLocked = false;
                //   this.stationarySince = null;
                //   this.lastMoveTime = now;
                //   this.history = [{ lat: this.lockedLat, lon: this.lockedLon, time: now }];
                //   // History reset → smoothing starts from stable locked position
                // =============================================================
                
                this.isLocked = false;
                this.stationarySince = null;
                this.lastMoveTime = now;
                
                // Reset history to locked position to prevent jump on unlock
                this.history = [{ lat: this.lockedLat, lon: this.lockedLon, time: now }];
                
                console.log(`[GPS] ${timeSinceLast}ms, ${distFromLock.toFixed(2)}m, 🔓 Unlocked (>${(this.minMovement * this.unlockThreshold).toFixed(2)}m, history reset)`);
                
                // Return locked position (now also in history for smooth transition)
                return { lat: this.lockedLat, lon: this.lockedLon, locked: false };
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
 * 
 * =============================================================================
 * ⚠️ CRITICAL iOS REQUIREMENTS - DO NOT MODIFY WITHOUT UNDERSTANDING ⚠️
 * =============================================================================
 * 
 * iOS 13+ requires device orientation permission to be requested in a SYNCHRONOUS
 * user gesture context. This is a WebKit security requirement.
 * 
 * KEY REQUIREMENTS:
 * 
 * 1. requestPermission() MUST be called synchronously in a click/tap handler
 *    - Cannot be inside an async function that has `await` before it
 *    - Cannot be in a setTimeout/setInterval callback
 *    - Cannot be in a Promise.then() handler
 *    - The call stack must lead directly back to the user's click
 * 
 * 2. DO NOT await the permission promise in the calling code
 *    - The start() method calls requestPermission() synchronously
 *    - The promise resolves asynchronously (after user responds)
 *    - Awaiting in start() would lose the gesture context
 *    - Instead, we use .then() to handle the result
 * 
 * 3. The permission dialog only appears once per app session
 *    - User can grant or deny
 *    - If denied, user must manually reset in Settings > Safari
 *    - If granted, subsequent calls to start() work immediately
 * 
 * WHY THIS MATTERS:
 * 
 * iOS tracks a "user gesture context" flag that is:
 *   - SET when the user clicks/taps a button
 *   - CLEARED when the event handler yields to the event loop
 * 
 * Yielding happens when:
 *   - An `await` is encountered (even if the promise resolves immediately)
 *   - A setTimeout/setInterval callback runs
 *   - A Promise resolution handler runs (.then, .catch)
 *   - An async function returns and control goes back to the caller
 * 
 * If the gesture context is lost, requestPermission() will:
 *   - Not show the permission dialog
 *   - Return a promise that resolves to "denied"
 *   - Provide no error or indication of what went wrong
 * 
 * BROWSER BEHAVIOR:
 * 
 *   Safari (iOS):     Strict - requires synchronous user gesture
 *   DuckDuckGo (iOS): Even stricter - additional privacy restrictions
 *   Chrome (iOS):     Uses WebKit, same as Safari
 *   Firefox (iOS):    Uses WebKit, same as Safari
 *   Desktop browsers: No permission required (no DeviceOrientationEvent.requestPermission)
 * 
 * DEBUGGING TIPS:
 * 
 * If compass permission is denied:
 *   1. Check console for "isPermissionRequired: true"
 *   2. Verify start() is called BEFORE any await in the click handler
 *   3. Look for "Permission result: denied" in console
 *   4. Check Safari Settings > [Your App] > Device Orientation
 *   5. Try in a private/incognito window (clears cached permissions)
 * 
 * REFERENCES:
 *   - https://developer.apple.com/documentation/webkit/requesting_device_orientation_permission
 *   - https://webkit.org/blog/10308/automation-permission-issue-for-webdriver-in-safari-13/
 *   - https://caniuse.com/device-orientation
 * =============================================================================
 */
const DeviceOrientationHelper = {
    isAvailable: typeof DeviceOrientationEvent !== 'undefined',
    isPermissionRequired: typeof DeviceOrientationEvent !== 'undefined' && 
                          typeof DeviceOrientationEvent.requestPermission === 'function',
    callback: null,

    /**
     * Start listening for device orientation changes
     * 
     * @param {Function} onOrientationChange - Callback fired when heading changes
     * @returns {boolean} true if listener was enabled (permission granted or not required)
     * 
     * ⚠️ CRITICAL: This method MUST be called synchronously in a user gesture handler.
     * Do NOT await the result - the permission dialog appears asynchronously.
     * 
     * Example usage in click handler:
     * 
     *   button.addEventListener('click', () => {
     *       // ✅ CORRECT: Called synchronously, no await
     *       DeviceOrientationHelper.start((heading) => {
     *           console.log('Heading:', heading);
     *       });
     *   });
     * 
     *   button.addEventListener('click', async () => {
     *       await someAsyncOperation(); // ❌ WRONG: Loses gesture context!
     *       DeviceOrientationHelper.start((heading) => {
     *           console.log('Heading:', heading); // May never be called
     *       });
     *   });
     */
    start(onOrientationChange) {
        console.log('[DeviceOrientationHelper] start() called');
        console.log('[DeviceOrientationHelper] isAvailable:', this.isAvailable);
        console.log('[DeviceOrientationHelper] isPermissionRequired:', this.isPermissionRequired);

        this.callback = onOrientationChange;

        if (this.isPermissionRequired) {
            console.log('[DeviceOrientationHelper] Requesting permission on iOS...');
            // IMPORTANT: Call requestPermission() synchronously in user gesture context
            // Don't await - just call it and the promise will resolve asynchronously
            // The gesture context is captured at the moment of this call
            const permissionPromise = DeviceOrientationEvent.requestPermission();
            permissionPromise.then((permission) => {
                console.log('[DeviceOrientationHelper] Permission result:', permission);
                if (permission === 'granted') {
                    console.log('[DeviceOrientationHelper] Permission granted, enabling listener');
                    this._enableListener();
                } else {
                    console.warn('[DeviceOrientationHelper] Permission denied:', permission);
                    console.warn('[DeviceOrientationHelper] User must enable in Settings > Safari > [App]');
                }
            }).catch((err) => {
                console.error('[DeviceOrientationHelper] Error requesting permission:', err);
            });
            return true; // Return immediately, listener will be enabled when permission resolves
        } else {
            console.log('[DeviceOrientationHelper] No permission required, enabling listener');
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
        GpsSoundSource, MultiOscillatorSource, SampleSource, CachedSampleSource, SoundPresets,
        GPSUtils, DeviceOrientationHelper, HeadingManager, GPSTracker
    };
} else {
    window.SpatialAudioEngine = SpatialAudioEngine;
    window.SoundSource = SoundSource;
    window.OscillatorSource = OscillatorSource;
    window.GpsSoundSource = GpsSoundSource;
    window.MultiOscillatorSource = MultiOscillatorSource;
    window.SampleSource = SampleSource;
    window.CachedSampleSource = CachedSampleSource;
    window.SoundPresets = SoundPresets;
    window.GPSUtils = GPSUtils;
    window.DeviceOrientationHelper = DeviceOrientationHelper;
    window.HeadingManager = HeadingManager;
    window.GPSTracker = GPSTracker;
    window.setReverbEnvironment = setReverbEnvironment;
    window.getReverbForDistance = getReverbForDistance;
    window.REVERB_ENVIRONMENTS = REVERB_ENVIRONMENTS;
    console.log('[spatial_audio.js] v5.1+ (Feature 15: Offline Cache Support) loaded');
    console.log('[spatial_audio.js] Available presets:', Object.keys(SoundPresets).join(', '));
    console.log('[spatial_audio.js] SampleSource: Ready for MP3/WAV/M4A files');
    console.log('[spatial_audio.js] CachedSampleSource: Offline cache support enabled');
    console.log('[spatial_audio.js] HeadingManager: GPS + Compass hybrid');
    console.log('[spatial_audio.js] GPSTracker: Auto-lock when stationary');
    console.log('[spatial_audio.js] SpatialAudioApp: High-level app orchestration');
    console.log('[spatial_audio.js] Reverb Environments:', Object.keys(REVERB_ENVIRONMENTS).join(', '));
    console.log('[spatial_audio.js] Usage: setReverbEnvironment("outdoor"|"indoor"|"large"|"cave"|"urban")');
}

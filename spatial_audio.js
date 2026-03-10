/**
 * Spatial Audio GPS System
 * Reusable library for spatial audio with GPS positioning
 * 
 * @version 4.1 (SampleSource - MP3/WAV/M4A support)
 */

console.log('[spatial_audio.js] Loading v4.1...');

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
    }

    init() {
        this.gain = this.engine.ctx.createGain();
        this.gain.gain.value = this.options.gain || 0.3;
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
        this.gain.connect(this.panner);
        this.panner.connect(this.engine.masterGain);
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

    updatePosition(listenerLat, listenerLon, listenerHeading) {
        const { x, z } = GPSUtils.toMeters(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
        const rad = listenerHeading * Math.PI / 180;
        const rotatedX = x * Math.cos(rad) - z * Math.sin(rad);
        const rotatedZ = x * Math.sin(rad) + z * Math.cos(rad);
        this.setPosition(rotatedX, rotatedZ);
    }

    getDistance(listenerLat, listenerLon) {
        return GPSUtils.distance(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
    }

    updateGainByDistance(listenerLat, listenerLon, targetGain = 0.5) {
        const dist = this.getDistance(listenerLat, listenerLon);
        if (dist < this.activationRadius) {
            const normalizedDist = dist / this.activationRadius;
            const gain = (1 - normalizedDist ** 2) * targetGain;
            if (this.gain) this.gain.gain.value = gain;
            return true;
        } else {
            if (this.gain) this.gain.gain.value = 0;
            return false;
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
        this.gain = this.engine.ctx.createGain();
        this.gain.gain.value = this.options.gain || 0.3;
        this.panner = this.engine.ctx.createPanner();
        this.panner.panningModel = 'HRTF';
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 1;
        this.panner.maxDistance = 10000;
        this.panner.rolloffFactor = 1;
        this.setPosition(this.x, this.z);

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

        this.gain.connect(this.panner);
        this.panner.connect(this.engine.masterGain);
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
        if (!this.url) {
            console.error('[SampleSource] No URL provided');
            return false;
        }

        try {
            console.log('[SampleSource] Loading:', this.url);
            const response = await fetch(this.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            this.buffer = await this.engine.ctx.decodeAudioData(arrayBuffer);
            console.log('[SampleSource] Loaded:', this.url, 'Duration:', this.buffer.duration.toFixed(2) + 's');
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
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 1;
        this.panner.maxDistance = 10000;
        this.panner.rolloffFactor = 1;

        this.setPosition(this.x, this.z);

        this.gain.connect(this.panner);
        this.panner.connect(this.engine.masterGain);
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
    }

    async init() {
        if (this.isInitialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        this._updateListenerOrientation();
        this.isInitialized = true;
        console.log('[SpatialAudioEngine] Initialized');
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
        const source = new SampleSource(this, id, options);
        source.init();
        this.sources.set(id, source);
        
        // Load the audio file
        const loaded = await source.load();
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
        listener.forwardX.value = Math.sin(rad);
        listener.forwardY.value = 0;
        listener.forwardZ.value = -Math.cos(rad);
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
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
 */
class GPSTracker {
    constructor(options = {}) {
        this.history = [];
        this.historySize = options.historySize || 10;      // Track last N readings
        this.minMovement = options.minMovement || 0.5;     // Meters - ignore smaller movements
        this.stationaryThreshold = options.stationaryThreshold || 0.3; // Meters variance
        this.stationaryTime = options.stationaryTime || 3000; // ms to lock
        
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
        
        // Add to history
        this.history.push({ lat, lon, time: now });
        
        // Keep only last N readings
        if (this.history.length > this.historySize) {
            this.history.shift();
        }
        
        // Need minimum readings before we can detect stationary
        if (this.history.length < 3) {
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
        }
        
        // Return locked position if locked, otherwise smoothed
        if (this.isLocked) {
            return { lat: this.lockedLat, lon: this.lockedLon, locked: true };
        }
        
        // Calculate smoothed position (not locked yet)
        let avgLat = 0, avgLon = 0;
        this.history.forEach(pos => {
            avgLat += pos.lat;
            avgLon += pos.lon;
        });
        avgLat /= this.history.length;
        avgLon /= this.history.length;
        
        return { lat: avgLat, lon: avgLon, locked: false };
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
                console.log('[Compass] iOS magnetic:', heading.toFixed(1) + '°');
            } 
            // Android: Use alpha (may need adjustment)
            else if (event.alpha !== null) {
                heading = event.alpha;
                console.log('[Compass] Android alpha:', heading.toFixed(1) + '°');
            }
            
            if (heading !== undefined && this.callback) {
                this.callback(heading);
            }
        };
        
        window.addEventListener('deviceorientation', handler, true);
        console.log('[DeviceOrientation] Listener enabled (using webkitCompassHeading if available)');
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
    console.log('[spatial_audio.js] v4.7 loaded');
    console.log('[spatial_audio.js] Available presets:', Object.keys(SoundPresets).join(', '));
    console.log('[spatial_audio.js] SampleSource: Ready for MP3/WAV/M4A files');
    console.log('[spatial_audio.js] HeadingManager: GPS + Compass hybrid');
    console.log('[spatial_audio.js] GPSTracker: Auto-lock when stationary');
    console.log('[spatial_audio.js] SpatialAudioApp: High-level app orchestration');
}

/**
 * Spatial Audio GPS System
 * Reusable library for spatial audio with GPS positioning
 * 
 * @version 4.0 (Phase 4 - MultiOscillatorSource + Presets)
 */

console.log('[spatial_audio.js] Loading v4.0...');

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
    }
};

/**
 * Listener - Represents the person experiencing the audio
 */
class Listener {
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
        this.listener = new Listener();
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
 * DeviceOrientation Helper
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
        window.addEventListener('deviceorientation', (event) => {
            if (event.alpha !== null && this.callback) {
                this.callback(event.alpha);
            }
        });
    },

    stop() { this.callback = null; }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        SpatialAudioEngine, Listener, SoundSource, OscillatorSource, 
        GpsSoundSource, MultiOscillatorSource, SoundPresets,
        GPSUtils, DeviceOrientationHelper
    };
} else {
    window.SpatialAudioEngine = SpatialAudioEngine;
    window.Listener = Listener;
    window.SoundSource = SoundSource;
    window.OscillatorSource = OscillatorSource;
    window.GpsSoundSource = GpsSoundSource;
    window.MultiOscillatorSource = MultiOscillatorSource;
    window.SoundPresets = SoundPresets;
    window.GPSUtils = GPSUtils;
    window.DeviceOrientationHelper = DeviceOrientationHelper;
    console.log('[spatial_audio.js] v4.0 loaded');
    console.log('[spatial_audio.js] Available presets:', Object.keys(SoundPresets).join(', '));
}

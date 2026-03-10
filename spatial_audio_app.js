/**
 * Listener - Represents a listener in the audio experience
 * Immutable from UI - engine owns and updates
 */
class Listener {
    constructor(config = {}) {
        this.id = config.id || 'listener1';
        this.lat = config.lat || 0;
        this.lon = config.lon || 0;
        this.heading = config.heading || 0;
    }

    /**
     * Update position and heading
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} heading - Heading in degrees (0-360°)
     */
    update(lat, lon, heading) {
        this.lat = lat;
        this.lon = lon;
        this.heading = heading;
    }

    /**
     * Get current position
     * @returns {{id: string, lat: number, lon: number, heading: number}}
     */
    getPosition() {
        return {
            id: this.id,
            lat: this.lat,
            lon: this.lon,
            heading: this.heading
        };
    }

    /**
     * Set heading (from compass)
     * @param {number} heading - Heading in degrees
     */
    setHeading(heading) {
        this.heading = heading;
    }
}

/**
 * Sound - Represents a sound source in the audio experience
 * Immutable from UI - engine owns and manages
 */
class Sound {
    constructor(config) {
        if (!config.url) {
            throw new Error('Sound config must have url');
        }
        
        // Accept either lat/lon OR distance/direction (direction will be converted by SpatialAudioApp)
        // For now, just validate url - lat/lon will be set by SpatialAudioApp if using distance/direction
        if (config.lat === undefined && config.distance === undefined) {
            throw new Error('Sound config must have either lat/lon OR distance/direction');
        }

        this.id = config.id || `sound_${Date.now()}`;
        this.url = config.url;
        this.lat = config.lat || 0;  // Will be set by SpatialAudioApp if using distance
        this.lon = config.lon || 0;  // Will be set by SpatialAudioApp if using distance
        this.activationRadius = config.activationRadius || 30;
        this.volume = config.volume !== undefined ? config.volume : 1.0;
        this.loop = config.loop || false;
        
        // Runtime state (managed by engine)
        this.sourceNode = null;
        this.isPlaying = false;
        this.gainNode = null;
        this.pannerNode = null;
    }

    /**
     * Get sound info (read-only, for UI display)
     * @returns {{id: string, lat: number, lon: number, activationRadius: number, isPlaying: boolean}}
     */
    getInfo() {
        return {
            id: this.id,
            lat: this.lat,
            lon: this.lon,
            activationRadius: this.activationRadius,
            isPlaying: this.isPlaying
        };
    }

    /**
     * Set volume (can be called by engine or via app API)
     * @param {number} volume - Volume (0.0 - 1.0)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }

    /**
     * Set activation radius
     * @param {number} radius - Radius in meters
     */
    setActivationRadius(radius) {
        this.activationRadius = radius;
    }
}

/**
 * SpatialAudioApp - Main application class
 * Orchestrates audio experience with clean UI separation
 */
class SpatialAudioApp {
    constructor(soundConfigs, options = {}) {
        // Validate and store configs
        if (!Array.isArray(soundConfigs) || soundConfigs.length === 0) {
            throw new Error('SpatialAudioApp requires at least one sound config');
        }

        this.soundConfigs = soundConfigs;
        this.options = {
            activationRadius: options.activationRadius || 30,
            gpsSmoothing: options.gpsSmoothing !== false,  // Default true
            autoLock: options.autoLock !== false,          // Default true
            ...options
        };

        // Runtime state (engine-owned)
        this.engine = null;
        this.listener = null;
        this.sounds = [];
        this.gpsTracker = null;
        this.isRunning = false;
        
        // Callbacks for UI
        this.onPositionUpdate = null;
        this.onStateChange = null;
        this.onError = null;
    }

    /**
     * Start the audio experience
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            throw new Error('App is already running');
        }

        try {
            this._setState('starting');
            console.log('[SpatialAudioApp] Starting...');

            // Initialize audio engine FIRST (user gesture context)
            console.log('[SpatialAudioApp] Initializing audio...');
            this.engine = new SpatialAudioEngine({
                keepAlive: true,
                keepAliveInterval: 3000
            });
            await this.engine.init();
            console.log('[SpatialAudioApp] Audio initialized');
            
            await this.engine.resume();
            this.engine.enableKeepAlive(3000);

            // Initialize GPS tracker (less aggressive locking)
            this.gpsTracker = new GPSTracker({
                historySize: 5,           // Fewer samples = more responsive
                minMovement: 2.0,         // Ignore movements < 2m (was 0.5m)
                stationaryTime: 5000      // Wait 5s to lock (was 3s)
            });

            // Create listener (will be updated with GPS)
            this.listener = new Listener();

            // Get initial GPS position FIRST
            console.log('[SpatialAudioApp] Requesting GPS...');
            const initialPos = await this._getInitialGPS();
            console.log('[SpatialAudioApp] GPS received:', initialPos);
            
            this.listener.update(initialPos.lat, initialPos.lon, 0);

            // Create sounds from configs
            this.sounds = this.soundConfigs.map((config, i) => {
                // If config has distance/direction, calculate lat/lon from GPS
                if (config.distance !== undefined && config.direction !== undefined) {
                    const dirRad = config.direction * Math.PI / 180;
                    const dLat = (config.distance * Math.cos(dirRad)) / 111000;
                    const dLon = (config.distance * Math.sin(dirRad)) / (111000 * Math.cos(initialPos.lat * Math.PI / 180));
                    
                    return new Sound({
                        id: config.id || `sound_${i}`,
                        url: config.url,
                        lat: initialPos.lat + dLat,
                        lon: initialPos.lon + dLon,
                        activationRadius: config.activationRadius,
                        volume: config.volume,
                        loop: config.loop
                    });
                } else {
                    // Config already has lat/lon
                    return new Sound(config);
                }
            });
            
            console.log('[SpatialAudioApp] Sounds created:', this.sounds.length);

            // Place sounds at their GPS positions
            console.log('[SpatialAudioApp] Initializing sounds...');
            await this._initializeSounds();
            console.log('[SpatialAudioApp] Sounds initialized - created', this.sounds.length, 'sounds');
            
            // Verify sounds are playing
            this.sounds.forEach((sound, i) => {
                console.log(`[SpatialAudioApp] Sound ${i}: ${sound.id}, playing=${sound.isPlaying}, volume=${sound.volume}`);
            });

            // Start GPS tracking
            console.log('[SpatialAudioApp] Starting GPS tracking...');
            this._startGPSTracking();

            // Start compass tracking
            console.log('[SpatialAudioApp] Starting compass tracking...');
            this._startCompassTracking();

            this._setState('running');
            console.log('[SpatialAudioApp] ✅ Started successfully - state is now RUNNING');

        } catch (error) {
            console.error('[SpatialAudioApp] ❌ Start failed:', error);
            this._setState('error');
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    /**
     * Stop the audio experience
     */
    stop() {
        if (!this.isRunning) return;

        // Stop GPS tracking
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }

        // Stop audio engine
        if (this.engine) {
            this.engine.removeAllSources();
            this.engine = null;
        }

        this.sounds = [];
        this.listener = null;
        this.isRunning = false;
        this._setState('stopped');
        console.log('[SpatialAudioApp] Stopped');
    }

    /**
     * Set volume for a specific sound
     * @param {string} soundId - Sound ID
     * @param {number} volume - Volume (0.0 - 1.0)
     */
    setVolume(soundId, volume) {
        const sound = this.sounds.find(s => s.id === soundId);
        if (sound) {
            sound.setVolume(volume);
        }
    }

    /**
     * Set activation radius for a specific sound
     * @param {string} soundId - Sound ID
     * @param {number} radius - Radius in meters
     */
    setActivationRadius(soundId, radius) {
        const sound = this.sounds.find(s => s.id === soundId);
        if (sound) {
            sound.setActivationRadius(radius);
        }
    }

    /**
     * Get current state
     * @returns {{isRunning: boolean, listener: object, sounds: array}}
     */
    getState() {
        return {
            isRunning: this.isRunning,
            listener: this.listener ? this.listener.getPosition() : null,
            sounds: this.sounds.map(s => s.getInfo())
        };
    }

    // ========== Private Methods ==========

    /**
     * Get initial GPS position
     * @returns {Promise<{lat: number, lon: number}>}
     * @private
     */
    async _getInitialGPS() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                // GPS failed - use fallback position
                console.warn('[GPS] Timeout - using fallback position');
                resolve({
                    lat: 0,
                    lon: 0
                });
            }, 8000);

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    clearTimeout(timeout);
                    console.log('[GPS] Position received:', pos.coords.latitude.toFixed(4), pos.coords.longitude.toFixed(4), 'accuracy:', pos.coords.accuracy.toFixed(1) + 'm');
                    resolve({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude
                    });
                },
                (error) => {
                    clearTimeout(timeout);
                    let msg = 'GPS error: ';
                    switch(error.code) {
                        case 1: msg += 'Permission denied'; break;
                        case 2: msg += 'Position unavailable'; break;
                        case 3: msg += 'Timeout'; break;
                        default: msg += error.message;
                    }
                    console.warn('[GPS]', msg, '- using fallback position');
                    resolve({
                        lat: 0,
                        lon: 0
                    });
                },
                {
                    enableHighAccuracy: false,  // Use WiFi/Cell (fast!) instead of GPS (slow)
                    timeout: 8000,
                    maximumAge: 10000
                }
            );
        });
    }

    /**
     * Initialize sounds at their GPS positions
     * @private
     */
    async _initializeSounds() {
        for (const sound of this.sounds) {
            try {
                const source = await this.engine.createSampleSource(sound.id, {
                    url: sound.url,
                    lat: sound.lat,
                    lon: sound.lon,
                    loop: sound.loop,
                    gain: sound.volume,
                    activationRadius: sound.activationRadius
                });

                if (source) {
                    source.start();
                    sound.sourceNode = source;
                    sound.gainNode = source.gain;
                    sound.pannerNode = source.panner;
                    sound.isPlaying = true;
                }
            } catch (error) {
                console.error(`[SpatialAudioApp] Failed to create sound ${sound.id}:`, error);
                if (this.onError) {
                    this.onError(new Error(`Failed to load sound: ${sound.id}`));
                }
            }
        }
    }

    /**
     * Start GPS tracking
     * @private
     */
    _startGPSTracking() {
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                if (!this.listener || !this.isRunning) return;

                // Use GPS tracker for smoothing and auto-lock
                const pos = this.gpsTracker.update(
                    position.coords.latitude,
                    position.coords.longitude
                );

                // Update listener position
                this.listener.update(pos.lat, pos.lon, this.listener.heading);

                // Update sound positions based on listener movement
                this._updateSoundPositions();

                // Notify UI of position update
                this._notifyPositionUpdate();

                // Debug log (occasionally)
                if (Math.random() < 0.01) {
                    console.log(`[GPS] ${pos.locked ? '🔒 LOCKED' : '🔓 LIVE'} @ ${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}`);
                }
            },
            (error) => {
                console.error('[SpatialAudioApp] GPS error:', error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 10000
            }
        );
        console.log('[SpatialAudioApp] GPS tracking started');
    }

    /**
     * Start compass tracking
     * @private
     */
    _startCompassTracking() {
        DeviceOrientationHelper.start((heading) => {
            if (!this.listener || !this.isRunning) return;

            // Update listener heading
            this.listener.setHeading(heading);

            // Update sound positions based on heading change
            this._updateSoundPositions();

            // Notify UI of position update
            this._notifyPositionUpdate();
        });
    }

    /**
     * Update sound positions based on listener position
     * @private
     */
    _updateSoundPositions() {
        if (!this.engine || !this.listener) return;

        this.engine.updateAllGpsSources(
            this.listener.lat,
            this.listener.lon,
            this.listener.heading
        );
    }

    /**
     * Notify UI of position update
     * @private
     */
    _notifyPositionUpdate() {
        if (!this.onPositionUpdate || !this.listener) return;

        const data = {
            listener: this.listener.getPosition(),
            sounds: this.sounds.map(sound => ({
                ...sound.getInfo(),
                distance: GPSUtils.distance(
                    this.listener.lat,
                    this.listener.lon,
                    sound.lat,
                    sound.lon
                ),
                bearing: GPSUtils.bearing(
                    this.listener.lat,
                    this.listener.lon,
                    sound.lat,
                    sound.lon
                )
            }))
        };

        this.onPositionUpdate(data);
    }

    /**
     * Update internal state and notify UI
     * @param {string} state - New state
     * @private
     */
    _setState(state) {
        this.isRunning = (state === 'running');
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }
}

// Export classes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Listener, Sound, SpatialAudioApp };
} else {
    window.Listener = Listener;
    window.Sound = Sound;
    window.SpatialAudioApp = SpatialAudioApp;
}

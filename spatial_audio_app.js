/**
 * Spatial Audio App
 * High-level application orchestration for spatial audio GPS system
 * 
 * @version 2.5 (Z-Axis Fix Support)
 * @depends spatial_audio.js v5.1+
 * 
 * Manages:
 * - GPS tracking with auto-lock when stationary
 * - Compass integration for device orientation
 * - Sound source lifecycle (create, start, stop, update)
 * - UI callbacks for position/state updates
 */

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
 * 
 * ARCHITECTURE NOTE: GPS Position Redundancy
 * ===========================================
 * This class stores `lat` and `lon`, and GpsSoundSource (in spatial_audio.js) 
 * also stores `gpsLat` and `gpsLon`. This is INTENTIONAL redundancy:
 * 
 * - Sound (app layer): Source of truth for UI, config export, and distance/bearing
 *   calculations. Allows app to work without audio engine initialized.
 * 
 * - GpsSoundSource (audio layer): Cached GPS position for high-frequency audio
 *   updates (60fps panner positioning) without requiring app layer involvement.
 * 
 * This separation allows:
 * - Clean decoupling between app logic and audio rendering
 * - App can query distance/bearing even when audio is stopped
 * - Audio engine can update positions independently once started
 * - No tight coupling - either layer can be modified independently
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
 *
 * Current GPS Tuning (optimized for walking + stopping):
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
 *
 * TODO: API Simplification - Move UI logic into app-level methods:
 *   - app.enableWakeLock() - Currently manual in single_sound_v2.html (requestWakeLock/releaseWakeLock)
 *   - app.autoResumeAudio() - Handle visibility changes internally (visibilitychange event listener)
 *   - app.setCompassThrottle(ms) - Configure throttling (currently COMPASS_THROTTLE_MS in HTML)
 *   - app.getSoundDistance(id) - Query sound distance (currently calculated in updateDisplay)
 *   - app.getSoundBearing(id) - Query sound bearing (currently calculated in updateDisplay)
 *   - app.monitorAudioState() - Auto-resume suspended audio (currently monitorAudioState in HTML)
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
            initialPosition: options.initialPosition || null,  // Pre-fetched GPS position
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
        this.onGPSUpdate = null;  // GPS position updates (for map marker)
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
                keepAlive: false,  // DISABLED - causes intermodulation distortion
                keepAliveInterval: 3000,
                reverbEnabled: true  // ENABLED - clean reverb with short IR
            });
            await this.engine.init();
            console.log('[SpatialAudioApp] Audio initialized');

            console.log('[SpatialAudioApp] Resuming audio engine...');
            
            // Add timeout to prevent hanging on iOS DuckDuckGo
            const resumePromise = this.engine.resume();
            const resumeTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Audio engine resume timeout')), 3000)
            );
            
            try {
                await Promise.race([resumePromise, resumeTimeout]);
                console.log('[SpatialAudioApp] Audio engine resumed, state:', this.engine.getState());
            } catch (resumeErr) {
                console.warn('[SpatialAudioApp] Audio resume issue (contining anyway):', resumeErr.message);
            }
            // Keep-alive DISABLED - causes intermodulation distortion (audible ringing)
            // this.engine.enableKeepAlive(3000);

            // TODO: Future - auto-switch these based on GPS speed
            // Initialize GPS tracker (tuned for walking + stopping)
            console.log('[SpatialAudioApp] Creating GPS tracker...');
            this.gpsTracker = new GPSTracker({
                historySize: 3,           // Was: 5 (less lag: ~1.5s vs ~2.5s)
                minMovement: 0.3,         // Was: 0.5 (more sensitive: 30cm vs 50cm)
                stationaryTime: 1500,     // Was: 3000 (locks faster: 1.5s vs 3s)
                stationaryThreshold: 0.3  // Match minMovement
                // unlockThreshold: 2x internally (0.6m to unlock vs 1.5m)
            });
            console.log('[SpatialAudioApp] GPS tracker created (walking tune: 3 samples, 0.3m, 1.5s)');

            // Create listener (will be updated with GPS)
            console.log('[SpatialAudioApp] Creating listener...');
            this.listener = new Listener();
            console.log('[SpatialAudioApp] Listener created');

            // Get initial GPS position FIRST
            // Use pre-fetched position if available (avoids iOS permission race condition)
            console.log('[SpatialAudioApp] Getting initial GPS position...');
            let initialPos;
            if (this.options.initialPosition) {
                console.log('[SpatialAudioApp] Using pre-fetched GPS position');
                initialPos = this.options.initialPosition;
            } else {
                console.log('[SpatialAudioApp] Requesting GPS...');
                initialPos = await this._getInitialGPS();
            }
            console.log('[SpatialAudioApp] GPS received:', initialPos);

            console.log('[SpatialAudioApp] Updating listener position...');
            this.listener.update(initialPos.lat, initialPos.lon, 0);
            console.log('[SpatialAudioApp] Listener updated');

            // Create sounds from configs
            console.log('[SpatialAudioApp] Creating sounds from configs...');
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
            console.log('[SpatialAudioApp] Verifying sounds...');
            this.sounds.forEach((sound, i) => {
                console.log(`[SpatialAudioApp] Sound ${i}: ${sound.id}, playing=${sound.isPlaying}, volume=${sound.volume}`);
            });

            // Start GPS tracking
            console.log('[SpatialAudioApp] Starting GPS tracking...');
            this._startGPSTracking();
            console.log('[SpatialAudioApp] GPS tracking started');

            // Compass is already started in the UI click handler (single_sound_v2.html)
            // No need to request permission again here

            console.log('[SpatialAudioApp] Setting state to running...');
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
     * Get distance from listener to a sound source
     * @param {string} soundId - Sound ID
     * @returns {number|null} Distance in meters, or null if sound not found
     */
    getSoundDistance(soundId) {
        if (!this.listener) return null;
        const sound = this.sounds.find(s => s.id === soundId);
        if (!sound) return null;
        return GPSUtils.distance(
            this.listener.lat,
            this.listener.lon,
            sound.lat,
            sound.lon
        );
    }

    /**
     * Get absolute bearing from listener to a sound source
     * @param {string} soundId - Sound ID
     * @returns {number|null} Bearing in degrees (0-360°), or null if sound not found
     */
    getSoundBearing(soundId) {
        if (!this.listener) return null;
        const sound = this.sounds.find(s => s.id === soundId);
        if (!sound) return null;
        return GPSUtils.bearing(
            this.listener.lat,
            this.listener.lon,
            sound.lat,
            sound.lon
        );
    }

    /**
     * Get relative bearing from listener to a sound source (adjusted for listener heading)
     * @param {string} soundId - Sound ID
     * @returns {number|null} Relative bearing in degrees (0-360°), or null if sound not found
     */
    getSoundRelativeBearing(soundId) {
        if (!this.listener) return null;
        const sound = this.sounds.find(s => s.id === soundId);
        if (!sound) return null;
        const bearing = GPSUtils.bearing(
            this.listener.lat,
            this.listener.lon,
            sound.lat,
            sound.lon
        );
        return GPSUtils.relativeBearing(bearing, this.listener.heading);
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
        console.log('[SpatialAudioApp] _initializeSounds called, sounds count:', this.sounds.length);
        
        for (const sound of this.sounds) {
            try {
                console.log('[SpatialAudioApp] Creating sound:', sound.id, 'URL:', sound.url);
                
                const source = await this.engine.createSampleSource(sound.id, {
                    url: sound.url,
                    lat: sound.lat,
                    lon: sound.lon,
                    loop: sound.loop,
                    gain: sound.volume,
                    activationRadius: sound.activationRadius
                });

                console.log('[SpatialAudioApp] createSampleSource returned:', source ? 'SUCCESS' : 'NULL');

                if (source) {
                    console.log('[SpatialAudioApp] Starting sound:', sound.id);
                    const started = source.start();
                    console.log('[SpatialAudioApp] source.start() returned:', started);
                    
                    sound.sourceNode = source;
                    sound.gainNode = source.gain;
                    sound.pannerNode = source.panner;
                    sound.isPlaying = true;
                    
                    console.log('[SpatialAudioApp] Sound chain:', 
                        'sourceNode:', !!source.sourceNode,
                        'gain:', !!source.gain,
                        'panner:', !!source.panner,
                        'buffer:', !!source.buffer,
                        'loop:', source.loop);
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

                // Update listener position (keep compass heading!)
                this.listener.update(pos.lat, pos.lon, this.listener.heading);

                // Notify UI of GPS update (for map marker)
                if (this.onGPSUpdate) {
                    this.onGPSUpdate(pos.lat, pos.lon, pos.locked);
                }

                // Debug: Log GPS updates with heading
                if (Math.random() < 0.1) {
                    console.log(`[GPS] ${pos.locked ? '🔒' : '🔓'} pos=${pos.lat.toFixed(6)},${pos.lon.toFixed(6)} heading=${this.listener.heading.toFixed(0)}°`);
                }

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
    async _startCompassTracking() {
        console.log('[SpatialAudioApp] Requesting compass permission...');
        
        // Request compass - this should return true/false for permission
        const result = DeviceOrientationHelper.start((heading) => {
            if (!this.listener || !this.isRunning) return;

            // Update listener heading
            const oldHeading = this.listener.heading;
            this.listener.setHeading(heading);

            // Debug: Log compass updates
            if (Math.abs(heading - oldHeading) > 5) {  // Only log significant changes
                console.log(`[Compass] ${oldHeading.toFixed(0)}° → ${heading.toFixed(0)}°`);
            } else if (Math.random() < 0.01) {
                // Occasional heartbeat log
                console.log(`[Compass] ${heading.toFixed(0)}° (stable)`);
            }

            // Update sound positions based on heading change
            this._updateSoundPositions();

            // Notify UI of position update
            this._notifyPositionUpdate();
        });
        
        console.log('[SpatialAudioApp] DeviceOrientationHelper.start() returned:', result);
        
        // If it's a Promise, await it
        if (result && typeof result.then === 'function') {
            const granted = await result;
            console.log('[SpatialAudioApp] Compass permission:', granted ? 'GRANTED ✅' : 'DENIED ❌');
        } else {
            // Not a Promise - assume it worked
            console.log('[SpatialAudioApp] Compass: No permission required (or already granted)');
        }
    }

    /**
     * Update sound positions based on listener position
     * @private
     */
    _updateSoundPositions() {
        if (!this.engine || !this.listener) return;

        // Debug: Log what heading we're using
        if (Math.random() < 0.05) {
            console.log(`[AudioApp] _updateSoundPositions: lat=${this.listener.lat.toFixed(6)}, lon=${this.listener.lon.toFixed(6)}, heading=${this.listener.heading.toFixed(0)}°`);
        }

        // Always use compass for orientation (heading), GPS for position (lat/lon)
        // This prevents snapping when GPS transitions between locked/live
        // Compass provides smooth, continuous heading regardless of movement

        // Update engine's listener position and orientation
        // Uses compass heading for smooth rotation even while walking
        this.engine.updateListenerPosition(
            this.listener.lat,
            this.listener.lon,
            this.listener.heading  // ← Always compass heading
        );

        // Update all sound positions based on current listener position
        // This recalculates x,z from GPS coordinates (no accumulation drift)
        this.engine.updateAllGpsSources(
            this.listener.lat,
            this.listener.lon,
            this.listener.heading
        );

        // Update gain/volume based on distance (fade in/out as you approach)
        this.sounds.forEach(sound => {
            const source = this.engine.getSource(sound.id);
            if (source && source.updateGainByDistance) {
                source.updateGainByDistance(
                    this.listener.lat,
                    this.listener.lon,
                    sound.volume  // Max volume at close range
                );
            }
        });
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
     * Start a soundscape with behaviors
     *
     * This method accepts a SoundScape object and executes its behaviors.
     * If no behaviors are defined, it defaults to starting all sounds together.
     *
     * @param {SoundScape} soundscape - Soundscape object with waypointData and behaviors
     * @returns {Promise<void>}
     */
    async startSoundScape(soundscape) {
        if (!soundscape || !soundscape.waypointData) {
            throw new Error('startSoundScape requires a SoundScape with waypointData');
        }

        console.log('[SpatialAudioApp] Starting soundscape:', soundscape.name);

        // Convert waypointData to sound configs
        const soundConfigs = soundscape.waypointData.map(wp => ({
            id: wp.id,
            url: wp.soundUrl,
            lat: wp.lat,
            lon: wp.lon,
            activationRadius: wp.activationRadius,
            volume: wp.volume,
            loop: wp.loop
        }));

        // Start the app with these configs
        this.soundConfigs = soundConfigs;
        await this.start();

        // Execute behaviors after sounds are loaded
        if (soundscape.behaviors && soundscape.behaviors.length > 0) {
            console.log('[SpatialAudioApp] Executing', soundscape.behaviors.length, 'behaviors');

            // Check if BehaviorExecutor is available (soundscape.js must be loaded)
            if (typeof BehaviorExecutor === 'undefined') {
                console.warn('[SpatialAudioApp] ⚠️ BehaviorExecutor not loaded - skipping behaviors');
                console.warn('[SpatialAudioApp] 💡 Make sure soundscape.js is loaded before spatial_audio_app.js');
                return;
            }

            // Wait for sounds to be initialized
            await new Promise(resolve => setTimeout(resolve, 500));

            // Execute each behavior
            soundscape.behaviors.forEach(behaviorSpec => {
                // Get sounds that are members of this behavior
                const behaviorSounds = this.sounds.filter(s =>
                    behaviorSpec.memberIds.includes(s.id)
                );

                if (behaviorSounds.length === 0) {
                    console.warn('[SpatialAudioApp] No sounds found for behavior:', behaviorSpec.type);
                    return;
                }

                // Create executor and start
                const executor = BehaviorExecutor.create(behaviorSpec, behaviorSounds, this.engine);
                executor.start();
            });
        }
        // else: Default behavior (all sounds together) is handled by start()
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

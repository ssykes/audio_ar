/**
 * Spatial Audio App
 * High-level application orchestration for spatial audio GPS system
 *
 * @version 3.0 (Martinez Intersection Crossfade)
 * @depends spatial_audio.js v6.0+
 *
 * Changelog:
 * - v3.0: Added Martinez intersection-based crossfade for overlapping polygon areas
 * - v2.8: Added distance-based low-pass filter (simulates air absorption)
 * - v2.7: Added hysteresis to disposal logic (prevents cycling at zone boundaries)
 * - v2.6: Fixed preloaded sounds not starting when entering active zone
 * - v2.5: Z-Axis Fix Support
 *
 * Manages:
 * - GPS tracking with auto-lock when stationary
 * - Compass integration for device orientation
 * - Sound source lifecycle (create, start, stop, update)
 * - UI callbacks for position/state updates
 * - FEATURE 13: Lazy loading with 3-zone system (active/preload/hysteresis)
 * - FEATURE 14: Air absorption simulation (low-pass filter based on distance)
 * - FEATURE 17: Martinez intersection crossfade (equal-power crossfade in overlap zones)
 *
 * FEATURE 13: ZONE LAYOUT (for 20m activation radius, 10m preload, 10m hysteresis)
 * =================================================
 * 0-20m:   ACTIVE ZONE      → Load + Play (gain fades at edge)
 * 20-30m:  PRELOAD ZONE     → Load muted (10m = ~6 sec walk time @ 4mph)
 * 30-40m:  HYSTERESIS ZONE  → Keep loaded, still playing (faded out)
 * >40m:    DISPOSE ZONE     → Dispose + free memory
 *
 * HYSTERESIS (prevents rapid cycling at boundaries):
 * - Disposal threshold: unloadDistance + hysteresis (40m + 10m = 50m)
 * - User must walk 50m away before disposal (not 40m)
 * - User walking back: sound reloads at 30m (preload zone)
 * - This creates a 10m "no man's land" where sound stays loaded
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

        // === Direction Tracking (for Area fade prediction) ===
        this.prevLat = null;
        this.prevLon = null;
        this.prevTime = null;
        this.movementVector = { direction: 0, speed: 0 };  // m/s
    }

    /**
     * Update position and heading
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} heading - Heading in degrees (0-360°)
     */
    update(lat, lon, heading) {
        const now = Date.now();

        // Store previous position for movement calculation
        this.prevLat = this.lat;
        this.prevLon = this.lon;
        this.prevTime = this.prevTime || now;

        this.lat = lat;
        this.lon = lon;
        if (heading !== null) this.heading = heading;

        // Calculate movement vector
        this._updateMovementVector(now);
    }

    /**
     * Calculate movement direction and speed
     * @private
     */
    _updateMovementVector(now) {
        if (this.prevLat === null || this.prevLon === null) {
            this.movementVector = { direction: this.heading, speed: 0 };
            return;
        }

        const dt = (now - this.prevTime) / 1000;  // Seconds
        if (dt <= 0) return;

        // Calculate distance and direction
        const distance = GPSUtils.distance(this.prevLat, this.prevLon, this.lat, this.lon);
        const direction = GPSUtils.bearing(this.prevLat, this.prevLon, this.lat, this.lon);
        const speed = distance / dt;  // m/s

        this.movementVector = { direction, speed };
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

    /**
     * Get current heading
     * @returns {number} Heading in degrees
     */
    getHeading() {
        return this.heading;
    }

    /**
     * Get movement vector (direction and speed)
     * @returns {{direction: number, speed: number}} Direction in degrees, speed in m/s
     */
    getMovementVector() {
        return this.movementVector;
    }

    /**
     * Predict future position based on current movement
     * @param {number} seconds - Seconds ahead to predict
     * @returns {{lat: number, lon: number}} Predicted position
     */
    predictPosition(seconds) {
        if (this.movementVector.speed <= 0) {
            return { lat: this.lat, lon: this.lon };
        }

        const distance = this.movementVector.speed * seconds;
        const pos = GPSUtils.placeSound(this.lat, this.lon, distance, this.movementVector.direction);
        return { lat: pos.lat, lon: pos.lon };
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
        // For oscillators, url is optional (not required)
        if (!config.url && config.type !== 'oscillator') {
            throw new Error('Sound config must have url (unless type is oscillator)');
        }

        // Accept either lat/lon OR distance/direction (direction will be converted by SpatialAudioApp)
        // For now, just validate url - lat/lon will be set by SpatialAudioApp if using distance/direction
        if (config.lat === undefined && config.distance === undefined) {
            throw new Error('Sound config must have either lat/lon OR distance/direction');
        }

        this.id = config.id || `sound_${Date.now()}`;
        this.url = config.url || '';  // Empty for oscillators
        this.lat = config.lat || 0;  // Will be set by SpatialAudioApp if using distance
        this.lon = config.lon || 0;  // Will be set by SpatialAudioApp if using distance
        this.activationRadius = config.activationRadius || 30;
        this.volume = config.volume !== undefined ? config.volume : 1.0;
        this.loop = config.loop || false;

        // === FEATURE 13: Audio Type Discriminator ===
        this.type = config.type || 'buffer';  // 'buffer' | 'oscillator' | 'stream'

        // === FEATURE 13: Oscillator-Specific Properties ===
        this.oscillatorType = config.oscillatorType || 'sine';  // 'sine' | 'square' | 'triangle' | 'sawtooth'
        this.frequency = config.frequency || 440;  // Hz
        this.detune = config.detune || 0;  // cents

        // === FEATURE 13: Stream-Specific Properties ===
        this.isLive = config.isLive || false;  // Live stream vs on-demand HLS
        this.streamBitrate = config.streamBitrate || 128;  // kbps

        // === FEATURE 13: State Tracking (Lazy Loading) ===
        this.isLoading = false;    // Currently loading from network
        this.isLoaded = false;     // Buffer/source ready
        this.isDisposed = false;   // Nodes disposed (freed from memory)
        this.isPaused = false;     // Stream paused (connection kept)
        this.loadPromise = null;   // Promise for async loading
        this.currentZone = null;   // 'active' | 'preload' | 'hysteresis' | 'paused'

        // Runtime state (managed by engine)
        this.sourceNode = null;
        this.isPlaying = false;
        this.gainNode = null;
        this.pannerNode = null;
        
        // === FEATURE 14: Distance-Based Audio Filtering (Air Absorption) ===
        this.filterNode = null;  // Low-pass filter for high-frequency loss over distance
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

    /**
     * Serialize sound to JSON (for persistence)
     * @returns {Object} JSON-serializable sound data
     */
    toJSON() {
        return {
            id: this.id,
            url: this.url,
            lat: this.lat,
            lon: this.lon,
            activationRadius: this.activationRadius,
            volume: this.volume,
            loop: this.loop,
            type: this.type,
            oscillatorType: this.oscillatorType,
            frequency: this.frequency,
            detune: this.detune,
            isLive: this.isLive,
            streamBitrate: this.streamBitrate
        };
    }

    /**
     * Deserialize sound from JSON
     * @param {Object} data - JSON data
     * @returns {Sound} New Sound instance
     */
    static fromJSON(data) {
        return new Sound(data);
    }
}

/**
 * FEATURE 13: Zone Configuration for Lazy Loading
 * Defines distances for active/preload/hysteresis zones by audio type
 * Uses FIXED MARGINS for consistent loading time regardless of radius size
 *
 * ZONE LAYOUT (for 30m activation radius, 20m preload, 10m hysteresis):
 * ================================================================
 * 0-30m:   ACTIVE ZONE      → Load + Play (full volume)
 * 30-50m:  PRELOAD ZONE     → Load + Play (faded based on distance)
 * 50-60m:  HYSTERESIS ZONE  → Keep loaded, still playing (faded out)
 * >60m:    DISPOSE ZONE     → Dispose + free memory
 *
 * CRITICAL: preloadMargin MUST match or exceed the fade zone (20m) in spatial_audio.js
 * This ensures sounds are loaded BEFORE user enters the fade zone, not after.
 */
const ZoneConfig = {
    // Buffers (MP3/WAV): Standard 3-zone lazy loading
    buffer: {
        activeMultiplier: 1.0,    // Active within 100% of activation radius (plays throughout)
        preloadMargin: 20,        // Fixed 20m preload (MUST match fade zone: 20m)
        unloadMargin: 10,         // Fixed 10m hysteresis (dispose 10m after preload zone)
        hysteresis: 10            // Prevent rapid load/unload cycles
    },

    // Oscillators: Instant creation, no preload needed
    oscillator: {
        activeMultiplier: 1.0,    // Active within 100% of activation radius
        preloadMargin: 0,         // No preload needed (instant creation)
        unloadMargin: 5,          // Small hysteresis (5m)
        hysteresis: 5
    },

    // Streams (HLS): Pause-only strategy (prevent rebuffering)
    stream: {
        activeMultiplier: 1.0,    // Play within 100% of activation radius
        pauseMargin: 50,          // Pause 50m beyond activation radius (keep connection)
        unloadMargin: 100,        // Dispose 100m beyond pause zone
        hysteresis: 20
    }
};

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

        // === SESSION 3: Area Manager for polygon sound zones ===
        this.areaManager = null;  // Manages AreaSoundSource instances

        // Callbacks for UI
        this.onPositionUpdate = null;
        this.onStateChange = null;
        this.onError = null;
        this.onGPSUpdate = null;  // GPS position updates (for map marker)
        this.onDebugLog = null;   // Debug log messages (for drift compensation logging)

        // === Listener Drift Compensation (EMA Smoothing) ===
        // Reference: Listener_DRIFT_COMPENSATION.md
        this.smoothedListenerLat = 0;
        this.smoothedListenerLon = 0;
        this.rawListenerLat = 0;  // Store raw GPS for UI display
        this.rawListenerLon = 0;
        this.smoothingFactor = 0.1;  // 0.1 = heavy smoothing, 0.9 = minimal
        this.lastMovementTime = 0;
        this.movementThreshold = 0.5;  // m/s - below this = stationary
        this.isStationary = false;
        this.stationaryThreshold = 2000;  // ms - time to consider stationary

        // === FEATURE 13: Lazy Loading Zone Management ===
        this.lastZoneCheck = 0;  // Timestamp of last zone update (throttle to 1/sec)
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

            // === SESSION 3: Create AreaManager for polygon sound zones ===
            console.log('[SpatialAudioApp] Creating AreaManager...');
            this.areaManager = new AreaManager(this.engine, this.listener);
            console.log('[SpatialAudioApp] AreaManager created');

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

            // FEATURE 13: True Lazy Loading - Don't eagerly load all sounds
            // Sounds will be loaded on-demand when listener enters activation radius
            // This prevents immediate disposal of distant sounds and reduces startup time
            console.log('[SpatialAudioApp] Skipping eager load - using true lazy loading');
            
            // Check for sounds already in range at startup (e.g., simulator avatar on waypoint)
            // This ensures immediate playback if listener starts within activation radius
            console.log('[SpatialAudioApp] Checking for sounds already in range...');
            this._updateSoundZonesAndLoad();

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

        // === SESSION 3: Dispose AreaManager ===
        if (this.areaManager) {
            this.areaManager.dispose();
            this.areaManager = null;
        }

        this.sounds = [];
        this.listener = null;
        this.isRunning = false;
        this._setState('stopped');
        console.log('[SpatialAudioApp] Stopped');
    }

    /**
     * SESSION 3: Load Area configurations into AreaManager
     * @param {Array} areaConfigs - Array of Area data objects
     */
    async loadAreas(areaConfigs) {
        if (!this.areaManager) {
            console.warn('[SpatialAudioApp] Cannot load areas - AreaManager not initialized');
            return;
        }
        console.log('[SpatialAudioApp] Loading', areaConfigs.length, 'areas into AreaManager...');
        await this.areaManager.loadAreas(areaConfigs);
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
     * 
     * DEPRECATED: This method is no longer called during normal startup.
     * True lazy loading is now used - sounds load on-demand when listener
     * enters activation radius (see _updateSoundZonesAndLoad()).
     * 
     * Kept for potential future use or backward compatibility.
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

        // CRITICAL: Update positions immediately after starting sounds
        // This prevents loud burst by calculating proper distance-based gain
        // before the user hears anything (instead of waiting for first GPS update)
        console.log('[SpatialAudioApp] Updating sound positions immediately after init...');
        
        // Debug: Log initial distances and gains
        this.sounds.forEach(sound => {
            const dist = GPSUtils.distance(this.listener.lat, this.listener.lon, sound.lat, sound.lon);
            console.log(`[SpatialAudioApp] Initial distance to ${sound.id}: ${dist.toFixed(1)}m (activation radius: ${sound.activationRadius}m)`);
        });
        
        this._updateSoundPositions();
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

                // === NEW: Apply drift compensation (EMA smoothing) ===
                // This smooths out GPS noise while preserving real movement
                this._updateListenerPosition(pos.lat, pos.lon, this.listener.heading);

                // Notify UI of GPS update (for map marker) - use RAW position
                if (this.onGPSUpdate) {
                    this.onGPSUpdate(pos.lat, pos.lon, pos.locked);
                }

                // Debug: Log GPS updates with heading
                if (Math.random() < 0.1) {
                    console.log(`[GPS] ${pos.locked ? '🔒' : '🔓'} pos=${pos.lat.toFixed(6)},${pos.lon.toFixed(6)} heading=${this.listener.heading.toFixed(0)}°`);
                }

                // Update sound positions based on listener movement
                this._updateSoundPositions();

                // === SESSION 3: Update AreaManager with new position ===
                if (this.areaManager) {
                    this.areaManager.update(pos.lat, pos.lon, this.listener.heading);
                }

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

            // === SESSION 3: Update AreaManager with new heading ===
            if (this.areaManager) {
                this.areaManager.update(this.listener.lat, this.listener.lon, heading);
            }

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
        // Fade zone handles smooth transitions (no abrupt stops)
        this.sounds.forEach(sound => {
            const source = this.engine.getSource(sound.id);

            if (source && source.updateGainByDistance) {
                // Skip gain update for disposed or unloaded sounds
                // This prevents "ghost playback" after disposal
                if (!sound.isLoaded || sound.isDisposed) {
                    return;
                }

                const distance = GPSUtils.distance(
                    this.listener.lat,
                    this.listener.lon,
                    sound.lat,
                    sound.lon
                );

                // Update gain based on distance (fade zone handles smooth transitions)
                // CRITICAL: Must call this even when outside fade zone to mute the sound
                source.updateGainByDistance(
                    this.listener.lat,
                    this.listener.lon,
                    sound.volume  // Max volume at close range
                );

                // Debug: Log gain after update (throttled)
                if (source.gain && Math.random() < 0.05) {
                    const fadeZone = 20;
                    const inFadeZone = distance > sound.activationRadius && distance <= (sound.activationRadius + fadeZone);
                    const zone = distance < sound.activationRadius ? '🔊 ACTIVE' : (inFadeZone ? '🌗 FADE' : '❌ OUTSIDE');
                    console.log(`[AudioApp] ${sound.id} gain: ${source.gain.gain.value.toFixed(3)} @ ${distance.toFixed(1)}m (${zone})`);
                }
            }
            
            // === FEATURE 14: Update Low-Pass Filter Based on Distance ===
            // Simulates air absorption (high frequencies lost over distance)
            if (sound.isLoaded && !sound.isDisposed && sound.filterNode) {
                const distance = GPSUtils.distance(
                    this.listener.lat,
                    this.listener.lon,
                    sound.lat,
                    sound.lon
                );
                
                const cutoff = this._calculateFilterCutoff(distance);
                sound.filterNode.frequency.value = cutoff;
                
                // Debug: Log filter updates (throttled, 1% sampling)
                if (Math.random() < 0.01) {
                    console.log(`[AudioApp] ${sound.id} filter: ${cutoff.toFixed(0)}Hz @ ${distance.toFixed(1)}m`);
                }
            }
        });

        // FEATURE 13: Update zones and trigger load/dispose (lazy loading)
        this._updateSoundZonesAndLoad();
    }

    /**
     * FEATURE 13: Update zones and trigger load/dispose actions
     * Throttled to once per second to avoid excessive loading
     * @private
     */
    async _updateSoundZonesAndLoad() {
        // Throttle zone checks to once per second (avoid excessive loading)
        const now = Date.now();
        if (!this.lastZoneCheck || (now - this.lastZoneCheck) > 1000) {
            this.lastZoneCheck = now;

            if (this.onDebugLog) {
                this.onDebugLog(`🔄 Checking sound zones...`);
            }

            const zones = this._updateSoundZones();

            // Load active zone sounds immediately
            if (zones.toLoad.length > 0) {
                if (this.onDebugLog) {
                    this.onDebugLog(`📥 Loading ${zones.toLoad.length} active zone sound(s)...`);
                }
                for (const sound of zones.toLoad) {
                    this._loadAndStartSound(sound);
                }
            }

            // Preload preload-zone sounds in background (non-blocking)
            if (zones.toPreload.length > 0) {
                if (this.onDebugLog) {
                    this.onDebugLog(`📦 Preloading ${zones.toPreload.length} sound(s)...`);
                }
                for (const sound of zones.toPreload) {
                    this._preloadSound(sound);  // Don't await - background task
                }
            }

            // Resume paused streams in active zone
            if (zones.toResume.length > 0) {
                if (this.onDebugLog) {
                    this.onDebugLog(`▶️ Resuming ${zones.toResume.length} stream(s)...`);
                }
                for (const sound of zones.toResume) {
                    this._resumePausedStream(sound);
                }
            }

            // Dispose unload-zone sounds
            if (zones.toDispose.length > 0) {
                if (this.onDebugLog) {
                    this.onDebugLog(`🗑️ Disposing ${zones.toDispose.length} sound(s)...`);
                }
                for (const sound of zones.toDispose) {
                    this._disposeSound(sound);
                }
            }

            // Debug: Log zone distribution (10% sampling)
            if (Math.random() < 0.1 && this.onDebugLog) {
                this._debugLogZoneDistribution();
            }
        }
    }

    /**
     * FEATURE 13: Resume a paused stream (quick resume from pause state)
     * @param {Sound} sound - Stream to resume
     * @returns {Promise<void>}
     * @private
     */
    async _resumePausedStream(sound) {
        if (!sound.isPaused || !sound.sourceNode) {
            return;  // Not paused or no source
        }

        if (this.onDebugLog) {
            this.onDebugLog(`▶️ Resuming stream ${sound.id}...`);
        }

        try {
            // Resume stream playback
            if (sound.sourceNode.play) {
                await sound.sourceNode.play();
            }

            // Restore gain (unmute)
            if (sound.gainNode) {
                sound.gainNode.gain.value = sound.volume;
            }

            sound.isPlaying = true;
            sound.isPaused = false;

            if (this.onDebugLog) {
                this.onDebugLog(`✅ Stream ${sound.id} resumed`);
            }
        } catch (error) {
            if (this.onDebugLog) {
                this.onDebugLog(`⚠️ Stream ${sound.id} resume failed: ${error.message}`);
            }
            // Fallback: reload stream from scratch
            sound.isPaused = false;
            sound.isLoaded = false;
            this._loadAndStartSound(sound);
        }
    }

    /**
     * FEATURE 13: Log zone distribution for debugging
     * @private
     */
    _debugLogZoneDistribution() {
        const byType = {
            buffer: { active: 0, preload: 0, unload: 0 },
            oscillator: { active: 0, inactive: 0 },
            stream: { active: 0, paused: 0, unloaded: 0 }
        };

        this.sounds.forEach(sound => {
            if (byType[sound.type]) {
                byType[sound.type][sound.currentZone]++;
            }
        });

        if (this.onDebugLog) {
            this.onDebugLog(`📊 Zone Distribution:`);
            this.onDebugLog(`  Buffers: ${byType.buffer.active} active, ${byType.buffer.preload} preload, ${byType.buffer.unload} unload`);
            this.onDebugLog(`  Oscillators: ${byType.oscillator.active} active`);
            this.onDebugLog(`  Streams: ${byType.stream.active} active, ${byType.stream.paused} paused, ${byType.stream.unloaded} unloaded`);
        }
    }

    /**
     * FEATURE 13: Determine which zone a sound is in based on distance and type
     * @param {Sound} sound - Sound object
     * @param {number} distance - Distance to sound in meters
     * @returns {{
     *   zone: string,
     *   shouldLoad: boolean,
     *   shouldPlay: boolean,
     *   shouldDispose: boolean,
     *   isInstant: boolean,
     *   keepAlive: boolean
     * }}
     * @private
     */
    _getSoundZone(sound, distance) {
        const config = ZoneConfig[sound.type] || ZoneConfig.buffer;
        const activationRadius = sound.activationRadius || 30;

        // Calculate zone boundaries using FIXED MARGINS (not multipliers)
        // This gives consistent loading time regardless of radius size
        const preloadStart = activationRadius + config.preloadMargin;
        const unloadDistance = activationRadius + config.preloadMargin + config.unloadMargin;

        // Oscillators: Instant creation, no preload needed
        if (sound.type === 'oscillator') {
            const inActiveZone = distance < activationRadius;
            
            // === HYSTERESIS: Prevent rapid create/destroy cycles ===
            const disposeThreshold = unloadDistance + config.hysteresis;
            const wasInactive = sound.currentZone === 'inactive';
            const shouldDispose = wasInactive 
                ? distance > disposeThreshold
                : distance > unloadDistance;
            
            return {
                zone: inActiveZone ? 'active' : 'inactive',
                shouldLoad: inActiveZone,
                shouldPlay: inActiveZone,
                shouldDispose: shouldDispose,
                isInstant: true,  // Skip preload
                keepAlive: false
            };
        }

        // Streams: Pause-only strategy (prevent rebuffering)
        if (sound.type === 'stream') {
            const pauseStart = activationRadius + config.pauseMargin;
            const inActiveZone = distance < activationRadius;
            const inPauseZone = distance < pauseStart;

            // === HYSTERESIS: Prevent rapid pause/dispose cycles ===
            const disposeThreshold = unloadDistance + config.hysteresis;
            const wasInHysteresisZone = sound.currentZone === 'hysteresis';
            const shouldDispose = wasInHysteresisZone
                ? distance > disposeThreshold
                : distance > unloadDistance;

            return {
                zone: inActiveZone ? 'active' :
                      inPauseZone ? 'paused' : 'hysteresis',
                shouldLoad: inPauseZone,  // Load/pause within pause zone
                shouldPlay: inActiveZone,
                shouldDispose: shouldDispose,
                isInstant: false,
                keepAlive: inPauseZone  // Keep connection alive in pause zone
            };
        }

        // Buffers: Standard 3-zone lazy loading with fixed margins
        const inActiveZone = distance < activationRadius;
        const inPreloadZone = distance < preloadStart;

        // === HYSTERESIS: Prevent rapid load/dispose cycles at boundary ===
        // Only dispose if sound was already in hysteresis zone AND user walked further
        // This prevents cycling when user stands near the disposal boundary
        const disposeThreshold = unloadDistance + config.hysteresis;
        const wasInHysteresisZone = sound.currentZone === 'hysteresis';
        const shouldDispose = wasInHysteresisZone
            ? distance > disposeThreshold  // Use hysteresis if was in hysteresis zone
            : distance > unloadDistance;   // Normal disposal if newly entering

        // DEBUG: Log zone calculation for buffers (20% sampling to avoid spam)
        if (this.onDebugLog && Math.random() < 0.2) {
            this.onDebugLog(`  🧮 [ZONE CALC] ${sound.id}: radius=${activationRadius}m, preloadStart=${preloadStart}m, unload=${unloadDistance}m, disposeThresh=${disposeThreshold}m`);
            this.onDebugLog(`    distance=${distance.toFixed(1)}m | inActive=${inActiveZone}, inPreload=${inPreloadZone}, wasInHysteresis=${wasInHysteresisZone} → zone=${inActiveZone ? 'active' : inPreloadZone ? 'preload' : 'hysteresis'}, shouldDispose=${shouldDispose}`);
        }

        return {
            zone: inActiveZone ? 'active' :
                  inPreloadZone ? 'preload' : 'hysteresis',
            shouldLoad: inPreloadZone,
            shouldPlay: inActiveZone,
            shouldDispose: shouldDispose,
            isInstant: false,
            keepAlive: false
        };
    }

    /**
     * FEATURE 13: Update zone states for all sounds
     * @returns {{toLoad: Sound[], toPreload: Sound[], toDispose: Sound[], toResume: Sound[]}}
     * @private
     */
    _updateSoundZones() {
        const toLoad = [];
        const toPreload = [];
        const toDispose = [];
        const toResume = [];

        // DEBUG: Log all sound states at start of zone check
        if (this.onDebugLog) {
            this.onDebugLog(`📊 [ZONE DEBUG] Checking ${this.sounds.length} sounds:`);
        }

        this.sounds.forEach(sound => {
            const distance = this.getSoundDistance(sound.id);
            const zone = this._getSoundZone(sound, distance);
            const activationRadius = sound.activationRadius || 30;
            const fadeZone = 20;  // Match spatial_audio.js fade zone

            // DEBUG: Log each sound's state
            if (this.onDebugLog) {
                this.onDebugLog(`  🔍 ${sound.id}: ${distance.toFixed(1)}m | loaded=${sound.isLoaded} | playing=${sound.isPlaying} | disposed=${sound.isDisposed} | zone=${sound.currentZone || 'null'}→${zone.zone}`);
            }

            // Store current zone for debugging
            const previousZone = sound.currentZone;
            sound.currentZone = zone.zone;

            // Detect zone changes (for logging)
            if (previousZone !== zone.zone && this.onDebugLog) {
                this.onDebugLog(`📍 ${sound.id} (${sound.type}): ${previousZone || 'unknown'} → ${zone.zone} (${distance.toFixed(1)}m, radius=${activationRadius}m)`);
            }

            // Log detailed state when entering loading zone (preload or active)
            if (zone.shouldLoad && !sound.isLoaded && !sound.isLoading && this.onDebugLog) {
                const zoneType = zone.zone === 'active' ? '🔊 WITHIN RADIUS' : '📦 PRELOAD ZONE';
                this.onDebugLog(`🎯 ${zoneType}: ${sound.id} | distance=${distance.toFixed(1)}m | activationRadius=${activationRadius}m | shouldLoad=${zone.shouldLoad} | isLoaded=${sound.isLoaded} | isLoading=${sound.isLoading} | isPlaying=${sound.isPlaying} | isDisposed=${sound.isDisposed}`);
            }

            // Log when sound is within activation radius (should play)
            if (zone.shouldPlay && this.onDebugLog) {
                const state = sound.isLoaded ? (sound.isPlaying ? '✅ PLAYING' : '⏸️ STOPPED') : '⏳ NOT LOADED';
                this.onDebugLog(`🔊 WITHIN RADIUS (${distance.toFixed(1)}m < ${activationRadius}m): ${sound.id} | ${state} | gain=${sound.gainNode ? sound.gainNode.gain.value.toFixed(3) : 'N/A'}`);
            }

            // Log when sound is in fade zone (just outside activation radius)
            const inFadeZone = distance > activationRadius && distance <= (activationRadius + fadeZone);
            if (inFadeZone && this.onDebugLog) {
                this.onDebugLog(`🌗 FADE ZONE: ${sound.id} | distance=${distance.toFixed(1)}m | activationRadius=${activationRadius}m | fadeZone=${fadeZone}m | isLoaded=${sound.isLoaded} | isPlaying=${sound.isPlaying}`);
            }

            // Log when sound is well outside (beyond fade zone)
            const wellOutside = distance > (activationRadius + fadeZone);
            if (wellOutside && zone.zone === 'hysteresis' && this.onDebugLog && Math.random() < 0.05) {
                this.onDebugLog(`❌ OUTSIDE: ${sound.id} | distance=${distance.toFixed(1)}m | activationRadius=${activationRadius}m | fadeZone=${fadeZone}m | shouldDispose=${zone.shouldDispose}`);
            }

            // CRITICAL: Clear isDisposed when entering active/preload zone
            // This must happen BEFORE classification logic below
            if ((zone.zone === 'active' || zone.zone === 'preload') && sound.isDisposed) {
                sound.isDisposed = false;
                if (this.onDebugLog) {
                    this.onDebugLog(`🔄 ${sound.id} cleared disposed flag (entering ${zone.zone} zone)`);
                }
            }

            // Classify sounds by required action
            if (zone.shouldLoad && !sound.isLoading) {
                // === ACTIVE ZONE: Load and play ===
                if (zone.zone === 'active') {
                    if (!sound.isLoaded) {
                        // Not loaded yet - load and start
                        toLoad.push(sound);
                        if (this.onDebugLog) {
                            this.onDebugLog(`📥 ACTIVE ZONE: ${sound.id} queued for loading (${distance.toFixed(1)}m < ${activationRadius}m)`);
                        }
                    } else if (!sound.isPlaying) {
                        // Already loaded (was preloaded) but not playing - start it
                        toLoad.push(sound);
                        if (this.onDebugLog) {
                            this.onDebugLog(`▶️ ${sound.id} preloaded → starting (active zone, ${distance.toFixed(1)}m)`);
                        }
                    }
                    // else: Already loaded and playing - do nothing
                }
                // === PRELOAD ZONE: Load AND play (for fade zone) ===
                else if (zone.zone === 'preload') {
                    if (!sound.isLoaded) {
                        toPreload.push(sound);
                        if (this.onDebugLog) {
                            this.onDebugLog(`📦 PRELOAD ZONE: ${sound.id} queued for preload (${distance.toFixed(1)}m, ${activationRadius}m < d < ${activationRadius + fadeZone}m)`);
                        }
                    } else if (!sound.isPlaying) {
                        // Already loaded but not playing - start it (shouldn't happen, but handle it)
                        toPreload.push(sound);
                        if (this.onDebugLog) {
                            this.onDebugLog(`▶️ ${sound.id} loaded → starting (preload zone, ${distance.toFixed(1)}m)`);
                        }
                    }
                    // else: Already preloaded and playing - do nothing
                }
                // === PAUSED ZONE (streams): Resume paused streams ===
                else if (zone.zone === 'paused' && sound.isPaused) {
                    toResume.push(sound);
                }
            } else if (zone.shouldLoad && this.onDebugLog) {
                // Log why sound is NOT being loaded
                this.onDebugLog(`⚠️ ${sound.id} SKIPPED: zone=${zone.zone}, shouldLoad=${zone.shouldLoad}, isLoaded=${sound.isLoaded}, isLoading=${sound.isLoading}, isPlaying=${sound.isPlaying}`);
            }

            if (zone.shouldDispose && !sound.isDisposed) {
                // DEBUG: Log disposal decision with hysteresis info
                if (this.onDebugLog) {
                    const config = ZoneConfig[sound.type] || ZoneConfig.buffer;
                    const disposeThreshold = (activationRadius + config.preloadMargin + config.unloadMargin) + config.hysteresis;
                    const wasInHysteresisZone = previousZone === 'hysteresis';
                    this.onDebugLog(`  🗑️ [DISPOSE] ${sound.id}: zone=${zone.zone}, distance=${distance.toFixed(1)}m, activationRadius=${activationRadius}m, previousZone=${previousZone}, wasInHysteresis=${wasInHysteresisZone}, disposeThreshold=${disposeThreshold}m`);
                }
                toDispose.push(sound);
            }
        });

        if (this.onDebugLog && (toLoad.length > 0 || toPreload.length > 0 || toDispose.length > 0)) {
            this.onDebugLog(`📦 Zone results: ${toLoad.length} to load, ${toPreload.length} to preload, ${toDispose.length} to dispose`);
        }

        // DEBUG: Log summary of all sound states
        if (this.onDebugLog) {
            const activeCount = this.sounds.filter(s => s.currentZone === 'active').length;
            const preloadCount = this.sounds.filter(s => s.currentZone === 'preload').length;
            const hysteresisCount = this.sounds.filter(s => s.currentZone === 'hysteresis').length;
            const loadedCount = this.sounds.filter(s => s.isLoaded && !s.isDisposed).length;
            const disposedCount = this.sounds.filter(s => s.isDisposed).length;
            this.onDebugLog(`📊 [ZONE SUMMARY] active=${activeCount}, preload=${preloadCount}, hysteresis=${hysteresisCount} | loaded=${loadedCount}, disposed=${disposedCount}, total=${this.sounds.length}`);
        }

        return { toLoad, toPreload, toDispose, toResume };
    }

    /**
     * FEATURE 13: Load and start a single sound on-demand (type-aware)
     * @param {Sound} sound - Sound to load
     * @returns {Promise<void>}
     * @private
     */
    async _loadAndStartSound(sound) {
        // === Handle Preloaded Sounds (Unmute Existing Source) ===
        // If sound was preloaded (isLoaded=true, isPlaying=false), just unmute and start
        if (sound.isLoaded && !sound.isPlaying && sound.sourceNode) {
            if (this.onDebugLog) {
                this.onDebugLog(`▶️ Starting preloaded sound ${sound.id} (unmuting existing source)...`);
            }

            try {
                // Unmute the existing source (set gain to actual volume)
                if (sound.gainNode) {
                    sound.gainNode.gain.value = sound.volume;
                }

                // Start playback if source has start method
                if (sound.sourceNode.start && !sound.isPlaying) {
                    sound.sourceNode.start();
                }

                sound.isPlaying = true;
                
                // CRITICAL: Immediately apply distance-based gain (handles fade zone)
                // This ensures sound starts at correct volume if listener is already in fade zone
                this._applyDistanceGain(sound);
                
                if (this.onDebugLog) {
                    this.onDebugLog(`✅ ${sound.id} started (was preloaded)`);
                }
                return;
            } catch (error) {
                if (this.onDebugLog) {
                    this.onDebugLog(`⚠️ ${sound.id} unmute failed: ${error.message}`);
                }
                // Fallback: dispose and reload from scratch
                this._disposeSound(sound);
                // Continue to normal load path below
            }
        }

        // Guard: prevent duplicate loading
        // Check isPlaying (not just isLoaded) - sound may be loaded but stopped
        if (sound.isLoading || (sound.isLoaded && sound.isPlaying)) {
            if (this.onDebugLog) {
                this.onDebugLog(`⏳ ${sound.id} already loading/playing (isLoading=${sound.isLoading}, isLoaded=${sound.isLoaded}, isPlaying=${sound.isPlaying})`);
            }
            return;
        }

        if (this.onDebugLog) {
            this.onDebugLog(`📥 STARTING LOAD: ${sound.id} (type=${sound.type}, url=${sound.url.substring(0, 50)}..., isDisposed=${sound.isDisposed}, isLoaded=${sound.isLoaded}, isPlaying=${sound.isPlaying})`);
        }

        // CRITICAL: Reset isDisposed flag when starting to reload
        // This allows sounds to be reloaded after being disposed
        if (sound.isDisposed) {
            sound.isDisposed = false;
            if (this.onDebugLog) {
                this.onDebugLog(`🔄 ${sound.id} reloading after disposal`);
            }
        }

        // === Oscillators: Instant Creation ===
        if (sound.type === 'oscillator') {
            if (this.onDebugLog) {
                this.onDebugLog(`🎹 Creating oscillator ${sound.id} (${sound.oscillatorType} ${sound.frequency}Hz)...`);
            }

            try {
                sound.isLoading = true;

                // Create actual oscillator source with properties
                const source = this.engine.createOscillator(sound.id, {
                    lat: sound.lat,
                    lon: sound.lon,
                    loop: sound.loop,
                    gain: sound.gain !== undefined ? sound.gain : sound.volume,
                    activationRadius: sound.activationRadius,
                    wave: sound.oscillatorType || 'sine',
                    freq: sound.frequency || 440
                });

                if (source && source.start()) {
                    sound.sourceNode = source;
                    sound.gainNode = source.gain;
                    sound.pannerNode = source.panner;

                    // === FEATURE 14: Create Low-Pass Filter (Air Absorption) ===
                    sound.filterNode = this.engine.ctx.createBiquadFilter();
                    sound.filterNode.type = 'lowpass';
                    sound.filterNode.frequency.value = 20000;
                    sound.filterNode.Q.value = 0.5;

                    // Reconnect: gain → filter → panner
                    source.gain.disconnect();
                    source.gain.connect(sound.filterNode);
                    sound.filterNode.connect(source.panner);

                    sound.isPlaying = true;
                    sound.isLoaded = true;

                    // Apply distance-based gain
                    this._applyDistanceGain(sound);

                    if (this.onDebugLog) {
                        this.onDebugLog(`✅ ${sound.id} oscillator started (${sound.oscillatorType} ${sound.frequency}Hz)`);
                    }
                }
            } catch (error) {
                if (this.onDebugLog) {
                    this.onDebugLog(`❌ ${sound.id} oscillator error: ${error.message}`);
                }
                console.error(`[SpatialAudioApp] Oscillator ${sound.id} error:`, error);
            } finally {
                sound.isLoading = false;
            }
            return;
        }

        // Debug: log sound type for non-oscillator sounds
        if (this.onDebugLog) {
            this.onDebugLog(`📥 Loading ${sound.type} sound ${sound.id} (url: ${sound.url || '(none)'})...`);
        }

        // === Buffers + Streams: Network Loading ===
        sound.isLoading = true;
        if (this.onDebugLog) {
            this.onDebugLog(`📥 Loading ${sound.type} ${sound.id} (${sound.url})...`);
        }

        try {
            const source = await this.engine.createSampleSource(sound.id, {
                url: sound.url,
                lat: sound.lat,
                lon: sound.lon,
                loop: sound.loop,
                gain: sound.volume,
                activationRadius: sound.activationRadius,
                isStream: sound.type === 'stream'
            });

            if (source) {
                const started = source.start();
                if (started) {
                    sound.sourceNode = source;
                    sound.gainNode = source.gain;
                    sound.pannerNode = source.panner;

                    // === FEATURE 14: Create Low-Pass Filter (Air Absorption) ===
                    // Insert filter between gain and panner
                    // Chain: sourceNode → gain → filter → panner → master
                    sound.filterNode = this.engine.ctx.createBiquadFilter();
                    sound.filterNode.type = 'lowpass';
                    sound.filterNode.frequency.value = 20000;  // Start at full spectrum
                    sound.filterNode.Q.value = 0.5;  // Smooth rolloff

                    // Reconnect: gain → filter → panner
                    source.gain.disconnect();
                    source.gain.connect(sound.filterNode);
                    sound.filterNode.connect(source.panner);

                    sound.isPlaying = true;
                    sound.isLoaded = true;

                    // CRITICAL: Immediately apply distance-based gain (handles fade zone)
                    this._applyDistanceGain(sound);

                    if (this.onDebugLog) {
                        this.onDebugLog(`✅ ${sound.id} loaded + started (with air absorption filter)`);
                    }
                } else {
                    if (this.onDebugLog) {
                        this.onDebugLog(`❌ ${sound.id} failed to start`);
                    }
                }
            } else {
                if (this.onDebugLog) {
                    this.onDebugLog(`❌ ${sound.id} failed to create source`);
                }
            }
        } catch (error) {
            if (this.onDebugLog) {
                this.onDebugLog(`❌ ${sound.id} load error: ${error.message}`);
            }
            console.error(`[SpatialAudioApp] Failed to load ${sound.id}:`, error);
        } finally {
            sound.isLoading = false;
        }
    }

    /**
     * Apply distance-based gain to a sound (fade zone handling)
     * Called immediately after loading to ensure correct initial volume
     * @param {Sound} sound - Sound to update
     * @private
     */
    _applyDistanceGain(sound) {
        if (!this.listener || !sound.sourceNode || !sound.sourceNode.updateGainByDistance) {
            return;
        }

        // Calculate distance and apply gain immediately
        const distance = GPSUtils.distance(
            this.listener.lat,
            this.listener.lon,
            sound.lat,
            sound.lon
        );

        // Apply gain based on distance (fade zone handles smooth transitions)
        sound.sourceNode.updateGainByDistance(
            this.listener.lat,
            this.listener.lon,
            sound.volume  // Max volume at close range
        );

        if (this.onDebugLog) {
            const gain = sound.gainNode ? sound.gainNode.gain.value : 0;
            const inFadeZone = distance > sound.activationRadius && distance <= (sound.activationRadius + 20);
            const zone = distance < sound.activationRadius ? '🔊 ACTIVE' : (inFadeZone ? '🌗 FADE' : '❌ OUTSIDE');
            this.onDebugLog(`🎚️ ${sound.id} initial gain: ${gain.toFixed(3)} @ ${distance.toFixed(1)}m (${zone})`);
        }
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
     * FEATURE 13: Preload sound in background (don't play yet)
     * Only for buffers - oscillators are instant, streams use pause-only strategy
     * 
     * NOTE: Despite the name "preload", this method now STARTS playback for sounds
     * in the fade zone. The gain is set by _applyDistanceGain() to handle fading.
     * 
     * @param {Sound} sound - Sound to preload
     * @returns {Promise<void>}
     * @private
     */
    async _preloadSound(sound) {
        // Only preload buffers (oscillators instant, streams pause-only)
        if (sound.type !== 'buffer') {
            return;
        }

        // Guard: prevent duplicate loading
        if (sound.isLoading || sound.isLoaded) {
            return;
        }

        sound.isLoading = true;
        if (this.onDebugLog) {
            this.onDebugLog(`📥 Preloading ${sound.id} (background)...`);
        }

        try {
            // Create source and load buffer
            // NOTE: Start with gain = 0 to prevent loud burst, then fade in
            const source = await this.engine.createSampleSource(sound.id, {
                url: sound.url,
                lat: sound.lat,
                lon: sound.lon,
                loop: sound.loop,
                gain: 0,  // Start muted, will set correct gain below
                activationRadius: sound.activationRadius
            });

            if (source) {
                sound.sourceNode = source;
                sound.gainNode = source.gain;
                sound.pannerNode = source.panner;

                // === FEATURE 14: Create Low-Pass Filter (Air Absorption) ===
                // Insert filter between gain and panner
                // Chain: sourceNode → gain → filter → panner → master
                sound.filterNode = this.engine.ctx.createBiquadFilter();
                sound.filterNode.type = 'lowpass';
                sound.filterNode.frequency.value = 20000;  // Start at full spectrum
                sound.filterNode.Q.value = 0.5;  // Smooth rolloff

                // Reconnect: gain → filter → panner
                source.gain.disconnect();
                source.gain.connect(sound.filterNode);
                sound.filterNode.connect(source.panner);

                sound.isLoaded = true;

                // CRITICAL: Start playback immediately (for fade zone)
                // The gain will be set by _applyDistanceGain() below
                const started = source.start();
                if (started) {
                    sound.isPlaying = true;

                    // CRITICAL: Apply distance-based gain immediately
                    // This sets the correct faded volume based on listener position
                    this._applyDistanceGain(sound);

                    if (this.onDebugLog) {
                        const gain = sound.gainNode ? sound.gainNode.gain.value : 0;
                        const distance = this.getSoundDistance(sound.id);
                        this.onDebugLog(`✅ ${sound.id} preloaded + started (gain=${gain.toFixed(3)} @ ${distance.toFixed(1)}m)`);
                    }
                } else {
                    if (this.onDebugLog) {
                        this.onDebugLog(`⚠️ ${sound.id} preload start failed`);
                    }
                }
            }
        } catch (error) {
            if (this.onDebugLog) {
                this.onDebugLog(`⚠️ ${sound.id} preload failed: ${error.message}`);
            }
        } finally {
            sound.isLoading = false;
        }
    }

    /**
     * FEATURE 13: Dispose of a sound to free resources (type-aware)
     * @param {Sound} sound - Sound to dispose
     * @private
     */
    _disposeSound(sound) {
        // Guard: already disposed or never loaded
        if (sound.isDisposed || !sound.isLoaded) {
            return;
        }

        // === Streams: Pause-Only Strategy (50-200m) ===
        // Keep connection alive for quick resume (prevent rebuffering)
        if (sound.type === 'stream' && sound.currentZone === 'paused') {
            if (this.onDebugLog) {
                this.onDebugLog(`⏸️ Pausing stream ${sound.id} (keeping connection)...`);
            }

            if (sound.sourceNode) {
                // Pause stream if method exists (keep connection alive)
                if (sound.sourceNode.pause) {
                    sound.sourceNode.pause();
                }
                // Mute output (prevent audio until resumed)
                if (sound.gainNode) {
                    sound.gainNode.gain.value = 0;
                }
            }

            sound.isPlaying = false;
            sound.isPaused = true;
            // Don't set isDisposed = true (keep "loaded" state for quick resume)
            // Don't disconnect nodes (quick resume when user returns)

            return;
        }

        // === Buffers + Oscillators: Full Disposal ===
        if (this.onDebugLog) {
            this.onDebugLog(`🗑️ Disposing ${sound.type} ${sound.id}...`);
        }

        if (sound.sourceNode) {
            // CRITICAL: Disable loop BEFORE stopping, or loop continues playing
            if (sound.sourceNode.loop !== undefined) {
                sound.sourceNode.loop = false;
            }
            // Stop immediately (0 = stop now)
            // Note: BufferSourceNode doesn't have disconnect(), only stop()
            sound.sourceNode.stop(0);
            sound.sourceNode = null;
        }

        if (sound.gainNode) {
            sound.gainNode.disconnect();
            sound.gainNode = null;
        }

        if (sound.pannerNode) {
            sound.pannerNode.disconnect();
            sound.pannerNode = null;
        }

        // === FEATURE 14: Dispose Low-Pass Filter ===
        if (sound.filterNode) {
            sound.filterNode.disconnect();
            sound.filterNode = null;
        }

        // Keep buffer in memory (can reload quickly if needed)
        // But dispose all active nodes

        sound.isPlaying = false;
        sound.isDisposed = true;
        sound.isLoaded = false;  // Mark as not loaded (needs reload to play)
        sound.isPaused = false;

        if (this.onDebugLog) {
            this.onDebugLog(`✅ ${sound.id} disposed`);
        }
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
        const soundConfigs = soundscape.waypointData.map(wp => {
            const config = {
                id: wp.id,
                url: wp.type === 'oscillator' ? '' : wp.soundUrl,  // Ignore soundUrl for oscillators
                lat: wp.lat,
                lon: wp.lon,
                activationRadius: wp.activationRadius,
                volume: wp.volume,
                loop: wp.loop,
                type: wp.type || 'file',
                // Oscillator properties
                oscillatorType: wp.waveform || 'sine',
                frequency: wp.frequency || 440,
                detune: wp.detune || 0,
                gain: wp.gain !== undefined ? wp.gain : wp.volume
            };
            console.log('[SpatialAudioApp] Waypoint sound config:', {
                id: wp.id,
                name: wp.name,
                type: config.type,
                url: config.url,
                oscillatorType: config.oscillatorType,
                frequency: config.frequency
            });
            return config;
        });

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
     * Update listener position with drift compensation (EMA smoothing)
     * Reference: Listener_DRIFT_COMPENSATION.md
     * 
     * This method applies Exponential Moving Average (EMA) smoothing to reduce
     * perceived drift from GPS noise. The virtual listener moves smoothly,
     * canceling out random GPS walk while preserving real movement.
     * 
     * @param {number} lat - Raw latitude from GPS
     * @param {number} lon - Raw longitude from GPS
     * @param {number} heading - Heading from compass (not smoothed)
     */
    _updateListenerPosition(lat, lon, heading) {
        // Store raw position for UI display
        this.rawListenerLat = lat;
        this.rawListenerLon = lon;

        // Initialize smoothed position on first call
        if (this.smoothedListenerLat === 0 && this.smoothedListenerLon === 0) {
            this.smoothedListenerLat = lat;
            this.smoothedListenerLon = lon;
        }

        // === Adaptive Smoothing (Stationary Detection) ===
        // Detect if user is stationary vs moving
        const now = Date.now();
        const distance = this._calculateDistance(
            this.smoothedListenerLat,
            this.smoothedListenerLon,
            lat,
            lon
        );
        const timeDiff = this.lastMovementTime > 0 ? (now - this.lastMovementTime) / 1000 : 1;
        const speed = distance / timeDiff;

        // Detect if stationary (speed below threshold)
        if (speed < this.movementThreshold) {
            this.isStationary = true;
        } else {
            this.isStationary = false;
            this.lastMovementTime = now;
        }

        // Apply adaptive smoothing: aggressive when stationary, responsive when moving
        const targetSmoothing = this.isStationary ? 0.05 : 0.3;
        this.smoothingFactor = this._lerp(this.smoothingFactor, targetSmoothing, 0.1);

        // Debug logging (occasionally)
        if (Math.random() < 0.02 && this.onDebugLog) {
            const mode = this.isStationary ? '🔒 STATIONARY' : '🚶 MOVING';
            this.onDebugLog(`${mode} smoothing=${this.smoothingFactor.toFixed(3)} (speed: ${speed.toFixed(2)} m/s)`);
        }

        // === Exponential Moving Average (EMA) ===
        const smoothedLat = (this.smoothingFactor * lat) +
                           ((1 - this.smoothingFactor) * this.smoothedListenerLat);
        const smoothedLon = (this.smoothingFactor * lon) +
                           ((1 - this.smoothingFactor) * this.smoothedListenerLon);

        this.smoothedListenerLat = smoothedLat;
        this.smoothedListenerLon = smoothedLon;

        // Update listener with smoothed position
        if (this.listener) {
            this.listener.update(smoothedLat, smoothedLon, heading);
        }

        // Debug: Log what heading we're using
        if (Math.random() < 0.05) {
            console.log(`[AudioApp] _updateListenerPosition: lat=${smoothedLat.toFixed(6)}, lon=${smoothedLon.toFixed(6)}, heading=${heading.toFixed(0)}°`);
        }
    }

    /**
     * Calculate distance between two GPS coordinates (Haversine formula)
     * @param {number} lat1 - Latitude 1
     * @param {number} lon1 - Longitude 1
     * @param {number} lat2 - Latitude 2
     * @param {number} lon2 - Longitude 2
     * @returns {number} Distance in meters
     */
    _calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Linear interpolation
     * @param {number} start - Start value
     * @param {number} end - End value
     * @param {number} t - Interpolation factor (0-1)
     * @returns {number} Interpolated value
     */
    _lerp(start, end, t) {
        return start + (end - start) * t;
    }

    /**
     * FEATURE 14: Calculate low-pass filter cutoff frequency based on distance
     * Simulates air absorption (high frequencies lost over distance)
     * 
     * Real-world physics: Air, ground, and turbulence absorb high frequencies
     * more than low frequencies, making distant sounds seem muffled.
     *
     * @param {number} distance - Distance to sound in meters
     * @returns {number} Cutoff frequency in Hz
     */
    _calculateFilterCutoff(distance) {
        // Configuration constants
        const MIN_FREQ = 1000;    // Muffled at max distance (like distant thunder)
        const MAX_FREQ = 20000;   // Full spectrum when close (human hearing limit)
        const MAX_DISTANCE = 80;  // Distance where sound becomes very muffled

        // Linear interpolation
        const ratio = Math.min(distance / MAX_DISTANCE, 1);
        const cutoff = MAX_FREQ - (ratio * (MAX_FREQ - MIN_FREQ));

        // Ensure minimum frequency (don't go completely muffled)
        return Math.max(MIN_FREQ, cutoff);
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

/**
 * AreaManager - Manages Area sound sources for polygon zones
 *
 * Responsibilities:
 * - Area lifecycle (create, start, stop, update, dispose)
 * - Volume mixing for overlapping Areas
 * - Direction-based fade prediction
 * - Overlap mode handling (mix vs opaque)
 *
 * @version 1.0 (Feature: Sound Areas)
 */
class AreaManager {
    constructor(engine, listener) {
        this.engine = engine;
        this.listener = listener;
        this.areas = new Map();  // Map<areaId, AreaSoundSource>
        this.activeAreas = new Set();  // Set of areaIds listener is inside
        this.previousActiveAreas = new Set();  // Track previous frame's active areas for crossfade
        this.lastUpdatePos = { lat: 0, lon: 0 };  // For direction calculation
    }

    /**
     * Load Area configurations and create sound sources
     * @param {Array} areaConfigs - Array of Area data objects
     */
    async loadAreas(areaConfigs) {
        console.log('[AreaManager] Loading', areaConfigs.length, 'areas...');
        console.log('[AreaManager] Listener position:', { lat: this.listener.lat, lon: this.listener.lon });

        // Debug: Log all polygon data for inspection (static, no dragging needed)
        console.group('[AreaManager] === STATIC POLYGON DATA ===');
        areaConfigs.forEach((config, idx) => {
            console.groupCollapsed(`Area ${idx + 1}/${areaConfigs.length}: "${config.name}" (${config.id})`);

            console.log('Polygon vertices:', config.polygon ? config.polygon.length : 0);
            if (config.polygon) {
                config.polygon.forEach((p, i) => {
                    console.log(`  [${i}] lat=${p.lat.toFixed(6)}, lng=${p.lng.toFixed(6)}`);
                });

                // Calculate bounds and size
                const bounds = GPSUtils.polygonBounds(config.polygon);
                const area = Math.abs(GPSUtils.polygonSignedArea(config.polygon));
                const sizeLat = (bounds.maxLat - bounds.minLat) * 111000;
                const sizeLng = (bounds.maxLng - bounds.minLng) * 111000 * Math.cos(bounds.minLat * Math.PI / 180);

                console.log(`  Area: ${area.toFixed(8)} deg²`);
                console.log(`  Bounds: lat[${bounds.minLat.toFixed(6)} to ${bounds.maxLat.toFixed(6)}], lng[${bounds.minLng.toFixed(6)} to ${bounds.maxLng.toFixed(6)}]`);
                console.log(`  Size: ${sizeLat.toFixed(1)}m × ${sizeLng.toFixed(1)}m`);
                console.log(`  Overlap mode: ${config.overlapMode || 'mix'}`);
                console.log(`  Order: ${config.order || 0}`);

                // === POLYGON VALIDATION ===
                const validation = GPSUtils.validatePolygon(config.polygon);
                if (!validation.valid) {
                    if (validation.errors.length > 0) {
                        console.error(`  ❌ VALIDATION ERRORS (${validation.errors.length}):`);
                        validation.errors.forEach(err => {
                            console.error(`    ❌ ${err.message}`);
                        });
                    }
                    if (validation.warnings.length > 0) {
                        console.warn(`  ⚠️ VALIDATION WARNINGS (${validation.warnings.length}):`);
                        validation.warnings.forEach(warn => {
                            console.warn(`    ⚠️ ${warn.message}`);
                        });
                    }
                } else {
                    console.log(`  ✅ Polygon validation passed`);
                }
            } else {
                console.warn('  ⚠️ NO POLYGON DATA!');
            }

            console.groupEnd();
        });
        console.groupEnd();

        // Summary of validation results
        const validationSummary = {
            total: areaConfigs.length,
            valid: 0,
            withErrors: 0,
            withWarnings: 0
        };
        areaConfigs.forEach(config => {
            if (config.polygon) {
                const v = GPSUtils.validatePolygon(config.polygon);
                if (v.valid) validationSummary.valid++;
                else if (v.errors.length > 0) validationSummary.withErrors++;
                else validationSummary.withWarnings++;
            }
        });

        if (validationSummary.withErrors > 0 || validationSummary.withWarnings > 0) {
            console.group('%c[AreaManager] ⚠️ POLYGON VALIDATION SUMMARY', 'color: #f39c12; font-weight: bold; font-size: 14px;');
            console.log(`  Total areas: ${validationSummary.total}`);
            console.log(`  ✅ Valid: ${validationSummary.valid}`);
            console.log(`  ❌ Errors: ${validationSummary.withErrors} (Martinez intersection will fail)`);
            console.log(`  ⚠️ Warnings: ${validationSummary.withWarnings} (may cause issues)`);
            console.log('%c  💡 Fix: Edit or delete problematic areas in the map editor', 'color: #00d9ff;');
            console.groupEnd();
        }

        for (const areaConfig of areaConfigs) {
            try {
                console.log('[AreaManager] Area config:', {
                    id: areaConfig.id,
                    name: areaConfig.name,
                    type: areaConfig.type,
                    waveform: areaConfig.waveform,
                    frequency: areaConfig.frequency,
                    detune: areaConfig.detune,
                    gain: areaConfig.gain
                });
                const areaSource = new AreaSoundSource(this.engine, areaConfig.id, {
                    areaId: areaConfig.id,
                    polygon: areaConfig.polygon,
                    soundUrl: areaConfig.soundUrl,
                    type: areaConfig.type || 'file',
                    volume: areaConfig.volume || 0.8,
                    loop: areaConfig.loop !== false,
                    fadeZoneWidth: areaConfig.fadeZoneWidth || 5.0,
                    overlapMode: areaConfig.overlapMode || 'mix',
                    order: areaConfig.order || 0,
                    gain: areaConfig.gain !== undefined ? areaConfig.gain : areaConfig.volume || 0.8,
                    // Oscillator properties
                    oscillatorType: areaConfig.waveform || 'sine',
                    frequency: areaConfig.frequency || 440,
                    detune: areaConfig.detune || 0
                });

                areaSource.init();
                const loaded = await areaSource.load();
                if (loaded) {
                    areaSource.start();
                    console.log('[AreaManager] Calling updateVolume with listener pos:', { lat: this.listener.lat, lon: this.listener.lon });
                    areaSource.updateVolume(this.listener.lat, this.listener.lon);
                    
                    // Debug: Check if listener is inside this area
                    const isInside = GPSUtils.pointInPolygon(this.listener.lat, this.listener.lon, areaConfig.polygon);
                    console.log('[AreaManager] Area', areaConfig.id, 'listener inside:', isInside);
                }
                this.areas.set(areaConfig.id, areaSource);
            } catch (error) {
                console.error('[AreaManager] Failed to load area', areaConfig.id, error);
            }
        }

        console.log('[AreaManager] Total areas loaded:', this.areas.size);
        
        // Debug: Export helper for console
        console.log('[AreaManager] 💡 To export polygons as GeoJSON, run: app.areaManager.exportPolygons()');
    }
    
    /**
     * Export polygon data as GeoJSON (for debugging)
     * Run from console: app.areaManager.exportPolygons()
     * @returns {string} GeoJSON string
     */
    exportPolygons() {
        const features = [];
        this.areas.forEach((area, id) => {
            const coords = area.polygon.map(p => [p.lng, p.lat]);
            coords.push(coords[0]); // Close the ring
            features.push({
                type: 'Feature',
                properties: {
                    id: id,
                    name: area.areaId,
                    overlapMode: area.overlapMode,
                    order: area.order
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords]
                }
            });
        });
        
        const geojson = {
            type: 'FeatureCollection',
            features: features
        };
        
        const jsonStr = JSON.stringify(geojson, null, 2);
        console.log('=== POLYGON GEOJSON EXPORT ===');
        console.log(jsonStr);
        console.log('=== END EXPORT ===');
        console.log('💡 Copy the JSON above or download:');
        
        // Create downloadable blob
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `polygons_${new Date().toISOString().slice(0,19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        return jsonStr;
    }

    /**
     * Update all areas based on listener position
     * Called on every GPS/position update
     * @param {number} listenerLat - Listener latitude
     * @param {number} listenerLon - Listener longitude
     * @param {number} heading - Listener heading
     */
    update(listenerLat, listenerLon, heading) {
        if (this.areas.size === 0) return;

        const activeAreas = [];

        // Calculate direction of travel from last position
        const direction = this._calculateDirection(this.lastUpdatePos.lat, this.lastUpdatePos.lon, listenerLat, listenerLon);

        // Update each area
        for (const [areaId, areaSource] of this.areas) {
            // Check if listener is inside polygon
            const isInside = areaSource.isActive(listenerLat, listenerLon);
            const wasActive = this.previousActiveAreas.has(areaId);

            // === HYSTERESIS: Prevent rapid enter/exit flickering at boundaries ===
            // If we were active but now outside, check distance to edge
            // Only deactivate if we're > 3m outside the boundary
            let shouldActivate = isInside;
            if (!isInside && wasActive) {
                const distanceToEdge = GPSUtils.distanceToEdge(listenerLat, listenerLon, areaSource.polygon);
                // Stay active if within 3m of edge (hysteresis zone)
                shouldActivate = distanceToEdge < 3.0;
            }

            if (shouldActivate) {
                activeAreas.push(areaSource);
                this.activeAreas.add(areaId);

                // Debug: Log when entering an area
                if (!wasActive) {
                    console.log('[AreaManager] ✅ ENTERED area', areaId, 'at', { lat: listenerLat, lon: listenerLon });
                }

                // For non-mix areas (opaque), update volume immediately
                // For mix areas, volume will be set by _mixAreas()
                if (areaSource.overlapMode !== 'mix') {
                    areaSource.updateVolume(listenerLat, listenerLon, direction, !wasActive);
                }
            } else {
                this.activeAreas.delete(areaId);

                // Debug: Log when exiting an area
                if (wasActive) {
                    console.log('[AreaManager] ❌ EXITED area', areaId, 'at', { lat: listenerLat, lon: listenerLon });
                }

                // Fade out smoothly when exiting area (or moving beyond hysteresis zone)
                if (areaSource.gain) {
                    const t = this.engine.ctx.currentTime;
                    areaSource.gain.gain.cancelScheduledValues(t);
                    areaSource.gain.gain.setTargetAtTime(0, t, 0.1);
                }
            }
        }

        // Handle overlap mixing with direction-aware crossfade
        if (activeAreas.length > 0) {
            this._mixAreas(activeAreas, direction);
        }

        // Store state for next update
        this.previousActiveAreas = new Set(this.activeAreas);
        this.lastUpdatePos = { lat: listenerLat, lon: listenerLon };
    }

    /**
     * Calculate direction of travel between two points
     * @param {number} lat1 - Start latitude
     * @param {number} lon1 - Start longitude
     * @param {number} lat2 - End latitude
     * @param {number} lon2 - End longitude
     * @returns {number} Direction in degrees (0-360°)
     * @private
     */
    _calculateDirection(lat1, lon1, lat2, lon2) {
        if (lat1 === 0 && lon1 === 0) return 0;  // No previous position

        const dLon = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    /**
     * Mix volumes for overlapping areas with direction-aware crossfading
     * Handles both 'mix' and 'opaque' overlap modes
     * Maintains constant total volume across all overlapping areas
     * @param {Array<AreaSoundSource>} activeAreas - Currently active areas
     * @param {number} travelDirection - Direction of travel in degrees (0-360°)
     * @private
     */
    _mixAreas(activeAreas, travelDirection = 0) {
        // Separate by overlap mode
        const mixAreas = activeAreas.filter(a => a.overlapMode === 'mix');
        const opaqueAreas = activeAreas.filter(a => a.overlapMode === 'opaque');

        // === OPAQUE MODE ===
        // Only the highest-order (last placed) opaque area plays
        if (opaqueAreas.length > 0) {
            // Sort by order (descending - highest order wins)
            opaqueAreas.sort((a, b) => b.order - a.order);
            const topOpaque = opaqueAreas[0];

            // Play top opaque area at full volume
            if (topOpaque.gain) {
                const t = this.engine.ctx.currentTime;
                topOpaque.gain.gain.cancelScheduledValues(t);
                topOpaque.gain.gain.setTargetAtTime(topOpaque.options.gain, t, 0.01);
            }

            // Mute all other opaque areas
            for (let i = 1; i < opaqueAreas.length; i++) {
                const area = opaqueAreas[i];
                if (area.gain) {
                    const t = this.engine.ctx.currentTime;
                    area.gain.gain.cancelScheduledValues(t);
                    area.gain.gain.setTargetAtTime(0, t, 0.1);
                }
            }
        }

        // === MIX MODE: Martinez intersection-based crossfade ===
        // For 2 overlapping areas: use geometric intersection + equal-power crossfade
        // For 3+ areas: fall back to equal distribution (Martinez limitation)
        if (mixAreas.length > 0) {
            const t = this.engine.ctx.currentTime;

            if (mixAreas.length === 2) {
                // === TWO-AREA INTERSECTION CROSSFADE ===
                const area1 = mixAreas[0];
                const area2 = mixAreas[1];

                // Step 1: Compute intersection polygon using Martinez
                const intersection = GPSUtils.martinezIntersection(area1.polygon, area2.polygon);

                if (intersection) {
                    // Step 2: Get listener position in intersection (0=entry, 1=exit)
                    const crossfadePos = GPSUtils.getCrossfadePosition(
                        this.listener.lat,
                        this.listener.lon,
                        intersection,
                        travelDirection
                    );

                    // Step 3: Determine origin vs destination area
                    // Origin = behind listener, Destination = ahead
                    const dirToArea1 = this._calculateDirection(
                        this.listener.lat,
                        this.listener.lon,
                        this._calculateAreaCenter(area1.polygon).lat,
                        this._calculateAreaCenter(area1.polygon).lon
                    );
                    const dirToArea2 = this._calculateDirection(
                        this.listener.lat,
                        this.listener.lon,
                        this._calculateAreaCenter(area2.polygon).lat,
                        this._calculateAreaCenter(area2.polygon).lon
                    );

                    const angleDiff1 = Math.abs(this._normalizeAngle(travelDirection - dirToArea1));
                    const angleDiff2 = Math.abs(this._normalizeAngle(travelDirection - dirToArea2));

                    // Area behind (angle > 90°) = Origin, Area ahead = Destination
                    const originArea = angleDiff1 > 90 ? area1 : area2;
                    const destArea = angleDiff1 > 90 ? area2 : area1;

                    // Step 4: Apply equal-power crossfade (cos/sin curves)
                    // Entry (pos=0): origin=100%, dest=0%
                    // Middle (pos=0.5): origin=71%, dest=71% (constant power)
                    // Exit (pos=1): origin=0%, dest=100%
                    const originWeight = Math.cos(crossfadePos * Math.PI / 2);
                    const destWeight = Math.sin(crossfadePos * Math.PI / 2);

                    // Step 5: Apply volumes with fade zone consideration
                    const applyVolume = (area, weight) => {
                        if (!area.gain) return;

                        // Calculate base volume from distance to edge (fade zone effect)
                        const distanceToEdge = GPSUtils.distanceToEdge(
                            this.listener.lat,
                            this.listener.lon,
                            area.polygon
                        );

                        // Guard: Handle invalid distances (Infinity, NaN)
                        if (!isFinite(distanceToEdge)) {
                            area.gain.gain.value = 0;
                            return;
                        }

                        let fadeVolume = 1.0;
                        if (distanceToEdge < area.fadeZoneWidth) {
                            fadeVolume = distanceToEdge / area.fadeZoneWidth;
                            fadeVolume = Math.pow(fadeVolume, 0.5);
                        }

                        // Apply crossfade weight + fade zone + max volume setting
                        const finalVolume = fadeVolume * area.options.gain * weight;
                        
                        // Guard: Ensure final volume is finite
                        if (!isFinite(finalVolume)) {
                            area.gain.gain.value = 0;
                            return;
                        }
                        
                        area.gain.gain.cancelScheduledValues(t);
                        area.gain.gain.setTargetAtTime(finalVolume, t, 0.05);
                    };

                    applyVolume(originArea, originWeight);
                    applyVolume(destArea, destWeight);

                    // Debug logging: Only when inside intersection (crossfade active)
                    // crossfadePos is 0-1 when inside, <0 or >1 when outside
                    if (crossfadePos >= 0 && crossfadePos <= 1) {
                        console.log(`[Crossfade] pos=${crossfadePos.toFixed(2)} | ` +
                            `${originArea.areaId}: ${(originWeight * 100).toFixed(0)}% vol | ` +
                            `${destArea.areaId}: ${(destWeight * 100).toFixed(0)}% vol`);
                    }
                } else {
                    // Fallback: no intersection (shouldn't happen) - use equal distribution
                    this._applyEqualDistribution(mixAreas, t);
                }
            } else {
                // Fallback: 3+ areas = equal distribution (1/N per area)
                // Martinez doesn't handle multi-way intersection elegantly
                this._applyEqualDistribution(mixAreas, t);
            }
        }
    }

    /**
     * Apply equal distribution to mix areas (fallback for 3+ areas)
     * @param {Array<AreaSoundSource>} mixAreas - Areas to mix
     * @param {number} t - Audio context time
     * @private
     */
    _applyEqualDistribution(mixAreas, t) {
        const numAreas = mixAreas.length;
        const equalWeight = 1.0 / numAreas;

        for (let i = 0; i < mixAreas.length; i++) {
            const area = mixAreas[i];
            if (area.gain) {
                // Calculate base volume from distance to edge (fade zone effect)
                const distanceToEdge = GPSUtils.distanceToEdge(
                    this.listener.lat,
                    this.listener.lon,
                    area.polygon
                );

                // Guard: Handle invalid distances (Infinity, NaN)
                if (!isFinite(distanceToEdge)) {
                    area.gain.gain.value = 0;
                    continue;
                }

                let fadeVolume = 1.0;
                if (distanceToEdge < area.fadeZoneWidth) {
                    fadeVolume = distanceToEdge / area.fadeZoneWidth;
                    fadeVolume = Math.pow(fadeVolume, 0.5);
                }

                const finalVolume = fadeVolume * area.options.gain * equalWeight;
                
                // Guard: Ensure final volume is finite
                if (!isFinite(finalVolume)) {
                    area.gain.gain.value = 0;
                    continue;
                }
                
                area.gain.gain.cancelScheduledValues(t);
                area.gain.gain.setTargetAtTime(finalVolume, t, 0.05);
            }
        }

        // Debug logging: Only if areas have audible volume (> 0)
        const activeAreas = mixAreas.filter(a => a.gain && a.gain.gain.value > 0);
        if (activeAreas.length > 0) {
            const debugInfo = activeAreas.map((a) =>
                `${a.areaId}:${(a.gain.gain.value * 100).toFixed(0)}%`
            ).join(' | ');
            console.log(`[Crossfade] ${debugInfo} (equal distribution)`);
        }
    }

    /**
     * Calculate center point of a polygon
     * @param {Array} polygon - Array of {lat, lon} points
     * @returns {{lat: number, lon: number}} Center coordinates
     * @private
     */
    _calculateAreaCenter(polygon) {
        if (!polygon || polygon.length === 0) return { lat: 0, lon: 0 };
        let sumLat = 0, sumLon = 0;
        for (const point of polygon) {
            sumLat += point.lat;
            sumLon += point.lon;
        }
        return {
            lat: sumLat / polygon.length,
            lon: sumLon / polygon.length
        };
    }

    /**
     * Normalize angle to range -180 to 180
     * @param {number} angle - Angle in degrees
     * @returns {number} Normalized angle
     * @private
     */
    _normalizeAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    /**
     * Get direction of travel for fade prediction
     * @returns {number} Direction in degrees (0-360°)
     * @private
     */
    _getDirectionOfTravel() {
        const movement = this.listener.getMovementVector();
        return movement.direction;
    }

    /**
     * Predict if listener will cross area boundary
     * Uses movement vector to anticipate fade zone transitions
     * @param {AreaSoundSource} areaSource - Area to check
     * @param {number} secondsAhead - Seconds to predict
     * @returns {boolean} True if will enter/exit area
     * @private
     */
    _willCrossBoundary(areaSource, secondsAhead = 2) {
        const predictedPos = this.listener.predictPosition(secondsAhead);
        const currentInside = GPSUtils.pointInPolygon(
            this.listener.lat,
            this.listener.lon,
            areaSource.polygon
        );
        const predictedInside = GPSUtils.pointInPolygon(
            predictedPos.lat,
            predictedPos.lon,
            areaSource.polygon
        );

        return currentInside !== predictedInside;
    }

    /**
     * Stop all areas and free resources
     */
    dispose() {
        console.log('[AreaManager] Disposing all areas...');

        for (const [areaId, areaSource] of this.areas) {
            areaSource.stop();
            areaSource.dispose();
        }

        this.areas.clear();
        this.activeAreas.clear();
        console.log('[AreaManager] Disposed');
    }

    /**
     * Get area manager status for debugging
     * @returns {{totalAreas: number, activeAreas: number, areaIds: string[]}}
     */
    getStatus() {
        return {
            totalAreas: this.areas.size,
            activeAreas: this.activeAreas.size,
            areaIds: Array.from(this.activeAreas)
        };
    }
}

// Export classes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Listener, Sound, SpatialAudioApp, AreaManager };
} else {
    window.Listener = Listener;
    window.Sound = Sound;
    window.SpatialAudioApp = SpatialAudioApp;
    window.AreaManager = AreaManager;
}

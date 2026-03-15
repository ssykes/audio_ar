/**
 * MapPlayerApp - Player-specific implementation
 * Extends MapAppShared with player functionality
 * 
 * @version 6.1 - Session 6 Refactor: Mode Presets
 * 
 * Features:
 * - Auto-sync on page load (timestamp-based)
 * - Read-only UI (no editing)
 * - GPS/Compass tracking
 * - Minimal UI (Start button only)
 * - Debug console with auto-scroll
 */

console.log('[map_player.js] Loading v6.1...');

class MapPlayerApp extends MapAppShared {
    constructor() {
        super({ mode: 'player' });
    }

    /**
     * Initialize the player app
     * @override
     */
    async init() {
        console.log('Map Player initializing...');
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Check login status
        await this._checkLoginStatus();

        this._initMap();
        this._setupEventListeners();
        this._initDebugConsole();
        await this._getInitialGPS();

        // Apply player restrictions (hide edit controls)
        this._applyPlayerRestrictions();

        // Load soundscape
        if (this.isLoggedIn) {
            await this._loadSoundscapeFromServer();
            // Auto-sync if data has changed
            await this._autoSyncIfNeeded();
        } else {
            this._loadSoundscapeFromStorage();  // Fallback to localStorage
        }

        console.log('Map Player ready');
    }

    /**
     * Check if user is logged in
     * @private
     */
    async _checkLoginStatus() {
        if (this.api.isLoggedIn()) {
            const valid = await this.api.verifyToken();
            if (valid) {
                this.isLoggedIn = true;
                this.debugLog('🔐 Logged in as ' + this.api.user.email);
            }
        }
    }

    /**
     * Apply player restrictions (disable marker dragging)
     * @private
     */
    _applyPlayerRestrictions() {
        console.log('[MapPlayer] 📱 Player mode - disabling marker dragging');

        // Disable marker dragging (markers are read-only)
        this.markers.forEach(marker => {
            marker.dragging.disable();
        });

        this._showToast('📱 Player Mode: Walk to explore the soundscape', 'info');
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this._handleStartClick());
        }
    }

    /**
     * Auto-sync if server data has changed (Session 5E: Timestamp-based sync)
     * @private
     */
    async _autoSyncIfNeeded() {
        if (!this.isLoggedIn || !this.activeSoundscapeId) return;

        try {
            // Get server timestamp
            const serverModified = await this.api.getSoundscapeModified(this.activeSoundscapeId);
            const localModified = localStorage.getItem('soundscape_modified_' + this.activeSoundscapeId);

            if (serverModified !== localModified) {
                this.debugLog('🔄 Timestamp mismatch (server: ' + serverModified + ', local: ' + localModified + ') - auto-syncing...');
                this._showToast('🔄 Updating from server...', 'info');
                await this._loadSoundscapeFromServer();
                this._showToast('✅ Soundscape updated', 'success');
            } else {
                this.debugLog('✅ Timestamp match (' + serverModified + ') - using cached data');
            }
        } catch (error) {
            this.debugLog('⚠️ Auto-sync failed: ' + error.message);
            // Silently fail - use cached data
        }
    }

    /**
     * Load soundscape from server
     * @private
     */
    async _loadSoundscapeFromServer() {
        if (!this.isLoggedIn) {
            this.debugLog('⚠️ Not logged in - cannot load from server');
            return;
        }

        // Skip if no valid soundscape ID (don't pass 'default' to server)
        if (!this.activeSoundscapeId || this.activeSoundscapeId === 'default') {
            this.debugLog('ℹ️ No server soundscape selected - using local data');
            return;
        }

        try {
            this.debugLog('☁️ Loading soundscape from server...');

            // Get soundscape data
            const data = await this.api.loadSoundscape(this.activeSoundscapeId);
            const soundscape = SoundScape.fromJSON(data.soundscape);

            // Clear existing
            this.soundscapes.clear();
            this.waypoints = [];
            this.markers.forEach(marker => marker.remove());
            this.markers.clear();

            // Add to soundscapes map
            this.soundscapes.set(soundscape.id, soundscape);
            this.activeSoundscapeId = soundscape.id;

            // Load waypoints
            this.waypoints = data.waypoints || [];

            // Restore nextId
            if (this.waypoints.length > 0) {
                const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
                this.nextId = maxId + 1;
            }

            // Render waypoints
            this.waypoints.forEach(wp => this._createMarker(wp));
            this._updateWaypointList();

            // Center map on waypoints
            if (this.waypoints.length > 0) {
                const sumLat = this.waypoints.reduce((sum, wp) => sum + wp.lat, 0);
                const sumLon = this.waypoints.reduce((sum, wp) => sum + wp.lon, 0);
                const centerLat = sumLat / this.waypoints.length;
                const centerLon = sumLon / this.waypoints.length;
                this.map.setView([centerLat, centerLon], 17);
            }

            this.debugLog(`✅ Loaded: ${soundscape.name} (${this.waypoints.length} waypoints)`);
        } catch (error) {
            this.debugLog('❌ Failed to load from server: ' + error.message);
            this._showToast('⚠️ Using cached data', 'warning');
            // Fallback to localStorage
            this._loadSoundscapeFromStorage();
        }
    }

    /**
     * Initialize debug console
     * @private
     */
    _initDebugConsole() {
        this.debugConsole = document.getElementById('debugConsole');
        if (this.debugConsole) {
            this.debugLog('🎧 Map Player v6.1 ready');
            this.debugLog('📍 Waiting for GPS...');

            // Auto-scroll debug console
            const observer = new MutationObserver(() => {
                this.debugConsole.scrollTop = this.debugConsole.scrollHeight;
            });
            observer.observe(this.debugConsole, { childList: true, subtree: true });
        }
    }

    // =====================================================================
    // PLAYER MODE - START
    // =====================================================================

    /**
     * Handle start click - start audio experience
     * @protected
     */
    async _handleStartClick() {
        if (this.state === 'player') {
            // Already in player mode - stop
            await this._stopPlayerMode();
            return;
        }

        if (this.waypoints.length === 0) {
            this._showToast('No waypoints to play', 'warning');
            return;
        }

        const startBtn = document.getElementById('startBtn');
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';

        try {
            console.log('[MapPlayer] 🎮 Starting Player Mode...');

            // =====================================================================
            // ⚠️ CRITICAL iOS PERMISSION ORDER - DO NOT REORDER ⚠️
            // =====================================================================
            // 1. Compass (BEFORE any await - must be synchronous in user gesture)
            // 2. Wake lock (in user gesture context)
            // 3. GPS (before other awaits for iOS permission)
            // 4. AudioContext (initialize + resume + close to satisfy iOS)
            // =====================================================================

            // ---------------------------------------------------------------------
            // STEP 1: Request compass permission (BEFORE ANY AWAIT)
            // ---------------------------------------------------------------------
            console.log('[MapPlayer] 🧭 Requesting compass permission...');
            if (typeof DeviceOrientationHelper !== 'undefined') {
                console.log('[MapPlayer] 🧭 DeviceOrientationHelper available:',
                    DeviceOrientationHelper.isAvailable,
                    DeviceOrientationHelper.isPermissionRequired);

                // Call start() synchronously - promise resolves asynchronously
                DeviceOrientationHelper.start((heading) => {
                    if (this.state !== 'player' || !this.app || !this.app.listener) return;

                    // Throttle compass updates
                    const now = Date.now();
                    if (now - this.lastCompassUpdate < this.compassThrottleMs) return;
                    this.lastCompassUpdate = now;

                    // Update listener heading
                    const oldHeading = this.listenerHeading;
                    this.listenerHeading = heading;
                    this.app.listener.setHeading(heading);

                    // Update status bar with new heading
                    this._updateStatusBar();

                    // Log significant changes
                    const headingChange = Math.abs(heading - oldHeading);
                    if (headingChange > 5) {
                        console.log(`[MapPlayer] 🧭 Compass: ${oldHeading.toFixed(0)}° → ${heading.toFixed(0)}° (Δ${headingChange.toFixed(0)}°)`);
                    }

                    // Update sound positions based on heading
                    this.app._updateSoundPositions();
                });
                console.log('[MapPlayer] 🧭 Compass permission requested (will resolve asynchronously)');
            } else {
                console.warn('[MapPlayer] ⚠️ DeviceOrientationHelper not loaded!');
            }

            // ---------------------------------------------------------------------
            // STEP 2: Request wake lock (must be in user gesture)
            // ---------------------------------------------------------------------
            await this._requestWakeLock();

            // ---------------------------------------------------------------------
            // STEP 3: Get GPS position (before other awaits for iOS)
            // ---------------------------------------------------------------------
            console.log('[MapPlayer] 📍 Requesting GPS...');
            let gpsResolved = false;
            const initialGPS = await new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (!gpsResolved) {
                        console.warn('[MapPlayer] ⚠️ GPS timeout - using fallback');
                        resolve({ lat: 0, lon: 0 });
                    }
                }, 12000);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.log(`[MapPlayer] 📍 GPS GRANTED ✅ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}, accuracy: ${pos.coords.accuracy.toFixed(1)}m)`);
                        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                    },
                    (err) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.warn(`[MapPlayer] 📍 GPS ERROR ❌: ${err.message}`);
                        resolve({ lat: 0, lon: 0 });
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            });

            // ---------------------------------------------------------------------
            // STEP 4: Initialize AudioContext (satisfy iOS gesture requirement)
            // ---------------------------------------------------------------------
            console.log('[MapPlayer] 🔊 Initializing audio context...');
            const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const resumePromise = tempAudioCtx.resume();
            const audioTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Audio resume timeout')), 3000)
            );

            try {
                await Promise.race([resumePromise, audioTimeout]);
                console.log('[MapPlayer] ✅ Audio context initialized');
            } catch (audioErr) {
                console.warn(`[MapPlayer] ⚠️ Audio context issue: ${audioErr.message} (continuing)`);
            }
            tempAudioCtx.close();

            // ---------------------------------------------------------------------
            // STEP 5: Create SpatialAudioApp with waypoints as sound sources
            // ---------------------------------------------------------------------
            console.log('[MapPlayer] 🎵 Creating sound configs from waypoints...');
            const soundConfigs = this.waypoints.map(wp => ({
                id: wp.id,
                url: wp.soundUrl || this.soundConfig.soundUrl,
                lat: wp.lat,
                lon: wp.lon,
                activationRadius: wp.activationRadius,
                volume: wp.volume !== undefined ? wp.volume : this.soundConfig.volume,
                loop: wp.loop !== undefined ? wp.loop : this.soundConfig.loop
            }));

            console.log('[MapPlayer] 🎵 Created', soundConfigs.length, 'sound configs');

            // Create app with initial GPS position
            this.app = new SpatialAudioApp(soundConfigs, {
                initialPosition: initialGPS,
                gpsSmoothing: true,
                autoLock: true,
                reverbEnabled: true
            });

            // ---------------------------------------------------------------------
            // STEP 6: Set up callbacks
            // ---------------------------------------------------------------------
            this.app.onPositionUpdate = (data) => {
                this._updateWaypointDistances();
            };

            this.app.onGPSUpdate = (lat, lon, locked) => {
                this._updateListenerMarker(lat, lon, locked);
                // Auto-center map on GPS update (player mode)
                if (this.autoCenterOnGPS) {
                    this.map.setView([lat, lon], 17);
                }
            };

            this.app.onStateChange = (state) => {
                console.log('[MapPlayer] 📊 State changed to:', state);
                this._updateStartButton(state);

                if (state === 'running') {
                    const audioWorks = this.app.engine && this.app.engine.getState() === 'running';

                    if (!audioWorks) {
                        // iOS DuckDuckGo workaround - needs second tap
                        this.needsAudioEnable = true;
                        this._showToast('👆 Tap Start to enable audio', 'info');
                    } else {
                        this.needsAudioEnable = false;
                        this._showToast('✅ Player mode active! Walk toward the sounds', 'success');
                    }
                }
            };

            this.app.onError = (error) => {
                console.error('[MapPlayer] ❌ Error:', error);
                this._showToast('❌ ' + error.message, 'error');
                this._updateStartButton('error');
            };

            // ---------------------------------------------------------------------
            // STEP 7: Start the experience (with soundscape behaviors if available)
            // ---------------------------------------------------------------------
            console.log('[MapPlayer] 🚀 Starting soundscape...');

            // Use startSoundScape if we have a soundscape with behaviors, otherwise use start()
            const soundscape = this.getActiveSoundscape();
            if (soundscape && soundscape.behaviors &&
                soundscape.behaviors.length > 0) {
                console.log('[MapPlayer] 🎼 Starting with behaviors:', soundscape.behaviors.length);
                await this.app.startSoundScape(soundscape);
            } else {
                console.log('[MapPlayer] 🎵 Starting without behaviors (default)');
                await this.app.start();
            }

            console.log('[MapPlayer] ✅ Soundscape started');

            // Update state
            this.state = 'player';
            this._updateStartButton('starting');

            // Refresh waypoint list to show distance placeholders
            this._updateWaypointList();

        } catch (error) {
            console.error('[MapPlayer] ❌ Start failed:', error);
            this._showToast('❌ ' + error.message, 'error');
            this._updateStartButton('error');
        }
    }

    /**
     * Stop player mode
     * @private
     */
    async _stopPlayerMode() {
        console.log('[MapPlayer] ⏹ Stopping Player Mode...');

        // Stop SpatialAudioApp
        if (this.app) {
            this.app.stop();
            this.app = null;
        }

        // Release wake lock
        await this._releaseWakeLock();

        // Clear GPS watch
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }

        // Reset state
        this.state = 'editor';
        this.needsAudioEnable = false;
        this.listenerHeading = 0;

        // Update UI
        this._updateStartButton('stopped');
        this._showToast('⏹ Player mode stopped', 'info');
    }

    /**
     * Request wake lock
     * @private
     */
    async _requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('[MapPlayer] 🔒 Wake lock acquired');

                this.wakeLock.addEventListener('release', () => {
                    console.log('[MapPlayer] 🔒 Wake lock released');
                    this.wakeLock = null;
                });
            } else {
                console.warn('[MapPlayer] ⚠️ Wake Lock API not supported');
            }
        } catch (err) {
            console.warn(`[MapPlayer] ⚠️ Wake lock failed: ${err.message}`);
        }
    }

    /**
     * Release wake lock
     * @private
     */
    async _releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
            console.log('[MapPlayer] 🔒 Wake lock released');
        }
    }

    /**
     * Update start button
     * @param {string} state
     * @private
     */
    _updateStartButton(state) {
        const startBtn = document.getElementById('startBtn');
        if (!startBtn) return;

        startBtn.disabled = false;

        switch (state) {
            case 'starting':
                startBtn.textContent = 'Starting...';
                startBtn.className = 'btn btn-primary';
                break;
            case 'running':
                startBtn.textContent = '⏹ Stop';
                startBtn.className = 'btn btn-danger';
                this._initStatusBar();
                break;
            case 'stopped':
                startBtn.textContent = '▶️ Start';
                startBtn.className = 'btn btn-primary';
                this._resetStatusBar();
                break;
            case 'error':
                startBtn.textContent = '▶️ Start Over';
                startBtn.className = 'btn btn-primary';
                break;
            default:
                startBtn.textContent = '▶️ Start';
                startBtn.className = 'btn btn-primary';
        }
    }

    /**
     * Initialize status bar
     * @private
     */
    _initStatusBar() {
        this._updateStatusBar();
    }

    /**
     * Reset status bar
     * @private
     */
    _resetStatusBar() {
        const gpsStatusEl = document.getElementById('gpsStatus');
        const headingStatusEl = document.getElementById('headingStatus');
        const statusBarEl = document.getElementById('statusBar');

        if (gpsStatusEl) gpsStatusEl.textContent = '--';
        if (headingStatusEl) headingStatusEl.textContent = '--';
        if (statusBarEl) statusBarEl.classList.remove('gps-locked');
    }

    /**
     * Update waypoint distances
     * @private
     */
    _updateWaypointDistances() {
        if (!this.app) return;

        this.waypoints.forEach(wp => {
            const distanceEl = document.getElementById(`dist_${wp.id}`);
            if (distanceEl && this.app) {
                const distance = this.app.getSoundDistance(wp.id);
                if (distance !== null) {
                    distanceEl.textContent = distance.toFixed(1) + ' m';
                }
            }
        });

        // Update status bar
        this._updateStatusBar();
    }

    /**
     * Update status bar
     * @private
     */
    _updateStatusBar() {
        const gpsStatusEl = document.getElementById('gpsStatus');
        const headingStatusEl = document.getElementById('headingStatus');
        const soundsStatusEl = document.getElementById('soundsStatus');
        const statusBarEl = document.getElementById('statusBar');

        if (!gpsStatusEl || !headingStatusEl || !soundsStatusEl) return;

        // GPS status
        if (this.app && this.app.gpsTracker) {
            if (this.app.gpsTracker.isLocked) {
                gpsStatusEl.textContent = '🔒 Locked';
                statusBarEl.classList.add('gps-locked');
            } else {
                gpsStatusEl.textContent = '🔓 Live';
                statusBarEl.classList.remove('gps-locked');
            }
        } else {
            gpsStatusEl.textContent = '--';
        }

        // Heading status
        if (this.listenerHeading !== null) {
            const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            const index = Math.round(this.listenerHeading / 45) % 8;
            headingStatusEl.textContent = `${this.listenerHeading.toFixed(0)}° ${directions[index]}`;
        } else {
            headingStatusEl.textContent = '--';
        }

        // Sounds status
        soundsStatusEl.textContent = this.waypoints.length;
    }
}

// Initialize app
const app = new MapPlayerApp();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

console.log('[map_player.js] MapPlayerApp class loaded');

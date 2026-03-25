/**
 * MapPlayerApp - Player-specific implementation
 * Extends MapAppShared with player functionality
 *
 * @version 7.1 - Add area visualization on map
 *
 * Features:
 * - Auto-sync on page load (timestamp-based)
 * - Read-only UI (no editing)
 * - GPS/Compass tracking
 * - Icon bar with floating toolbar
 * - Bottom status bar (GPS + Heading + Sounds)
 * - Debug modal with copy to clipboard
 */

console.log('[map_player.js] Loading v7.1...');

class MapPlayerApp extends MapAppShared {
    constructor() {
        super({ mode: 'player' });
        // Initialize offline download manager for offline soundscape loading
        this.downloadManager = new OfflineDownloadManager();
        // Area visualization (read-only)
        this.drawnItems = null;  // FeatureGroup for area polygons
        this.areaMarkers = new Map();  // Map<areaId, L.Polygon>
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

        // Check online/offline status
        this.isOnline = navigator.onLine;
        console.log('[MapPlayer] Initial network status:', this.isOnline ? '🟢 Online' : '📴 Offline');
        this.debugLog(`📡 Network status: ${this.isOnline ? '🟢 Online' : '📴 Offline'}`);

        // Listen for network status changes
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.debugLog('📡 Network status: Online');
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.debugLog('📴 Network status: Offline');
        });

        // Check for selected soundscape from picker
        const selectedId = localStorage.getItem('selected_soundscape_id');
        console.log('[MapPlayer] selected_soundscape_id:', selectedId);
        if (selectedId) {
            this.debugLog(`📍 Found selected_soundscape_id: ${selectedId}`);
        } else {
            this.debugLog(`⚠️ No selected_soundscape_id found`);
        }

        // Check login status
        await this._checkLoginStatus();

        this._initMap();
        this._setupEventListeners();
        this._initDebugConsole();
        await this._getInitialGPS();

        // Apply player restrictions (hide edit controls)
        this._applyPlayerRestrictions();

        // Check if user selected a soundscape from picker (Session 9)
        const persistedSelectedId = localStorage.getItem('selected_soundscape_id');
        if (persistedSelectedId) {
            this.debugLog(`📱 Using selected soundscape: ${persistedSelectedId}`);
            this.activeSoundscapeId = persistedSelectedId;
            localStorage.removeItem('selected_soundscape_id');  // Clear after use
            // Persist active soundscape for page refresh (Bug fix: waypoints disappear on refresh)
            localStorage.setItem('player_active_soundscape_id', persistedSelectedId);
        } else {
            // Restore active soundscape from previous session (Bug fix: waypoints disappear on refresh)
            const persistedId = localStorage.getItem('player_active_soundscape_id');
            if (persistedId) {
                this.debugLog(`📱 Restoring active soundscape from previous session: ${persistedId}`);
                this.activeSoundscapeId = persistedId;
            }
        }

        // Load soundscape - use offline mode if not online
        if (!this.isOnline) {
            this.debugLog('📴 Offline mode detected - loading from cache');
            await this._loadSoundscapeFromOffline();
        } else if (this.isLoggedIn) {
            await this._loadSoundscapeFromServer();
            // Auto-sync if data has changed
            await this._autoSyncIfNeeded();
        } else {
            this.debugLog('🔓 Not logged in - cannot load soundscapes (server required)');
            this._showToast('🔓 Please login via index.html to load soundscapes', 'warning');
        }

        console.log('Map Player ready');
        this.debugLog('✅ Map Player ready');
    }

    /**
     * Check if user is logged in
     * @private
     */
    async _checkLoginStatus() {
        // Skip login check when offline - allow offline playback
        if (!this.isOnline) {
            this.debugLog('📴 Offline mode - skipping login verification');
            return;
        }

        if (this.api.isLoggedIn()) {
            const valid = await this.api.verifyToken();
            if (valid) {
                this.isLoggedIn = true;

                // Show user panel
                const userPanel = document.getElementById('userPanel');
                const userEmail = document.getElementById('userEmail');
                if (userPanel) userPanel.style.display = 'block';
                if (userEmail) userEmail.textContent = this.api.user.email;

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

        // Initialize area drawer for visualization (read-only)
        this._initAreaDrawer();

        this._showToast('📱 Player Mode: Walk to explore the soundscape', 'info');
    }

    /**
     * Initialize Leaflet.Draw for area visualization (read-only)
     * @private
     */
    _initAreaDrawer() {
        this.debugLog('🗺️ _initAreaDrawer called');
        
        // Create feature group to store drawn areas
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        
        this.debugLog('✅ drawnItems initialized and added to map');
    }

    /**
     * Load areas into drawer for visualization
     * @param {Object[]} areas
     * @private
     */
    _loadAreasIntoDrawer(areas) {
        this.debugLog('🗺️ _loadAreasIntoDrawer called with ' + (areas ? areas.length : 0) + ' areas');
        
        if (!areas || areas.length === 0) {
            this.debugLog('⚠️ No areas to load');
            return;
        }

        // Safety check: ensure drawnItems is initialized
        if (!this.drawnItems) {
            this.debugLog('⚠️ _loadAreasIntoDrawer: drawnItems not initialized yet');
            return;
        }

        this.debugLog('✅ drawnItems exists, loading areas...');

        areas.forEach((area, idx) => {
            this.debugLog(`  Area ${idx + 1}: ${area.name}, ${area.polygon?.length || 0} vertices`);
            
            const latlngs = area.polygon.map(v => [v.lat, v.lng]);

            const polygon = L.polygon(latlngs, {
                color: area.color || '#ff6b6b',
                fillColor: area.color || '#ff6b6b',
                fillOpacity: 0.2,
                weight: 2
            });

            this.drawnItems.addLayer(polygon);
            this.areaMarkers.set(area.id, polygon);

            // Bind popup (read-only info)
            polygon.bindPopup(this._createAreaPopupContent(area));

            // Add click handler - stop propagation to prevent map clicks
            polygon.on('click', (e) => {
                e.originalEvent.stopPropagation();
            });
        });

        this.debugLog(`📍 Loaded ${areas.length} Areas`);
    }

    /**
     * Get popup content for Area (read-only)
     * @param {Object} area
     * @returns {string}
     * @private
     */
    _createAreaPopupContent(area) {
        return `
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 10px 0;">${area.icon || '◈'} ${area.name}</h3>
                <div style="font-size: 0.85em; color: #666; margin-bottom: 10px;">
                    <div>📍 ${area.polygon.length} vertices</div>
                    <div>🔊 Volume: ${(area.volume * 100).toFixed(0)}%</div>
                    <div>🎵 Sound: ${area.soundUrl.split('/').pop()}</div>
                </div>
            </div>
        `;
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

        // Back to picker button (Session 9)
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = 'soundscape_picker.html';
            });
        }

        // Logout handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this._handleLogout());
        }

        // Toggle debug modal visibility (Session 10)
        const debugBtn = document.getElementById('debugBtn');
        if (debugBtn) {
            debugBtn.addEventListener('click', () => this._toggleDebugModal());
        }

        // Close debug modal
        const debugCloseBtn = document.getElementById('debugCloseBtn');
        if (debugCloseBtn) {
            debugCloseBtn.addEventListener('click', () => this._closeDebugModal());
        }

        // Copy debug log to clipboard (Session 11)
        const debugCopyBtn = document.getElementById('debugCopyBtn');
        if (debugCopyBtn) {
            debugCopyBtn.addEventListener('click', () => this._copyDebugToClipboard());
        }
    }

    /**
     * Handle logout - redirect to index.html
     * @private
     */
    _handleLogout() {
        if (!confirm('Are you sure you want to logout?')) {
            return;
        }

        this.api.logout();
        this.isLoggedIn = false;
        this.serverSoundscapeIds.clear();
        this.soundscapes.clear();
        this.activeSoundscapeId = null;
        this.waypoints = [];

        // Clear map markers
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this._updateWaypointList();

        // Clear persisted active soundscape ID (Bug fix: prevent stale data on next login)
        localStorage.removeItem('player_active_soundscape_id');

        this._showToast('🚪 Logged out successfully', 'info');
        this.debugLog('🚪 Logged out');

        // Redirect to index.html
        window.location.href = 'index.html';
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

            this.debugLog('📦 Server data received:');
            this.debugLog('  - data.soundscape.areas: ' + (data.soundscape.areas ? data.soundscape.areas.length : 'undefined'));
            this.debugLog('  - soundscape.areas: ' + (soundscape.areas ? soundscape.areas.length : 'undefined'));

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

            // Load areas for visualization
            const areas = soundscape.areas || [];
            this.debugLog('🗺️ Loading ' + areas.length + ' areas into drawer...');
            this._loadAreasIntoDrawer(areas);

            this.debugLog('✅ Created ' + this.waypoints.length + ' waypoint markers on map');

            // Center and zoom map to show all waypoints
            if (this.waypoints.length > 0) {
                // Create bounds from all waypoint positions
                const bounds = this.waypoints.map(wp => [wp.lat, wp.lon]);
                
                // Fit map to show all waypoints with padding
                this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
                
                const centerLat = bounds.reduce((sum, b) => sum + b[0], 0) / bounds.length;
                const centerLon = bounds.reduce((sum, b) => sum + b[1], 0) / bounds.length;
                
                this.debugLog(`🗺️ Map centered on soundscape at [${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}] (zoomed to show all waypoints)`);
            }

            this.debugLog(`✅ Loaded: ${soundscape.name} (${this.waypoints.length} waypoints)`);
        } catch (error) {
            this.debugLog('❌ Failed to load from server: ' + error.message);
            this._showToast('⚠️ Server load failed', 'error');
        }
    }

    /**
     * Load soundscape from offline cache (Feature 15: Offline mode)
     * Loads from Cache API + localStorage when device is offline
     * @private
     */
    async _loadSoundscapeFromOffline() {
        if (!this.activeSoundscapeId) {
            this.debugLog('⚠️ No soundscape selected - cannot load offline');
            this._showToast('⚠️ No soundscape selected', 'warning');
            return;
        }

        try {
            this.debugLog('📂 Loading soundscape from offline cache...');
            this.debugLog(`🔍 Looking for: offline_soundscape_full_${this.activeSoundscapeId}`);

            // Get cached soundscape data (including waypoints)
            const cachedData = await this.downloadManager.getCachedSoundscape(this.activeSoundscapeId);
            
            this.debugLog(`📦 Raw cached data: ${cachedData ? 'found' : 'NULL'}`);

            if (!cachedData) {
                const errorMsg = 'Soundscape not available offline. Please download it first while online.';
                this.debugLog('❌ ' + errorMsg);
                throw new Error(errorMsg);
            }

            this.debugLog(`✅ Retrieved cached data for ${cachedData.name}`);
            this.debugLog(`📊 Waypoints in cache: ${cachedData.waypoints?.length || 0}`);

            // Clear existing
            this.soundscapes.clear();
            this.waypoints = [];
            this.markers.forEach(marker => marker.remove());
            this.markers.clear();

            // Create soundscape from cached data
            const soundscape = new SoundScape(cachedData.id, cachedData.name);
            this.soundscapes.set(soundscape.id, soundscape);
            this.activeSoundscapeId = soundscape.id;

            // Load waypoints from cached data
            this.waypoints = cachedData.waypoints || [];
            this.debugLog(`📍 Loaded ${this.waypoints.length} waypoints`);

            // Restore nextId
            if (this.waypoints.length > 0) {
                const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
                this.nextId = maxId + 1;
                this.debugLog(`🔢 nextId set to ${this.nextId}`);
            }

            // Render waypoints
            this.debugLog('🎨 Rendering waypoints...');
            this.waypoints.forEach(wp => {
                this.debugLog(`  - ${wp.id}: ${wp.lat}, ${wp.lon}`);
                this._createMarker(wp);
            });
            this._updateWaypointList();

            // Load areas for visualization
            const areas = cachedData.areas || [];
            this._loadAreasIntoDrawer(areas);
            this.debugLog(`📊 Areas in cache: ${areas.length}`);

            this.debugLog('✅ Created ' + this.waypoints.length + ' waypoint markers on map');

            // Center and zoom map to show all waypoints
            if (this.waypoints.length > 0) {
                // Create bounds from all waypoint positions
                const bounds = this.waypoints.map(wp => [wp.lat, wp.lon]);

                // Fit map to show all waypoints with padding
                this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });

                const centerLat = bounds.reduce((sum, b) => sum + b[0], 0) / bounds.length;
                const centerLon = bounds.reduce((sum, b) => sum + b[1], 0) / bounds.length;

                this.debugLog(`🗺️ Map centered on soundscape at [${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}] (zoomed to show all waypoints)`);
            }

            this.debugLog(`✅ Loaded offline: ${soundscape.name} (${this.waypoints.length} waypoints)`);
            this._showToast('📴 Offline mode - using cached soundscape', 'info');

        } catch (error) {
            this.debugLog('❌ Failed to load from offline cache: ' + error.message);
            this.debugLog('❌ Stack: ' + error.stack);
            this._showToast('❌ ' + error.message, 'error');
            
            // Show helpful message
            if (error.message.includes('not available offline')) {
                this._showToast('💡 Go online and download the soundscape first', 'info');
            }
        }
    }

    /**
     * Initialize debug console
     * @private
     */
    _initDebugConsole() {
        this.debugModal = document.getElementById('debugModal');
        this.debugModalContent = document.getElementById('debugModalContent');
        if (this.debugModalContent) {
            // Log version info for troubleshooting
            this.debugLog('🎧 Map Player v7.1 ready');
            this.debugLog('📄 map_player.js: v7.1 (areas visualization)');
            this.debugLog('📍 Waiting for GPS...');

            // Auto-scroll debug console
            const observer = new MutationObserver(() => {
                if (this.debugModalContent) {
                    this.debugModalContent.scrollTop = this.debugModalContent.scrollHeight;
                }
            });
            observer.observe(this.debugModalContent, { childList: true, subtree: true });
        }
    }

    /**
     * Toggle debug modal visibility (Session 10)
     * @private
     */
    _toggleDebugModal() {
        if (this.debugModal) {
            this.debugModal.classList.add('visible');
            this.debugLog('📋 Debug log shown');
        }
    }

    /**
     * Close debug modal (Session 10)
     * @private
     */
    _closeDebugModal() {
        if (this.debugModal) {
            this.debugModal.classList.remove('visible');
            this.debugLog('📋 Debug log hidden');
        }
    }

    /**
     * Copy debug log to clipboard (Session 11)
     * @private
     */
    async _copyDebugToClipboard() {
        try {
            const debugText = this.debugModalContent.innerText;

            // Use modern Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(debugText);
                this._showToast('✅ Copied to clipboard', 'success');
                this.debugLog('📋 Debug log copied to clipboard');
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = debugText;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this._showToast('✅ Copied to clipboard', 'success');
                this.debugLog('📋 Debug log copied to clipboard (fallback method)');
            }
        } catch (error) {
            this.debugLog('❌ Failed to copy: ' + error.message);
            this._showToast('❌ Copy failed: ' + error.message, 'error');
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
        // Don't change textContent - SVG icon will be updated by _updateStartButton

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

            // === SESSION 3: Load Areas from soundscape into AreaManager ===
            const soundscape = this.getActiveSoundscape();
            if (soundscape && soundscape.areas && soundscape.areas.length > 0) {
                console.log('[MapPlayer] 🗺️ Loading', soundscape.areas.length, 'areas into AreaManager...');
                this.app.loadAreas(soundscape.areas);
            } else {
                console.log('[MapPlayer] 🗺️ No areas in soundscape');
            }

            // ---------------------------------------------------------------------
            // STEP 6: Set up callbacks
            // ---------------------------------------------------------------------
            this.app.onPositionUpdate = (data) => {
                this._updateWaypointDistances();
            };

            this.app.onGPSUpdate = (lat, lon, locked) => {
                this._updateListenerMarker(lat, lon, locked);
                // Auto-center map on GPS update (player mode) - only once at startup
                // Commented out to prevent map from jumping away from waypoints
                // if (this.autoCenterOnGPS) {
                //     this.map.setView([lat, lon], 17);
                // }
            };

            this.app.onDebugLog = (message) => {
                this.debugLog(`[Drift] ${message}`);
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
            // (soundscape variable already declared above for Area loading)
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

            // Update button to running state AFTER everything is initialized
            this._updateStartButton('running');
            
            this.debugLog('✅ Audio started - ' + this.waypoints.length + ' waypoints active');

        } catch (error) {
            console.error('[MapPlayer] ❌ Start failed:', error);
            console.error('[MapPlayer] Stack trace:', error.stack);
            this._showToast('❌ ' + error.message, 'error');
            this._updateStartButton('error');
            // Reset state to allow retry
            this.state = 'editor';
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

        // SVG paths for different states
        const playPath = '<path d="M8 5v14l11-7z"/>';
        const stopPath = '<path d="M6 6h12v12H6z"/>';

        // Get SVG icon element
        const svgIcon = startBtn.querySelector('.icon-svg');
        if (!svgIcon) {
            console.error('[MapPlayer] ⚠️ SVG icon not found in start button');
            return;
        }

        switch (state) {
            case 'starting':
                startBtn.setAttribute('data-tooltip', 'Starting...');
                startBtn.classList.remove('active');
                svgIcon.innerHTML = playPath;  // Keep play icon while starting
                break;
            case 'running':
                startBtn.setAttribute('data-tooltip', 'Stop Audio');
                startBtn.classList.add('active');
                svgIcon.innerHTML = stopPath;
                this._initStatusBar();
                break;
            case 'stopped':
                startBtn.setAttribute('data-tooltip', 'Start Audio');
                startBtn.classList.remove('active');
                svgIcon.innerHTML = playPath;
                this._resetStatusBar();
                break;
            case 'error':
                startBtn.setAttribute('data-tooltip', 'Error - Tap to Retry');
                startBtn.classList.remove('active');
                svgIcon.innerHTML = playPath;  // Show play icon on error
                break;
            default:
                startBtn.setAttribute('data-tooltip', 'Start Audio');
                startBtn.classList.remove('active');
                svgIcon.innerHTML = playPath;
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
        const soundsStatusEl = document.getElementById('soundsStatus');
        const statusBarEl = document.getElementById('statusBar');

        if (gpsStatusEl) gpsStatusEl.textContent = '--';
        if (headingStatusEl) headingStatusEl.textContent = '--';
        if (soundsStatusEl) soundsStatusEl.textContent = '0';
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

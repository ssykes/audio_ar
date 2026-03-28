/**
 * MapAppShared - Abstract base class for map-based apps
 * Uses Mode Presets pattern for behavior configuration
 *
 * @version 6.12 - Areas fix: removed redundant loadAreas(), unified save/load
 * @author Spatial Audio AR Team
 *
 * Architecture:
 * - Shared logic extracted to base class (map initialization, GPS, compass, simulator, audio)
 * - Child classes use mode presets (editor/player) with optional overrides
 * - Abstract methods enforce subclass implementation
 *
 * Usage:
 *   class MapEditorApp extends MapAppShared {
 *       constructor() { super({ mode: 'editor' }); }
 *   }
 *   class MapPlayerApp extends MapAppShared {
 *       constructor() { super({ mode: 'player' }); }
 *   }
 */

console.log('[map_shared.js] Loading v6.11...');

/**
 * Mode Presets - Pre-configured behavior bundles
 * Add new modes here instead of updating every child class
 */
const MODE_PRESETS = {
    /**
     * Editor Mode - Full creation and editing capabilities
     * Used by: MapEditorApp (PC), MapTabletApp (tablet editor)
     */
    editor: {
        allowEditing: true,           // Can add/edit/delete waypoints
        autoSync: false,              // Manual sync only
        showDetailedInfo: true,       // Full waypoint details in popups
        autoCenterOnGPS: false,       // Map doesn't jump on GPS update
        showSimulator: true,          // Show simulation controls
        allowStartTesting: false      // Start button hidden (shown on tablets via runtime detection)
    },

    /**
     * Player Mode - Read-only GPS-based audio experience
     * Used by: MapPlayerApp (phone), MapKioskApp (kiosk viewer)
     */
    player: {
        allowEditing: false,          // No editing allowed
        autoSync: true,               // Auto-sync on page load
        showDetailedInfo: false,      // Minimal popup info
        autoCenterOnGPS: true,        // Map follows user location
        showSimulator: false,         // No simulation controls
        allowStartTesting: true       // Start button visible (GPS required)
    }
};

/**
 * Abstract base class for map applications
 * Uses Mode Presets pattern with optional overrides
 */
class MapAppShared {
    /**
     * @param {Object} options - Configuration options
     * @param {string} [options.mode='editor'] - 'editor' | 'player'
     * @param {boolean} [options.allowEditing] - Override preset (optional)
     * @param {boolean} [options.autoSync] - Override preset (optional)
     * @param {boolean} [options.showDetailedInfo] - Override preset (optional)
     * @param {boolean} [options.autoCenterOnGPS] - Override preset (optional)
     * @param {boolean} [options.showSimulator] - Override preset (optional)
     */
    constructor(options = {}) {
        // Enforce abstract base class
        if (this.constructor === MapAppShared) {
            throw new Error("MapAppShared is abstract - use MapEditorApp or MapPlayerApp");
        }

        // === Properties (shared) ===
        this.state = 'editor';
        this.waypoints = [];
        this.map = null;
        this.markers = new Map();
        this.listenerLat = null;
        this.listenerLon = null;
        this.listenerHeading = 0;
        this.listenerMarker = null;
        this.isDragging = false;
        this.isEditing = false;  // Prevent reentrant _editWaypoint calls

        // Default activation radius (meters)
        this.defaultActivationRadius = 20;
        this.nextId = 1;

        // API Client for server sync
        this.api = new ApiClient('/api');

        // SoundScape management (Session 5B: Multi-Soundscape Support)
        this.soundscapes = new Map();      // All soundscapes: Map<id, SoundScape>
        this.activeSoundscapeId = null;    // Currently selected soundscape ID
        this.serverSoundscapeIds = new Map(); // Map<localId, serverId> for sync

        // Global sound configuration (applies to all waypoints)
        this.soundConfig = {
            soundUrl: '/sounds/BoxingBell.mp3',  // Default sound file
            volume: 0.8,                          // 0.0 - 1.0
            loop: true                            // Loop playback
        };

        // Player mode state
        this.app = null;              // SpatialAudioApp instance
        this.gpsWatchId = null;
        this.wakeLock = null;
        this.lastCompassUpdate = 0;
        this.compassThrottleMs = 100;  // Max 10 compass updates/sec
        this.needsAudioEnable = false; // iOS DuckDuckGo workaround

        // Simulation mode state
        this.simulationMode = false;
        this.simListenerMarker = null;
        this.simListenerLat = null;
        this.simListenerLon = null;
        this._lastSimDistance = null;  // For throttling debug logs

        // Debug console
        this.debugConsole = null;
        this.maxDebugLines = 1000;  // Capture full walking test for analysis

        // Auto-copy logs when user stops (for easy debugging while walking)
        this.autoCopyLogs = true;
        this.lastMoveTime = 0;
        this.copyAfterSeconds = 3;  // Auto-copy 3 seconds after last movement
        this.autoCopyTimer = null;

        // Auto-save feedback
        this.saveFeedbackTimer = null;
        this.saveDebounceTimer = null;

        // Login state
        this.isLoggedIn = false;

        // === Apply Mode Preset + Optional Overrides ===
        const mode = options.mode || 'editor';
        const preset = MODE_PRESETS[mode] || MODE_PRESETS.editor;

        this.mode = mode;
        this.allowEditing = options.allowEditing ?? preset.allowEditing;
        this.autoSync = options.autoSync ?? preset.autoSync;
        this.showDetailedInfo = options.showDetailedInfo ?? preset.showDetailedInfo;
        this.autoCenterOnGPS = options.autoCenterOnGPS ?? preset.autoCenterOnGPS;
        this.showSimulator = options.showSimulator ?? preset.showSimulator;
        this.allowStartTesting = options.allowStartTesting ?? preset.allowStartTesting;

        this.debugLog(`🗺️ MapAppShared initialized (mode: ${this.mode})`);
    }

    /**
     * Initialize the app (abstract method - must be implemented by subclass)
     * @returns {Promise<void>}
     */
    async init() {
        throw new Error("init() must be implemented by subclass");
    }

    /**
     * Detect device type based on user agent, touch capability, and screen size
     * @returns {string} 'desktop' | 'tablet' | 'mobile'
     * @protected
     */
    _detectDeviceType() {
        const ua = navigator.userAgent;
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const width = window.innerWidth;

        // Mobile devices (phone) - explicit mobile UA detection
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
            return 'mobile';
        }

        // Tablet (touch + larger screen)
        if (hasTouch && width > 600) {
            return 'tablet';
        }

        // Desktop (no touch or large screen without mobile UA)
        return 'desktop';
    }

    /**
     * Initialize map
     * @protected
     */
    _initMap() {
        // Default to Ashland, Oregon (not Seattle)
        const defaultLat = 42.1713;
        const defaultLon = -122.7095;
        this.map = L.map('map').setView([defaultLat, defaultLon], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Map click handler (only in editor mode with editing allowed)
        this.map.on('click', (e) => {
            if (this.state !== 'editor') return;
            if (this.isDragging) return;
            if (!this.allowEditing) return;

            // Session 4: Don't add waypoint if drawing an Area
            if (this.isDrawingArea) {
                return;
            }
            // Also check areaDrawer (Leaflet.Draw)
            if (this.areaDrawer && this.areaDrawer.isEnabled) return;

            this._addWaypoint(e.latlng.lat, e.latlng.lng);
        });
    }

    /**
     * Get initial GPS/WiFi position (fallback if no soundscapes)
     * All devices request position (GPS on mobile, WiFi on desktop)
     * Position is stored but map is centered later based on soundscapes
     * @returns {Promise<boolean>} True if position acquired
     * @protected
     */
    async _getInitialGPS() {
        return new Promise((resolve) => {
            // Try to get GPS/WiFi position for all devices
            if (!navigator.geolocation) {
                console.log('[MapShared] Geolocation not supported - will use soundscape position or default');
                resolve(false);
                return;
            }

            navigator.geolocation.getCurrentPosition((pos) => {
                this.listenerLat = pos.coords.latitude;
                this.listenerLon = pos.coords.longitude;

                // Store position but don't center yet - will center on soundscapes if they exist
                console.log('[MapShared] GPS/WiFi acquired:', this.listenerLat, this.listenerLon);
                console.log('[MapShared] Will center on soundscapes if available, otherwise use this position');
                this._updateListenerMarker(this.listenerLat, this.listenerLon, false);

                // Center map on GPS position (will be overridden by soundscapes if they exist)
                this.map.setView([this.listenerLat, this.listenerLon], 16);
                resolve(true);
            }, (err) => {
                console.log('[MapShared] GPS/WiFi unavailable (' + err.message + ') - will use soundscape position or default');
                resolve(false);
            }, { enableHighAccuracy: true, timeout: 5000 });
        });
    }

    /**
     * Check if device has both GPS and compass (for editor capability)
     * GPS: heading property exists OR accuracy < 50m
     * Compass: DeviceOrientation with alpha/heading available
     * @returns {Promise<{gps: boolean, compass: boolean, both: boolean}>}
     * @protected
     */
    async _checkGPSAndCompass() {
        return new Promise((resolve) => {
            const result = { gps: false, compass: false, both: false };

            // Check GPS
            if (!navigator.geolocation) {
                console.log('[Device Check] Geolocation not supported');
                resolve(result);
                return;
            }

            const gpsTimeout = setTimeout(() => {
                console.log('[Device Check] GPS timeout');
                resolve(result);
            }, 5000);

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    clearTimeout(gpsTimeout);
                    const hasHeading = typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading);
                    const hasGoodAccuracy = pos.coords.accuracy < 50;
                    result.gps = hasHeading || hasGoodAccuracy;
                    console.log(`[Device Check] GPS: ${result.gps ? '✅' : '⚠️'} (heading: ${hasHeading}, accuracy: ${pos.coords.accuracy}m)`);

                    // Check compass (DeviceOrientation)
                    this._checkCompass().then((hasCompass) => {
                        result.compass = hasCompass;
                        result.both = result.gps && result.compass;
                        console.log(`[Device Check] Compass: ${result.compass ? '✅' : '⚠️'}`);
                        console.log(`[Device Check] Result: GPS=${result.gps}, Compass=${result.compass}, Both=${result.both ? '✅ YES' : '❌ NO'}`);
                        resolve(result);
                    });
                },
                (err) => {
                    clearTimeout(gpsTimeout);
                    console.log('[Device Check] GPS error:', err.message);
                    resolve(result);
                },
                { timeout: 5000, enableHighAccuracy: true }
            );
        });
    }

    /**
     * Check if compass (DeviceOrientation) is available
     * @returns {Promise<boolean>} True if compass available
     * @protected
     */
    async _checkCompass() {
        return new Promise((resolve) => {
            // Check if DeviceOrientation is supported
            if (!window.DeviceOrientationEvent) {
                resolve(false);
                return;
            }

            // Try to get a device orientation reading
            const compassTimeout = setTimeout(() => {
                console.log('[Device Check] Compass timeout');
                resolve(false);
            }, 3000);

            const handler = (event) => {
                clearTimeout(compassTimeout);
                window.removeEventListener('deviceorientation', handler);

                // Check for heading data (alpha or webkitCompassHeading)
                const hasAlpha = typeof event.alpha === 'number' && !isNaN(event.alpha);
                const hasWebkitHeading = typeof event.webkitCompassHeading === 'number' && !isNaN(event.webkitCompassHeading);

                const hasCompass = hasAlpha || hasWebkitHeading;
                console.log(`[Device Check] Compass data: alpha=${event.alpha}, webkitHeading=${event.webkitCompassHeading}, result=${hasCompass ? '✅' : '⚠️'}`);
                resolve(hasCompass);
            };

            window.addEventListener('deviceorientation', handler);
        });
    }

    // =====================================================================
    // SOUNDSCAPE MANAGEMENT (Shared)
    // =====================================================================

    /**
     * Get the active soundscape
     * @returns {SoundScape|null}
     */
    getActiveSoundscape() {
        if (!this.activeSoundscapeId) return null;
        return this.soundscapes.get(this.activeSoundscapeId);
    }

    /**
     * Switch to a different soundscape
     * @param {string} id - Soundscape ID to switch to
     * @returns {boolean} - True if switched successfully
     */
    switchSoundscape(id) {
        if (!this.soundscapes.has(id)) {
            this.debugLog('⚠️ Soundscape not found: ' + id);
            return false;
        }

        // Save current soundscape before switching
        this._saveSoundscapeToStorage();

        // Switch
        this.activeSoundscapeId = id;
        const soundscape = this.getActiveSoundscape();

        // Clear existing markers and circles BEFORE loading new data
        this.debugLog(`🧹 Clearing existing markers and circles...`);
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        // Also clear circles from current waypoints
        this.waypoints.forEach(wp => {
            if (wp.circleMarker) {
                wp.circleMarker.remove();
                wp.circleMarker = null;
            }
        });
        // Clear Area polygons (for MapEditorApp)
        if (this.areaMarkers) {
            this.areaMarkers.forEach(polygon => polygon.remove());
            this.areaMarkers.clear();
        }
        this.debugLog(`   ✅ Cleared old markers and circles`);

        // Load new waypoints from soundscape
        this.waypoints = soundscape.waypointData || [];
        this.debugLog(`   📥 Loaded ${this.waypoints.length} waypoints from soundscape`);

        // Restore nextId from waypoints
        if (this.waypoints.length > 0) {
            const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
            this.nextId = maxId + 1;
        }

        // Create markers and circles for new waypoints
        this.debugLog(`   🎨 Creating markers and circles...`);
        this.waypoints.forEach(wp => this._createMarker(wp));
        this.debugLog(`   ✅ Created markers and circles for new soundscape`);
        this._updateWaypointList();
        this._updateSoundscapeSelector();

        // Load Areas from soundscape (Session 4: Sound Area - Drawing)
        if (soundscape.areas && soundscape.areas.length > 0) {
            this.debugLog(`   📍 Loading ${soundscape.areas.length} Areas...`);
            if (this._loadAreasIntoDrawer) {
                this._loadAreasIntoDrawer(soundscape.areas);
                this.debugLog(`   ✅ Loaded Areas into drawer`);
            }
        }

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

        this.debugLog(`🎼 Switched to: ${soundscape.name} (${this.waypoints.length} waypoints)`);
        this._showToast(`🎼 Switched to: ${soundscape.name}`, 'info');
        return true;
    }

    /**
     * Delete a soundscape by ID
     * @param {string} id - Soundscape ID to delete
     * @returns {boolean} - True if deleted successfully
     */
    deleteSoundscape(id) {
        if (!this.soundscapes.has(id)) {
            this.debugLog('⚠️ Soundscape not found: ' + id);
            return false;
        }

        // Can't delete the last soundscape
        if (this.soundscapes.size === 1) {
            this._showToast('⚠️ Cannot delete the last soundscape', 'warning');
            return false;
        }

        // Confirm deletion
        const soundscape = this.soundscapes.get(id);
        if (!confirm(`Delete soundscape "${soundscape.name}"? This cannot be undone.`)) {
            return false;
        }

        // Delete from server if synced
        const serverId = this.serverSoundscapeIds.get(id);
        if (serverId && this.isLoggedIn) {
            this.api.deleteSoundscape(serverId).catch(err => {
                this.debugLog('⚠️ Failed to delete from server: ' + err.message);
            });
        }

        // Remove from map
        this.soundscapes.delete(id);
        this.serverSoundscapeIds.delete(id);

        // If deleted active, switch to another
        if (this.activeSoundscapeId === id) {
            const firstKey = this.soundscapes.keys().next().value;
            this.switchSoundscape(firstKey);
        } else {
            this._updateSoundscapeSelector();
        }

        // Save to storage
        this._saveSoundscapeToStorage();

        this.debugLog(`🗑️ Deleted soundscape: ${soundscape.name}`);
        this._showToast(`🗑️ Deleted: ${soundscape.name}`, 'info');
        return true;
    }

    /**
     * Update soundscape selector dropdown
     * @protected
     */
    _updateSoundscapeSelector() {
        const selector = document.getElementById('soundscapeSelector');
        if (!selector) return;

        // Clear existing options
        selector.innerHTML = '';

        // Populate with all soundscapes
        this.soundscapes.forEach((soundscape, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${soundscape.name} (${soundscape.soundIds.length || this.waypoints.length} sounds)`;
            if (id === this.activeSoundscapeId) {
                option.selected = true;
            }
            selector.appendChild(option);
        });

        // Set up change handler
        selector.onchange = (e) => {
            this.switchSoundscape(e.target.value);
        };
    }

    /**
     * Save soundscape to storage (stub - localStorage removed)
     * Server auto-save handles persistence
     * @protected
     */
    _saveSoundscapeToStorage() {
        // No-op: localStorage soundscape cache removed
        // Server auto-save handles all persistence
    }

    /**
     * Mark soundscape as dirty (has unsaved changes)
     * @protected
     */
    _markSoundscapeDirty() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        soundscape.isDirty = true;
        this.debugLog('📝 Soundscape marked dirty');
        this._updateSyncStatus(false);  // Show "Not synced" indicator
    }

    /**
     * Schedule auto-save to server (debounced)
     * @protected
     */
    _scheduleAutoSave() {
        // Clear any pending timer
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }

        // Cancel any pending save request (prevents race conditions)
        if (this.saveAbortController) {
            this.saveAbortController.abort();
            this.saveAbortController = null;
        }

        // Schedule save after 2 seconds (resets on each call)
        this.saveDebounceTimer = setTimeout(() => {
            this._executeAutoSave();
        }, 2000);
    }

    /**
     * Execute auto-save to server (called by timer)
     * Only saves if soundscape is dirty
     * @private
     */
    _executeAutoSave() {
        if (!this.isLoggedIn) return;

        const serverId = this.serverSoundscapeIds.get(this.activeSoundscapeId);
        if (!serverId) return;

        const soundscape = this.getActiveSoundscape();
        if (!soundscape || !soundscape.isDirty) {
            this.debugLog('✅ No changes - skipping save');
            return;
        }

        this.debugLog('☁️ Auto-saving to server...');

        // Create abort controller for this save request
        this.saveAbortController = new AbortController();
        const { signal } = this.saveAbortController;

        // Use soundscape.waypointData (clean data) instead of this.waypoints
        const wpData = soundscape.waypointData || [];
        const behaviors = soundscape.behaviors || [];

        // Strip Leaflet properties (circleMarker, marker) before sending to server
        // These are added by _updateRadiusCircle() and contain circular references to the map
        const cleanWaypoints = wpData.map(wp => {
            const { circleMarker, marker, ...cleanWp } = wp;
            return cleanWp; // Keep camelCase - server repository handles snake_case conversion
        });

        // Debug: log waypoint soundUrls to verify they're being saved
        this.debugLog(`📍 Waypoints being saved: ${cleanWaypoints.length}`);
        cleanWaypoints.forEach((wp, idx) => {
            this.debugLog(`   WP ${idx + 1}: "${wp.name}" soundUrl=${wp.soundUrl || '(empty)'}`);
        });

        // Strip Leaflet layer references from areas
        const cleanAreas = (soundscape.areas || []).map(area => {
            const { _leafletLayer, ...cleanArea } = area;
            return cleanArea;
        });

        // Debug: log area soundUrls to verify they're being saved
        this.debugLog(`🗺️ Areas being saved: ${cleanAreas.length}`);
        cleanAreas.forEach((area, idx) => {
            this.debugLog(`   Area ${idx + 1}: "${area.name}" soundUrl=${area.soundUrl || '(empty)'}`);
        });

        // Debug: log what we're sending
        this.debugLog(`📦 Saving: ${cleanWaypoints.length} waypoints, ${behaviors.length} behaviors, ${cleanAreas.length} areas`);
        this.debugLog(`🏷️ Soundscape metadata: name="${soundscape.name}", desc="${soundscape.description}", public=${soundscape.isPublic}`);

        // Save soundscape metadata first (name, description, isPublic)
        this.debugLog('📝 Calling updateSoundscape for metadata...');
        const metadataPromise = this.api.updateSoundscape(
            serverId,
            soundscape.name,
            soundscape.description,
            soundscape.isPublic
        );

        // Save waypoints, behaviors, and areas in single call
        const dataPromise = this.api.saveSoundscape(
            serverId,
            cleanWaypoints,
            behaviors,
            cleanAreas,
            signal  // Pass abort signal
        );

        // Wait for both to complete
        Promise.all([metadataPromise, dataPromise])
        .then(() => {
            soundscape.isDirty = false;
            this.debugLog('✅ Auto-saved to server (metadata + waypoints + behaviors + areas)');
            this._updateSyncStatus(true);
        })
        .catch((error) => {
            if (error.name === 'AbortError') {
                this.debugLog('⚠️ Save aborted (new edit in progress)');
                return;
            }
            this.debugLog('❌ Server save failed: ' + error.message);
            this._showToast('⚠️ Server sync failed - changes not saved', 'error');
            this._updateSyncStatus(false);
            // Keep isDirty = true so it will retry later
        })
        .finally(() => {
            this.saveAbortController = null;
        });
    }

    /**
     * Execute forced save to server (returns promise for awaiting)
     * Used for explicit saves before logout/navigation
     * @returns {Promise<void>}
     * @protected
     */
    async _executeAutoSaveForce() {
        if (!this.isLoggedIn) {
            throw new Error('Not logged in');
        }

        const serverId = this.serverSoundscapeIds.get(this.activeSoundscapeId);
        if (!serverId) {
            throw new Error('No server ID mapped');
        }

        const soundscape = this.getActiveSoundscape();
        if (!soundscape || !soundscape.isDirty) {
            this.debugLog('✅ No changes - skipping forced save');
            return;
        }

        this.debugLog('☁️ Force-saving to server...');

        // Use soundscape.waypointData (clean data) instead of this.waypoints
        const wpData = soundscape.waypointData || [];
        const behaviors = soundscape.behaviors || [];

        // Strip Leaflet properties (circleMarker, marker) before sending to server
        const cleanWaypoints = wpData.map(wp => {
            const { circleMarker, marker, ...cleanWp } = wp;
            return cleanWp;
        });

        // Strip Leaflet layer references from areas
        const cleanAreas = (soundscape.areas || []).map(area => {
            const { _leafletLayer, ...cleanArea } = area;
            return cleanArea;
        });

        // Await the save (no abort controller for force save)
        await this.api.saveSoundscape(serverId, cleanWaypoints, behaviors, cleanAreas);

        soundscape.isDirty = false;
        this.debugLog('✅ Force-saved to server (waypoints + behaviors + areas)');
        this._updateSyncStatus(true);
    }

    // =====================================================================
    // WAYPOINT MANAGEMENT (Shared)
    // =====================================================================

    /**
     * Add a waypoint
     * @param {number} lat
     * @param {number} lon
     * @param {Object} config
     * @returns {Object} waypoint
     * @protected
     */
    _addWaypoint(lat, lon, config = {}) {
        const waypoint = {
            id: 'wp' + this.nextId++,
            lat: lat,
            lon: lon,
            name: config.name || 'Sound ' + (this.waypoints.length + 1),
            type: config.type || 'sample',
            icon: config.icon || '•',
            color: config.color || '#00d9ff',
            activationRadius: config.activationRadius || this.defaultActivationRadius,
            soundUrl: config.soundUrl || this.soundConfig.soundUrl,
            volume: config.volume !== undefined ? config.volume : this.soundConfig.volume,
            loop: config.loop !== undefined ? config.loop : this.soundConfig.loop,
            soundConfig: config.soundConfig || { freq: 440, wave: 'sine', gain: 0.3 }
        };
        this.waypoints.push(waypoint);
        this._createMarker(waypoint);
        this._updateWaypointList();

        // Add to soundscape and mark dirty
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            const cleanWaypoint = {
                id: waypoint.id,
                name: waypoint.name,
                lat: waypoint.lat,
                lon: waypoint.lon,
                type: waypoint.type,
                icon: waypoint.icon,
                color: waypoint.color,
                activationRadius: waypoint.activationRadius,
                soundUrl: waypoint.soundUrl,
                volume: waypoint.volume,
                loop: waypoint.loop,
                soundConfig: waypoint.soundConfig
            };
            soundscape.addSound(waypoint.id, cleanWaypoint);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }

        return waypoint;
    }

    /**
     * Create marker for waypoint (uses allowEditing + showDetailedInfo flags)
     * @param {Object} waypoint
     * @returns {L.Marker}
     * @protected
     */
    _createMarker(waypoint) {
        const icon = L.divIcon({
            className: 'waypoint-marker',
            html: '<div style="font-size: 24px; cursor: grab; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">' + waypoint.icon + '</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        this.debugLog(`📍 Creating marker for ${waypoint.name} at [${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}]`);
        this.debugLog(`   allowEditing: ${this.allowEditing}`);

        const marker = L.marker([waypoint.lat, waypoint.lon], {
            icon: icon,
            draggable: this.allowEditing  // Use behavior flag
        }).addTo(this.map);

        this.debugLog(`   Marker draggable: ${marker.dragging.enabled()}`);

        marker.bindPopup(this._createPopupContent(waypoint));
        
        marker.on('dragstart', () => { 
            this.isDragging = true; 
            marker.closePopup(); 
        });
        
        marker.on('dragend', (e) => {
            this.isDragging = false;
            const newLat = e.target.getLatLng().lat;
            const newLon = e.target.getLatLng().lng;

            this.debugLog(`🖐️ Dragged ${waypoint.name} from [${waypoint.lat.toFixed(4)}, ${waypoint.lon.toFixed(4)}] to [${newLat.toFixed(4)}, ${newLon.toFixed(4)}]`);
            this.debugLog(`   Circle before update: ${waypoint.circleMarker ? 'exists' : 'NOT FOUND'}`);

            // Update waypoint in this.waypoints
            waypoint.lat = newLat;
            waypoint.lon = newLon;

            // Also update soundscape.waypointData (for clean server save)
            const soundscape = this.getActiveSoundscape();
            if (soundscape) {
                const wpInSoundscape = soundscape.waypointData.find(wp => wp.id === waypoint.id);
                if (wpInSoundscape) {
                    wpInSoundscape.lat = newLat;
                    wpInSoundscape.lon = newLon;
                }
            }

            this._updateRadiusCircle(waypoint);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();  // Debounced save after drag
        });
        
        this.markers.set(waypoint.id, marker);
        this._updateRadiusCircle(waypoint);
    }

    /**
     * Get popup content (uses showDetailedInfo flag)
     * @param {Object} waypoint
     * @returns {string}
     * @protected
     */
    _createPopupContent(waypoint) {
        if (this.showDetailedInfo) {
            return `
                <div style="min-width: 200px;">
                    <h3 style="margin: 0 0 10px 0;">${waypoint.icon} ${waypoint.name}</h3>
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 10px;">
                        <div>📍 ${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}</div>
                        <div>🔊 Radius: ${waypoint.activationRadius}m</div>
                        <div>🎵 Sound: ${waypoint.soundUrl.split('/').pop()}</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="event.stopPropagation(); app._editWaypoint('${waypoint.id}')" style="flex: 1; padding: 6px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">✏️ Edit</button>
                        <button onclick="event.stopPropagation(); app._deleteWaypoint('${waypoint.id}')" style="flex: 1; padding: 6px; background: #e94560; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ Delete</button>
                    </div>
                </div>
            `;
        } else {
            return `<h3>${waypoint.icon} ${waypoint.name}</h3>`;
        }
    }

    /**
     * Edit waypoint
     * @param {string} waypointId
     * @protected
     */
    _editWaypoint(waypointId) {
        // Prevent reentrant calls (user clicking marker while edit dialog is open)
        if (this.isEditing) {
            this.debugLog('⚠️ Edit already in progress - ignoring duplicate call');
            return;
        }
        
        if (this.state !== 'editor') return;
        const waypoint = this.waypoints.find(wp => wp.id === waypointId);
        if (!waypoint) return;

        this.isEditing = true;
        this.debugLog(`✏️ Editing waypoint ${waypointId} (${waypoint.name})`);

        const newSoundUrl = prompt('Sound file URL:', waypoint.soundUrl);
        if (newSoundUrl === null) { this.isEditing = false; return; }
        if (newSoundUrl) waypoint.soundUrl = newSoundUrl;

        const newVolume = prompt('Volume (0.0 - 1.0):', waypoint.volume);
        if (newVolume === null) { this.isEditing = false; return; }
        const vol = parseFloat(newVolume);
        if (!isNaN(vol) && vol >= 0 && vol <= 1) waypoint.volume = vol;

        const newLoop = confirm('Loop sound? (OK=Yes, Cancel=No)');
        waypoint.loop = newLoop;

        const newRadius = prompt('Activation radius (meters):', waypoint.activationRadius);
        if (newRadius === null) { this.isEditing = false; return; }
        const radius = parseInt(newRadius);
        if (!isNaN(radius) && radius > 0) {
            waypoint.activationRadius = radius;
            this._updateRadiusCircle(waypoint);
        }

        // Also update soundscape.waypointData (for clean server save)
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            const wpInSoundscape = soundscape.waypointData.find(wp => wp.id === waypointId);
            if (wpInSoundscape) {
                wpInSoundscape.soundUrl = waypoint.soundUrl;
                wpInSoundscape.volume = waypoint.volume;
                wpInSoundscape.loop = waypoint.loop;
                wpInSoundscape.activationRadius = waypoint.activationRadius;
            }
        }

        // Close and reopen popup to show updated info
        const marker = this.markers.get(waypointId);
        if (marker) {
            marker.closePopup();
            marker.setPopupContent(this._createPopupContent(waypoint));
            marker.openPopup();
        }

        this._updateWaypointList();
        this._markSoundscapeDirty();
        this._scheduleAutoSave();  // Debounced save after edit
        this._showToast('✅ Waypoint updated', 'success');
        
        this.isEditing = false;
        this.debugLog('✅ Edit complete');
    }

    /**
     * Update radius circle
     * @param {Object} waypoint
     * @protected
     */
    _updateRadiusCircle(waypoint) {
        // If circle exists, update its position (more efficient than remove/recreate)
        if (waypoint.circleMarker) {
            waypoint.circleMarker.setLatLng([waypoint.lat, waypoint.lon]);
            waypoint.circleMarker.setRadius(waypoint.activationRadius);
        } else {
            // Create new circle
            waypoint.circleMarker = L.circle([waypoint.lat, waypoint.lon], {
                radius: waypoint.activationRadius,
                color: waypoint.color,
                fillColor: waypoint.color,
                fillOpacity: 0.15,
                weight: 1
            }).addTo(this.map);
        }
    }

    /**
     * Delete waypoint
     * @param {string} waypointId
     * @protected
     */
    _deleteWaypoint(waypointId) {
        if (this.state !== 'editor') return;
        const index = this.waypoints.findIndex(wp => wp.id === waypointId);
        if (index === -1) return;
        const waypoint = this.waypoints[index];
        const marker = this.markers.get(waypointId);
        
        this.debugLog(`🗑️ Deleting waypoint ${waypointId} (${waypoint.name})`);
        this.debugLog(`   Marker exists: ${!!marker}`);
        this.debugLog(`   Circle exists: ${!!waypoint.circleMarker}`);
        
        if (marker) marker.remove();
        if (waypoint.circleMarker) {
            waypoint.circleMarker.remove();
            waypoint.circleMarker = null;
        }
        
        this.waypoints.splice(index, 1);
        this._updateWaypointList();

        // Remove from soundscape and mark dirty
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.removeSound(waypoint.id);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }
        
        this.debugLog(`✅ Deleted waypoint ${waypointId}`);
    }

    /**
     * Clear all waypoints
     * @protected
     */
    _clearAllWaypoints() {
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.waypoints.forEach(wp => { if (wp.circleMarker) wp.circleMarker.remove(); });
        this.waypoints = [];
        this.nextId = 1;
        this._updateWaypointList();

        // Clear Areas (Session 4: Sound Area)
        if (this._clearAllAreas) {
            this._clearAllAreas();
        }

        // Clear soundscape and mark dirty
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.soundIds = [];
            soundscape.waypointData = [];
            soundscape.areas = [];
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }
    }

    /**
     * Update waypoint list UI
     * @protected
     */
    _updateWaypointList() {
        const listEl = document.getElementById('waypointList');
        if (!listEl) return;
        if (this.waypoints.length === 0) {
            listEl.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">No waypoints yet.</p>';
            return;
        }

        // Show distance field in player mode, hide in editor mode
        const showDistance = this.state === 'player';

        listEl.innerHTML = this.waypoints.map(wp => `
            <div style="display:flex;align-items:center;padding:8px;margin:4px 0;background:rgba(255,255,255,0.05);border-radius:6px;">
                <span style="font-size:20px;margin-right:8px;">${wp.icon}</span>
                <div style="flex:1;">
                    <div style="font-weight:bold;">${wp.name}</div>
                    <div style="font-size:0.8em;color:#888;">
                        ${wp.activationRadius}m${showDistance ? ` • <span id="dist_${wp.id}">-- m</span>` : ''}
                    </div>
                </div>
                ${this.state === 'editor' && this.allowEditing ? `<button onclick="app._deleteWaypoint('${wp.id}')" style="background:transparent;border:1px solid #e94560;color:#e94560;padding:4px 8px;border-radius:4px;cursor:pointer;">🗑️</button>` : ''}
            </div>
        `).join('');
    }

    /**
     * Update listener marker
     * @param {number} lat
     * @param {number} lon
     * @param {boolean} locked
     * @protected
     */
    _updateListenerMarker(lat, lon, locked) {
        if (lat === null) return;

        // Update stored listener position
        this.listenerLat = lat;
        this.listenerLon = lon;

        // Update or create marker
        if (this.listenerMarker) {
            this.listenerMarker.setLatLng([lat, lon]);
            // Update color based on lock state
            const newColor = locked ? '#00ff88' : '#00d9ff';
            this.listenerMarker.setStyle({
                color: newColor,
                fillColor: newColor
            });
        } else {
            this.listenerMarker = L.circleMarker([lat, lon], {
                radius: 8,
                color: locked ? '#00ff88' : '#00d9ff',
                fillColor: locked ? '#00ff88' : '#00d9ff',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(this.map);
        }
    }

    // =====================================================================
    // SIMULATION MODE (Shared)
    // =====================================================================

    /**
     * Handle simulate button click
     * @protected
     */
    _handleSimulateClick() {
        // Enforce showSimulator flag
        if (!this.showSimulator) {
            console.warn('[MapShared] Simulation not available in this mode');
            this._showToast('⚠️ Simulation not available', 'warning');
            return;
        }

        if (this.simulationMode) {
            this._stopSimulation();
            return;
        }

        if (this.waypoints.length === 0) {
            this._showToast('Add at least one waypoint first', 'warning');
            return;
        }

        this._startSimulation();
    }

    /**
     * Start simulation mode
     * @protected
     */
    async _startSimulation() {
        if (this.waypoints.length === 0) {
            this._showToast('Add at least one waypoint first', 'warning');
            return;
        }

        // Prevent quick-clicking before audio is ready
        if (this.isInitializing) {
            this._showToast('⏳ Please wait - audio is initializing...', 'info');
            return;
        }

        console.log('[MapShared] 🎮 Starting Simulation Mode...');
        this.debugLog('🎮 Starting simulation mode...');

        this.simulationMode = true;
        this.state = 'simulator';

        // Get map center for initial listener position
        const center = this.map.getCenter();
        this.simListenerLat = center.lat;
        this.simListenerLon = center.lng;

        this.debugLog(`📍 Initial position: [${this.simListenerLat.toFixed(4)}, ${this.simListenerLon.toFixed(4)}]`);
        this.debugLog(`🎵 Loading ${this.waypoints.length} sounds for simulation`);

        // Create draggable listener marker
        this._createSimListenerMarker();

        // Start audio (no GPS, no compass)
        await this._startSimAudio();

        // Show simulation panel
        this._showSimPanel();

        // Update button
        const simulateBtn = document.getElementById('simulateBtn');
        if (simulateBtn) {
            simulateBtn.textContent = '❌ Exit Sim';
            simulateBtn.className = 'btn btn-danger';
        }

        // Disable waypoint editing during simulation
        this._setWaypointsInteractive(false);

        this._showToast('🎮 Simulation Mode: Drag the avatar to preview', 'info');
        this.debugLog('✅ Simulation mode started');
        console.log('[MapShared] ✅ Simulation Mode started');
    }

    /**
     * Stop simulation mode
     * @protected
     */
    _stopSimulation() {
        console.log('[MapShared] ⏹ Stopping Simulation Mode...');
        this.debugLog('⏹ Stopping simulation mode...');

        this.simulationMode = false;
        this.state = 'editor';

        // Remove listener marker
        if (this.simListenerMarker) {
            this.simListenerMarker.remove();
            this.simListenerMarker = null;
        }

        // Stop audio
        if (this.app) {
            this.app.stop();
            this.app = null;
        }

        // Hide simulation panel
        this._hideSimPanel();

        // Update button
        const simulateBtn = document.getElementById('simulateBtn');
        if (simulateBtn) {
            simulateBtn.textContent = '🎮 Simulate';
            simulateBtn.className = 'btn btn-warning';
        }

        // Re-enable waypoint editing
        this._setWaypointsInteractive(true);

        this._showToast('⏹ Simulation stopped', 'info');
        this.debugLog('✅ Simulation mode stopped');
        console.log('[MapShared] ✅ Simulation Mode stopped');
    }

    /**
     * Create simulation listener marker
     * @protected
     */
    _createSimListenerMarker() {
        const icon = L.divIcon({
            className: 'sim-listener-marker',
            html: '<div style="font-size: 32px; cursor: grab;">🚶</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        this.simListenerMarker = L.marker(
            [this.simListenerLat, this.simListenerLon],
            { icon: icon, draggable: true }
        ).addTo(this.map);

        // Update audio position on drag
        this.simListenerMarker.on('drag', (e) => {
            this.simListenerLat = e.latlng.lat;
            this.simListenerLon = e.latlng.lng;
            this._updateSimAudio();
            this._updateSimDisplay();
        });

        // Update on drag end
        this.simListenerMarker.on('dragend', () => {
            this._updateSimDisplay();
        });
    }

    /**
     * Start simulation audio
     * @protected
     */
    async _startSimAudio() {
        console.log('[MapShared] 🔊 Starting simulation audio...');
        this.debugLog('🔊 Starting simulation audio engine...');

        const soundConfigs = this.waypoints.map(wp => ({
            id: wp.id,
            url: wp.soundUrl || this.soundConfig.soundUrl,
            lat: wp.lat,
            lon: wp.lon,
            activationRadius: wp.activationRadius,
            volume: wp.volume !== undefined ? wp.volume : this.soundConfig.volume,
            loop: wp.loop !== undefined ? wp.loop : this.soundConfig.loop
        }));

        this.debugLog(`🎵 Creating ${soundConfigs.length} sound sources...`);

        // Create app with simulated position (no GPS tracking)
        this.app = new SpatialAudioApp(soundConfigs, {
            initialPosition: {
                lat: this.simListenerLat,
                lon: this.simListenerLon
            },
            gpsSmoothing: false,  // Instant response for simulation
            autoLock: false,      // No GPS lock in simulation
            reverbEnabled: true
        });

        // Set callbacks
        this.app.onPositionUpdate = (data) => {
            this._updateSimDisplay();
        };

        this.app.onDebugLog = (message) => {
            this.debugLog(`[Drift] ${message}`);
        };

        this.app.onStateChange = (state) => {
            console.log('[MapShared] 📊 Sim audio state:', state);
            if (state === 'running') {
                this.debugLog('✅ Simulation audio active - drag avatar to preview');
                this._updateSimDisplay();
                this._showToast('✅ Simulation audio active! Drag the avatar', 'success');
            }
        };

        this.app.onError = (error) => {
            console.error('[MapShared] ❌ Sim audio error:', error);
            this._showToast('❌ ' + error.message, 'error');
        };

        // Start the audio FIRST (creates listener, initializes positions)
        try {
            const soundscape = this.getActiveSoundscape();
            if (soundscape && soundscape.behaviors && soundscape.behaviors.length > 0) {
                console.log('[MapShared] 🎼 Starting simulation with behaviors:', soundscape.behaviors.length);
                await this.app.startSoundScape(soundscape);
            } else {
                console.log('[MapShared] 🎵 Starting simulation without behaviors (default)');
                await this.app.start();
            }
            console.log('[MapShared] ✅ Simulation audio started');
            this.debugLog('✅ Simulation audio started');
            
            // === SESSION 3: Load Areas AFTER app.start() (listener now exists) ===
            // This ensures updateVolume() has valid listener coordinates
            if (soundscape && soundscape.areas && soundscape.areas.length > 0) {
                console.log('[MapShared] 🗺️ Loading', soundscape.areas.length, 'areas into AreaManager (sim, post-start)...');
                this.debugLog(`🗺️ Loading ${soundscape.areas.length} areas for simulation...`);
                await this.app.loadAreas(soundscape.areas);
            }
            
            this._updateSimDisplay();
        } catch (err) {
            console.error('[MapShared] ❌ Sim audio start failed:', err);
            this.debugLog('❌ Simulation audio start failed: ' + err.message);
            this._showToast('❌ Audio start failed: ' + err.message, 'error');
        }
    }

    /**
     * Update simulation audio
     * @protected
     */
    _updateSimAudio() {
        if (!this.app || !this.app.listener) return;

        // Update listener position (heading = 0, facing north)
        this.app.listener.update(this.simListenerLat, this.simListenerLon, 0);

        // Update sound positions
        this.app._updateSoundPositions();

        // === SESSION 3: Update AreaManager with simulated position ===
        if (this.app.areaManager) {
            this.app.areaManager.update(this.simListenerLat, this.simListenerLon, 0);
        }
    }

    /**
     * Update simulation display
     * @protected
     */
    _updateSimDisplay() {
        if (!this.app || !this.app.listener) return;

        // Find nearest sound for display
        let nearestSound = null;
        let nearestDistance = Infinity;

        this.waypoints.forEach(wp => {
            const distance = this.app.getSoundDistance(wp.id);
            if (distance !== null && distance < nearestDistance) {
                nearestDistance = distance;
                nearestSound = wp;
            }
        });

        // Update simulation panel
        const distanceEl = document.getElementById('simDistance');
        const bearingEl = document.getElementById('simBearing');
        const volumeEl = document.getElementById('simVolume');

        if (nearestSound && nearestDistance !== null) {
            // Distance
            if (distanceEl) {
                distanceEl.textContent = nearestDistance.toFixed(1) + ' m';
            }

            // Bearing
            const bearing = this.app.getSoundBearing(nearestSound.id);
            if (bearingEl && bearing !== null) {
                const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                const index = Math.round(bearing / 45) % 8;
                bearingEl.textContent = `${bearing.toFixed(0)}° ${directions[index]}`;
            }

            // Volume (estimate based on distance)
            if (volumeEl) {
                const ratio = Math.max(0, 1 - (nearestDistance / nearestSound.activationRadius));
                const volumePercent = Math.round(ratio * 100);
                volumeEl.textContent = volumePercent + '%';
            }

            // Debug logging (throttled - only log if distance changed significantly)
            if (!this._lastSimDistance || Math.abs(nearestDistance - this._lastSimDistance) > 1.0) {
                this._lastSimDistance = nearestDistance;
                this.debugLog(`🚶 Avatar: ${nearestDistance.toFixed(1)}m from ${nearestSound.name}`);
            }
        } else {
            if (distanceEl) distanceEl.textContent = '--';
            if (bearingEl) bearingEl.textContent = '--';
            if (volumeEl) volumeEl.textContent = '--';
        }
    }

    /**
     * Show simulation panel
     * @protected
     */
    _showSimPanel() {
        const panel = document.getElementById('simPanel');
        if (panel) {
            panel.style.display = 'block';
        }
    }

    /**
     * Hide simulation panel
     * @protected
     */
    _hideSimPanel() {
        const panel = document.getElementById('simPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    /**
     * Set waypoints interactive
     * @param {boolean} interactive
     * @protected
     */
    _setWaypointsInteractive(interactive) {
        this.markers.forEach((marker, id) => {
            if (interactive) {
                marker.dragging.enable();
            } else {
                marker.dragging.disable();
                marker.closePopup();
            }
        });
    }

    // =====================================================================
    // UTILITIES (Shared)
    // =====================================================================

    /**
     * Debug logging with color-coded levels (Session 10 mockup style)
     * @param {string} message
     */
    debugLog(message) {
        if (!this.debugModalContent) return;

        const timestamp = new Date().toLocaleTimeString();

        // Detect log level from message content
        let level = 'info';
        if (message.includes('❌') || message.includes('Error') || message.includes('Failed')) {
            level = 'error';
        } else if (message.includes('⚠️') || message.includes('Warning') || message.includes('WARN')) {
            level = 'warn';
        }

        // Create styled line with block display for proper line breaks
        const line = `<div class="debug-line ${level}">[${timestamp}] ${message}</div>`;

        this.debugModalContent.innerHTML = line + this.debugModalContent.innerHTML;

        // Limit lines
        const maxLines = 100;
        const lines = this.debugModalContent.querySelectorAll('.debug-line');
        if (lines.length > maxLines) {
            for (let i = maxLines; i < lines.length; i++) {
                lines[i].remove();
            }
        }
    }

    /**
     * Initialize UI elements based on mode flags
     * Called by subclasses after DOM is ready
     * @protected
     */
    _initUI() {
        // Start button - only if allowStartTesting is true
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.style.display = this.allowStartTesting ? 'block' : 'none';
        }

        // Simulate button - only if showSimulator is true
        const simulateBtn = document.getElementById('simulateBtn');
        if (simulateBtn) {
            simulateBtn.style.display = this.showSimulator ? 'block' : 'none';
        }

        // Initialize debug console
        this._initDebugConsole();
    }

    /**
     * Initialize debug console
     * @protected
     */
    _initDebugConsole() {
        this.debugConsole = document.getElementById('debugConsole');
        this.debugModalContent = document.getElementById('debugConsoleContent');
        
        if (this.debugModalContent) {
            // Wire up copy button
            const copyBtn = document.getElementById('debugCopyBtn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => this._copyLogs());
            }
        }
    }

    /**
     * Copy debug logs to clipboard
     * @protected
     */
    async _copyLogs() {
        if (!this.debugModalContent) return;
        
        try {
            await navigator.clipboard.writeText(this.debugModalContent.innerText);
            this._showToast('✅ Copied to clipboard', 'success');
        } catch (err) {
            // Fallback for older browsers
            const range = document.createRange();
            range.selectNode(this.debugModalContent);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            this._showToast('✅ Copied to clipboard', 'success');
        }
    }

    /**
     * Show toast notification
     * @param {string} message
     * @param {string} type
     * @protected
     */
    _showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { 
            toast.style.opacity = '0'; 
            toast.style.transition = 'opacity 0.3s'; 
            setTimeout(() => toast.remove(), 300); 
        }, 3000);
    }

    /**
     * Show instruction
     * @param {string} message
     * @protected
     */
    _showInstruction(message) {
        this._showToast(message, 'info');
    }
}

console.log('[map_shared.js] MapAppShared base class loaded');

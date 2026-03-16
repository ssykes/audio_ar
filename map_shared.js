/**
 * MapAppShared - Abstract base class for map-based apps
 * Uses Mode Presets pattern for behavior configuration
 *
 * @version 6.4 - Strip Leaflet properties before server save
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

console.log('[map_shared.js] Loading v6.1...');

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
        showSimulator: true           // Show simulation controls
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
        showSimulator: false          // No simulation controls
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
     * Initialize map
     * @protected
     */
    _initMap() {
        const defaultLat = 47.6062;
        const defaultLon = -122.3321;
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
            this._addWaypoint(e.latlng.lat, e.latlng.lng);
        });
    }

    /**
     * Get initial GPS position
     * @returns {Promise<boolean>} True if GPS acquired
     * @protected
     */
    async _getInitialGPS() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.log('[MapShared] Geolocation not supported - using default location');
                this.map.setView([47.6062, -122.3321], 16);
                resolve(false);
                return;
            }
            navigator.geolocation.getCurrentPosition((pos) => {
                this.listenerLat = pos.coords.latitude;
                this.listenerLon = pos.coords.longitude;
                this.map.setView([this.listenerLat, this.listenerLon], 17);
                this._updateListenerMarker(this.listenerLat, this.listenerLon, false);
                console.log('[MapShared] GPS acquired:', this.listenerLat, this.listenerLon);
                resolve(true);
            }, (err) => {
                console.log('[MapShared] GPS unavailable (' + err.message + ') - using default location');
                this.map.setView([47.6062, -122.3321], 16);
                resolve(false);
            }, { enableHighAccuracy: true, timeout: 5000 });
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

        // Update waypoints from the soundscape's waypointData
        this.waypoints = soundscape.waypointData || [];

        // Restore nextId from waypoints
        if (this.waypoints.length > 0) {
            const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
            this.nextId = maxId + 1;
        }

        // Clear and render waypoints
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.waypoints.forEach(wp => this._createMarker(wp));
        this._updateWaypointList();
        this._updateSoundscapeSelector();

        // Center map on the new waypoints
        if (this.waypoints.length > 0) {
            // Calculate center point
            const sumLat = this.waypoints.reduce((sum, wp) => sum + wp.lat, 0);
            const sumLon = this.waypoints.reduce((sum, wp) => sum + wp.lon, 0);
            const centerLat = sumLat / this.waypoints.length;
            const centerLon = sumLon / this.waypoints.length;

            // Center map with appropriate zoom
            this.map.setView([centerLat, centerLon], 17);
            this.debugLog(`🗺️ Map centered on soundscape at [${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}]`);
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
     * Load soundscape from localStorage
     * @protected
     */
    _loadSoundscapeFromStorage() {
        const data = SoundScapeStorage.getAll();
        if (data && data.soundscapes && data.soundscapes.length > 0) {
            // Load all soundscapes into map
            this.soundscapes.clear();
            data.soundscapes.forEach(soundscape => {
                this.soundscapes.set(soundscape.id, soundscape);
            });

            // Set active soundscape
            this.activeSoundscapeId = data.activeId || data.soundscapes[0].id;
            const activeSoundscape = this.getActiveSoundscape();

            // Load waypoints from active soundscape
            this.waypoints = activeSoundscape.waypointData || [];

            // Restore nextId from waypoints
            if (this.waypoints.length > 0) {
                const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
                this.nextId = maxId + 1;
            }

            // Render waypoints on map
            this.waypoints.forEach(wp => {
                this._createMarker(wp);
            });

            this._updateWaypointList();
            this._updateSoundscapeSelector();

            this.debugLog(`🎼 Loaded ${this.soundscapes.size} soundscape(s): ${activeSoundscape.name} (${this.waypoints.length} waypoints)`);
        } else {
            // Create default soundscape
            this._createDefaultSoundscape();
        }
    }

    /**
     * Create default soundscape
     * @protected
     */
    _createDefaultSoundscape() {
        // Generate a proper UUID-like ID instead of using 'default' (which isn't a valid UUID)
        const id = 'soundscape_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        const soundscape = new SoundScape(id, 'Default Soundscape', [], []);
        this.soundscapes.set(id, soundscape);
        this.activeSoundscapeId = id;
        this._updateSoundscapeSelector();
        this.debugLog('🎼 Created default soundscape: ' + id);
    }

    /**
     * Save soundscape to localStorage
     * @protected
     */
    _saveSoundscapeToStorage() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        // Update soundscape with current waypoints (clean data without Leaflet objects)
        soundscape.soundIds = this.waypoints.map(wp => wp.id);
        soundscape.waypointData = this.waypoints.map(wp => ({
            id: wp.id,
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            type: wp.type,
            icon: wp.icon,
            color: wp.color,
            activationRadius: wp.activationRadius,
            soundUrl: wp.soundUrl,
            volume: wp.volume,
            loop: wp.loop,
            soundConfig: wp.soundConfig
        }));

        // Always save to localStorage (backup)
        SoundScapeStorage.saveAll(Array.from(this.soundscapes.values()), this.activeSoundscapeId);

        this.debugLog('💾 Saved to localStorage');
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
        
        // Use soundscape.waypointData (clean data) instead of this.waypoints
        const wpData = soundscape.waypointData || [];
        const behaviors = soundscape.behaviors || [];

        // Strip Leaflet properties (circleMarker, marker) before sending to server
        // These are added by _updateRadiusCircle() and contain circular references to the map
        const cleanWaypoints = wpData.map(wp => {
            const { circleMarker, marker, ...cleanWp } = wp;
            return cleanWp; // Keep camelCase - server repository handles snake_case conversion
        });

        this.api.saveSoundscape(
            serverId,
            cleanWaypoints,
            behaviors
        )
        .then(() => {
            soundscape.isDirty = false;
            this.debugLog('✅ Auto-saved to server');
            this._updateSyncStatus(true);
        })
        .catch((error) => {
            this.debugLog('❌ Server save failed: ' + error.message);
            this._showToast('⚠️ Server sync failed - saved locally', 'warning');
            this._updateSyncStatus(false);
            // Keep isDirty = true so it will retry later
        });
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
            icon: config.icon || '🎵',
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
            html: '<div style="font-size: 24px; cursor: grab;">' + waypoint.icon + '</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const marker = L.marker([waypoint.lat, waypoint.lon], { 
            icon: icon, 
            draggable: this.allowEditing  // Use behavior flag
        }).addTo(this.map);
        
        marker.bindPopup(this._createPopupContent(waypoint));
        
        marker.on('dragstart', () => { 
            this.isDragging = true; 
            marker.closePopup(); 
        });
        
        marker.on('dragend', (e) => {
            this.isDragging = false;
            const newLat = e.target.getLatLng().lat;
            const newLon = e.target.getLatLng().lng;
            
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
                        <button onclick="app._editWaypoint('${waypoint.id}')" style="flex: 1; padding: 6px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">✏️ Edit</button>
                        <button onclick="app._deleteWaypoint('${waypoint.id}')" style="flex: 1; padding: 6px; background: #e94560; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ Delete</button>
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
        if (this.state !== 'editor') return;
        const waypoint = this.waypoints.find(wp => wp.id === waypointId);
        if (!waypoint) return;

        const newSoundUrl = prompt('Sound file URL:', waypoint.soundUrl);
        if (newSoundUrl === null) return;
        if (newSoundUrl) waypoint.soundUrl = newSoundUrl;

        const newVolume = prompt('Volume (0.0 - 1.0):', waypoint.volume);
        if (newVolume === null) return;
        const vol = parseFloat(newVolume);
        if (!isNaN(vol) && vol >= 0 && vol <= 1) waypoint.volume = vol;

        const newLoop = confirm('Loop sound? (OK=Yes, Cancel=No)');
        waypoint.loop = newLoop;

        const newRadius = prompt('Activation radius (meters):', waypoint.activationRadius);
        if (newRadius === null) return;
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
            marker.bindPopup(this._createPopupContent(waypoint));
            marker.openPopup();
        }

        this._updateWaypointList();
        this._markSoundscapeDirty();
        this._scheduleAutoSave();  // Debounced save after edit
        this._showToast('✅ Waypoint updated', 'success');
    }

    /**
     * Update radius circle
     * @param {Object} waypoint
     * @protected
     */
    _updateRadiusCircle(waypoint) {
        if (waypoint.circleMarker) waypoint.circleMarker.remove();
        waypoint.circleMarker = L.circle([waypoint.lat, waypoint.lon], {
            radius: waypoint.activationRadius,
            color: waypoint.color,
            fillColor: waypoint.color,
            fillOpacity: 0.15,
            weight: 1
        }).addTo(this.map);
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
        if (marker) marker.remove();
        if (waypoint.circleMarker) waypoint.circleMarker.remove();
        this.waypoints.splice(index, 1);
        this._updateWaypointList();

        // Remove from soundscape and mark dirty
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.removeSound(waypoint.id);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }
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

        // Clear soundscape and mark dirty
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.soundIds = [];
            soundscape.waypointData = [];
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
    _startSimulation() {
        if (this.waypoints.length === 0) {
            this._showToast('Add at least one waypoint first', 'warning');
            return;
        }

        console.log('[MapShared] 🎮 Starting Simulation Mode...');

        this.simulationMode = true;
        this.state = 'simulator';

        // Get map center for initial listener position
        const center = this.map.getCenter();
        this.simListenerLat = center.lat;
        this.simListenerLon = center.lng;

        // Create draggable listener marker
        this._createSimListenerMarker();

        // Start audio (no GPS, no compass)
        this._startSimAudio();

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
        console.log('[MapShared] ✅ Simulation Mode started');
    }

    /**
     * Stop simulation mode
     * @protected
     */
    _stopSimulation() {
        console.log('[MapShared] ⏹ Stopping Simulation Mode...');

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
    _startSimAudio() {
        console.log('[MapShared] 🔊 Starting simulation audio...');

        const soundConfigs = this.waypoints.map(wp => ({
            id: wp.id,
            url: wp.soundUrl || this.soundConfig.soundUrl,
            lat: wp.lat,
            lon: wp.lon,
            activationRadius: wp.activationRadius,
            volume: wp.volume !== undefined ? wp.volume : this.soundConfig.volume,
            loop: wp.loop !== undefined ? wp.loop : this.soundConfig.loop
        }));

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

        this.app.onStateChange = (state) => {
            console.log('[MapShared] 📊 Sim audio state:', state);
            if (state === 'running') {
                this._updateSimDisplay();
                this._showToast('✅ Simulation audio active! Drag the avatar', 'success');
            }
        };

        this.app.onError = (error) => {
            console.error('[MapShared] ❌ Sim audio error:', error);
            this._showToast('❌ ' + error.message, 'error');
        };

        // Start the audio
        this.app.start().then(() => {
            console.log('[MapShared] ✅ Simulation audio started');
            this._updateSimDisplay();
        }).catch(err => {
            console.error('[MapShared] ❌ Sim audio start failed:', err);
            this._showToast('❌ Audio start failed: ' + err.message, 'error');
        });
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
     * Debug logging
     * @param {string} message
     */
    debugLog(message) {
        if (!this.debugConsole) return;

        const timestamp = new Date().toLocaleTimeString();
        const line = `[${timestamp}] ${message}\n`;

        this.debugConsole.textContent = line + this.debugConsole.textContent;

        // Limit lines
        const lines = this.debugConsole.textContent.split('\n');
        if (lines.length > this.maxDebugLines) {
            this.debugConsole.textContent = lines.slice(0, this.maxDebugLines).join('\n');
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
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#00d9ff;color:#000;padding:12px 24px;border-radius:8px;font-weight:bold;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
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

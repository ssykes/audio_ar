/**
 * MapEditorApp - Editor-specific implementation
 * Extends MapAppShared with editor functionality
 *
 * @version 6.42 - Areas fix: init drawer before loading soundscapes
 * @author Spatial Audio AR Team
 *
 * Features:
 * - Soundscape management (create, edit, delete)
 * - Waypoint editing (add, edit, delete, clear)
 * - Export/Import JSON
 * - Server sync
 * - Simulation mode
 * - Auto-redirect to index.html if not logged in
 * - Area drawing (Session 4): Click vertices, double-click to close
 */

console.log('[map_editor.js] Loading v6.42...');

class MapEditorApp extends MapAppShared {
    constructor() {
        super({ mode: 'editor' });

        // Area drawing using Leaflet.Draw (Session 4)
        this.drawnItems = null;  // FeatureGroup for drawn areas
        this.isAreaEditMode = false;  // Track edit mode
        this.areaMarkers = new Map();  // Map<areaId, L.Polygon>
        this.nextAreaId = 1;
    }

    /**
     * Initialize the editor app
     * @override
     */
    async init() {
        console.log('Map Editor initializing...');
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Check login status - redirect to index.html if not logged in
        await this._checkLoginStatus();

        this._initMap();
        this._setupEventListeners();
        this._initDebugConsole();

        // Get initial GPS/WiFi position (all devices, for fallback positioning)
        // Position will be used if no soundscapes exist
        await this._getInitialGPS();

        // Initialize Leaflet.Draw for Areas BEFORE loading soundscapes (fix: areas need drawnItems)
        this._initAreaDrawer();

        // Load soundscape from server (editor requires login)
        // This will center the map on the first soundscape's waypoints (if any exist)
        if (this.isLoggedIn) {
            await this._loadSoundscapeFromServer();
            // Skip auto-sync check - we just loaded from server, so data is fresh
            this.debugLog('✅ Just loaded from server - skipping auto-sync check');
        }

        // If no soundscapes were loaded and we have GPS position, center on it
        if (this.waypoints.length === 0 && this.listenerLat !== null) {
            this.map.setView([this.listenerLat, this.listenerLon], 18);  // Closer zoom for GPS position
            this.debugLog(`🗺️ No soundscapes - centered on GPS/WiFi position [${this.listenerLat.toFixed(4)}, ${this.listenerLon.toFixed(4)}]`);
        }

        // Check GPS hardware for Start button (all devices)
        this.debugLog('📡 Checking for GPS hardware...');
        const hasGPS = await this._checkGPSAvailability();
        if (hasGPS) {
            this.debugLog('📍 GPS detected - showing Start button');
            const startBtn = document.getElementById('startBtn');
            if (startBtn) startBtn.style.display = 'block';
        } else {
            this.debugLog('⚠️ No GPS hardware (WiFi positioning only) - keeping Start button hidden');
        }

        // Initialize UI based on mode flags
        this._initUI();

        // Warn before closing page with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            const soundscape = this.getActiveSoundscape();
            if (soundscape?.isDirty) {
                e.preventDefault();
                e.returnValue = '';  // Browser shows "Leave site?" dialog
                return '';
            }
        });

        console.log('Map Editor ready');
    }

    /**
     * Check if user is logged in - redirect to index.html if not
     * @private
     */
    async _checkLoginStatus() {
        if (!this.api.isLoggedIn()) {
            this.debugLog('🔒 Not logged in - redirecting to index.html');
            window.location.href = 'index.html';
            return;
        }

        // Verify token is still valid
        const valid = await this.api.verifyToken();
        if (!valid) {
            this.debugLog('🔒 Token invalid - redirecting to index.html');
            window.location.href = 'index.html';
            return;
        }

        // User is logged in - show user panel
        this.isLoggedIn = true;
        const userPanel = document.getElementById('userPanel');
        const userEmail = document.getElementById('userEmail');
        const soundscapeControls = document.getElementById('soundscapeControls');
        const addWaypointBtn = document.getElementById('addWaypointBtn');
        const addAreaBtn = document.getElementById('addAreaBtn');

        if (userPanel) userPanel.style.display = 'block';
        if (userEmail) userEmail.textContent = this.api.user.email;
        if (soundscapeControls) soundscapeControls.style.display = 'block';
        if (addWaypointBtn) addWaypointBtn.style.display = 'block';
        if (addAreaBtn) addAreaBtn.style.display = 'block';

        this.debugLog('🔐 Logged in as ' + this.api.user.email);

        // Load soundscape list
        await this._loadSoundscapeList();
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        // Add Area button - start polygon drawing mode (Session 4: Sound Area)
        const addAreaBtn = document.getElementById('addAreaBtn');
        if (addAreaBtn) {
            addAreaBtn.addEventListener('click', () => {
                this.debugLog('🗺️ Draw Area button clicked');
                if (this.state !== 'editor') return;
                
                // Toggle area edit mode
                if (this.isAreaEditMode) {
                    // Exit edit mode
                    this.isAreaEditMode = false;
                    this._updateDrawingModeUI(false);
                    this._showInstruction('✏️ Area editing disabled', 'info');
                } else {
                    // Enter edit mode - show toolbar
                    this.isAreaEditMode = true;
                    this._updateDrawingModeUI(true);
                    this._showInstruction('🗺️ Click polygon icon to draw, or pencil icon to edit existing Areas', 'info');
                }
            });
        } else {
            console.warn('addAreaBtn not found!');
        }

        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this._handleStartClick());
        }

        const simulateBtn = document.getElementById('simulateBtn');
        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => this._handleSimulateClick());
        }

        const clearBtn = document.getElementById('clearAllBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.state !== 'editor') return;
                this._clearAllWaypoints();
            });
        }

        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this._exportSoundscape());
        }

        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this._triggerImport());
        }

        // SoundScape management
        const newSoundscapeBtn = document.getElementById('newSoundscapeBtn');
        if (newSoundscapeBtn) {
            newSoundscapeBtn.addEventListener('click', () => this._createNewSoundscape());
        }

        const editSoundscapeBtn = document.getElementById('editSoundscapeBtn');
        if (editSoundscapeBtn) {
            editSoundscapeBtn.addEventListener('click', () => this._editSoundscape());
        }

        const deleteSoundscapeBtn = document.getElementById('deleteSoundscapeBtn');
        if (deleteSoundscapeBtn) {
            deleteSoundscapeBtn.addEventListener('click', () => this._deleteSoundscape());
        }

        // Import file input
        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => this._handleImportFile(e.target.files[0]));
        }

        // Logout handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this._handleLogout());
        }

        // Sync from server button
        const syncFromServerBtn = document.getElementById('syncFromServerBtn');
        if (syncFromServerBtn) {
            syncFromServerBtn.addEventListener('click', () => this._handleSyncFromServer());
        }

        // Soundscape selector
        const soundscapeSelector = document.getElementById('soundscapeSelector');
        if (soundscapeSelector) {
            soundscapeSelector.addEventListener('change', () => this._onSoundscapeChange());
        }
    }

    /**
     * Handle logout - redirect to index.html
     * @private
     */
    async _handleLogout() {
        const soundscape = this.getActiveSoundscape();
        const hasUnsavedChanges = soundscape?.isDirty || false;

        if (hasUnsavedChanges) {
            const confirmed = confirm(
                '⚠️ You have unsaved changes.\n\n' +
                'Click OK to save before logout, or Cancel to logout without saving.'
            );
            if (!confirmed) {
                // User chose to logout without saving
                this.debugLog('⚠️ Logout without saving - changes will be lost');
            } else {
                // Force save before logout - wait for completion
                this.debugLog('💾 Saving before logout...');
                this._showToast('💾 Saving before logout...', 'info');

                try {
                    // Cancel any pending auto-save
                    if (this.saveDebounceTimer) {
                        clearTimeout(this.saveDebounceTimer);
                        this.saveDebounceTimer = null;
                    }
                    if (this.saveAbortController) {
                        this.saveAbortController.abort();
                        this.saveAbortController = null;
                    }

                    // Force immediate save
                    await this._executeAutoSaveForce();

                    this.debugLog('✅ Saved before logout');
                    this._showToast('✅ Saved - logging out', 'success');
                } catch (error) {
                    this.debugLog('❌ Failed to save before logout: ' + error.message);
                    this._showToast('⚠️ Save failed - changes may be lost', 'error');
                }
            }
        }

        this.api.logout();
        this.isLoggedIn = false;
        this.serverSoundscapeIds.clear();
        this.soundscapes.clear();
        this.activeSoundscapeId = null;
        this.waypoints = [];
        this.nextId = 1;

        // Clear map markers
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this._updateWaypointList();

        this._showToast('🚪 Logged out successfully', 'info');
        this.debugLog('🚪 Logged out');

        // Redirect to index.html
        window.location.href = 'index.html';
    }

    /**
     * Check if GPS hardware is available (for Start button)
     * Uses heading property to distinguish GPS from WiFi positioning
     * @returns {Promise<boolean>} True if GPS available
     * @private
     */
    async _checkGPSAvailability() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => resolve(false), 5000);

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    clearTimeout(timeout);
                    
                    // Check for GPS indicators
                    const hasHeading = typeof pos.coords.heading === 'number' && 
                                       !isNaN(pos.coords.heading);
                    const hasGoodAccuracy = pos.coords.accuracy < 50;

                    console.log(`[GPS Check] Accuracy: ${pos.coords.accuracy}m`);
                    console.log(`[GPS Check] Heading: ${pos.coords.heading}`);
                    console.log(`[GPS Check] Result: ${hasHeading || hasGoodAccuracy ? 'GPS likely ✅' : 'WiFi likely ⚠️'}`);
                    
                    // Accept if heading exists OR accuracy is good
                    resolve(hasHeading || hasGoodAccuracy);
                },
                (err) => {
                    clearTimeout(timeout);
                    console.log(`[GPS Check] Error: ${err.message}`);
                    resolve(false);
                },
                { timeout: 5000, enableHighAccuracy: true }
            );
        });
    }

    /**
     * Handle sync from server
     * @private
     */
    async _handleSyncFromServer() {
        if (!this.isLoggedIn) {
            this._showToast('⚠️ Please login first', 'warning');
            return;
        }

        this.debugLog('🔄 Syncing from server...');
        this._showToast('🔄 Syncing from server...', 'info');
        await this._loadSoundscapeFromServer();
        this._showToast('✅ Sync complete', 'success');
    }

    /**
     * Load soundscape list from server
     * @private
     */
    async _loadSoundscapeList() {
        if (!this.isLoggedIn) return;

        try {
            const selector = document.getElementById('soundscapeSelector');
            if (!selector) return;

            // Clear existing options
            selector.innerHTML = '<option value="">Select Soundscape...</option>';

            // Get server soundscapes
            const serverSoundscapes = await this.api.getSoundscapes();
            const serverIds = new Set(serverSoundscapes.map(ss => ss.id));

            // Add server soundscapes
            serverSoundscapes.forEach(ss => {
                const option = document.createElement('option');
                option.value = ss.id;
                option.textContent = ss.name;
                // Select if this is the active one
                const localId = Array.from(this.serverSoundscapeIds.entries())
                    .find(([_, serverId]) => serverId === ss.id)?.[0];
                if (localId === this.activeSoundscapeId) {
                    option.selected = true;
                }
                selector.appendChild(option);
            });

            // Add local-only soundscapes
            for (const [localId, soundscape] of this.soundscapes.entries()) {
                const hasServer = this.serverSoundscapeIds.has(localId);
                if (!hasServer && !serverIds.has(localId)) {
                    const option = document.createElement('option');
                    option.value = localId;
                    option.textContent = soundscape.name + ' (local only)';
                    if (localId === this.activeSoundscapeId) {
                        option.selected = true;
                    }
                    selector.appendChild(option);
                    this.debugLog(`  📁 Added local-only: ${soundscape.name}`);
                }
            }

            this.debugLog(`📋 Soundscape selector populated (${selector.options.length - 1} soundscapes)`);
        } catch (error) {
            this.debugLog('❌ Failed to load soundscapes: ' + error.message);
        }
    }

    /**
     * Handle soundscape selector change
     * @private
     */
    async _onSoundscapeChange() {
        const selector = document.getElementById('soundscapeSelector');
        const selectedValue = selector?.value;

        if (!selectedValue) return;

        // Find the local ID for this server ID
        let localId = Array.from(this.serverSoundscapeIds.entries())
            .find(([_, serverId]) => serverId === selectedValue)?.[0];

        // If not found in mapping, check if it's a local-only soundscape
        if (!localId && this.soundscapes.has(selectedValue)) {
            localId = selectedValue;
            this.debugLog('📁 Found local-only soundscape (not on server)');
        }

        if (!localId) {
            // Not loaded yet - load from server
            this.debugLog('🔄 Loading soundscape from server...');
            try {
                const data = await this.api.loadSoundscape(selectedValue);
                // Convert server response to SoundScape instance
                const soundscape = SoundScape.fromJSON(data.soundscape);
                this.soundscapes.set(soundscape.id, soundscape);
                this.activeSoundscapeId = soundscape.id;
                this.serverSoundscapeIds.set(soundscape.id, selectedValue);
                this.waypoints = data.waypoints;

                // Restore nextId
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
                    const sumLat = this.waypoints.reduce((sum, wp) => sum + wp.lat, 0);
                    const sumLon = this.waypoints.reduce((sum, wp) => sum + wp.lon, 0);
                    const centerLat = sumLat / this.waypoints.length;
                    const centerLon = sumLon / this.waypoints.length;
                    this.map.setView([centerLat, centerLon], 17);
                    this.debugLog(`🗺️ Map centered at [${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}]`);
                }

                this.debugLog(`✅ Loaded: ${soundscape.name} (${this.waypoints.length} waypoints)`);
            } catch (error) {
                this.debugLog('❌ Failed to load soundscape: ' + error.message);
                this._showToast('⚠️ Soundscape not on server', 'warning');
            }
        } else {
            // Already loaded - just switch
            this.switchSoundscape(localId);
        }
    }

    /**
     * Create new soundscape
     * @private
     */
    async _createNewSoundscape() {
        const name = prompt('Enter soundscape name:', 'New Soundscape');
        if (!name) return;

        // Save current soundscape first (if any)
        this._saveSoundscapeToStorage();

        // Create new empty soundscape
        const id = 'soundscape_' + Date.now();
        const soundscape = new SoundScape(id, name, [], [], []);
        this.soundscapes.set(id, soundscape);
        this.activeSoundscapeId = id;

        // Clear waypoints for the new soundscape
        this._clearAllWaypoints();

        if (this.isLoggedIn) {
            // Create on server FIRST, then map IDs
            try {
                const result = await this.api.createSoundscape(name);
                const serverId = result.soundscape.id;

                // Map local ID to server ID BEFORE saving
                this.serverSoundscapeIds.set(id, serverId);
                this.debugLog(`🎼 Created on server: ${name} (server ID: ${serverId})`);

                // Now save to server with the mapping in place
                this._updateSoundscapeSelector();
                this._saveSoundscapeToStorage();

                // Refresh soundscape list from server
                await this._loadSoundscapeList();

                this.debugLog(`✅ Soundscape created and saved to server`);
            } catch (error) {
                this.debugLog('❌ Failed to create on server: ' + error.message);
                this._showToast('⚠️ Created locally only (server failed)', 'warning');
            }
        } else {
            // Not logged in - save locally only
            this._updateSoundscapeSelector();
            this._saveSoundscapeToStorage();
        }

        this._showToast(`✅ Created: ${soundscape.name}`, 'success');
    }

    /**
     * Edit current soundscape
     * @private
     */
    async _editSoundscape() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        const newName = prompt('Edit soundscape name:', soundscape.name);
        if (!newName) return;

        const serverId = this.serverSoundscapeIds.get(this.activeSoundscapeId);
        if (this.isLoggedIn && serverId) {
            // Update on server
            try {
                await this.api.updateSoundscape(serverId, newName);
                soundscape.name = newName;
                this.debugLog('✏️ Soundscape updated on server');
            } catch (error) {
                this.debugLog('❌ Failed to update on server: ' + error.message);
            }
        } else {
            soundscape.name = newName;
        }

        this._saveSoundscapeToStorage();
        this._updateSoundscapeSelector();
        this._showToast('✅ Soundscape updated', 'success');
    }

    /**
     * Delete current soundscape
     * @private
     */
    async _deleteSoundscape() {
        if (!this.activeSoundscapeId) return;
        this.deleteSoundscape(this.activeSoundscapeId);
    }

    /**
     * Export soundscape with waypoints to JSON file
     * @private
     */
    _exportSoundscape() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) {
            this._showToast('⚠️ No soundscape to export', 'warning');
            return;
        }

        // Update soundscape with current waypoints
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

        const data = {
            version: '3.0',
            exportedAt: new Date().toISOString(),
            soundscape: soundscape.toJSON(),
            waypoints: this.waypoints
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `soundscape_${soundscape.id}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.debugLog('[Export] Exported:', a.download);
        this._showToast('✅ Soundscape exported', 'success');
    }

    /**
     * Trigger file import dialog
     * @private
     */
    _triggerImport() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Handle imported file
     * @param {File} file
     * @private
     */
    _handleImportFile(file) {
        if (!file) return;

        this.debugLog(`📥 Importing: ${file.name}`);

        // Confirm before overwriting if there's existing data
        const hasExistingData = this.waypoints.length > 0;
        if (hasExistingData) {
            const confirmed = confirm(
                `⚠️ Import will overwrite your current soundscape.\n\n` +
                `You have ${this.waypoints.length} waypoint(s) that will be replaced.\n\n` +
                `Click OK to import, or Cancel to abort.`
            );
            if (!confirmed) {
                this.debugLog('❌ Import cancelled by user');
                return;
            }
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const soundscape = SoundScape.fromJSON(data.soundscape);
                const waypoints = data.waypoints || [];

                // Clear current data
                this._clearAllWaypoints();

                // Load imported data as new soundscape
                this.soundscapes.set(soundscape.id, soundscape);
                this.activeSoundscapeId = soundscape.id;
                this.waypoints = waypoints;

                // Restore nextId
                if (this.waypoints.length > 0) {
                    const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
                    this.nextId = maxId + 1;
                }

                // Render waypoints
                this.waypoints.forEach(wp => this._createMarker(wp));
                this._updateWaypointList();
                this._updateSoundscapeSelector();

                this.debugLog(`✅ Imported: ${soundscape.name} (${this.waypoints.length} waypoints)`);
                this._showToast(`✅ Imported: ${soundscape.name}`, 'success');
            } catch (error) {
                this.debugLog('❌ Import failed: ' + error.message);
                this._showToast('❌ Import failed: ' + (error?.message || 'Unknown error'), 'error');
            }
        };
        reader.readAsText(file);
    }

    /**
     * Load ALL soundscapes from server
     * @private
     */
    async _loadSoundscapeFromServer() {
        if (!this.isLoggedIn) {
            this.debugLog('⚠️ Not logged in - cannot load from server');
            return;
        }

        try {
            this.debugLog('☁️ Loading soundscapes from server...');

            // Get list of soundscapes
            const soundscapes = await this.api.getSoundscapes();

            if (soundscapes.length === 0) {
                this.debugLog('📭 No soundscapes on server - creating default');
                await this._createNewSoundscape();
                return;
            }

            // Load ALL soundscapes into local cache
            this.debugLog(`🎼 Loading ${soundscapes.length} soundscape(s)...`);
            for (const ss of soundscapes) {
                try {
                    const data = await this.api.loadSoundscape(ss.id);
                    const soundscape = SoundScape.fromJSON(data.soundscape);

                    // IMPORTANT: Add waypointData to soundscape (from data.waypoints, not data.soundscape)
                    soundscape.waypointData = data.waypoints;

                    // Areas are already included in data.soundscape.areas (loaded by api.loadSoundscape)
                    // and initialized by SoundScape.fromJSON() - no separate load needed

                    // Add to soundscapes map
                    this.soundscapes.set(soundscape.id, soundscape);
                    this.serverSoundscapeIds.set(soundscape.id, ss.id);

                    this.debugLog(`  ✅ Loaded: ${soundscape.name} (${data.waypoints.length} waypoints)`);
                } catch (error) {
                    this.debugLog(`  ⚠️ Failed to load ${ss.name}: ${error.message}`);
                }
            }

            // Set active to most recent
            const latest = soundscapes[0];
            const localId = Array.from(this.serverSoundscapeIds.entries())
                .find(([_, serverId]) => serverId === latest.id)?.[0];

            if (localId) {
                this.switchSoundscape(localId);
            }

            this.debugLog(`✅ Loaded ${soundscapes.length} soundscape(s) from server`);
            this._updateSyncStatus(true);
        } catch (error) {
            this.debugLog('❌ Failed to load from server: ' + error.message);
            this._showToast('⚠️ Server sync failed', 'error');
            this._updateSyncStatus(false);
        }
    }

    /**
     * Save soundscape to server
     * @private
     */
    async _saveSoundscapeToServer() {
        const serverId = this.serverSoundscapeIds.get(this.activeSoundscapeId);
        if (!this.isLoggedIn || !serverId) {
            this.debugLog('⚠️ Cannot save to server - not logged in or no soundscape');
            return;
        }

        try {
            this.debugLog('☁️ Saving to server...');

            const soundscape = this.getActiveSoundscape();
            // Use soundscape.waypointData (clean objects) instead of this.waypoints (may have Leaflet refs)
            // Strip Leaflet properties from waypoints
            const cleanWaypoints = soundscape.waypointData.map(wp => {
                const { circleMarker, marker, ...cleanWp } = wp;
                return cleanWp;
            });

            // Strip Leaflet layer references from areas
            const cleanAreas = (soundscape.areas || []).map(area => {
                const { _leafletLayer, ...cleanArea } = area;
                return cleanArea;
            });

            // Save waypoints, behaviors, and areas in single call
            await this.api.saveSoundscape(
                serverId,
                cleanWaypoints,
                soundscape.behaviors || [],
                cleanAreas
            );

            this.debugLog('✅ Saved to server (waypoints + behaviors + areas)');
            this._updateSyncStatus(true);
        } catch (error) {
            this.debugLog('❌ Server save failed: ' + error.message);
            this._showToast('⚠️ Server sync failed - saved locally', 'warning');
            this._updateSyncStatus(false);
        }
    }

    /**
     * Update sync status indicator
     * @param {boolean} isSynced - Whether server is in sync
     * @private
     */
    _updateSyncStatus(isSynced) {
        const syncStatus = document.getElementById('syncStatus');
        if (!syncStatus) return;

        const soundscape = this.getActiveSoundscape();
        const isDirty = soundscape?.isDirty || false;

        if (!this.isLoggedIn) {
            syncStatus.textContent = '🔓 Not logged in';
            syncStatus.style.color = '#888';
        } else if (isDirty) {
            syncStatus.textContent = '⚠️ Unsaved changes...';
            syncStatus.style.color = '#f39c12';
        } else if (isSynced) {
            syncStatus.textContent = '🟢 Synced to server';
            syncStatus.style.color = '#00ff88';
        } else {
            syncStatus.textContent = '🟡 Local only';
            syncStatus.style.color = '#f39c12';
        }
    }

    /**
     * Initialize debug console
     * @private
     */
    _initDebugConsole() {
        this.debugConsole = document.getElementById('debugConsole');
        this.debugModalContent = document.getElementById('debugConsoleContent');
        
        if (this.debugModalContent) {
            this.debugLog('🗺️ Map Editor v6.0 ready');
            this.debugLog('📍 Waiting for GPS...');
            this.debugLog('🎯 Auto-copy: 1000 lines, copies 3s after you stop');

            // Wire up copy button (new icon button)
            const copyBtn = document.getElementById('debugCopyBtn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => this._copyLogs());
            }

            // Wire up old copy button (for backwards compatibility)
            const oldCopyBtn = document.getElementById('copyLogsBtn');
            if (oldCopyBtn) {
                oldCopyBtn.addEventListener('click', () => this._copyLogs());
            }

            // Override console.log to capture audio debug logs
            const originalLog = console.log;
            const self = this;
            console.log = function(...args) {
                originalLog.apply(console, args);
                // Capture audio/debug logs
                const msg = args.join(' ');
                if (msg.includes('[Audio]') || msg.includes('[GPS]') || msg.includes('[Compass]') || msg.includes('[MapShared]') || msg.includes('[MapEditor]')) {
                    self.debugLog(msg);
                }
            };
        }
    }

    /**
     * Copy logs to clipboard
     * @private
     */
    _copyLogs(isAutoCopy = false) {
        if (!this.debugConsoleContent) return;

        const text = this.debugConsoleContent.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('debugCopyBtn');
            if (btn) {
                // Show tooltip feedback
                const originalTitle = btn.title;
                btn.title = '✅ Copied!';
                setTimeout(() => {
                    btn.title = originalTitle;
                }, 2000);
            }
            if (isAutoCopy) {
                this.debugLog('📋 Logs auto-copied to clipboard!');
            }
        }).catch(err => {
            this.debugLog(`❌ Copy failed: ${err.message}`);
        });
    }

    // =====================================================================
    // PLAYER MODE - START (Inherited from MapAppShared with editor-specific handling)
    // =====================================================================

    /**
     * Handle start click - switch to player mode
     * @protected
     */
    async _handleStartClick() {
        if (this.state === 'player') {
            // Already in player mode - stop
            await this._stopPlayerMode();
            return;
        }

        if (this.waypoints.length === 0) {
            this._showToast('Add at least one waypoint first', 'warning');
            return;
        }

        const startBtn = document.getElementById('startBtn');
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';

        try {
            console.log('[MapEditor] 🎮 Starting Player Mode...');

            // Request wake lock
            await this._requestWakeLock();

            // Get GPS position
            console.log('[MapEditor] 📍 Requesting GPS...');
            let gpsResolved = false;
            let gpsGranted = false;
            const initialGPS = await new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (!gpsResolved) {
                        console.warn('[MapEditor] ⚠️ GPS timeout - using fallback');
                        resolve(null);  // No initial position - will use waypoint center
                    }
                }, 12000);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        gpsResolved = true;
                        gpsGranted = true;
                        clearTimeout(timeoutId);
                        console.log(`[MapEditor] 📍 GPS GRANTED ✅ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}, accuracy: ${pos.coords.accuracy.toFixed(1)}m)`);
                        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                    },
                    (err) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.warn(`[MapEditor] 📍 GPS ERROR ❌: ${err.message} - will center on soundscapes`);
                        resolve(null);  // No initial position - will use waypoint center
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            });

            // Initialize AudioContext
            console.log('[MapEditor] 🔊 Initializing audio context...');
            const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const resumePromise = tempAudioCtx.resume();
            const audioTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Audio resume timeout')), 3000)
            );

            try {
                await Promise.race([resumePromise, audioTimeout]);
                console.log('[MapEditor] ✅ Audio context initialized');
            } catch (audioErr) {
                console.warn(`[MapEditor] ⚠️ Audio context issue: ${audioErr.message} (continuing)`);
            }
            tempAudioCtx.close();

            // Create sound configs
            console.log('[MapEditor] 🎵 Creating sound configs from waypoints...');
            const soundConfigs = this.waypoints.map(wp => ({
                id: wp.id,
                url: wp.soundUrl || this.soundConfig.soundUrl,
                lat: wp.lat,
                lon: wp.lon,
                activationRadius: wp.activationRadius,
                volume: wp.volume !== undefined ? wp.volume : this.soundConfig.volume,
                loop: wp.loop !== undefined ? wp.loop : this.soundConfig.loop
            }));

            // Create app with initial GPS position
            this.app = new SpatialAudioApp(soundConfigs, {
                initialPosition: initialGPS,
                gpsSmoothing: true,
                autoLock: true,
                reverbEnabled: true
            });

            // Set up callbacks
            this.app.onPositionUpdate = (data) => {
                this._updateWaypointDistances();
            };

            this.app.onGPSUpdate = (lat, lon, locked) => {
                this._updateListenerMarker(lat, lon, locked);
            };

            this.app.onStateChange = (state) => {
                console.log('[MapEditor] 📊 State changed to:', state);
                this._updateStartButton(state);

                if (state === 'running') {
                    const audioWorks = this.app.engine && this.app.engine.getState() === 'running';

                    if (!audioWorks) {
                        this.needsAudioEnable = true;
                        this._showToast('👆 Tap Start to enable audio', 'info');
                    } else {
                        this.needsAudioEnable = false;
                        this._showToast('✅ Player mode active! Walk toward the sounds', 'success');
                    }
                }
            };

            this.app.onError = (error) => {
                console.error('[MapEditor] ❌ Error:', error);
                this._showToast('❌ ' + error.message, 'error');
                this._updateStartButton('error');
            };

            // Start the experience
            console.log('[MapEditor] 🚀 Starting soundscape...');
            const soundscape = this.getActiveSoundscape();
            if (soundscape && soundscape.behaviors && soundscape.behaviors.length > 0) {
                console.log('[MapEditor] 🎼 Starting with behaviors:', soundscape.behaviors.length);
                await this.app.startSoundScape(soundscape);
            } else {
                console.log('[MapEditor] 🎵 Starting without behaviors (default)');
                await this.app.start();
            }

            console.log('[MapEditor] ✅ Soundscape started');

            // Update state
            this.state = 'player';
            this._updateStartButton('starting');

            // Refresh waypoint list to show distance placeholders
            this._updateWaypointList();

        } catch (error) {
            console.error('[MapEditor] ❌ Start failed:', error);
            this._showToast('❌ ' + error.message, 'error');
            this._updateStartButton('error');
        }
    }

    /**
     * Stop player mode
     * @private
     */
    async _stopPlayerMode() {
        console.log('[MapEditor] ⏹ Stopping Player Mode...');

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
                console.log('[MapEditor] 🔒 Wake lock acquired');

                this.wakeLock.addEventListener('release', () => {
                    console.log('[MapEditor] 🔒 Wake lock released');
                    this.wakeLock = null;
                });
            } else {
                console.warn('[MapEditor] ⚠️ Wake Lock API not supported');
            }
        } catch (err) {
            console.warn(`[MapEditor] ⚠️ Wake lock failed: ${err.message}`);
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
            console.log('[MapEditor] 🔒 Wake lock released');
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
     * Auto-sync if server data has changed since last save (Session 5E: Timestamp-based sync)
     * Compares server timestamp with local timestamp to detect changes from other tabs/devices
     * @private
     */
    async _autoSyncIfNeeded() {
        if (!this.isLoggedIn || !this.activeSoundscapeId) return;

        try {
            // Get server timestamp
            const serverModified = await this.api.getSoundscapeModified(this.activeSoundscapeId);
            const localModified = localStorage.getItem('soundscape_modified_' + this.activeSoundscapeId);

            if (serverModified !== localModified) {
                this.debugLog('🔄 Timestamp mismatch (server: ' + serverModified + ', local: ' + localModified + ') - server has newer data');
                
                // Check if we have unsaved local changes
                const soundscape = this.getActiveSoundscape();
                if (soundscape && soundscape.isDirty) {
                    // Has local changes - ask user what to do
                    this.debugLog('⚠️ Local changes detected - prompting user');
                    const confirmSync = confirm(
                        'Server has newer data from another tab or device.\n\n' +
                        'Click OK to sync from server (local changes will be lost).\n' +
                        'Click Cancel to keep your local changes.'
                    );
                    
                    if (!confirmSync) {
                        this.debugLog('❌ User chose to keep local changes');
                        return;
                    }
                }
                
                // Sync from server
                this._showToast('🔄 Updating from server...', 'info');
                await this._loadSoundscapeFromServer();
                this._showToast('✅ Soundscape updated', 'success');
                this.debugLog('✅ Auto-synced from server');
            } else {
                this.debugLog('✅ Timestamp match (' + serverModified + ') - using current data');
            }
        } catch (error) {
            this.debugLog('⚠️ Auto-sync check failed: ' + error.message);
            // Silently fail - continue with current data
        }
    }

    // =====================================================================
    // AREA DRAWING (Session 4: Sound Area - using Leaflet.Draw)
    // =====================================================================

    /**
     * Initialize Leaflet.Draw for Area editing
     * @private
     */
    _initAreaDrawer() {
        // Create feature group to store drawn items
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        // Create draw control
        this.drawControl = new L.Control.Draw({
            edit: {
                featureGroup: this.drawnItems,
                edit: {
                    selectedPathOptions: {
                        maintainColor: true,
                        opacity: 0.6,
                        fillOpacity: 0.3
                    }
                },
                remove: false,  // We handle deletion ourselves
                poly: {
                    allowIntersection: true
                }
            },
            draw: {
                polygon: {
                    allowIntersection: true,
                    showArea: true,
                    shapeOptions: {
                        color: '#ff6b6b',
                        fillColor: '#ff6b6b',
                        fillOpacity: 0.3,
                        weight: 3
                    },
                    metric: true
                },
                polyline: false,
                rectangle: false,
                circle: false,
                marker: false,
                circlemarker: false
            }
        });

        this.map.addControl(this.drawControl);

        // Event: Drawing started (Session 4: Prevent waypoint creation while drawing)
        this.map.on(L.Draw.Event.DRAWSTART, () => {
            console.log('[MapEditor] DRAWSTART fired - setting isDrawingArea = true');
            this.isDrawingArea = true;
            console.log('[MapEditor] isDrawingArea is now:', this.isDrawingArea);
        });

        // Event: Drawing stopped
        this.map.on(L.Draw.Event.DRAWSTOP, () => {
            console.log('[MapEditor] DRAWSTOP fired - setting isDrawingArea = false');
            this.isDrawingArea = false;
            console.log('[MapEditor] isDrawingArea is now:', this.isDrawingArea);
        });

        // Event: Polygon created
        this.map.on(L.Draw.Event.CREATED, (e) => {
            if (e.layerType !== 'polygon') return;

            const layer = e.layer;
            const latlngs = layer.getLatLngs()[0];

            console.log('[MapEditor] CREATED event - layerType:', e.layerType, 'layer:', layer, 'on map:', this.map.hasLayer(layer));

            this.debugLog(`🗺️ Polygon drawn: ${latlngs.length} vertices`);

            // Auto-name area (similar to waypoints: Sound 1, Sound 2, ...)
            const areaName = 'Sound ' + (this.areaMarkers.size + 1);

            // Create Area object
            const area = {
                id: 'area' + this.nextAreaId++,
                name: areaName,
                polygon: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng })),
                soundUrl: this.soundConfig.soundUrl,
                volume: this.soundConfig.volume,
                loop: this.soundConfig.loop,
                fadeZoneWidth: 5.0,
                overlapMode: 'mix',
                icon: '◈',
                color: '#ff6b6b',
                sortOrder: 0,
                _leafletLayer: layer  // Store reference
            };

            // Add to soundscape
            const soundscape = this.getActiveSoundscape();
            if (soundscape) {
                soundscape.addArea(area);
                this._markSoundscapeDirty();
                this._scheduleAutoSave();
            }

            // Store in area markers
            this.areaMarkers.set(area.id, layer);

            // IMPORTANT: Explicitly add the layer to drawnItems (Leaflet.Draw doesn't auto-add)
            this.drawnItems.addLayer(layer);

            console.log('[MapEditor] After storing - layer on map:', this.map.hasLayer(layer), 'in drawnItems:', this.drawnItems.hasLayer(layer));

            // Bind popup
            layer.bindPopup(this._createAreaPopupContent(area));

            // Add click handler for adding vertices
            layer.on('click', (e) => {
                console.log('[MapEditor] Area click - isAreaEditMode:', this.isAreaEditMode);
                if (this.isAreaEditMode) {
                    e.originalEvent.stopPropagation();
                    this._addVertexOnClick(area, e.latlng);
                } else {
                    // Not in edit mode - allow popup to show
                    // But stop propagation so map click doesn't create waypoint
                    e.originalEvent.stopPropagation();
                    console.log('[MapEditor] Area click - stopped propagation, popup should show');
                }
            });

            console.log('[MapEditor] After bindPopup - layer on map:', this.map.hasLayer(layer));

            this.debugLog(`✅ Created Area: ${area.name} (${latlngs.length} vertices)`);
            this._showToast(`✅ Created Area: ${areaName}`, 'success');
        });

        // Event: Editing started
        this.map.on(L.Draw.Event.EDITSTART, () => {
            this.debugLog('✏️ Area edit mode started');
            this.isAreaEditMode = true;
            this._updateDrawingModeUI(true);
            
            // Disable map dragging
            this.map.dragging.disable();
            this.map.scrollWheelZoom.disable();
            
            // Disable popups while editing
            this.drawnItems.eachLayer((layer) => {
                if (layer.getPopup()) {
                    layer._popupContent = layer.getPopup().getContent();
                    layer.unbindPopup();
                }
            });
        });

        // Event: Polygon edited
        this.map.on(L.Draw.Event.EDITED, (e) => {
            e.layers.eachLayer((layer) => {
                const area = this._findAreaByLayer(layer);
                if (area) {
                    // Update polygon data
                    const latlngs = layer.getLatLngs()[0];
                    area.polygon = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
                    
                    // Update soundscape
                    const soundscape = this.getActiveSoundscape();
                    if (soundscape) {
                        soundscape.updateArea(area.id, area);
                        this._markSoundscapeDirty();
                        this._scheduleAutoSave();
                    }
                    
                    this.debugLog(`✏️ Edited Area: ${area.name}`);
                }
            });
            
            // Re-enable map dragging
            this.map.dragging.enable();
            this.map.scrollWheelZoom.enable();
        });

        // Event: Editing stopped
        this.map.on(L.Draw.Event.EDITSTOP, () => {
            this.debugLog('✏️ Area edit mode stopped');

            // Re-enable popups with fresh content (event handlers need to be re-attached)
            this.drawnItems.eachLayer((layer) => {
                const area = this._findAreaByLayer(layer);
                if (area) {
                    layer.bindPopup(this._createAreaPopupContent(area));
                }
            });
        });

        this.debugLog('🗺️ Leaflet.Draw initialized for Areas');
    }

    /**
     * Find area by Leaflet layer
     * @param {L.Polygon} layer
     * @returns {Object|null}
     * @private
     */
    _findAreaByLayer(layer) {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return null;
        
        for (const area of soundscape.getAreas()) {
            if (area._leafletLayer === layer) {
                return area;
            }
        }
        return null;
    }

    /**
     * Add vertex when clicking on edge
     * @param {Object} area
     * @param {L.LatLng} clickLatlng
     * @private
     */
    _addVertexOnClick(area, clickLatlng) {
        const layer = area._leafletLayer;
        if (!layer) return;
        
        const latlngs = layer.getLatLngs()[0];
        
        // Find closest edge
        let closestIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < latlngs.length; i++) {
            const nextIndex = (i + 1) % latlngs.length;
            const distance = L.GeometryUtil.distanceToSegment(this.map, clickLatlng, latlngs[i], latlngs[nextIndex]);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = i;
            }
        }
        
        // Insert vertex
        latlngs.splice(closestIndex + 1, 0, clickLatlng);
        layer.setLatLngs(latlngs);
        
        // Update area data
        area.polygon = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
        
        this.debugLog(`✅ Added vertex to Area ${area.name} at index ${closestIndex + 1}`);
    }

    /**
     * Update UI for drawing mode
     * @param {boolean} isDrawing
     * @private
     */
    _updateDrawingModeUI(isDrawing) {
        const drawingModeItem = document.getElementById('drawingModeItem');
        const drawingModeStatus = document.getElementById('drawingModeStatus');
        const addAreaBtn = document.getElementById('addAreaBtn');

        if (drawingModeItem && drawingModeStatus) {
            drawingModeItem.style.display = isDrawing ? 'flex' : 'none';
            drawingModeStatus.textContent = isDrawing ? 'Area editing' : '--';
        }

        if (addAreaBtn) {
            addAreaBtn.textContent = isDrawing ? '✖ Done' : '+ Draw Area';
            addAreaBtn.classList.toggle('btn-warning', isDrawing);
            addAreaBtn.classList.toggle('btn-primary', !isDrawing);
        }
    }

    /**
     * Clear all areas
     */
    _clearAllAreas() {
        // Remove from map
        this.drawnItems.clearLayers();
        this.areaMarkers.clear();
        this.nextAreaId = 1;

        // Clear from soundscape
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.areas = [];
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }

        this.debugLog('🗑️ Cleared all Areas');
    }

    /**
     * Load areas when switching soundscapes
     * @param {Object[]} areas
     */
    _loadAreasIntoDrawer(areas) {
        console.log('[MapEditor] _loadAreasIntoDrawer called with:', areas);
        
        if (!areas || areas.length === 0) {
            console.log('[MapEditor] No areas to load');
            return;
        }

        // Safety check: ensure drawnItems is initialized
        if (!this.drawnItems) {
            this.debugLog('⚠️ _loadAreasIntoDrawer: drawnItems not initialized yet');
            return;
        }

        console.log('[MapEditor] Loading', areas.length, 'areas...');
        areas.forEach((area, index) => {
            console.log('[MapEditor] Loading area', index + 1, ':', area.name, area.polygon.length, 'vertices');
            
            const latlngs = area.polygon.map(v => [v.lat, v.lng]);

            const polygon = L.polygon(latlngs, {
                color: area.color || '#ff6b6b',
                fillColor: area.color || '#ff6b6b',
                fillOpacity: 0.2,
                weight: 2
            });

            this.drawnItems.addLayer(polygon);
            this.areaMarkers.set(area.id, polygon);
            area._leafletLayer = polygon;

            // Bind popup
            polygon.bindPopup(this._createAreaPopupContent(area));

            // Add click handler
            polygon.on('click', (e) => {
                console.log('[MapEditor] Area click - isAreaEditMode:', this.isAreaEditMode);
                if (this.isAreaEditMode) {
                    e.originalEvent.stopPropagation();
                    this._addVertexOnClick(area, e.latlng);
                } else {
                    // Not in edit mode - allow popup to show
                    // But stop propagation so map click doesn't create waypoint
                    e.originalEvent.stopPropagation();
                    console.log('[MapEditor] Area click - stopped propagation, popup should show');
                }
            });
        });

        this.debugLog(`📍 Loaded ${areas.length} Areas`);
    }

    /**
     * Get popup content for Area
     * @param {Object} area
     * @returns {string}
     * @private
     */
    _createAreaPopupContent(area) {
        const content = `
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 10px 0;">${area.icon || '◈'} ${area.name}</h3>
                <div style="font-size: 0.85em; color: #666; margin-bottom: 10px;">
                    <div>📍 ${area.polygon.length} vertices</div>
                    <div>🔊 Volume: ${(area.volume * 100).toFixed(0)}%</div>
                    <div>🎵 Sound: ${area.soundUrl.split('/').pop()}</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button id="edit-area-${area.id}" style="flex: 1; padding: 6px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">✏️ Edit</button>
                    <button id="delete-area-${area.id}" style="flex: 1; padding: 6px; background: #e94560; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ Delete</button>
                </div>
            </div>
        `;
        
        // Add event handlers after popup opens
        setTimeout(() => {
            const editBtn = document.getElementById(`edit-area-${area.id}`);
            const deleteBtn = document.getElementById(`delete-area-${area.id}`);

            if (editBtn && area._leafletLayer) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.debugLog(`✏️ Editing area: ${area.name}`);
                    
                    // Close the popup first
                    if (area._leafletLayer) {
                        area._leafletLayer.closePopup();
                    }
                    
                    // Enable editing on the specific layer
                    if (this.drawnItems) {
                        // Use Leaflet.Draw's edit handler
                        const editHandler = this.map.editHandler;
                        if (editHandler) {
                            editHandler.enable();
                        } else {
                            // Fallback: trigger edit via drawnItems
                            this.drawnItems.eachLayer((layer) => {
                                if (layer === area._leafletLayer) {
                                    layer.editing.enable();
                                }
                            });
                        }
                    }
                    
                    this._showInstruction(`✏️ Editing: ${area.name}. Drag vertices to reshape. Click Save when done.`, 'info');
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this._deleteArea(area.id);
                });
            }
        }, 50);
        
        return content;
    }

    /**
     * Delete an Area
     * @param {string} areaId
     * @private
     */
    _deleteArea(areaId) {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        const area = soundscape.getArea(areaId);
        if (!area) return;

        if (!confirm(`Delete Area "${area.name}"?`)) return;

        // Remove from soundscape
        soundscape.deleteArea(areaId);
        this._markSoundscapeDirty();
        this._scheduleAutoSave();

        // Remove from map
        if (area._leafletLayer) {
            this.drawnItems.removeLayer(area._leafletLayer);
        }
        this.areaMarkers.delete(areaId);

        this.debugLog(`🗑️ Deleted Area: ${area.name}`);
        this._showToast(`🗑️ Deleted: ${area.name}`, 'info');
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
const app = new MapEditorApp();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

console.log('[map_editor.js] MapEditorApp class loaded');

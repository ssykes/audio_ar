/**
 * MapEditorApp - Editor-specific implementation
 * Extends MapAppShared with editor functionality
 *
 * @version 6.3 - Populate waypointData when loading from server
 * @author Spatial Audio AR Team
 *
 * Features:
 * - Login/Register/Logout UI
 * - Soundscape management (create, edit, delete)
 * - Waypoint editing (add, edit, delete, clear)
 * - Export/Import JSON
 * - Server sync
 * - Simulation mode
 */

console.log('[map_editor.js] Loading v6.1...');

class MapEditorApp extends MapAppShared {
    constructor() {
        super({ mode: 'editor' });
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

        // Check login status first
        await this._checkLoginStatus();

        this._initMap();
        this._setupEventListeners();
        this._initDebugConsole();
        await this._getInitialGPS();

        // Load soundscape from server if logged in, otherwise from localStorage
        if (this.isLoggedIn) {
            await this._loadSoundscapeFromServer();
            // Auto-sync if server data has changed since last save
            await this._autoSyncIfNeeded();
        } else {
            this._loadSoundscapeFromStorage();  // Fallback to localStorage
        }

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
     * Check if user is logged in and update UI
     * @private
     */
    async _checkLoginStatus() {
        const loginForm = document.getElementById('loginForm');
        const userPanel = document.getElementById('userPanel');
        const userEmail = document.getElementById('userEmail');
        const soundscapeControls = document.getElementById('soundscapeControls');
        const addWaypointBtn = document.getElementById('addWaypointBtn');

        if (this.api.isLoggedIn()) {
            // Verify token is still valid
            const valid = await this.api.verifyToken();
            if (valid) {
                this.isLoggedIn = true;
                if (loginForm) loginForm.style.display = 'none';
                if (userPanel) userPanel.style.display = 'block';
                if (userEmail) userEmail.textContent = this.api.user.email;
                if (soundscapeControls) soundscapeControls.style.display = 'block';
                if (addWaypointBtn) addWaypointBtn.style.display = 'block';
                this.debugLog('🔐 Logged in as ' + this.api.user.email);

                // Load soundscape list
                await this._loadSoundscapeList();
            } else {
                this._showLoginForm();
            }
        } else {
            this._showLoginForm();
        }
    }

    /**
     * Show login form
     * @private
     */
    _showLoginForm() {
        const loginForm = document.getElementById('loginForm');
        const userPanel = document.getElementById('userPanel');
        const soundscapeControls = document.getElementById('soundscapeControls');
        const addWaypointBtn = document.getElementById('addWaypointBtn');

        if (loginForm) loginForm.style.display = 'block';
        if (userPanel) userPanel.style.display = 'none';
        if (soundscapeControls) soundscapeControls.style.display = 'none';
        if (addWaypointBtn) addWaypointBtn.style.display = 'none';

        this.debugLog('🔓 Not logged in - please login or register');
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        const addBtn = document.getElementById('addWaypointBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (this.state !== 'editor') return;
                this._showInstruction('Click on the map to place a sound');
            });
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

        // Login/Logout handlers
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this._handleLogin());
        }

        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => this._handleRegister());
        }

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
     * Handle login
     * @private
     */
    async _handleLogin() {
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value?.trim();

        if (!email || !password) {
            this._showToast('⚠️ Please enter email and password', 'warning');
            return;
        }

        try {
            this.debugLog('🔐 Logging in...');
            await this.api.login(email, password);
            this.isLoggedIn = true;
            await this._checkLoginStatus();
            this._showToast('✅ Logged in successfully', 'success');
            this.debugLog('🔐 Logged in as ' + email);

            // Clear password
            if (passwordInput) passwordInput.value = '';

            // Load soundscape from server
            await this._loadSoundscapeFromServer();
        } catch (error) {
            this._showToast('❌ Login failed: ' + error.message, 'error');
            this.debugLog('❌ Login failed: ' + error.message);
        }
    }

    /**
     * Handle register
     * @private
     */
    async _handleRegister() {
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value?.trim();

        if (!email || !password) {
            this._showToast('⚠️ Please enter email and password', 'warning');
            return;
        }

        if (password.length < 6) {
            this._showToast('⚠️ Password must be at least 6 characters', 'warning');
            return;
        }

        try {
            this.debugLog('📝 Registering...');
            await this.api.register(email, password);
            this.isLoggedIn = true;
            await this._checkLoginStatus();
            this._showToast('✅ Registration successful', 'success');
            this.debugLog('📝 Registered as ' + email);

            // Clear password
            if (passwordInput) passwordInput.value = '';

            // Create first soundscape
            await this._createNewSoundscape();
        } catch (error) {
            this._showToast('❌ Registration failed: ' + error.message, 'error');
            this.debugLog('❌ Registration failed: ' + error.message);
        }
    }

    /**
     * Handle logout
     * @private
     */
    _handleLogout() {
        if (!confirm('Are you sure you want to logout? Unsaved changes will be lost.')) {
            return;
        }

        // Save current soundscape before logout
        this._saveSoundscapeToStorage();

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

        this._showLoginForm();
        this._showToast('🚪 Logged out successfully', 'info');
        this.debugLog('🚪 Logged out');
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

        SoundScapeStorage.export(soundscape, this.waypoints);
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

        SoundScapeStorage.import(file, (result, error) => {
            if (error || !result) {
                this._showToast('❌ Import failed: ' + (error?.message || 'Unknown error'), 'error');
                return;
            }

            // Clear current data
            this._clearAllWaypoints();

            // Load imported data as new soundscape
            const soundscape = result.soundscape;
            this.waypoints = result.waypoints;

            // Add to soundscapes map
            this.soundscapes.set(soundscape.id, soundscape);
            this.activeSoundscapeId = soundscape.id;

            // Restore nextId
            if (this.waypoints.length > 0) {
                const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
                this.nextId = maxId + 1;
            }

            // Render waypoints
            this.waypoints.forEach(wp => this._createMarker(wp));
            this._updateWaypointList();
            this._updateSoundscapeSelector();

            // Save to localStorage
            this._saveSoundscapeToStorage();

            this.debugLog(`✅ Imported: ${soundscape.name} (${this.waypoints.length} waypoints)`);
            this._showToast(`✅ Imported: ${soundscape.name}`, 'success');
        });
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
            this._showToast('⚠️ Using local data (server sync failed)', 'warning');
            // Fallback to localStorage
            this._loadSoundscapeFromStorage();
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
            await this.api.saveSoundscape(
                serverId,
                soundscape.waypointData.map(wp => this.api.wpToServer(wp)),
                soundscape.behaviors || []
            );

            this.debugLog('✅ Saved to server');
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
        if (this.debugConsole) {
            this.debugLog('🗺️ Map Editor v6.0 ready');
            this.debugLog('📍 Waiting for GPS...');
            this.debugLog('🎯 Auto-copy: 1000 lines, copies 3s after you stop');

            // Wire up copy button
            const copyBtn = document.getElementById('copyLogsBtn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => this._copyLogs());
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
        if (!this.debugConsole) return;

        const text = this.debugConsole.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copyLogsBtn');
            if (btn) {
                const originalText = btn.textContent;
                btn.textContent = isAutoCopy ? '✅ Auto-copied!' : '✅ Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
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
            const initialGPS = await new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (!gpsResolved) {
                        console.warn('[MapEditor] ⚠️ GPS timeout - using fallback');
                        resolve({ lat: 0, lon: 0 });
                    }
                }, 12000);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.log(`[MapEditor] 📍 GPS GRANTED ✅ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}, accuracy: ${pos.coords.accuracy.toFixed(1)}m)`);
                        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                    },
                    (err) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.warn(`[MapEditor] 📍 GPS ERROR ❌: ${err.message}`);
                        resolve({ lat: 0, lon: 0 });
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

/**
 * Map Placer App
 * Visual map interface for placing sound waypoints
 * @version 5.0 - Multi-Soundscape Support
 *
 * Session 5B Implementation:
 * - Multiple soundscape management (create, switch, delete)
 * - Soundscape selector dropdown with all soundscapes
 * - Multi-soundscape localStorage persistence
 * - Server sync for multiple soundscapes
 *
 * Session 4 Implementation:
 * - User authentication (login/register/logout)
 * - Server-side soundscape persistence via API
 * - Auto-sync on waypoint changes
 * - Phone mode detection (edit controls hidden on mobile)
 *
 * Previous Features (v3.0):
 * - Player mode with GPS tracking and compass rotation
 * - SpatialAudioApp integration for audio playback
 * - Wake lock, compass, and GPS permission handling
 * - Debug console with auto-copy for field testing
 */

class MapPlacerApp {
    constructor() {
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

        // Phone mode detection
        this.isPhoneMode = this._detectPhoneMode();

        // Auto-save feedback
        this.saveFeedbackTimer = null;
        this.saveDebounceTimer = null;

        // Login state
        this.isLoggedIn = false;
    }

    async init() {
        console.log('Map Placer initializing...');
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }
        
        // Check login status first
        await this._checkLoginStatus();
        
        this._initMap();
        this._setupEventListeners();
        this._initDebugConsole();
        await this._getInitialGPS();

        // Load soundscape from server (placer requires login)
        if (this.isLoggedIn) {
            await this._loadSoundscapeFromServer();
        }

        console.log('Map Placer ready (Editor Mode)');
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
     * Detect if running on a phone/tablet
     * @returns {boolean}
     * @private
     */
    _detectPhoneMode() {
        // Check for mobile user agent
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Check for touch support (additional signal for tablet mode)
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Check screen size (smaller threshold to avoid false positives on desktop)
        const isSmallScreen = window.innerWidth < 600;
        
        // Phone mode: mobile device OR (touch + small screen)
        return isMobile || (hasTouch && isSmallScreen);
    }

    /**
     * Apply phone mode restrictions (hide edit controls)
     * @private
     */
    _applyPhoneModeRestrictions() {
        console.log('[MapPlacer] 📱 Phone mode detected - hiding edit controls');

        // Hide edit buttons
        const addBtn = document.getElementById('addWaypointBtn');
        if (addBtn) addBtn.style.display = 'none';

        const clearBtn = document.getElementById('clearAllBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        const newSoundscapeBtn = document.getElementById('newSoundscapeBtn');
        if (newSoundscapeBtn) newSoundscapeBtn.style.display = 'none';

        const editSoundscapeBtn = document.getElementById('editSoundscapeBtn');
        if (editSoundscapeBtn) editSoundscapeBtn.style.display = 'none';

        const deleteSoundscapeBtn = document.getElementById('deleteSoundscapeBtn');
        if (deleteSoundscapeBtn) deleteSoundscapeBtn.style.display = 'none';

        // Hide soundscape controls (just use saved soundscape)
        const soundscapeControls = document.getElementById('soundscapeControls');
        if (soundscapeControls) soundscapeControls.style.display = 'none';

        // Show sync button if logged in
        const syncBtn = document.getElementById('syncFromServerBtn');
        if (syncBtn) {
            if (this.isLoggedIn) {
                syncBtn.style.display = 'block';
            } else {
                syncBtn.style.display = 'none';
            }
        }

        // Update subtitle
        const subtitle = document.querySelector('.subtitle');
        if (subtitle) subtitle.textContent = 'Player Mode - Walk to explore';

        this._showToast('📱 Player Mode: Walk to explore the soundscape', 'info');
    }

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
     * Update soundscape selector dropdown (Session 5B: Multi-Soundscape Support)
     * @private
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

    _initMap() {
        const defaultLat = 47.6062;
        const defaultLon = -122.3321;
        this.map = L.map('map').setView([defaultLat, defaultLon], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
        this.map.on('click', (e) => {
            if (this.state !== 'editor') return;
            if (this.isDragging) return;
            this._addWaypoint(e.latlng.lat, e.latlng.lng);
        });
    }

    async _getInitialGPS() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.log('[MapPlacer] Geolocation not supported - using default location');
                // Use default location (Seattle) for map view
                this.map.setView([47.6062, -122.3321], 16);
                resolve(false);
                return;
            }
            navigator.geolocation.getCurrentPosition((pos) => {
                this.listenerLat = pos.coords.latitude;
                this.listenerLon = pos.coords.longitude;
                this.map.setView([this.listenerLat, this.listenerLon], 17);
                this._updateListenerMarker(this.listenerLat, this.listenerLon, false);  // Not locked yet
                console.log('[MapPlacer] GPS acquired:', this.listenerLat, this.listenerLon);
                resolve(true);
            }, (err) => {
                // GPS denied or unavailable - use default location
                console.log('[MapPlacer] GPS unavailable (' + err.message + ') - using default location');
                // Use default location (Seattle) for map view
                this.map.setView([47.6062, -122.3321], 16);
                resolve(false);
            }, { enableHighAccuracy: true, timeout: 5000 });
        });
    }

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

        // Sync from server button (phone mode)
        const syncFromServerBtn = document.getElementById('syncFromServerBtn');
        if (syncFromServerBtn) {
            syncFromServerBtn.addEventListener('click', () => this._handleSyncFromServer());
        }

        // Soundscape selector
        const soundscapeSelector = document.getElementById('soundscapeSelector');
        if (soundscapeSelector) {
            soundscapeSelector.addEventListener('change', () => this._onSoundscapeChange());
        }

        // Apply phone mode restrictions
        if (this.isPhoneMode) {
            this._applyPhoneModeRestrictions();
        }
    }

    /**
     * Handle sync from server (phone mode)
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
     * Load soundscape list from server (Session 5D: Multi-Soundscape Server Sync)
     * Populates dropdown from server soundscapes + local-only soundscapes
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

            // Add local-only soundscapes (server create failed)
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
     * Handle soundscape selector change (Session 5B: Multi-Soundscape Support)
     * @private
     */
    async _onSoundscapeChange() {
        const selector = document.getElementById('soundscapeSelector');
        const selectedValue = selector?.value;

        if (!selectedValue) return;

        // Find the local ID for this server ID
        let localId = Array.from(this.serverSoundscapeIds.entries())
            .find(([_, serverId]) => serverId === selectedValue)?.[0];

        // If not found in mapping, check if it's a local-only soundscape (server create failed)
        if (!localId && this.soundscapes.has(selectedValue)) {
            // This is a local-only soundscape (server ID = local ID)
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
            // Already loaded - just switch (includes map centering)
            this.switchSoundscape(localId);
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

    // =====================================================================
    // PLAYER MODE - START
    // =====================================================================
    async _handleStartClick() {
        if (this.state === 'player') {
            // Already in player mode - stop
            await this.stopPlayerMode();
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
            console.log('[MapPlacer] 🎮 Starting Player Mode...');

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
            console.log('[MapPlacer] 🧭 Requesting compass permission...');
            if (typeof DeviceOrientationHelper !== 'undefined') {
                console.log('[MapPlacer] 🧭 DeviceOrientationHelper available:',
                    DeviceOrientationHelper.isAvailable,
                    'permissionRequired:', DeviceOrientationHelper.isPermissionRequired);

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
                        console.log(`[MapPlacer] 🧭 Compass: ${oldHeading.toFixed(0)}° → ${heading.toFixed(0)}° (Δ${headingChange.toFixed(0)}°)`);
                    }

                    // Update sound positions based on heading
                    this.app._updateSoundPositions();
                });
                console.log('[MapPlacer] 🧭 Compass permission requested (will resolve asynchronously)');
            } else {
                console.warn('[MapPlacer] ⚠️ DeviceOrientationHelper not loaded!');
            }

            // ---------------------------------------------------------------------
            // STEP 2: Request wake lock (must be in user gesture)
            // ---------------------------------------------------------------------
            await this._requestWakeLock();

            // ---------------------------------------------------------------------
            // STEP 3: Get GPS position (before other awaits for iOS)
            // ---------------------------------------------------------------------
            console.log('[MapPlacer] 📍 Requesting GPS...');
            let gpsResolved = false;
            const initialGPS = await new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    if (!gpsResolved) {
                        console.warn('[MapPlacer] ⚠️ GPS timeout - using fallback');
                        resolve({ lat: 0, lon: 0 });
                    }
                }, 12000);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.log(`[MapPlacer] 📍 GPS GRANTED ✅ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}, accuracy: ${pos.coords.accuracy.toFixed(1)}m)`);
                        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                    },
                    (err) => {
                        gpsResolved = true;
                        clearTimeout(timeoutId);
                        console.warn(`[MapPlacer] 📍 GPS ERROR ❌: ${err.message}`);
                        resolve({ lat: 0, lon: 0 });
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            });

            // ---------------------------------------------------------------------
            // STEP 4: Initialize AudioContext (satisfy iOS gesture requirement)
            // ---------------------------------------------------------------------
            console.log('[MapPlacer] 🔊 Initializing audio context...');
            const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const resumePromise = tempAudioCtx.resume();
            const audioTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Audio resume timeout')), 3000)
            );

            try {
                await Promise.race([resumePromise, audioTimeout]);
                console.log('[MapPlacer] ✅ Audio context initialized');
            } catch (audioErr) {
                console.warn(`[MapPlacer] ⚠️ Audio context issue: ${audioErr.message} (continuing)`);
            }
            tempAudioCtx.close();

            // ---------------------------------------------------------------------
            // STEP 5: Create SpatialAudioApp with waypoints as sound sources
            // ---------------------------------------------------------------------
            console.log('[MapPlacer] 🎵 Creating sound configs from waypoints...');
            const soundConfigs = this.waypoints.map(wp => ({
                id: wp.id,
                url: wp.soundUrl || this.soundConfig.soundUrl,
                lat: wp.lat,
                lon: wp.lon,
                activationRadius: wp.activationRadius,
                volume: wp.volume !== undefined ? wp.volume : this.soundConfig.volume,
                loop: wp.loop !== undefined ? wp.loop : this.soundConfig.loop
            }));

            console.log('[MapPlacer] 🎵 Created', soundConfigs.length, 'sound configs');

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
            };

            this.app.onStateChange = (state) => {
                console.log('[MapPlacer] 📊 State changed to:', state);
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
                console.error('[MapPlacer] ❌ Error:', error);
                this._showToast('❌ ' + error.message, 'error');
                this._updateStartButton('error');
            };

            // ---------------------------------------------------------------------
            // STEP 7: Start the experience (with soundscape behaviors if available)
            // ---------------------------------------------------------------------
            console.log('[MapPlacer] 🚀 Starting soundscape...');

            // Use startSoundScape if we have a soundscape with behaviors, otherwise use start()
            const soundscape = this.getActiveSoundscape();
            if (soundscape && soundscape.behaviors &&
                soundscape.behaviors.length > 0) {
                console.log('[MapPlacer] 🎼 Starting with behaviors:', soundscape.behaviors.length);
                await this.app.startSoundScape(soundscape);
            } else {
                console.log('[MapPlacer] 🎵 Starting without behaviors (default)');
                await this.app.start();
            }

            console.log('[MapPlacer] ✅ Soundscape started');

            // Update state
            this.state = 'player';
            this._updateStartButton('starting');

            // Refresh waypoint list to show distance placeholders
            this._updateWaypointList();

        } catch (error) {
            console.error('[MapPlacer] ❌ Start failed:', error);
            this._showToast('❌ ' + error.message, 'error');
            this._updateStartButton('error');
        }
    }

    async stopPlayerMode() {
        console.log('[MapPlacer] ⏹ Stopping Player Mode...');

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

    async _requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('[MapPlacer] 🔒 Wake lock acquired');

                this.wakeLock.addEventListener('release', () => {
                    console.log('[MapPlacer] 🔒 Wake lock released');
                    this.wakeLock = null;
                });
            } else {
                console.warn('[MapPlacer] ⚠️ Wake Lock API not supported');
            }
        } catch (err) {
            console.warn(`[MapPlacer] ⚠️ Wake lock failed: ${err.message}`);
        }
    }

    async _releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
            console.log('[MapPlacer] 🔒 Wake lock released');
        }
    }

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
                // Initialize status bar
                this._updateStatusBar();
                break;
            case 'stopped':
                startBtn.textContent = '▶️ Start';
                startBtn.className = 'btn btn-primary';
                // Reset status bar
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

    _resetStatusBar() {
        const gpsStatusEl = document.getElementById('gpsStatus');
        const headingStatusEl = document.getElementById('headingStatus');
        const statusBarEl = document.getElementById('statusBar');
        
        if (gpsStatusEl) gpsStatusEl.textContent = '--';
        if (headingStatusEl) headingStatusEl.textContent = '--';
        if (statusBarEl) statusBarEl.classList.remove('gps-locked');
    }

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
    // =====================================================================
    // PLAYER MODE - END
    // =====================================================================

    // =====================================================================
    // SIMULATION MODE - START
    // =====================================================================
    async _handleSimulateClick() {
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

    async _startSimulation() {
        console.log('[MapPlacer] 🎮 Starting Simulation Mode...');

        this.simulationMode = true;
        this.state = 'simulator';

        // Get map center for initial listener position
        const center = this.map.getCenter();
        this.simListenerLat = center.lat;
        this.simListenerLon = center.lng;

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
        console.log('[MapPlacer] ✅ Simulation Mode started');
    }

    _stopSimulation() {
        console.log('[MapPlacer] ⏹ Stopping Simulation Mode...');

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
        console.log('[MapPlacer] ✅ Simulation Mode stopped');
    }

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

    async _startSimAudio() {
        console.log('[MapPlacer] 🔊 Starting simulation audio...');

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
            console.log('[MapPlacer] 📊 Sim audio state:', state);
            if (state === 'running') {
                this._updateSimDisplay();
                this._showToast('✅ Simulation audio active! Drag the avatar', 'success');
            }
        };

        this.app.onError = (error) => {
            console.error('[MapPlacer] ❌ Sim audio error:', error);
            this._showToast('❌ ' + error.message, 'error');
        };

        // Start the audio (with behaviors if available)
        try {
            const soundscape = this.getActiveSoundscape();
            if (soundscape && soundscape.behaviors && soundscape.behaviors.length > 0) {
                console.log('[MapPlacer] 🎼 Starting simulation with behaviors:', soundscape.behaviors.length);
                await this.app.startSoundScape(soundscape);
            } else {
                console.log('[MapPlacer] 🎵 Starting simulation without behaviors (default)');
                await this.app.start();
            }
            console.log('[MapPlacer] ✅ Simulation audio started');
            this._updateSimDisplay();
        } catch (err) {
            console.error('[MapPlacer] ❌ Sim audio start failed:', err);
            this._showToast('❌ Audio start failed: ' + err.message, 'error');
        }
    }

    _updateSimAudio() {
        if (!this.app || !this.app.listener) return;

        // Update listener position (heading = 0, facing north)
        this.app.listener.update(this.simListenerLat, this.simListenerLon, 0);

        // Update sound positions
        this.app._updateSoundPositions();
    }

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

    _showSimPanel() {
        const panel = document.getElementById('simPanel');
        if (panel) {
            panel.style.display = 'block';
        }
    }

    _hideSimPanel() {
        const panel = document.getElementById('simPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    _setWaypointsInteractive(interactive) {
        // Disable/enable waypoint markers during simulation
        this.markers.forEach((marker, id) => {
            if (interactive) {
                // Re-enable dragging
                marker.dragging.enable();
            } else {
                // Disable dragging
                marker.dragging.disable();
                marker.closePopup();
            }
        });
    }
    // =====================================================================
    // SIMULATION MODE - END
    // =====================================================================

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
            // Player mode sound settings
            soundUrl: config.soundUrl || this.soundConfig.soundUrl,
            volume: config.volume !== undefined ? config.volume : this.soundConfig.volume,
            loop: config.loop !== undefined ? config.loop : this.soundConfig.loop,
            // Legacy (for future oscillator support)
            soundConfig: config.soundConfig || { freq: 440, wave: 'sine', gain: 0.3 }
        };
        this.waypoints.push(waypoint);
        this._createMarker(waypoint);
        this._updateWaypointList();

        // Add to soundscape and auto-save
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            // Store clean waypoint data (without Leaflet objects like circleMarker, marker, etc.)
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
            this._saveSoundscapeToStorage();
        }

        return waypoint;
    }

    _createMarker(waypoint) {
        const icon = L.divIcon({
            className: 'waypoint-marker',
            html: '<div style="font-size: 24px; cursor: grab;">' + waypoint.icon + '</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        const marker = L.marker([waypoint.lat, waypoint.lon], { icon: icon, draggable: true }).addTo(this.map);
        marker.bindPopup(this._createPopupContent(waypoint));
        marker.on('dragstart', () => { this.isDragging = true; marker.closePopup(); });
        marker.on('dragend', (e) => {
            this.isDragging = false;
            waypoint.lat = e.target.getLatLng().lat;
            waypoint.lon = e.target.getLatLng().lng;
            this._updateRadiusCircle(waypoint);
            this._saveSoundscapeToStorage();  // Auto-save new position
        });
        this.markers.set(waypoint.id, marker);
        this._updateRadiusCircle(waypoint);
    }

    _createPopupContent(waypoint) {
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
    }

    _editWaypoint(waypointId) {
        if (this.state !== 'editor') return;
        const waypoint = this.waypoints.find(wp => wp.id === waypointId);
        if (!waypoint) return;

        const newSoundUrl = prompt('Sound file URL:', waypoint.soundUrl);
        if (newSoundUrl === null) return; // Cancelled
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

        // Close and reopen popup to show updated info
        const marker = this.markers.get(waypointId);
        if (marker) {
            marker.closePopup();
            marker.bindPopup(this._createPopupContent(waypoint));
            marker.openPopup();
        }

        this._updateWaypointList();
        this._showToast('✅ Waypoint updated', 'success');
    }

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

        // Remove from soundscape and auto-save
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.removeSound(waypoint.id);
            this._saveSoundscapeToStorage();
        }
    }

    _clearAllWaypoints() {
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.waypoints.forEach(wp => { if (wp.circleMarker) wp.circleMarker.remove(); });
        this.waypoints = [];
        this.nextId = 1;
        this._updateWaypointList();

        // Clear soundscape and auto-save
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.soundIds = [];
            soundscape.waypointData = [];
            this._saveSoundscapeToStorage();
        }
    }

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
                ${this.state === 'editor' ? `<button onclick="app._deleteWaypoint('${wp.id}')" style="background:transparent;border:1px solid #e94560;color:#e94560;padding:4px 8px;border-radius:4px;cursor:pointer;">🗑️</button>` : ''}
            </div>
        `).join('');
    }

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
                color: locked ? '#00ff88' : '#00d9ff',  // Green if locked, blue if live
                fillColor: locked ? '#00ff88' : '#00d9ff',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(this.map);
        }
    }

    _showInstruction(message) { this._showToast(message, 'info'); }

    _showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#00d9ff;color:#000;padding:12px 24px;border-radius:8px;font-weight:bold;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    exportConfig() {
        const config = {
            version: '2.0',
            createdAt: new Date().toISOString(),
            soundConfig: this.soundConfig,
            waypoints: this.waypoints.map(wp => ({
                id: wp.id,
                lat: wp.lat,
                lon: wp.lon,
                name: wp.name,
                type: wp.type,
                icon: wp.icon,
                color: wp.color,
                activationRadius: wp.activationRadius,
                soundUrl: wp.soundUrl,
                volume: wp.volume,
                loop: wp.loop,
                soundConfig: wp.soundConfig
            }))
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'soundscape_' + new Date().getTime() + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // =====================================================================
    // SOUNDSCAPE MANAGEMENT
    // =====================================================================

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
     * Edit current soundscape (Session 5B: Multi-Soundscape Support)
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
     * Delete current soundscape (Session 5B: Multi-Soundscape Support)
     * @private
     */
    async _deleteSoundscape() {
        if (!this.activeSoundscapeId) return;
        this.deleteSoundscape(this.activeSoundscapeId);
    }

    /**
     * Save current soundscape to localStorage (and server if logged in)
     * Session 5B: Multi-Soundscape Support
     * @private
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

        // If logged in, also save to server (debounced)
        const serverId = this.serverSoundscapeIds.get(this.activeSoundscapeId);
        if (this.isLoggedIn && serverId) {
            // Debounce server saves (wait for user to stop editing)
            if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);

            this.saveDebounceTimer = setTimeout(async () => {
                await this._saveSoundscapeToServer();
            }, 2000);
        }

        // Show brief feedback (debounced - don't spam user)
        if (!this.saveFeedbackTimer) {
            this.saveFeedbackTimer = setTimeout(() => {
                const status = this.isLoggedIn ? '💾 Auto-saved to server' : '💾 Auto-saved';
                this.debugLog(status);
                this._updateSyncStatus(this.isLoggedIn);
                this.saveFeedbackTimer = null;
            }, 2000);
        }
    }

    /**
     * Update sync status indicator
     * @private
     */
    _updateSyncStatus(isSynced) {
        const syncStatus = document.getElementById('syncStatus');
        if (syncStatus) {
            syncStatus.textContent = isSynced ? '🟢 Synced to server' : '🟡 Local only';
            syncStatus.style.color = isSynced ? '#00ff88' : '#f39c12';
        }
    }

    /**
     * Load ALL soundscapes from server (Session 5D: Multi-Soundscape Server Sync)
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
     * Save soundscape to server (Session 5B: Multi-Soundscape Support)
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
            await this.api.saveSoundscape(
                serverId,
                this.waypoints.map(wp => this.api.wpToServer(wp)),
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
     * Create new soundscape (Session 5B: Multi-Soundscape Support)
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
    
    _initDebugConsole() {
        this.debugConsole = document.getElementById('debugConsole');
        if (this.debugConsole) {
            this.debugLog('🗺️ Map Placer v2.5 ready');
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
                if (msg.includes('[Audio]') || msg.includes('[GPS]') || msg.includes('[Compass]') || msg.includes('[MapPlacer]')) {
                    self.debugLog(msg);
                }
            };
        }
    }

    _onMovement() {
        if (!this.autoCopyLogs || this.state !== 'player') return;
        this.lastMoveTime = Date.now();
        if (this.autoCopyTimer) clearTimeout(this.autoCopyTimer);
        this.autoCopyTimer = setTimeout(() => this._autoCopyLogs(), this.copyAfterSeconds * 1000);
    }

    _autoCopyLogs() {
        if (!this.debugConsole || (Date.now() - this.lastMoveTime < this.copyAfterSeconds * 1000)) return;
        this._copyLogs(true);
    }

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
}

const app = new MapPlacerApp();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

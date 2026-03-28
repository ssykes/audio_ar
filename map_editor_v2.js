/**
 * Map Editor v2 - JavaScript
 *
 * Modern UI for map editor with soundscape management,
 * area/waypoint editing, and debug logging.
 *
 * Session 3: CRUD Operations Implementation
 */

console.log('[map_editor_v2.js] Script started');

// =====================================================================
// MapEditorApp Class
// =====================================================================

class MapEditorApp extends MapAppShared {
    constructor() {
        super({ mode: 'editor' });

        // Area drawing using Leaflet.Draw
        this.drawnItems = null;  // FeatureGroup for drawn areas
        this.areaMarkers = new Map();  // Map<areaId, L.Polygon>
        this.nextAreaId = 1;
        this.isDrawingArea = false;

        // Track selected item for editing
        this.selectedItem = null;
        this.selectedItemType = null;  // 'waypoint' or 'area'
    }

    /**
     * Initialize the editor app
     * @override
     */
    async init() {
        console.log('Map Editor v2 initializing...');

        // Wait for DOM ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Check for "new soundscape" mode from query parameter
        this.isNewSoundscapeMode = this._checkNewSoundscapeMode();

        // Initialize map (from MapAppShared._initMap())
        this._initMap();

        // Check login status first
        await this._checkLoginStatus();

        // Initialize debug console
        this._initDebugConsole();

        // Initialize Leaflet.Draw for areas
        this._initAreaDrawer();

        // Setup event listeners
        this._setupEventListeners();

        // Handle new soundscape mode or load existing
        if (this.isNewSoundscapeMode) {
            // Prompt user to create new soundscape or cancel
            await this._promptNewSoundscape();
        } else if (this.isLoggedIn) {
            // Load from server if logged in
            await this._loadSoundscapeFromServer();
        } else {
            // Not logged in - create a default soundscape
            this._createDefaultSoundscape();
        }

        // Initialize UI forms from soundscape data (after soundscape is loaded)
        this._initForms();

        console.log('Map Editor v2 ready');
    }

    /**
     * Check if URL has ?new=true query parameter
     * @private
     * @returns {boolean} True if in new soundscape mode
     */
    _checkNewSoundscapeMode() {
        const params = new URLSearchParams(window.location.search);
        const isNew = params.get('new') === 'true';
        this.debugLog(`🔍 New soundscape mode: ${isNew}`);
        return isNew;
    }

    /**
     * Prompt user to create a new soundscape or cancel
     * @private
     */
    async _promptNewSoundscape() {
        this.debugLog('🆕 New soundscape mode activated');

        // Show prompt dialog
        const result = await this._showCreateSoundscapeDialog();

        if (result && result.name && result.name.trim()) {
            // User confirmed with a name - create the soundscape
            this._createNewSoundscapeFromDialog(result.name.trim(), result.description || '');
            this.debugLog(`✅ Created new soundscape: ${result.name}`);
        } else {
            // User canceled - redirect back to soundscape picker
            this.debugLog('❌ New soundscape canceled by user');
            this._showToast('New soundscape canceled', 'info');
            setTimeout(() => {
                window.location.href = 'soundscape_picker.html';
            }, 1000);
        }
    }

    /**
     * Show dialog to create a new soundscape
     * @private
     * @returns {Promise<{name: string, description: string}|null>}
     */
    _showCreateSoundscapeDialog() {
        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.id = 'newSoundscapeOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // Create dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: var(--bg-panel);
                border: 1px solid var(--border-panel);
                border-radius: 8px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            `;

            dialog.innerHTML = `
                <h2 style="margin: 0 0 16px 0; color: var(--accent-primary); font-size: 18px;">
                    🎧 Create New Soundscape
                </h2>
                <p style="color: var(--text-muted); margin-bottom: 20px; font-size: 13px;">
                    Enter a name for your new soundscape. You can add waypoints and areas after creation.
                </p>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; color: var(--text-muted); font-size: 11px; text-transform: uppercase; margin-bottom: 6px;">
                        Name *
                    </label>
                    <input type="text" id="newSoundscapeName" placeholder="My Awesome Soundscape"
                        style="width: 100%; padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 4px; color: var(--text-primary); font-size: 14px;"
                        autofocus
                    />
                    <div id="newSoundscapeError" style="color: var(--accent-danger); font-size: 11px; margin-top: 6px; display: none;">
                        ⚠️ Please enter a name for your soundscape
                    </div>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-muted); font-size: 11px; text-transform: uppercase; margin-bottom: 6px;">
                        Description (optional)
                    </label>
                    <textarea id="newSoundscapeDescription" placeholder="Describe your soundscape..."
                        style="width: 100%; padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 4px; color: var(--text-primary); font-size: 13px; min-height: 60px; resize: vertical;"
                    ></textarea>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="newSoundscapeCancel" style="
                        padding: 8px 16px;
                        background: var(--bg-panel);
                        border: 1px solid var(--border-input);
                        border-radius: 4px;
                        color: var(--text-primary);
                        cursor: pointer;
                        font-size: 13px;
                    ">Cancel</button>
                    <button id="newSoundscapeCreate" style="
                        padding: 8px 16px;
                        background: var(--accent-primary);
                        border: none;
                        border-radius: 4px;
                        color: var(--bg-body);
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: 500;
                    ">Create Soundscape</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Focus the name input
            const nameInput = document.getElementById('newSoundscapeName');
            if (nameInput) nameInput.focus();

            // Hide error when user starts typing
            nameInput.addEventListener('input', () => {
                const errorEl = document.getElementById('newSoundscapeError');
                if (errorEl) errorEl.style.display = 'none';
            });

            // Handle cancel
            document.getElementById('newSoundscapeCancel').addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });

            // Handle create
            document.getElementById('newSoundscapeCreate').addEventListener('click', () => {
                const name = document.getElementById('newSoundscapeName').value.trim();
                const description = document.getElementById('newSoundscapeDescription').value.trim();
                const errorEl = document.getElementById('newSoundscapeError');
                const nameInput = document.getElementById('newSoundscapeName');

                if (!name) {
                    // Show inline error
                    if (errorEl) errorEl.style.display = 'block';
                    if (nameInput) nameInput.focus();
                    return;
                }

                // Hide error if visible
                if (errorEl) errorEl.style.display = 'none';

                document.body.removeChild(overlay);
                resolve({ name, description });
            });

            // Handle Enter key
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('newSoundscapeCreate').click();
                }
            });

            // Handle Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    document.getElementById('newSoundscapeCancel').click();
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    /**
     * Create a new soundscape from the dialog (new soundscape mode)
     * @private
     * @param {string} name - Soundscape name
     * @param {string} description - Soundscape description
     */
    async _createNewSoundscapeFromDialog(name, description = '') {
        const id = 'soundscape_' + Date.now();
        const soundscape = new SoundScape(id, name, description, true, [], [], [], []);
        this.soundscapes.set(id, soundscape);
        this.activeSoundscapeId = id;

        // Update edit form with new soundscape data
        const nameInput = document.getElementById('editName');
        const descInput = document.getElementById('editDescription');
        const publicCheckbox = document.getElementById('editPublic');
        if (nameInput) nameInput.value = name;
        if (descInput) descInput.value = description;
        if (publicCheckbox) publicCheckbox.checked = true;

        this.debugLog(`🎼 Created soundscape: ${name} (${id})`);
        this._showToast(`Created "${name}"`, 'success');

        // Remove query parameter from URL (clean URL)
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        // Create on server FIRST (if logged in) to get server ID mapping
        if (this.isLoggedIn) {
            try {
                this.debugLog('☁️ Creating soundscape on server...');
                const result = await this.api.createSoundscape(name, description, publicCheckbox.checked);
                const serverId = result.soundscape.id;

                // Map local ID to server ID BEFORE auto-save
                this.serverSoundscapeIds.set(id, serverId);
                this.debugLog(`✅ Created on server: ${name} (server ID: ${serverId})`);

                // Now save waypoints/areas (empty for now) with the mapping in place
                this._markSoundscapeDirty();
                this._scheduleAutoSave();
            } catch (error) {
                this.debugLog('❌ Failed to create on server: ' + error.message);
                this._showToast('⚠️ Created locally only (server failed)', 'warning');
            }
        } else {
            // Not logged in - save locally only
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }
    }

    /**
     * Check if user is logged in
     * @private
     */
    async _checkLoginStatus() {
        if (!this.api.isLoggedIn()) {
            this.debugLog('🔒 Not logged in');
            this.isLoggedIn = false;
            return;
        }

        // Verify token is still valid
        const valid = await this.api.verifyToken();
        if (!valid) {
            this.debugLog('🔒 Token invalid');
            this.isLoggedIn = false;
            return;
        }

        // User is logged in
        this.isLoggedIn = true;
        this.debugLog('🔐 Logged in as ' + this.api.user.email);
    }

    /**
     * Initialize debug console
     * @private
     */
    _initDebugConsole() {
        this.debugConsole = document.getElementById('debugPanel');
        this.debugModalContent = document.getElementById('debugPanelBody');

        if (!this.debugModalContent) {
            console.error('❌ debugPanelBody not found in DOM!');
            return;
        }

        this.debugLog('🗺️ Map Editor v2 ready');

        // Wire up copy button
        const copyBtn = document.getElementById('debugCopyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this._copyLogs());
        }

        // Wire up clear button
        const clearBtn = document.getElementById('debugClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.debugModalContent.innerHTML = '';
                this.debugLog('Debug logs cleared');
            });
        }

        // Override console.log to capture audio/debug logs
        const originalLog = console.log;
        const self = this;
        console.log = function(...args) {
            originalLog.apply(console, args);
            const msg = args.join(' ');
            if (msg.includes('[Audio]') || msg.includes('[GPS]') || msg.includes('[Compass]') || msg.includes('[MapShared]') || msg.includes('[MapEditor]')) {
                self.debugLog(msg);
            }
        };
    }

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
                        color: '#00d9ff',       // Same cyan as waypoints
                        fillColor: '#00d9ff',   // Same cyan as waypoints
                        fillOpacity: 0.15,      // Semi-transparent fill
                        weight: 2               // Thinner border
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

        // Event: Drawing started (prevent waypoint creation while drawing)
        this.map.on(L.Draw.Event.DRAWSTART, () => {
            this.isDrawingArea = true;
            this.debugLog('🔷 Drawing started');
        });

        // Event: Drawing stopped
        this.map.on(L.Draw.Event.DRAWSTOP, () => {
            this.isDrawingArea = false;
            this.debugLog('🔷 Drawing stopped');
        });

        // Event: Polygon created
        this.map.on(L.Draw.Event.CREATED, (e) => {
            if (e.layerType !== 'polygon') return;

            const layer = e.layer;
            const latlngs = layer.getLatLngs()[0];

            this.debugLog(`🗺️ Polygon created: ${latlngs.length} vertices`);
            this.debugLog(`   isDrawingArea flag: ${this.isDrawingArea}`);

            // IMPORTANT: Add layer to drawnItems to make it permanent
            this.drawnItems.addLayer(layer);
            this.debugLog(`   Layer added to drawnItems: ${this.drawnItems.hasLayer(layer)}`);

            // Auto-name area
            const soundscape = this.getActiveSoundscape();
            const areaCount = soundscape ? soundscape.getAreas().length : 0;
            const areaName = 'Sound ' + (areaCount + 1);

            // Create Area object
            const area = {
                id: 'area' + this.nextAreaId++,
                name: areaName,
                polygon: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng })),
                soundUrl: '',
                volume: 0.8,
                loop: true,
                fadeZoneWidth: 5.0,
                overlapMode: 'mix',
                icon: '◈',
                color: '#00d9ff',
                sortOrder: 0,
                _leafletLayer: layer  // Store reference
            };

            // Add to soundscape
            if (soundscape) {
                soundscape.addArea(area);
                this._markSoundscapeDirty();
                this._scheduleAutoSave();
                this.debugLog('   Added to soundscape');
            } else {
                this.debugLog('⚠️ No active soundscape - area created on map only');
            }

            // Store in area markers
            this.areaMarkers.set(area.id, layer);
            this.debugLog(`   Stored in areaMarkers (count: ${this.areaMarkers.size})`);

            // Store area data on the layer itself for easy retrieval
            layer.areaData = area;

            // Add to sidebar list
            this.debugLog('   Calling _addAreaToList...');
            this._addAreaToList(area);

            this.debugLog(`✅ Area created: ${area.name} (${area.polygon.length} vertices)`);
            this.debugLog(`   Layer on map: ${this.map.hasLayer(layer)}`);
            this.debugLog(`   Layer in drawnItems: ${this.drawnItems.hasLayer(layer)}`);
            this.debugLog(`   Soundscape exists: ${!!soundscape}`);
        });

        // Event: Polygon edit started
        this.map.on(L.Draw.Event.EDITSTART, () => {
            this.isDrawingArea = true;
        });

        // Event: Polygon edit stopped
        this.map.on(L.Draw.Event.EDITSTOP, () => {
            this.isDrawingArea = false;
        });

        // Event: Polygon edited
        this.map.on(L.Draw.Event.EDITED, (e) => {
            e.layers.eachLayer((layer) => {
                // Get area data stored on layer
                if (layer.areaData) {
                    const latlngs = layer.getLatLngs()[0];
                    layer.areaData.polygon = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
                    this.debugLog(`✏️ Area edited: ${layer.areaData.name}`);

                    // Mark soundscape dirty and schedule save
                    this._markSoundscapeDirty();
                    this._scheduleAutoSave();
                }
            });
        });
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        // Map click handler already exists in MapAppShared._initMap()
        // It calls _addWaypoint when clicking on map in editor mode

        // Drag start - prevent accidental clicks
        this.map.on('dragstart', () => {
            this.isDragging = true;
        });

        // Drag end - re-enable clicks
        this.map.on('dragend', () => {
            this.isDragging = false;
        });

        // Listen for waypoint changes to refresh lists
        this.onWaypointsChange = () => this._refreshWaypointList();
    }

    /**
     * Get area by ID
     * @private
     */
    _getAreaById(id) {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return null;

        for (const area of soundscape.getAreas()) {
            if (area.id === id) {
                return area;
            }
        }
        return null;
    }

    /**
     * Get waypoint by ID
     * @private
     */
    _getWaypointById(id) {
        return this.waypoints.find(wp => wp.id === id);
    }

    /**
     * Add area to sidebar list
     * @private
     */
    _addAreaToList(area) {
        // Show the areas section if it's hidden
        const computedStyle = window.getComputedStyle(areasSection);
        if (computedStyle.display === 'none') {
            areasSection.style.display = '';
        }

        const meta = `${area.polygon.length} vertices`;
        const html = `
            <div class="item-list-item" data-id="${area.id}" data-type="area" data-color="${area.color}">
                <span class="item-icon">◈</span>
                <span class="item-name">${area.name}</span>
                <span class="item-meta">${meta}</span>
            </div>
        `;
        areasList.insertAdjacentHTML('beforeend', html);

        this.debugLog(`📋 Area added to list: ${area.name}`);
    }

    /**
     * Refresh the waypoint list from current data
     * @private
     */
    _refreshWaypointList() {
        // Clear list
        waypointsList.innerHTML = '';

        // Get waypoints section
        const waypointsSection = document.getElementById('waypointsSection');

        // Repopulate from waypoints array
        if (this.waypoints.length === 0) {
            // Hide section if empty
            if (waypointsSection) waypointsSection.style.display = 'none';
            return;
        }

        // Show section if has items
        if (waypointsSection) waypointsSection.style.display = '';

        this.waypoints.forEach(wp => {
            const meta = `${wp.activationRadius}m`;
            const html = `
                <div class="item-list-item" data-id="${wp.id}" data-type="waypoint" data-color="${wp.color}">
                    <span class="item-icon">${wp.icon}</span>
                    <span class="item-name">${wp.name}</span>
                    <span class="item-meta">${meta}</span>
                </div>
            `;
            waypointsList.insertAdjacentHTML('beforeend', html);
        });
    }

    /**
     * Refresh the area list from current data
     * @private
     */
    _refreshAreaList() {
        // Clear list
        areasList.innerHTML = '';

        // Get areas from soundscape
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        const areas = soundscape.getAreas();

        // Show/hide section based on count
        if (areas.length === 0) {
            areasSection.style.display = 'none';
            return;
        }

        areasSection.style.display = '';

        // Repopulate from areas
        areas.forEach(area => {
            this._addAreaToList(area);
        });
    }

    /**
     * Initialize forms from soundscape data
     * @private
     */
    _initForms() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        // Populate edit form
        if (editName) editName.value = soundscape.name || '';
        if (editDescription) editDescription.value = soundscape.description || '';
        if (editPublic) editPublic.checked = soundscape.isPublic !== false;

        // Populate lists
        this._refreshWaypointList();
        this._refreshAreaList();
    }

    /**
     * Create a default soundscape when none exists
     * @private
     */
    _createDefaultSoundscape() {
        const id = 'soundscape_' + Date.now();
        const soundscape = new SoundScape(id, 'New Soundscape', [], [], []);
        this.soundscapes.set(id, soundscape);
        this.activeSoundscapeId = id;

        this.debugLog(`🎼 Created default soundscape: ${soundscape.name} (${id})`);
    }

    /**
     * Override _addWaypoint to integrate with UI lists (Session 3: CRUD)
     * @override
     * @protected
     */
    _addWaypoint(lat, lon) {
        if (this.state !== 'editor') return;
        if (this.isDrawingArea) return;  // Don't create waypoints while drawing areas

        const waypoint = {
            id: 'wp' + this.nextId++,
            name: 'Sound ' + this.nextId,
            lat: lat,
            lon: lon,
            soundUrl: '',
            volume: 0.8,
            loop: true,
            activationRadius: 20,
            icon: '🎵',
            color: '#00d9ff',
            sortOrder: 0
        };

        this.waypoints.push(waypoint);

        // Mark soundscape dirty and schedule save (waypoint will be saved with soundscape)
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }

        // Create custom div icon with colored dot
        const icon = L.divIcon({
            className: 'waypoint-marker',
            html: `<div style="
                width: 12px;
                height: 12px;
                background-color: ${waypoint.color};
                border-radius: 50%;
                cursor: grab;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([waypoint.lat, waypoint.lon], {
            icon: icon,
            draggable: this.allowEditing
        }).addTo(this.map);

        // No popup - editing via slideout panel only

        marker.on('dragstart', () => {
            this.isDragging = true;
        });

        marker.on('dragend', (e) => {
            this.isDragging = false;
            const newLat = e.target.getLatLng().lat;
            const newLon = e.target.getLatLng().lng;

            this.debugLog(`🖐️ Dragged ${waypoint.name} to [${newLat.toFixed(4)}, ${newLon.toFixed(4)}]`);

            // Update waypoint
            waypoint.lat = newLat;
            waypoint.lon = newLon;

            this._updateRadiusCircle(waypoint);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        });

        this.markers.set(waypoint.id, marker);
        this._updateRadiusCircle(waypoint);

        // Add to sidebar list
        this._refreshWaypointList();

        this.debugLog(`✅ Waypoint created: ${waypoint.name} at [${lat.toFixed(5)}, ${lon.toFixed(5)}]`);
    }

    /**
     * Update waypoint from slideout form
     * @param {Object} updatedData
     * @private
     */
    _updateWaypointFromForm(updatedData) {
        const waypoint = this._getWaypointById(updatedData.id);
        if (!waypoint) return;

        // Update waypoint properties
        Object.assign(waypoint, updatedData);

        // Update marker if exists
        const marker = this.markers.get(waypoint.id);
        if (marker) {
            // Update radius circle
            this._updateRadiusCircle(waypoint);
        }

        // Refresh list to show updated name
        this._refreshWaypointList();

        // Mark soundscape dirty
        this._markSoundscapeDirty();
        this._scheduleAutoSave();

        this.debugLog(`✏️ Updated waypoint: ${waypoint.name}`);
    }

    /**
     * Delete waypoint
     * @param {string} waypointId
     * @private
     */
    _deleteWaypoint(waypointId) {
        const waypoint = this._getWaypointById(waypointId);
        if (!waypoint) return;

        // Remove from map
        const marker = this.markers.get(waypointId);
        if (marker) {
            marker.remove();
            this.markers.delete(waypointId);
        }

        // Remove from waypoints array
        const index = this.waypoints.findIndex(wp => wp.id === waypointId);
        if (index > -1) {
            this.waypoints.splice(index, 1);
        }

        // Remove from soundscape (using removeSound, not deleteWaypoint)
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.removeSound(waypointId);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }

        // Refresh list
        this._refreshWaypointList();

        this.debugLog(`🗑️ Deleted waypoint: ${waypoint.name}`);
    }

    /**
     * Update area from slideout form
     * @param {Object} updatedData
     * @private
     */
    _updateAreaFromForm(updatedData) {
        const area = this._getAreaById(updatedData.id);
        if (!area) return;

        // Update area properties
        Object.assign(area, updatedData);

        // Update layer if exists
        const layer = this.areaMarkers.get(area.id);
        if (layer && layer.areaData) {
            layer.areaData = area;
        }

        // Refresh list to show updated name
        this._refreshAreaList();

        // Mark soundscape dirty
        this._markSoundscapeDirty();
        this._scheduleAutoSave();

        this.debugLog(`✏️ Updated area: ${area.name}`);
    }

    /**
     * Delete area
     * @param {string} areaId
     * @private
     */
    _deleteArea(areaId) {
        const area = this._getAreaById(areaId);
        if (!area) return;

        // Remove from map
        const layer = this.areaMarkers.get(areaId);
        if (layer) {
            this.drawnItems.removeLayer(layer);
            this.areaMarkers.delete(areaId);
        }

        // Remove from soundscape
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.deleteArea(areaId);
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }

        // Refresh list
        this._refreshAreaList();

        this.debugLog(`🗑️ Deleted area: ${area.name}`);
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
                this._refreshWaypointList();

                // Load areas
                this._loadAreasIntoDrawer(soundscape.getAreas() || []);
                this._refreshAreaList();

                // Center map on the new waypoints
                if (this.waypoints.length > 0) {
                    const sumLat = this.waypoints.reduce((sum, wp) => sum + wp.lat, 0);
                    const sumLon = this.waypoints.reduce((sum, wp) => sum + wp.lon, 0);
                    const centerLat = sumLat / this.waypoints.length;
                    const centerLon = sumLon / this.waypoints.length;
                    this.map.setView([centerLat, centerLon], 17);
                    this.debugLog(`🗺️ Map centered at [${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}]`);
                }

                // Update edit form
                this._initForms();

                this.debugLog(`✅ Loaded: ${soundscape.name} (${this.waypoints.length} waypoints)`);
            } catch (error) {
                this.debugLog('❌ Failed to load soundscape: ' + error.message);
                this._showToast('⚠️ Soundscape not on server', 'warning');
            }
        } else {
            // Already loaded - just switch
            this.switchSoundscape(localId);
            this._initForms();
        }
    }

    /**
     * Update soundscape metadata from form
     * @private
     */
    _updateSoundscapeFromForm() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        soundscape.name = editName?.value || '';
        soundscape.description = editDescription?.value || '';
        soundscape.isPublic = editPublic?.checked !== false;

        this._markSoundscapeDirty();
        this._scheduleAutoSave();

        this.debugLog(`✏️ Updated soundscape metadata: ${soundscape.name}`);
    }

    /**
     * Clear all waypoints and areas
     * @private
     */
    _clearAll() {
        if (!confirm('Clear all waypoints and areas?')) return;

        this.debugLog('🗑️ Clear All clicked - starting...');

        // Clear waypoints
        this._clearAllWaypoints();

        // Clear areas
        this._clearAllAreas();

        // Refresh lists
        this._refreshWaypointList();
        this._refreshAreaList();

        this.debugLog('🗑️ Cleared all waypoints and areas');
    }

    /**
     * Clear all areas
     * @private
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
     * Clear all waypoints (override to use _refreshWaypointList)
     * @override
     * @protected
     */
    _clearAllWaypoints() {
        // Remove markers from map
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        
        // Remove radius circles
        this.waypoints.forEach(wp => { if (wp.circleMarker) wp.circleMarker.remove(); });
        
        // Clear arrays
        this.waypoints = [];
        this.nextId = 1;

        // Clear soundscape data
        const soundscape = this.getActiveSoundscape();
        if (soundscape) {
            soundscape.soundIds = [];
            soundscape.waypointData = [];
            this._markSoundscapeDirty();
            this._scheduleAutoSave();
        }

        this.debugLog('🗑️ Cleared all waypoints');
    }

    /**
     * Load areas when switching soundscapes
     * @param {Object[]} areas
     * @private
     */
    _loadAreasIntoDrawer(areas) {
        if (!areas || areas.length === 0) return;

        // Safety check: ensure drawnItems is initialized
        if (!this.drawnItems) {
            this.debugLog('⚠️ _loadAreasIntoDrawer: drawnItems not initialized yet');
            return;
        }

        areas.forEach((area) => {
            const latlngs = area.polygon.map(v => [v.lat, v.lng]);

            const polygon = L.polygon(latlngs, {
                color: area.color || '#00d9ff',
                fillColor: area.color || '#00d9ff',
                fillOpacity: 0.2,
                weight: 2
            });

            this.drawnItems.addLayer(polygon);
            this.areaMarkers.set(area.id, polygon);
            area._leafletLayer = polygon;

            // Store area data on layer
            polygon.areaData = area;
        });

        this.debugLog(`📍 Loaded ${areas.length} Areas`);
    }

    /**
     * Export soundscape to JSON file
     * @private
     */
    _exportSoundscape() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) {
            this._showToast('⚠️ No soundscape to export', 'warning');
            return;
        }

        // Create clean waypoint data (no Leaflet refs)
        const cleanWaypointData = this.waypoints.map(wp => ({
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

        // Create clean area data (no Leaflet refs)
        const cleanAreas = soundscape.getAreas().map(area => {
            const { _leafletLayer, ...cleanArea } = area;
            return cleanArea;
        });

        // Create clean soundscape data (no Leaflet refs)
        const cleanSoundscape = {
            id: soundscape.id,
            name: soundscape.name,
            description: soundscape.description,
            isPublic: soundscape.isPublic,
            soundIds: this.waypoints.map(wp => wp.id),
            waypointData: cleanWaypointData,
            areas: cleanAreas,
            behaviors: soundscape.behaviors || []
        };

        const data = {
            version: '3.0',
            exportedAt: new Date().toISOString(),
            soundscape: cleanSoundscape,
            waypoints: cleanWaypointData,
            areas: cleanAreas
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `soundscape_${soundscape.id}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.debugLog(`📦 Exported: ${a.download}`);
        this._showToast('✅ Soundscape exported', 'success');
    }

    /**
     * Import soundscape from JSON file
     * @private
     */
    _importSoundscape() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Confirm before overwriting if there's existing data
            const hasExistingData = this.waypoints.length > 0 ||
                                   (this.getActiveSoundscape()?.getAreas().length > 0);
            if (hasExistingData) {
                const confirmed = confirm(
                    `⚠️ Import will overwrite your current soundscape.\n\n` +
                    `You have ${this.waypoints.length} waypoint(s) that will be replaced.\n\n` +
                    `Click OK to import, or Cancel to abort.`
                );
                if (!confirmed) return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    const soundscape = SoundScape.fromJSON(data.soundscape);
                    const waypoints = data.waypoints || [];
                    const areas = data.areas || [];

                    // Clear current data
                    this._clearAllWaypoints();
                    this._clearAllAreas();

                    // Load imported data
                    this.soundscapes.set(soundscape.id, soundscape);
                    this.activeSoundscapeId = soundscape.id;
                    this.waypoints = waypoints;

                    // Restore nextId
                    if (this.waypoints.length > 0) {
                        const maxId = Math.max(...this.waypoints.map(wp => parseInt(wp.id.replace('wp', '')) || 0));
                        this.nextId = maxId + 1;
                    }

                    // Restore nextAreaId
                    if (areas.length > 0) {
                        const maxAreaId = Math.max(...areas.map(a => parseInt(a.id.replace('area', '')) || 0));
                        this.nextAreaId = maxAreaId + 1;
                    }

                    // Render waypoints
                    this.waypoints.forEach(wp => this._createMarker(wp));
                    this._refreshWaypointList();

                    // Load areas
                    this._loadAreasIntoDrawer(areas);
                    this._refreshAreaList();

                    // Update edit form
                    this._initForms();

                    // Mark soundscape dirty and schedule save (imported data needs to be saved)
                    this._markSoundscapeDirty();
                    this._scheduleAutoSave();

                    this.debugLog(`✅ Imported: ${soundscape.name} (${this.waypoints.length} waypoints, ${areas.length} areas)`);
                    this._showToast(`✅ Imported: ${soundscape.name}`, 'success');
                } catch (error) {
                    this.debugLog('❌ Import failed: ' + error.message);
                    this._showToast('❌ Import failed: ' + (error?.message || 'Unknown error'), 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Delete current soundscape
     * @private
     */
    async _deleteCurrentSoundscape() {
        const soundscape = this.getActiveSoundscape();
        if (!soundscape) return;

        const soundscapeName = soundscape.name || 'this soundscape';

        if (!confirm(`⚠️ Delete Soundscape\n\nAre you sure you want to delete "${soundscapeName}"?\n\nThis action cannot be undone.`)) {
            return;
        }

        const serverId = this.serverSoundscapeIds.get(this.activeSoundscapeId);

        // Delete from server if logged in
        if (this.isLoggedIn && serverId) {
            try {
                await this.api.deleteSoundscape(serverId);
                this.debugLog(`✅ Deleted from server: ${soundscapeName}`);
            } catch (error) {
                this.debugLog('❌ Failed to delete from server: ' + error.message);
            }
        }

        // Delete locally
        this.deleteSoundscape(this.activeSoundscapeId);

        // Clear UI
        this._clearAll();
        if (editName) editName.value = '';
        if (editDescription) editDescription.value = '';

        this.debugLog(`🗑️ Deleted soundscape: ${soundscapeName}`);
        this._showToast(`🗑️ Deleted: ${soundscapeName}`, 'success');

        // Redirect to soundscape picker
        setTimeout(() => {
            window.location.href = 'soundscape_picker.html';
        }, 1000);
    }

    /**
     * Sync from server
     * @private
     */
    async _syncFromServer() {
        if (!this.isLoggedIn) {
            this._showToast('⚠️ Please login first', 'warning');
            return;
        }

        this.debugLog('🔄 Syncing from server...');
        this._showToast('🔄 Syncing from server...', 'info');

        // Check for unsaved changes
        const soundscape = this.getActiveSoundscape();
        if (soundscape?.isDirty) {
            const confirmSync = confirm(
                '⚠️ You have unsaved changes.\n\n' +
                'Syncing from server will overwrite your local changes.\n\n' +
                'Click OK to sync, or Cancel to cancel.'
            );
            if (!confirmSync) return;
        }

        await this._loadSoundscapeFromServer();
        this._initForms();
        this._showToast('✅ Sync complete', 'success');
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

                    // Add waypointData to soundscape
                    soundscape.waypointData = data.waypoints;

                    // Add to soundscapes map
                    this.soundscapes.set(soundscape.id, soundscape);
                    this.serverSoundscapeIds.set(soundscape.id, ss.id);

                    this.debugLog(`  ✅ Loaded: ${soundscape.name} (${data.waypoints.length} waypoints, ${soundscape.getAreas().length} areas)`);
                } catch (error) {
                    this.debugLog(`  ⚠️ Failed to load ${ss.name}: ${error.message}`);
                }
            }

            // Set active to selected soundscape (from localStorage) or most recent
            const selectedId = localStorage.getItem('selected_soundscape_id');
            this.debugLog(`🔍 Selected soundscape ID from localStorage: ${selectedId || 'none'}`);

            let activeLocalId = null;

            if (selectedId) {
                // Try to use selected soundscape
                activeLocalId = Array.from(this.serverSoundscapeIds.entries())
                    .find(([_, serverId]) => serverId === selectedId)?.[0];

                if (activeLocalId) {
                    this.debugLog(`✅ Using selected soundscape: ${selectedId}`);
                } else {
                    this.debugLog(`⚠️ Selected soundscape not found in cache, using most recent`);
                }
            }

            // If no selected ID or not found, use most recent
            if (!activeLocalId && soundscapes.length > 0) {
                const latest = soundscapes[0];
                activeLocalId = Array.from(this.serverSoundscapeIds.entries())
                    .find(([_, serverId]) => serverId === latest.id)?.[0];
                this.debugLog(`📅 Using most recent soundscape: ${latest.id}`);
            }

            if (activeLocalId) {
                // Switch soundscape (this will load waypoints and areas)
                this.switchSoundscape(activeLocalId);
                this._initForms();
            }

            // Clear selected ID (one-time use)
            if (selectedId) {
                localStorage.removeItem('selected_soundscape_id');
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

        // Clear waypoints and areas for the new soundscape
        this._clearAllWaypoints();
        this._clearAllAreas();
        this.nextId = 1;
        this.nextAreaId = 1;

        // Clear markers
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();

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

        // Update edit form
        this._initForms();

        this._showToast(`✅ Created: ${soundscape.name}`, 'success');
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
}

// =====================================================================
// DOM Elements (UI-only, not map-related)
// =====================================================================

const editName = document.getElementById('editName');
const editDescription = document.getElementById('editDescription');
const editPublic = document.getElementById('editPublic');
const areasList = document.getElementById('areasList');
const waypointsList = document.getElementById('waypointsList');
const areasSection = document.getElementById('areasSection');
const slideoutPanel = document.getElementById('slideoutPanel');
const slideoutTitle = document.getElementById('slideoutTitle');
const slideoutName = document.getElementById('slideoutName');
const slideoutMeta = document.getElementById('slideoutMeta');
const slideoutColor = document.getElementById('slideoutColor');
const slideoutClose = document.getElementById('slideoutClose');
const slideoutCancel = document.getElementById('slideoutCancel');
const slideoutSave = document.getElementById('slideoutSave');
const slideoutDelete = document.getElementById('slideoutDelete');

// Debug modal elements
const debugPanel = document.getElementById('debugPanel');
const debugPanelBody = document.getElementById('debugPanelBody');
const debugClearBtn = document.getElementById('debugClearBtn');
const debugCopyBtn = document.getElementById('debugCopyBtn');

// Slideout form elements (waypoint editing)
const slideoutBody = document.getElementById('slideoutBody');
const slideoutType = document.getElementById('slideoutType');
const slideoutTypeSection = document.getElementById('slideoutTypeSection');
const typeSectionTitle = document.getElementById('typeSectionTitle');
const typeFieldsContainer = document.getElementById('typeFieldsContainer');
const slideoutSoundUrl = document.getElementById('slideoutSoundUrl');
const slideoutVolume = document.getElementById('slideoutVolume');
const slideoutVolumeValue = document.getElementById('slideoutVolumeValue');
const slideoutActivationRadius = document.getElementById('slideoutActivationRadius');
const slideoutActivationRadiusValue = document.getElementById('slideoutActivationRadiusValue');
const slideoutLoop = document.getElementById('slideoutLoop');
const slideoutSortOrder = document.getElementById('slideoutSortOrder');
const slideoutLat = document.getElementById('slideoutLat');
const slideoutLon = document.getElementById('slideoutLon');
const slideoutAdvanced = document.getElementById('slideoutAdvanced');

// Type configurations for dynamic form fields
const TYPE_CONFIGS = {
    'file': {
        title: 'File Settings',
        fields: `
            <div class="slideout-field">
                <label for="slideoutSoundUrl">Sound URL</label>
                <input type="url" id="slideoutSoundUrl" placeholder="https://example.com/sound.mp3">
                <small class="slideout-help">MP3, WAV, or OGG file URL</small>
            </div>
        `,
        onRender: () => {
            // Optional: Add event listeners after render
        }
    },
    'oscillator': {
        title: 'Oscillator Settings',
        fields: `
            <div class="slideout-field">
                <label for="slideoutWaveform">Waveform</label>
                <select id="slideoutWaveform">
                    <option value="sine">Sine ◯</option>
                    <option value="square">Square ◻</option>
                    <option value="sawtooth">Sawtooth ⚡</option>
                    <option value="triangle">Triangle △</option>
                </select>
            </div>
            <div class="slideout-field-row">
                <div class="slideout-field">
                    <label for="slideoutFrequency">Frequency (Hz)</label>
                    <input type="number" id="slideoutFrequency" min="20" max="20000" value="440">
                    <small class="slideout-help">20Hz - 20kHz</small>
                </div>
                <div class="slideout-field">
                    <label for="slideoutDetune">Detune (cents)</label>
                    <input type="number" id="slideoutDetune" min="-1200" max="1200" value="0">
                    <small class="slideout-help">-1200 to +1200</small>
                </div>
            </div>
            <div class="slideout-field">
                <label for="slideoutGain">Gain</label>
                <input type="range" id="slideoutGain" min="0" max="1" step="0.01" value="0.5">
                <span class="slideout-field-value" id="slideoutGainValue">50%</span>
            </div>
        `,
        onRender: () => {
            const gainSlider = document.getElementById('slideoutGain');
            const gainValue = document.getElementById('slideoutGainValue');
            if (gainSlider && gainValue) {
                gainSlider.addEventListener('input', (e) => {
                    gainValue.textContent = `${Math.round(e.target.value * 100)}%`;
                });
            }
        }
    },
    'streaming': {
        title: 'Streaming Settings',
        fields: `
            <div class="slideout-field">
                <label for="slideoutStreamUrl">Stream URL</label>
                <input type="url" id="slideoutStreamUrl" placeholder="https://stream.example.com/live">
            </div>
            <div class="slideout-field">
                <label for="slideoutStreamType">Stream Type</label>
                <select id="slideoutStreamType">
                    <option value="mp3">MP3 Stream</option>
                    <option value="hls">HLS (m3u8)</option>
                    <option value="icecast">Icecast/Shoutcast</option>
                    <option value="dash">DASH</option>
                </select>
            </div>
            <div class="slideout-field">
                <label for="slideoutBufferTime">Buffer Time</label>
                <input type="range" id="slideoutBufferTime" min="1" max="30" step="1" value="5">
                <span class="slideout-field-value" id="slideoutBufferTimeValue">5s</span>
            </div>
            <div class="slideout-field">
                <label class="slideout-checkbox">
                    <input type="checkbox" id="slideoutAutoReconnect" checked>
                    <span>Auto-Reconnect</span>
                </label>
            </div>
        `,
        onRender: () => {
            const bufferSlider = document.getElementById('slideoutBufferTime');
            const bufferValue = document.getElementById('slideoutBufferTimeValue');
            if (bufferSlider && bufferValue) {
                bufferSlider.addEventListener('input', (e) => {
                    bufferValue.textContent = `${e.target.value}s`;
                });
            }
        }
    }
};

let debugLogs = ['Ready - tap Start to begin...'];

// Toggle advanced section
function toggleAdvancedSection() {
    slideoutAdvanced.classList.toggle('active');
    const toggle = document.getElementById('slideoutAdvancedToggle');
    if (slideoutAdvanced.classList.contains('active')) {
        toggle.textContent = '▲ More';
        addDebugLog('More opened');
    } else {
        toggle.textContent = '▼ More';
    }
}

// Render type-specific fields
function renderTypeFields(type) {
    const config = TYPE_CONFIGS[type] || TYPE_CONFIGS['file'];

    typeSectionTitle.textContent = config.title;
    typeFieldsContainer.innerHTML = config.fields;

    // Call onRender callback if defined
    if (config.onRender) {
        config.onRender();
    }

    addDebugLog(`Rendered form for type: ${type}`);
}

// Get current form data based on type
function getFormData() {
    const type = slideoutType.value;
    const data = {
        type: type,
        name: document.getElementById('slideoutName').value,
        volume: parseFloat(document.getElementById('slideoutVolume').value),
        loop: document.getElementById('slideoutLoop').checked,
        activationRadius: parseInt(document.getElementById('slideoutActivationRadius').value),
        sortOrder: parseInt(document.getElementById('slideoutSortOrder').value),
        lat: slideoutLat.textContent,
        lon: slideoutLon.textContent
    };

    // Add type-specific fields
    if (type === 'file') {
        data.soundUrl = document.getElementById('slideoutSoundUrl').value;
    } else if (type === 'oscillator') {
        data.waveform = document.getElementById('slideoutWaveform').value;
        data.frequency = parseFloat(document.getElementById('slideoutFrequency').value);
        data.detune = parseFloat(document.getElementById('slideoutDetune').value);
        data.gain = parseFloat(document.getElementById('slideoutGain').value);
    } else if (type === 'streaming') {
        data.streamUrl = document.getElementById('slideoutStreamUrl').value;
        data.streamType = document.getElementById('slideoutStreamType').value;
        data.bufferTime = parseInt(document.getElementById('slideoutBufferTime').value);
        data.autoReconnect = document.getElementById('slideoutAutoReconnect').checked;
    }

    return data;
}

// Live update for range sliders
if (slideoutVolume) {
    slideoutVolume.addEventListener('input', (e) => {
        const value = Math.round(e.target.value * 100);
        slideoutVolumeValue.textContent = `${value}%`;
    });
}

if (slideoutActivationRadius) {
    slideoutActivationRadius.addEventListener('input', (e) => {
        slideoutActivationRadiusValue.textContent = `${e.target.value}m`;
    });
}

// Type selector change handler
if (slideoutType) {
    slideoutType.addEventListener('change', (e) => {
        renderTypeFields(e.target.value);
    });
}

// Debug log functions
function addDebugLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    debugLogs.push(`[${timestamp}] ${message}`);
    renderDebugLogs();
}

function renderDebugLogs() {
    debugPanelBody.innerHTML = debugLogs.map(log =>
        `<div class="debug-line">${log}</div>`
    ).join('');
    debugPanelBody.scrollTop = debugPanelBody.scrollHeight;
}

function clearDebugLogs() {
    debugLogs = [];
    renderDebugLogs();
}

function copyDebugLogs() {
    const text = debugLogs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        addDebugLog('Logs copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Debug panel event handlers
function toggleDebugPanel() {
    debugPanel.classList.toggle('active');
    const toggle = document.getElementById('debugPanelToggle');
    if (debugPanel.classList.contains('active')) {
        toggle.textContent = '▼ Debug Log';
        addDebugLog('Debug panel opened');
    } else {
        toggle.textContent = '▲ Debug Log';
    }
}

// Advanced settings toggle
function toggleAdvancedSettings() {
    const advancedSettings = document.getElementById('advancedSettings');
    const toggle = document.getElementById('advancedSettingsToggle');
    advancedSettings.classList.toggle('active');
    if (advancedSettings.classList.contains('active')) {
        toggle.textContent = '▲ More';
        addDebugLog('More opened');
    } else {
        toggle.textContent = '▼ More';
    }
}

debugClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearDebugLogs();
    addDebugLog('Debug logs cleared');
});

debugCopyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyDebugLogs();
});

// =====================================================================
// Toolbar Button Handlers (Session 3: Real CRUD operations)
// =====================================================================

// Sync from Server
document.getElementById('syncFromServerBtn').addEventListener('click', () => {
    app._syncFromServer();
});

// Clear All
document.getElementById('clearAllBtn').addEventListener('click', () => {
    app._clearAll();
});

// Import
document.getElementById('btnImport').addEventListener('click', () => {
    app._importSoundscape();
});

// Export
document.getElementById('btnExport').addEventListener('click', () => {
    app._exportSoundscape();
});

// =====================================================================
// Slideout Panel Handlers
// =====================================================================

let selectedItem = null;
let selectedItemType = null;
let selectedItemData = null;

// Handle item clicks - open slideout
function handleItemClick(e, type, id, name, meta, color) {
    // Remove previous selection highlight
    if (selectedItem) {
        selectedItem.classList.remove('selected');
    }

    // Select new item
    const item = e.currentTarget;
    item.classList.add('selected');
    selectedItem = item;
    selectedItemType = type;

    // Get actual data from app
    if (type === 'Waypoint') {
        selectedItemData = app._getWaypointById(id);
    } else if (type === 'Area') {
        selectedItemData = app._getAreaById(id);
    }

    if (!selectedItemData) {
        addDebugLog(`⚠️ ${type} not found: ${id}`);
        return;
    }

    // Open slideout with data
    openSlideout(type, id, name, meta, color);
}

// Open slideout with item data
function openSlideout(type, id, name, meta, color) {
    slideoutTitle.textContent = 'Edit ' + type;

    if (type === 'Waypoint') {
        const waypoint = app._getWaypointById(id);
        if (!waypoint) return;

        // Show waypoint form
        slideoutBody.style.display = 'block';

        // Populate common fields
        slideoutName.value = waypoint.name || '';
        slideoutVolume.value = waypoint.volume || 0.8;
        slideoutVolumeValue.textContent = `${Math.round((waypoint.volume || 0.8) * 100)}%`;
        slideoutActivationRadius.value = waypoint.activationRadius || 20;
        slideoutActivationRadiusValue.textContent = `${waypoint.activationRadius || 20}m`;
        slideoutLoop.checked = waypoint.loop !== false;
        slideoutSortOrder.value = waypoint.sortOrder || 0;
        slideoutLat.textContent = waypoint.lat?.toFixed(6) || '--';
        slideoutLon.textContent = waypoint.lon?.toFixed(6) || '--';

        // Show type selector and render type-specific fields
        slideoutType.style.display = 'block';
        slideoutTypeSection.style.display = 'block';
        slideoutVolume.parentElement.style.display = 'flex';
        slideoutActivationRadius.parentElement.parentElement.style.display = 'flex';
        slideoutLoop.parentElement.style.display = 'flex';
        slideoutSortOrder.parentElement.style.display = 'flex';
        slideoutLat.parentElement.style.display = 'flex';
        slideoutLon.parentElement.style.display = 'flex';

        // Set type selector and render type-specific fields
        slideoutType.value = waypoint.type || 'file';
        renderTypeFields(waypoint.type || 'file');

        // Populate type-specific fields
        if (waypoint.type === 'file') {
            if (slideoutSoundUrl) slideoutSoundUrl.value = waypoint.soundUrl || '';
        }

    } else if (type === 'Area') {
        const area = app._getAreaById(id);
        if (!area) return;

        // Show area form
        slideoutBody.style.display = 'block';

        // Populate common fields
        slideoutName.value = area.name || '';
        slideoutVolume.value = area.volume || 0.8;
        slideoutVolumeValue.textContent = `${Math.round((area.volume || 0.8) * 100)}%`;
        slideoutLoop.checked = area.loop !== false;
        slideoutSortOrder.value = area.sortOrder || 0;
        slideoutLat.textContent = meta || '--';
        slideoutLon.textContent = '--';

        // Show type selector and render type-specific fields
        slideoutType.style.display = 'block';
        slideoutTypeSection.style.display = 'block';
        slideoutVolume.parentElement.style.display = 'flex';
        slideoutActivationRadius.parentElement.parentElement.style.display = 'none'; // Hide for areas
        slideoutLoop.parentElement.style.display = 'flex';
        slideoutSortOrder.parentElement.style.display = 'flex';
        slideoutLat.parentElement.style.display = 'flex';
        slideoutLon.parentElement.style.display = 'flex';

        // Set type selector and render type-specific fields
        slideoutType.value = area.type || 'file';
        renderTypeFields(area.type || 'file');

        // Populate type-specific fields
        if (area.type === 'file') {
            if (slideoutSoundUrl) slideoutSoundUrl.value = area.soundUrl || '';
        }
    }

    // Show panel
    slideoutPanel.classList.add('active');

    addDebugLog(`Selected ${type}: ${name}`);
}

function closeSlideout() {
    slideoutPanel.classList.remove('active');
    // Clear selection highlight
    if (selectedItem) {
        selectedItem.classList.remove('selected');
        selectedItem = null;
    }
    selectedItemType = null;
    selectedItemData = null;
}

function saveSlideout() {
    if (!selectedItemData || !selectedItemType) return;

    // Get all form data including type-specific fields
    const updated = getFormData();
    updated.id = selectedItemData.id;

    if (selectedItemType === 'Waypoint') {
        // Update waypoint
        app._updateWaypointFromForm(updated);

        // Update list display
        if (selectedItem) {
            selectedItem.querySelector('.item-name').textContent = updated.name;
        }
    } else if (selectedItemType === 'Area') {
        // Update area
        app._updateAreaFromForm(updated);

        // Update list display
        if (selectedItem) {
            selectedItem.querySelector('.item-name').textContent = updated.name;
        }
    }

    addDebugLog(`✏️ Saved ${selectedItemType}: ${updated.name}`);
    closeSlideout();
}

function deleteSlideout() {
    if (!selectedItemData || !selectedItem || !selectedItemType) return;

    if (confirm(`Delete ${selectedItemData.name}?`)) {
        if (selectedItemType === 'Waypoint') {
            app._deleteWaypoint(selectedItemData.id);
        } else if (selectedItemType === 'Area') {
            app._deleteArea(selectedItemData.id);
        }

        // Remove from list
        selectedItem.remove();

        addDebugLog(`🗑️ Deleted ${selectedItemType}: ${selectedItemData.name}`);
        closeSlideout();
    }
}

// Close slideout handlers
slideoutClose.addEventListener('click', closeSlideout);
slideoutCancel.addEventListener('click', closeSlideout);
slideoutSave.addEventListener('click', saveSlideout);
slideoutDelete.addEventListener('click', deleteSlideout);

// Close slideout when clicking outside
document.addEventListener('click', (e) => {
    if (!slideoutPanel.contains(e.target) &&
        !areasList.contains(e.target) &&
        !waypointsList.contains(e.target)) {
        if (slideoutPanel.classList.contains('active')) {
            closeSlideout();
        }
    }
});

// Close slideout on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && slideoutPanel.classList.contains('active')) {
        closeSlideout();
    }
});

// Add click handlers to lists (event delegation)
areasList.addEventListener('click', (e) => {
    const item = e.target.closest('.item-list-item');
    if (item && item.dataset.id) {
        handleItemClick(e, 'Area', item.dataset.id, item.querySelector('.item-name').textContent, item.querySelector('.item-meta').textContent, item.dataset.color);
    }
});

waypointsList.addEventListener('click', (e) => {
    const item = e.target.closest('.item-list-item');
    if (item && item.dataset.id) {
        handleItemClick(e, 'Waypoint', item.dataset.id, item.querySelector('.item-name').textContent, item.querySelector('.item-meta').textContent, item.dataset.color);
    }
});

// =====================================================================
// Other UI Handlers
// =====================================================================

// Simulate/Edit toggle
let isSimulating = false;
document.getElementById('btnSimulate').addEventListener('click', (e) => {
    e.stopPropagation();
    isSimulating = !isSimulating;

    const btn = document.getElementById('btnSimulate');
    const simPanel = document.getElementById('simPanel');

    if (isSimulating) {
        btn.textContent = 'Edit';
        simPanel.classList.add('active');
        addDebugLog('Simulation started');
    } else {
        btn.textContent = 'Simulate';
        simPanel.classList.remove('active');
        addDebugLog('Simulation stopped');
    }
});

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
    addDebugLog('Back button clicked');
    window.location.href = 'soundscape_picker.html';
});

// Logout button
document.getElementById('logoutBtn').addEventListener('click', async () => {
    addDebugLog('Logout button clicked');

    const soundscape = app.getActiveSoundscape();
    const hasUnsavedChanges = soundscape?.isDirty || false;

    if (hasUnsavedChanges) {
        const confirmed = confirm(
            '⚠️ You have unsaved changes.\n\n' +
            'Click OK to save before logout, or Cancel to logout without saving.'
        );
        if (!confirmed) {
            app.debugLog('⚠️ Logout without saving - changes will be lost');
        } else {
            app.debugLog('💾 Saving before logout...');
            try {
                if (app.saveDebounceTimer) {
                    clearTimeout(app.saveDebounceTimer);
                    app.saveDebounceTimer = null;
                }
                if (app.saveAbortController) {
                    app.saveAbortController.abort();
                    app.saveAbortController = null;
                }
                await app._executeAutoSaveForce();
                app.debugLog('✅ Saved before logout');
            } catch (error) {
                app.debugLog('❌ Failed to save before logout: ' + error.message);
            }
        }
    }

    app.api.logout();
    app.isLoggedIn = false;
    app.serverSoundscapeIds.clear();
    app.soundscapes.clear();
    app.activeSoundscapeId = null;
    app.waypoints = [];
    app.nextId = 1;

    // Clear map markers
    app.markers.forEach(marker => marker.remove());
    app.markers.clear();
    app._refreshWaypointList();

    app._showToast('🚪 Logged out successfully', 'info');
    app.debugLog('🚪 Logged out');

    window.location.href = 'index.html';
});

// Delete Soundscape button
document.getElementById('deleteSoundscapeBtn').addEventListener('click', () => {
    app._deleteCurrentSoundscape();
});

// Edit form change handlers (auto-save on change)
if (editName) {
    editName.addEventListener('input', () => {
        app._updateSoundscapeFromForm();
    });
}

if (editDescription) {
    editDescription.addEventListener('input', () => {
        app._updateSoundscapeFromForm();
    });
}

if (editPublic) {
    editPublic.addEventListener('change', () => {
        app._updateSoundscapeFromForm();
    });
}

// Soundscape selector
const soundscapeSelector = document.getElementById('soundscapeSelector');
if (soundscapeSelector) {
    soundscapeSelector.addEventListener('change', () => {
        app._onSoundscapeChange();
    });
}

console.log('[map_editor_v2.js] Loaded');

// =====================================================================
// Initialize Application
// =====================================================================

const app = new MapEditorApp();
app.init();

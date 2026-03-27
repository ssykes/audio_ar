/**
 * Map Editor v2 - JavaScript
 *
 * Modern UI for map editor with soundscape management,
 * area/waypoint editing, and debug logging.
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

        // Initialize map (from MapAppShared._initMap())
        this._initMap();
        
        // Initialize Leaflet.Draw for areas
        this._initAreaDrawer();
        
        // Setup event listeners
        this._setupEventListeners();
        
        console.log('Map Editor v2 ready');
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

        // Event: Drawing started (prevent waypoint creation while drawing)
        this.map.on(L.Draw.Event.DRAWSTART, () => {
            this.isDrawingArea = true;
            this.debugLog('🔷 Drawing started');
        });

        // Event: Drawing stopped (with delay to allow CREATED to fire first)
        this.map.on(L.Draw.Event.DRAWSTOP, () => {
            this.debugLog('🔷 Drawing stopped');
            // Delay resetting flag to allow CREATED event to process first
            setTimeout(() => {
                this.isDrawingArea = false;
                this.debugLog('   Drawing flag reset');
            }, 100);
        });

        // Event: Polygon created
        this.map.on(L.Draw.Event.CREATED, (e) => {
            if (e.layerType !== 'polygon') return;

            const layer = e.layer;
            const latlngs = layer.getLatLngs()[0];

            this.debugLog(`🗺️ Polygon created: ${latlngs.length} vertices`);
            this.debugLog(`   isDrawingArea flag: ${this.isDrawingArea}`);

            // IMPORTANT: Add layer to drawnItems to make it permanent
            // Without this, the polygon disappears after drawing
            this.drawnItems.addLayer(layer);
            this.debugLog(`   Layer added to drawnItems: ${this.drawnItems.hasLayer(layer)}`);

            // Auto-name area
            const areaName = 'Sound ' + (this.areaMarkers.size + 1);

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
                color: '#ff6b6b',
                sortOrder: 0,
                _leafletLayer: layer  // Store reference
            };

            // Store in area markers (the layer is now on the map via drawnItems)
            this.areaMarkers.set(area.id, layer);
            
            // Store area data on the layer itself for easy retrieval
            layer.areaData = area;

            // Add to sidebar list
            this._addAreaToList(area);

            this.debugLog(`✅ Area created: ${area.name} (${area.polygon.length} vertices)`);
            this.debugLog(`   Layer on map: ${this.map.hasLayer(layer)}`);
            this.debugLog(`   Layer in drawnItems: ${this.drawnItems.hasLayer(layer)}`);
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
        // No need to add duplicate handler here
        
        // Drag start - prevent accidental clicks
        this.map.on('dragstart', () => {
            this.isDragging = true;
        });

        // Drag end - re-enable clicks
        this.map.on('dragend', () => {
            this.isDragging = false;
        });
    }

    /**
     * Get area by ID
     * @private
     */
    _getAreaById(id) {
        // Placeholder - will be implemented in Session 3 with data layer
        return null;
    }

    /**
     * Add area to sidebar list
     * @private
     */
    _addAreaToList(area) {
        const meta = `${area.polygon.length} vertices`;
        const html = `
            <div class="item-list-item" data-id="${area.id}" data-type="area" data-color="${area.color}">
                <span class="item-icon">◈</span>
                <span class="item-name">${area.name}</span>
                <span class="item-meta">${meta}</span>
            </div>
        `;
        areasList.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Override _addWaypoint to remove popup modals (Session 2: No popups)
     * @override
     * @protected
     */
    _addWaypoint(lat, lon) {
        if (this.state !== 'editor') return;

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

        // Create custom div icon with colored dot (not emoji)
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

        // Session 2: NO POPUP - editing via slideout panel only
        // marker.bindPopup() removed per spec

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
        });

        this.markers.set(waypoint.id, marker);
        this._updateRadiusCircle(waypoint);

        this.debugLog(`✅ Waypoint created: ${waypoint.name} at [${lat.toFixed(5)}, ${lon.toFixed(5)}]`);
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

// Toolbar button actions
document.getElementById('syncFromServerBtn').addEventListener('click', () => {
    console.log('Sync from server');
    addDebugLog('Syncing from server...');
    setTimeout(() => {
        addDebugLog('Synced from server');
    }, 1000);
});

document.getElementById('clearAllBtn').addEventListener('click', () => {
    console.log('Clear all');
    addDebugLog('Clear all clicked');
    if (confirm('Clear all waypoints and areas?')) {
        addDebugLog('Cleared all waypoints and areas');
        renderList(areasList, [], areasSection);
        renderList(waypointsList, [], null);
        closeSlideout();
    }
});

document.getElementById('btnImport').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            addDebugLog(`Importing file: ${file.name}`);
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    addDebugLog(`Imported soundscape: ${data.name || 'Unknown'}`);
                    alert('📥 Import Successful\n\nFile: ' + file.name + '\nSoundscape: ' + (data.name || 'Unknown'));
                } catch (err) {
                    addDebugLog('Import failed: Invalid JSON');
                    alert('❌ Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
});

document.getElementById('btnExport').addEventListener('click', () => {
    const data = soundscapes['1'];
    if (!data) return;

    addDebugLog(`Exporting soundscape: ${data.name}`);

    const json = JSON.stringify({
        id: '1',
        name: data.name,
        description: data.description,
        waypoints: data.waypointsList,
        areas: data.areasList
    }, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.name.replace(/[^a-z0-9]/gi, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addDebugLog(`Exported: ${data.name}.json`);
});

let selectedItem = null;
let selectedItemType = null;
let selectedItemData = null;

// Render item list
function renderList(container, items, section) {
    // Clear selection when re-rendering (prevents stale references)
    if (selectedItem && container.contains(selectedItem)) {
        selectedItem.classList.remove('selected');
        selectedItem = null;
        selectedItemType = null;
        selectedItemData = null;
        closeSlideout();
    }

    if (!items || items.length === 0) {
        container.innerHTML = '';
        // Hide section if empty
        if (section) {
            section.style.display = 'none';
        }
        return;
    }
    // Show section if has items
    if (section) {
        section.style.display = '';
    }
    container.innerHTML = items.map(item => `
        <div class="item-list-item" data-id="${item.id}" data-type="${item.type}" data-color="${item.color || '#ff6b6b'}">
            <span class="item-icon">${item.icon}</span>
            <span class="item-name">${item.name}</span>
            <span class="item-meta">${item.meta}</span>
        </div>
    `).join('');
}

// Handle item clicks - open slideout
function openSlideout(type, id, name, meta, color) {
    selectedItemType = type;
    
    // Base data for both types
    selectedItemData = { 
        id, 
        name, 
        meta, 
        color,
        // Default waypoint values
        type: 'file',
        soundUrl: '',
        volume: 0.8,
        loop: true,
        activationRadius: 20,
        sortOrder: 0,
        lat: null,
        lon: null
    };

    // Set panel title
    slideoutTitle.textContent = 'Edit ' + type;
    
    if (type === 'Waypoint') {
        // Show waypoint/sound form
        slideoutBody.style.display = 'block';
        
        // Populate common fields
        slideoutName.value = name;
        slideoutVolume.value = 0.8;
        slideoutVolumeValue.textContent = '80%';
        slideoutActivationRadius.value = 20;
        slideoutActivationRadiusValue.textContent = '20m';
        slideoutLoop.checked = true;
        slideoutSortOrder.value = 0;
        slideoutLat.textContent = '47.6062';
        slideoutLon.textContent = '-122.3321';
        
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
        slideoutType.value = 'file';
        renderTypeFields('file');
        
    } else if (type === 'Area') {
        // Show area form (same sound types as waypoint)
        slideoutBody.style.display = 'block';
        
        // Populate common fields
        slideoutName.value = name;
        slideoutVolume.value = 0.8;
        slideoutVolumeValue.textContent = '80%';
        slideoutActivationRadius.parentElement.parentElement.style.display = 'none'; // Hide activation radius for areas
        slideoutLoop.checked = true;
        slideoutSortOrder.value = 0;
        slideoutLat.textContent = meta || '--';
        slideoutLon.textContent = '--';
        
        // Show type selector and render type-specific fields (same as waypoint)
        slideoutType.style.display = 'block';
        slideoutTypeSection.style.display = 'block';
        slideoutVolume.parentElement.style.display = 'flex';
        slideoutLoop.parentElement.style.display = 'flex';
        slideoutSortOrder.parentElement.style.display = 'flex';
        slideoutLat.parentElement.style.display = 'flex';
        slideoutLon.parentElement.style.display = 'flex';
        
        // Set type selector and render type-specific fields
        slideoutType.value = 'file';
        renderTypeFields('file');
        
    } else {
        // Unknown type - show basic form
        slideoutName.value = name;
        slideoutType.value = 'file';
        renderTypeFields('file');
    }

    // Show panel
    slideoutPanel.classList.add('active');

    addDebugLog(`Selected ${type}: ${name}`);
    console.log(`Selected ${type}:`, id, name);
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
    if (!selectedItemData) return;

    // Get all form data including type-specific fields
    const updated = getFormData();
    updated.id = selectedItemData.id;

    addDebugLog(`Saved ${selectedItemType}: ${updated.name} (${updated.type})`);
    console.log('Save ' + selectedItemType + ':', updated);

    // Update the clicked item's display
    if (selectedItem) {
        selectedItem.querySelector('.item-name').textContent = updated.name;
    }

    closeSlideout();
}

function deleteSlideout() {
    if (!selectedItemData || !selectedItem) return;

    if (confirm(`Delete ${selectedItemData.name}?`)) {
        addDebugLog(`Deleted ${selectedItemType}: ${selectedItemData.name}`);
        console.log('Delete ' + selectedItemType + ':', selectedItemData.id);
        selectedItem.remove();
        closeSlideout();
    }
}

// Close slideout handlers
slideoutClose.addEventListener('click', closeSlideout);
slideoutCancel.addEventListener('click', closeSlideout);
slideoutSave.addEventListener('click', saveSlideout);
slideoutDelete.addEventListener('click', deleteSlideout);

// Handle list item clicks
function handleItemClick(e, type, id, name, meta, color) {
    // Remove previous selection highlight
    if (selectedItem) {
        selectedItem.classList.remove('selected');
    }

    // Select new item
    const item = e.currentTarget;
    item.classList.add('selected');
    selectedItem = item;

    // Open slideout
    openSlideout(type, id, name, meta, color);
}

// Close slideout when clicking outside
document.addEventListener('click', (e) => {
    if (!slideoutPanel.contains(e.target) &&
        !areasList.contains(e.target) &&
        !waypointsList.contains(e.target)) {
        // Clicked outside slideout and lists - close slideout
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

// Toolbar button actions (mock)
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

// Back button - go back to soundscape picker
document.getElementById('backBtn').addEventListener('click', () => {
    addDebugLog('Back button clicked');
    console.log('Navigate back to soundscape picker');
    // In production: window.location.href = 'soundscape_picker.html';
    alert('← Back to Soundscape Picker (mock)');
});

// Logout button
document.getElementById('logoutBtn').addEventListener('click', () => {
    addDebugLog('Logout button clicked');
    console.log('Logout clicked');
    if (confirm('Logout?')) {
        // In production: clear auth and redirect to login
        alert('🚪 Logout (mock)');
    }
});

// Delete Soundscape button
document.getElementById('deleteSoundscapeBtn').addEventListener('click', () => {
    const soundscapeName = editName.value || 'this soundscape';
    
    addDebugLog('Delete Soundscape button clicked');
    console.log('Delete Soundscape button clicked');
    
    if (confirm(`⚠️ Delete Soundscape\n\nAre you sure you want to delete "${soundscapeName}"?\n\nThis action cannot be undone.`)) {
        addDebugLog(`Deleting soundscape: ${soundscapeName}`);
        console.log('Delete soundscape:', soundscapeName);
        
        // In production: delete from server/database first
        // Then redirect to soundscape picker
        window.location.href = 'soundscape_picker.html';
    }
});

console.log('[map_editor_v2.js] Loaded');

// =====================================================================
// Initialize Application
// =====================================================================

const app = new MapEditorApp();
app.init();

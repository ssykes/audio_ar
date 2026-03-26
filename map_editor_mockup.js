/**
 * Map Editor Mockup - JavaScript
 *
 * Mock UI for map editor with soundscape management,
 * area/waypoint editing, and debug logging.
 */

console.log('[map_editor_mockup.js] Script started');

// Mock data
const soundscapes = {
    '1': {
        name: 'Forest Ambience',
        description: 'Peaceful forest sounds with birds and wind',
        waypoints: 12,
        areas: 3,
        modified: '2026-03-21',
        areasList: [
            { id: 1, name: 'Forest Zone', type: 'area', icon: '◈', meta: '3 vertices', color: '#ff6b6b' },
            { id: 2, name: 'Clearing', type: 'area', icon: '◈', meta: '5 vertices', color: '#ff6b6b' },
            { id: 3, name: 'Stream Area', type: 'area', icon: '◈', meta: '4 vertices', color: '#ff6b6b' }
        ],
        waypointsList: [
            { id: 1, name: 'Bird Song 1', type: 'waypoint', icon: '🎵', meta: '20m', color: '#00d9ff' },
            { id: 2, name: 'Bird Song 2', type: 'waypoint', icon: '🎵', meta: '35m', color: '#00d9ff' },
            { id: 3, name: 'Wind Chimes', type: 'waypoint', icon: '🎵', meta: '50m', color: '#00d9ff' },
            { id: 4, name: 'Fountain', type: 'waypoint', icon: '🎵', meta: '65m', color: '#00d9ff' },
            { id: 5, name: 'Leaves Rustle', type: 'waypoint', icon: '🎵', meta: '80m', color: '#00d9ff' }
        ]
    },
    '2': {
        name: 'Urban Soundscape',
        description: 'City traffic and street ambience',
        waypoints: 8,
        areas: 0,
        modified: '2026-03-20',
        areasList: [],
        waypointsList: [
            { id: 1, name: 'Traffic', type: 'waypoint', icon: '🎵', meta: '15m', color: '#00d9ff' },
            { id: 2, name: 'Street Musician', type: 'waypoint', icon: '🎵', meta: '30m', color: '#00d9ff' },
            { id: 3, name: 'Cafe Ambience', type: 'waypoint', icon: '🎵', meta: '45m', color: '#00d9ff' }
        ]
    },
    '3': {
        name: 'Ocean Waves',
        description: 'Beach waves and seagulls',
        waypoints: 5,
        areas: 2,
        modified: '2026-03-19',
        areasList: [
            { id: 1, name: 'Beach Zone', type: 'area', icon: '◈', meta: '6 vertices', color: '#ff6b6b' },
            { id: 2, name: 'Pier Area', type: 'area', icon: '◈', meta: '4 vertices', color: '#ff6b6b' }
        ],
        waypointsList: [
            { id: 1, name: 'Waves', type: 'waypoint', icon: '🎵', meta: '10m', color: '#00d9ff' },
            { id: 2, name: 'Seagulls', type: 'waypoint', icon: '🎵', meta: '25m', color: '#00d9ff' },
            { id: 3, name: 'Wind', type: 'waypoint', icon: '🎵', meta: '40m', color: '#00d9ff' }
        ]
    }
};

// DOM Elements
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

// Sync status management
function updateSyncStatus(status) {
    if (!infoSyncStatus) return;
    
    const statuses = {
        'synced': { icon: '🟢', title: 'Synced to server' },
        'unsaved': { icon: '🟡', title: 'Unsaved changes' },
        'error': { icon: '🔴', title: 'Sync error' },
        'offline': { icon: '⚪', title: 'Offline mode' }
    };
    
    const config = statuses[status] || statuses['synced'];
    infoSyncStatus.textContent = config.icon;
    infoSyncStatus.title = config.title;
    infoSyncStatus.className = `sync-status ${status}`;
    
    addDebugLog(`Sync status: ${config.title}`);
}

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

// Auto-save on field change (mock)
let saveTimeout = null;
let hasUnsavedChanges = false;

// Initialize display with first soundscape
function initializeDisplay() {
    const data = soundscapes['1'];
    if (data) {
        infoWaypoints.textContent = `📍 ${data.waypoints} waypoints`;
        infoAreas.textContent = `🗺️ ${data.areas} areas`;
        infoModified.textContent = `Modified: ${data.modified}`;
        editName.value = data.name;
        editDescription.value = data.description;
        editPublic.checked = true;
        renderList(areasList, data.areasList, areasSection);
        renderList(waypointsList, data.waypointsList, null);
        updateSyncStatus('synced');
    }
}

function triggerAutoSave(field, value) {
    // Show saving state
    infoModified.textContent = 'Saving...';
    infoModified.style.color = '#f39c12';
    updateSyncStatus('unsaved');
    addDebugLog(`Auto-save triggered: ${field}`);

    // Debounce save (wait 500ms after last change)
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        console.log('Auto-save:', field, value);
        addDebugLog(`Auto-saved: ${field} = ${value}`);
        // Show saved state
        infoModified.textContent = `Modified: ${new Date().toISOString().split('T')[0]}`;
        infoModified.style.color = '#888';
        updateSyncStatus('synced');
        hasUnsavedChanges = false;
    }, 500);
    
    hasUnsavedChanges = true;
    updateSyncStatus('unsaved');
}

[editName, editDescription, editPublic].forEach(el => {
    el.addEventListener('change', () => {
        triggerAutoSave(el.id, el.value);
    });
});

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

    // Auto-save trigger
    triggerAutoSave(selectedItemType.toLowerCase() + '_edit', updated);

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

// Initialize
// initializeDisplay(); // Commented out - references non-existent elements in mockup

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
const deleteSoundscapeBtn = document.getElementById('deleteSoundscapeBtn');
console.log('[Delete Btn] Element found:', deleteSoundscapeBtn);

if (deleteSoundscapeBtn) {
    deleteSoundscapeBtn.addEventListener('click', () => {
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
} else {
    console.error('[Delete Btn] Element NOT found!');
}

console.log('[map_editor_mockup.js] Loaded');

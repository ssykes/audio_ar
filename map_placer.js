/**
 * Map Placer App
 * Visual map interface for placing sound waypoints
 * @version 1.0 - Editor Mode Only
 *
 * TODO Session_2: Add Player Mode (audio integration)
 * TODO Session_2: Add Start/Stop toggle with wake lock
 * TODO Session_2: Add GPS tracking in player mode
 * TODO Session_2: Add compass tracking in player mode (use DeviceOrientationHelper - see single_sound_v2.html)
 * TODO Session_2: Add SpatialAudioApp initialization for playing sounds
 * TODO Session_2: Implement _handleStartClick() full flow:
 *                  1. Get GPS position (getCurrentPosition)
 *                  2. Initialize AudioContext (satisfy iOS user gesture requirement)
 *                  3. Request wake lock
 *                  4. Request compass permission (DeviceOrientationHelper.start in click handler!)
 *                  5. Create SpatialAudioApp with waypoints as sound sources
 *                  6. Set up callbacks (onPositionUpdate, onStateChange, onError)
 *                  7. Call app.start()
 * TODO Session_3: Add JSON export/import for configs
 * TODO Session_3: Add sound preview on click (editor mode)
 */

class MapPlacerApp {
    constructor() {
        this.state = 'editor';
        this.waypoints = [];
        this.map = null;
        this.markers = new Map();
        this.listenerLat = null;
        this.listenerLon = null;
        this.listenerMarker = null;
        this.isDragging = false;
        this.defaultActivationRadius = 20;
        this.nextId = 1;
    }

    async init() {
        console.log('Map Placer initializing...');
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }
        this._initMap();
        this._setupEventListeners();
        await this._getInitialGPS();
        console.log('Map Placer ready (Editor Mode)');
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
                console.warn('Geolocation not supported');
                resolve(false);
                return;
            }
            navigator.geolocation.getCurrentPosition((pos) => {
                this.listenerLat = pos.coords.latitude;
                this.listenerLon = pos.coords.longitude;
                this.map.setView([this.listenerLat, this.listenerLon], 17);
                this._updateListenerMarker();
                resolve(true);
            }, (err) => {
                console.warn('GPS unavailable: ' + err.message);
                resolve(false);
            }, { enableHighAccuracy: true, timeout: 10000 });
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
        const clearBtn = document.getElementById('clearAllBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.state !== 'editor') return;
                this._clearAllWaypoints();
            });
        }
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportConfig());
        }
    }

    async _handleStartClick() {
        if (this.waypoints.length === 0) {
            this._showToast('Add at least one waypoint first', 'warning');
            return;
        }
        
        // Request compass permission FIRST (must be in user gesture for iOS)
        // TODO Session_2: Full player mode initialization should follow single_sound_v2.html pattern:
        //                  1. Get GPS position first (getCurrentPosition with timeout)
        //                  2. Initialize AudioContext (create + resume + close, satisfies iOS gesture)
        //                  3. Request wake lock
        //                  4. Request compass permission (DeviceOrientationHelper.start - HERE)
        //                  5. Create SpatialAudioApp with waypoints as sound sources
        //                  6. Set up callbacks (onPositionUpdate, onStateChange, onError)
        //                  7. Call app.start() and handle state changes
        console.log('[MapPlacer] 🧭 Requesting compass permission...');
        if (typeof DeviceOrientationHelper !== 'undefined') {
            console.log('[MapPlacer] 🧭 DeviceOrientationHelper available:', 
                DeviceOrientationHelper.isAvailable, 
                'permissionRequired:', DeviceOrientationHelper.isPermissionRequired);
            
            const compassGranted = await DeviceOrientationHelper.start((heading) => {
                // Update listener heading if we have one
                if (this.listener && this.listener.setHeading) {
                    this.listener.setHeading(heading);
                }
                console.log('[MapPlacer] 🧭 Compass:', heading.toFixed(0) + '°');
            });
            console.log('[MapPlacer] 🧭 Compass:', compassGranted ? 'GRANTED ✅' : 'DENIED ❌');
        } else {
            console.warn('[MapPlacer] ⚠️ DeviceOrientationHelper not loaded!');
        }
        
        // TODO Session_2: Transition to player mode
        this._showToast('Player mode coming in Session 2', 'info');
    }

    _addWaypoint(lat, lon, config = {}) {
        const waypoint = {
            id: 'wp' + this.nextId++,
            lat: lat,
            lon: lon,
            name: config.name || 'Sound ' + (this.waypoints.length + 1),
            type: config.type || 'oscillator',
            icon: config.icon || '🎵',
            color: config.color || '#00d9ff',
            activationRadius: config.activationRadius || this.defaultActivationRadius,
            soundConfig: config.soundConfig || { freq: 440, wave: 'sine', gain: 0.3 }
        };
        this.waypoints.push(waypoint);
        this._createMarker(waypoint);
        this._updateWaypointList();
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
        marker.bindPopup('<div><h3>' + waypoint.icon + ' ' + waypoint.name + '</h3><button onclick="app._deleteWaypoint(\\'' + waypoint.id + '\\')" style="margin-top:8px;padding:4px 8px;background:#e94560;color:white;border:none;border-radius:4px;cursor:pointer;">Delete</button></div>');
        marker.on('dragstart', () => { this.isDragging = true; marker.closePopup(); });
        marker.on('dragend', (e) => {
            this.isDragging = false;
            waypoint.lat = e.target.getLatLng().lat;
            waypoint.lon = e.target.getLatLng().lng;
            this._updateRadiusCircle(waypoint);
        });
        this.markers.set(waypoint.id, marker);
        this._updateRadiusCircle(waypoint);
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
    }

    _clearAllWaypoints() {
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.waypoints.forEach(wp => { if (wp.circleMarker) wp.circleMarker.remove(); });
        this.waypoints = [];
        this.nextId = 1;
        this._updateWaypointList();
    }

    _updateWaypointList() {
        const listEl = document.getElementById('waypointList');
        if (!listEl) return;
        if (this.waypoints.length === 0) {
            listEl.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">No waypoints yet.</p>';
            return;
        }
        listEl.innerHTML = this.waypoints.map(wp => 
            '<div style="display:flex;align-items:center;padding:8px;margin:4px 0;background:rgba(255,255,255,0.05);border-radius:6px;">' +
            '<span style="font-size:20px;margin-right:8px;">' + wp.icon + '</span>' +
            '<div style="flex:1;"><div style="font-weight:bold;">' + wp.name + '</div>' +
            '<div style="font-size:0.8em;color:#888;">' + wp.type + ' • ' + wp.activationRadius + 'm</div></div>' +
            '<button onclick="app._deleteWaypoint(\\'' + wp.id + '\\')" style="background:transparent;border:1px solid #e94560;color:#e94560;padding:4px 8px;border-radius:4px;cursor:pointer;">🗑️</button></div>'
        ).join('');
    }

    _updateListenerMarker() {
        if (this.listenerLat === null) return;
        if (this.listenerMarker) {
            this.listenerMarker.setLatLng([this.listenerLat, this.listenerLon]);
        } else {
            this.listenerMarker = L.circleMarker([this.listenerLat, this.listenerLon], {
                radius: 8, color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.8, weight: 2
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
            version: '1.0',
            createdAt: new Date().toISOString(),
            waypoints: this.waypoints.map(wp => ({
                id: wp.id, lat: wp.lat, lon: wp.lon, name: wp.name, type: wp.type,
                icon: wp.icon, color: wp.color, activationRadius: wp.activationRadius, soundConfig: wp.soundConfig
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

    async startPlayerMode() { /* TODO Session_2 */ }
    async stopPlayerMode() { /* TODO Session_2 */ }
}

const app = new MapPlacerApp();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}
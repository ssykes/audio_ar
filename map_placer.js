/**
 * Map Placer App
 * Visual map interface for placing sound waypoints
 * @version 2.5 - Player Mode with Debug Logging
 *
 * Session 2 Implementation:
 * - Player mode with GPS tracking and compass rotation
 * - SpatialAudioApp integration for audio playback
 * - Wake lock, compass, and GPS permission handling
 * - Debug console with auto-copy for field testing
 *
 * Debug Logging:
 * - Auto-captures [Audio], [GPS], [Compass], [MapPlacer] messages
 * - Auto-copies to clipboard after 3s of stillness (hands-free testing)
 * - 1000-line buffer captures ~50-100 seconds of testing
 * - To disable: set this.autoCopyLogs = false in constructor
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
    }

    async init() {
        console.log('Map Placer initializing...');
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }
        this._initMap();
        this._setupEventListeners();
        this._initDebugConsole();
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
                this._updateListenerMarker(this.listenerLat, this.listenerLon, false);  // Not locked yet
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
            exportBtn.addEventListener('click', () => this.exportConfig());
        }
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
            // STEP 7: Start the experience
            // ---------------------------------------------------------------------
            console.log('[MapPlacer] 🚀 Calling app.start()...');
            await this.app.start();
            console.log('[MapPlacer] ✅ app.start() completed');

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

    _startSimulation() {
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

    _startSimAudio() {
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

        // Start the audio
        this.app.start().then(() => {
            console.log('[MapPlacer] ✅ Simulation audio started');
            this._updateSimDisplay();
        }).catch(err => {
            console.error('[MapPlacer] ❌ Sim audio start failed:', err);
            this._showToast('❌ Audio start failed: ' + err.message, 'error');
        });
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

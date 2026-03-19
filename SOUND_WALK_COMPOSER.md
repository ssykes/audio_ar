# Sound Walk Composer - Feature Specification

**Feature Number:** 15<br>
**Status:** 📋 Planned<br>
**Priority:** High<br>
**Version:** 1.0<br>
**Created:** 2026-03-19

---

## Overview

**Goal:** Enable users to compose sound walks with mixed **waypoints** (discrete points) and **routes** (continuous paths snapped to streets/trails).

**Problem Solved:**
- Current: Only discrete sound waypoints (circular activation zones)
- Limitation: Can't create continuous audio experiences along walking paths
- Gap: No easy way to draw routes that snap to roads/paths

**Solution:** Route drawing tool with OSRM-based road snapping + segment-based sound walk data structure.

---

## User Experience Vision

### Editor Workflow (PC)

```
┌─────────────────────────────────────────────────────────────┐
│  🎵 Sound Walk Editor                                        │
│                                                              │
│  Mode: [📍 Waypoint] [🛤️ Route] [🎵 Play Test]              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │    🎵 (waypoint)                                      │   │
│  │      │                                                │   │
│  │      ╰────────────╮                                   │   │
│  │                   ╰───────🎵 (route segment)          │   │
│  │                            │                          │   │
│  │                            ╰────────╮                 │   │
│  │                                     ╰──🎵 (waypoint)  │   │
│  │                                                       │   │
│  │         [Click to add route points]                   │   │
│  │         [Double-click to finish segment]              │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  📋 Sound Walk Segments:                                     │
│  1. 📍 "Forest Entry" - Waypoint (20m radius)               │
│  2. 🛤️ "Path to River" - Route (1.2km, 15m width)          │
│  3. 📍 "River Ambience" - Waypoint (30m radius)             │
│  4. 🛤️ "Return Path" - Route (0.8km, 15m width)            │
│                                                              │
│  [💾 Save Sound Walk] [▶️ Test Walk] [📤 Export]            │
└─────────────────────────────────────────────────────────────┘
```

### Player Experience (Phone)

```
User walks along route:

📍 Start at "Forest Entry" waypoint
   ↓ (audio: forest ambience, 20m radius)
   
🛤️ Walk "Path to River" route
   ↓ (audio: birds ambience, continuous along 1.2km path)
   
📍 Arrive at "River Ambience" waypoint
   ↓ (audio: river sounds, 30m radius)
   
🛤️ Walk "Return Path" route
   ↓ (audio: forest ambience, continuous along 0.8km path)
   
📍 End at starting point
```

---

## Architecture

### Data Structure

```javascript
class SoundWalk {
    constructor(options) {
        this.id = options.id || generateId();
        this.name = options.name || 'Untitled Sound Walk';
        this.description = options.description || '';
        
        // Mixed segments (waypoints + routes)
        this.segments = [
            {
                type: 'waypoint',
                id: 'wp_1',
                name: 'Forest Entry',
                soundUrl: 'forest.mp3',
                lat: 51.505,
                lon: -0.09,
                activationRadius: 20,
                volume: 0.8,
                loop: true
            },
            {
                type: 'route',
                id: 'rt_1',
                name: 'Path to River',
                soundUrl: 'birds.mp3',
                route: [  // Snapped to streets/paths via OSRM
                    { lat: 51.505, lon: -0.09 },
                    { lat: 51.506, lon: -0.091 },
                    { lat: 51.507, lon: -0.092 }
                ],
                activationWidth: 15,  // Meters left/right of path
                volume: 0.6,
                loop: false
            }
            // ... more segments
        ];
        
        this.createdAt = new Date().toISOString();
        this.modifiedAt = new Date().toISOString();
    }
}
```

**Key Design Decision:** Store as **ordered segments array** (not separate collections).

**Benefits:**
- ✅ Sequential sound walks (story progression)
- ✅ Mixed waypoint + route experiences
- ✅ Easy reordering (drag segments)
- ✅ Clear mental model for users

---

## Route Snapping: Technical Approach

### Leaflet Routing Machine + OSRM

**Library:** Leaflet Routing Machine (v3.2.12)<br>
**Routing Engine:** OSRM (Open Source Routing Machine)<br>
**Hosting:** Self-hosted via Docker (free, no rate limits)

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│  Your PC (Editor)                                        │
│  map_editor.html + Leaflet Routing Machine              │
│         ↓                                                 │
│  Your local OSRM server (Docker)                         │
│  Routes snapped to OSM roads/paths                       │
└─────────────────────────────────────────────────────────┘
                         ↓ (save to server)
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (API)                                 │
│  Stores path coordinates in database                    │
└─────────────────────────────────────────────────────────┘
                         ↓ (phone downloads)
┌─────────────────────────────────────────────────────────┐
│  Phone (Player)                                          │
│  map_player.html + path activation logic                │
│  No routing needed (just checks distance to path)       │
└─────────────────────────────────────────────────────────┘
```

**Key Point:** Routing only needed on **editor (PC)**. Phone just checks distance to saved path coordinates.

---

### OSRM Setup (Self-Hosted)

**Prerequisites:** Docker Desktop

**Setup Commands:**
```powershell
# 1. Download OSM extract for your region
# Get .osm.pbf file from https://download.geofabrik.de/
# Example: greater-london-latest.osm.pbf (~50MB)

# 2. Create OSRM data folder
mkdir osrm-data
cd osrm-data

# 3. Run OSRM preprocessing (generates routing graph)
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/greater-london-latest.osm.pbf

# 4. Run OSRM server
docker run -t -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routine --algorithm mld /data/greater-london-latest.osrm
```

**Test:**
```powershell
# Open browser: http://localhost:5000/route/v1/driving/-0.09,51.505;-0.092,51.507
# Should return JSON with routed coordinates
```

**Resource Usage:**
- RAM: ~2-5GB (depends on region size)
- Disk: ~500MB - 2GB (OSM data + graph)
- CPU: Minimal after preprocessing
- Preprocessing Time: 5-20 minutes (one-time per region)

**Fallback:** Use OSRM demo server (`router.project-osrm.org`) for testing, switch to localhost for production.

---

## Route Activation Logic

### Distance to Path Calculation

```javascript
class SoundPath {
    /**
     * Check if user is within activation zone of path
     * @param {number} userLat 
     * @param {number} userLon 
     * @returns {{isActive: boolean, distance: number}}
     */
    checkActivation(userLat, userLon) {
        const distance = this._distanceToRoute(userLat, userLon);
        return {
            isActive: distance <= this.activationWidth,
            distance: distance
        };
    }
    
    /**
     * Calculate minimum distance from user to any route segment
     * @private
     */
    _distanceToRoute(lat, lon) {
        let minDistance = Infinity;
        
        for (let i = 0; i < this.route.length - 1; i++) {
            const start = this.route[i];
            const end = this.route[i + 1];
            const distance = this._distancePointToSegment(
                lat, lon,
                start.lat, start.lon,
                end.lat, end.lon
            );
            minDistance = Math.min(minDistance, distance);
        }
        
        return minDistance;
    }
    
    /**
     * Distance from point to line segment (Haversine formula)
     * @private
     */
    _distancePointToSegment(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1; yy = y1;
        } else if (param > 1) {
            xx = x2; yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        return this._haversineDistance(px, py, xx, yy);
    }
}
```

### Integration with Lazy Loading

```javascript
// spatial_audio_app.js - Update _updateSoundZones()
_updateSoundZones() {
    const toLoad = [];
    const toPreload = [];
    const toDispose = [];
    
    this.soundscapes.forEach(soundscape => {
        // Existing waypoint logic
        soundscape.segments?.forEach(segment => {
            if (segment.type === 'waypoint') {
                const distance = this.getSoundDistance(segment.id);
                const zone = this._getSoundZone(distance);
                // ... existing logic
            } else if (segment.type === 'route') {
                const checkResult = segment.checkActivation(
                    this.listener.lat,
                    this.listener.lon
                );
                const zone = this._getSoundZone(checkResult.distance);
                
                if (zone.shouldLoad && !segment.isLoading && !segment.isLoaded) {
                    if (zone.zone === 'active') {
                        toLoad.push(segment);
                    } else if (zone.zone === 'preload') {
                        toPreload.push(segment);
                    }
                }
                
                if (zone.shouldDispose && !segment.isDisposed) {
                    toDispose.push(segment);
                }
            }
        });
    });
    
    return { toLoad, toPreload, toDispose };
}
```

---

## Implementation Plan

### Phase 1: Route Drawing Tool (~150 lines)

**Files:** `map_shared.js`, `map_editor.js`, `map_editor.html`

**Tasks:**
- [ ] Add Leaflet Routing Machine assets to `map_editor.html`
- [ ] Add `_initRouting()` method to `map_shared.js`
- [ ] Add route mode toggle button (waypoint vs route)
- [ ] Add click-to-place point handlers
- [ ] Add double-click to finish segment
- [ ] Add visual preview while drawing

**Code Structure:**
```javascript
// map_shared.js
this.drawingMode = 'waypoint';  // 'waypoint' | 'route'
this.currentRoutePoints = [];
this.routingControl = null;

async _initRouting() {
    // Load Leaflet Routing Machine dynamically
    await this._loadRoutingMachineAssets();
    
    this.routingControl = L.Routing.control({
        waypoints: [],
        routeWhileDragging: true,
        show: false,  // Hide instructions panel
        serviceUrl: 'http://localhost:5000'  // Self-hosted OSRM
    });
    
    this.routingControl.on('routesfound', (e) => {
        const route = e.routes[0];
        this._onRouteUpdated(route.coordinates);
    });
}
```

---

### Phase 2: Sound Walk Data Model (~80 lines)

**Files:** `soundscape.js`, `api-client.js`

**Tasks:**
- [ ] Add `SoundWalk` class with segments array
- [ ] Add segment add/remove/reorder helpers
- [ ] Update API client to save/load segments
- [ ] Add segment type discrimination (waypoint vs route)

**Code Structure:**
```javascript
// soundscape.js
class SoundWalk {
    constructor(options) {
        this.segments = options.segments || [];
    }
    
    addSegment(segment) {
        this.segments.push(segment);
        this._reindex();
    }
    
    removeSegment(id) {
        this.segments = this.segments.filter(s => s.id !== id);
        this._reindex();
    }
    
    getSegment(id) {
        return this.segments.find(s => s.id === id);
    }
    
    _reindex() {
        this.segments.forEach((s, i) => s.order = i);
        this.modifiedAt = new Date().toISOString();
    }
}
```

---

### Phase 3: Segment List UI (~100 lines)

**Files:** `map_editor.html`, `map_editor.js`

**Tasks:**
- [ ] Add segment list panel
- [ ] Add drag-to-reorder (or up/down buttons)
- [ ] Add click to edit properties
- [ ] Add delete button per segment
- [ ] Add visual indicators (📍 vs 🛤️)

**UI Mockup:**
```html
<div id="segmentList" class="segment-list">
    <h3>🎵 Sound Walk Segments</h3>
    
    <div class="segment-item" data-id="wp_1">
        <span class="drag-handle">☰</span>
        <span class="segment-icon">📍</span>
        <span class="segment-name">Forest Entry</span>
        <span class="segment-type">Waypoint (20m)</span>
        <button class="edit-btn">✏️</button>
        <button class="delete-btn">🗑️</button>
    </div>
    
    <div class="segment-item" data-id="rt_1">
        <span class="drag-handle">☰</span>
        <span class="segment-icon">🛤️</span>
        <span class="segment-name">Path to River</span>
        <span class="segment-type">Route (1.2km)</span>
        <button class="edit-btn">✏️</button>
        <button class="delete-btn">🗑️</button>
    </div>
    
    <button id="addSegmentBtn">➕ Add Segment</button>
</div>
```

---

### Phase 4: Route Activation Logic (~120 lines)

**Files:** `spatial_audio_app.js`, `soundscape.js`

**Tasks:**
- [ ] Add `SoundPath` class with activation check
- [ ] Add `_distanceToRoute()` helper to `spatial_audio_app.js`
- [ ] Integrate route zones into `_updateSoundZones()`
- [ ] Add route-specific lazy loading (load/preload/dispose)

**Code Structure:**
```javascript
// spatial_audio_app.js
_distanceToRoute(lat, lon, routeCoords) {
    let minDistance = Infinity;
    
    for (let i = 0; i < routeCoords.length - 1; i++) {
        const start = routeCoords[i];
        const end = routeCoords[i + 1];
        const distance = this._distancePointToSegment(
            lat, lon,
            start.lat, start.lon,
            end.lat, end.lon
        );
        minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
}
```

---

### Phase 5: Testing + Polish (~50 lines)

**Files:** `map_editor.html`, `map_player.html`

**Tasks:**
- [ ] Debug logging for route activation
- [ ] Visual indicators (route color changes when active)
- [ ] Test walk simulator (drag avatar along route)
- [ ] Field test on phone with real GPS

**Test Checklist:**

| Test | Expected Result | Status |
|------|-----------------|--------|
| Draw route on map | Snaps to roads/paths | ⬜ |
| Route saves to server | Coordinates persist | ⬜ |
| Phone loads route | Path appears on map | ⬜ |
| Walk along route | Audio plays continuously | ⬜ |
| Walk away from route | Audio fades out at edge | ⬜ |
| Multiple segments | Sequential playback works | ⬜ |
| Memory usage (50 segments) | <20 MB | ⬜ |
| CPU usage (walking) | <10% | ⬜ |

---

## Total Summary

| Phase | Task | Files | Lines | Time |
|-------|------|-------|-------|------|
| **1** | Route drawing tool | 3 modify | ~150 | 1h |
| **2** | SoundWalk data model | 2 modify | ~80 | 40 min |
| **3** | Segment list UI | 2 modify | ~100 | 45 min |
| **4** | Route activation logic | 2 modify | ~120 | 50 min |
| **5** | Testing + polish | 2 modify | ~50 | 30 min |
| **Total** | | **6 modified** | **~500** | **~4 hours** |

---

## Dependencies

| Dependency | Status |
|------------|--------|
| Leaflet Routing Machine | ✅ Available (CDN) |
| OSRM (self-hosted) | ⏳ Setup required |
| Lazy loading (Feature 13) | ✅ Complete |
| Drift compensation (Feature 13) | ✅ Complete |
| Air absorption (Feature 14) | ✅ Complete |

---

## Future Enhancements (Post-Feature 15)

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Variable width** | Different activation width per route segment | ~30 lines |
| **Progress tracking** | Trigger events at path milestones (0%, 50%, 100%) | ~50 lines |
| **Multi-sound routes** | Crossfade between sounds along long paths | ~80 lines |
| **Elevation-aware** | Adjust volume based on elevation gain/loss | ~60 lines |
| **Narration cues** | Trigger voice narration at specific points | ~40 lines |

---

## Success Criteria

| Criterion | How to Verify |
|-----------|---------------|
| Route snaps to roads | Visual inspection on map |
| Route saves/loads | Refresh page, verify persistence |
| Phone plays route audio | Walk along path, listen |
| Lazy loading works | Memory stays <20 MB (50 segments) |
| No audio gaps | Continuous playback along route |
| Editor UX intuitive | New user can draw route in <1 min |

---

## Testing Protocol

### Editor Testing
1. Open `map_editor.html`
2. Click "🛤️ Route Mode"
3. Click 3-5 points on map (along roads)
4. Double-click to finish
5. Verify route snaps to roads
6. Add waypoint at start/end
7. Save soundscape
8. Refresh page → verify persistence

### Player Testing
1. Open `map_player.html` on phone
2. Load soundscape with routes
3. Verify routes visible on map
4. Walk along route
5. Verify audio plays continuously
6. Walk away from route
7. Verify audio fades out

### Performance Testing
```javascript
// Open browser console (DevTools → Performance tab)
// Record while walking through soundscape with 20 route segments
// Check:
// - Memory usage (should stay <20 MB)
// - CPU usage (should stay <10%)
// - No garbage collection spikes
```

---

## Notes

- **OSRM Demo Server:** Use `router.project-osrm.org` for initial testing (rate-limited but works)
- **Self-Hosted OSRM:** Switch to `localhost:5000` for production (no rate limits)
- **Region Data:** Download OSM extracts from https://download.geofabrik.de/
- **Trail Coverage:** OSRM uses OpenStreetMap data (roads + major paths, not all hiking trails)

---

**Last Updated:** 2026-03-19<br>
**Next Session:** Phase 1 (Route Drawing Tool)

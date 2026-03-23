# Sound Area Architecture

**Version:** 1.0  
**Date:** 2026-03-23  
**Related Spec:** `SOUND_AREA.md`

---

## Architecture Overview

The Sound Area feature follows the **existing layered architecture** with parallel systems for Waypoints and Areas. This minimizes impact to existing code and allows independent testing.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ map_editor.html │  │  map_player.html│  │soundscape_picker│ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│  ┌────────▼────────────────────▼────────────────────▼────────┐ │
│  │                    map_shared.js                           │ │
│  │         (MapAppShared base class, UI orchestration)        │ │
│  └────────────────────────────┬───────────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                       Application Layer                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               spatial_audio_app.js v2.8+                  │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐  │   │
│  │  │   WaypointManager  │  │      AreaManager (NEW)     │  │   │
│  │  │  (existing v2.8)   │  │  - Area lifecycle          │  │   │
│  │  │  - Lazy loading    │  │  - Volume mixing           │  │   │
│  │  │  - Hysteresis      │  │  - Overlap handling        │  │   │
│  │  │  - Air absorption  │  │  - Direction tracking      │  │   │
│  │  └────────────────────┘  └────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                         Audio Engine Layer                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  spatial_audio.js v5.1+                   │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐  │   │
│  │  │  GpsSoundSource    │  │   AreaSoundSource (NEW)    │  │   │
│  │  │  (point source)    │  │  (zone source, no panning) │  │   │
│  │  │  - HRTF panning    │  │  - Volume-only control     │  │   │
│  │  │  - Distance filter │  │  - Fade zone               │  │   │
│  │  └────────────────────┘  └────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │          GPSUtils (extended with helpers)          │   │   │
│  │  │  + pointInPolygon()                                │   │   │
│  │  │  + distanceToEdge()                                │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                        Data Access Layer                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   api-client.js                           │   │
│  │  - syncAreas() (NEW)                                     │   │
│  │  - saveArea(), deleteArea() (NEW)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              api/models/ (Domain Models)                  │   │
│  │  - Waypoint.js (existing)                                │   │
│  │  - Area.js (NEW)                                         │   │
│  │  - SoundScape.js (extended with areas array)             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           api/repositories/ (Data Mappers)                │   │
│  │  - WaypointRepository.js (existing)                      │   │
│  │  - AreaRepository.js (NEW)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                        Database Layer                            │
│  ┌────────────────────┐  ┌────────────────────────────────┐    │
│  │    waypoints       │  │           areas                │    │
│  │  (existing table)  │  │        (NEW table)             │    │
│  └────────────────────┘  └────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              soundscapes (existing, unchanged)         │     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## New Classes & Files

### 1. Domain Models (Server-Side)

**File:** `api/models/Area.js`
```javascript
class Area {
  constructor(
    id, soundscapeId, name,
    polygon,           // [{lat, lng}, ...]
    soundUrl, volume, loop,
    fadeZone,          // {width, curve}
    overlapMode,       // 'mix' | 'opaque'
    order,             // placement order for opaque priority
    icon, color, sortOrder
  ) { ... }
  
  static fromRow(row) { ... }   // snake_case → camelCase
  static fromJSON(json) { ... }
  toRow() { ... }               // camelCase → snake_case
  toJSON() { ... }
}
```

**Impact:** None (new file, follows existing Waypoint.js pattern)

---

### 2. Data Repositories (Server-Side)

**File:** `api/repositories/AreaRepository.js`
```javascript
class AreaRepository extends BaseRepository {
  constructor(db) { super(db, 'areas'); }
  
  async findBySoundscape(soundscapeId, orderBy = 'sort_order')
  async countBySoundscape(soundscapeId)
  async deleteBySoundscape(soundscapeId)
  async insertBatch(soundscapeId, areas)
}
```

**Impact:** None (new file, follows existing WaypointRepository pattern)

---

### 3. Database Schema

**File:** `api/migrations/003_create_areas_table.sql` (NEW)
```sql
CREATE TABLE areas (
  id              TEXT PRIMARY KEY,
  soundscape_id   TEXT NOT NULL REFERENCES soundscapes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  polygon         JSONB NOT NULL,          -- [{lat, lng}, ...]
  sound_url       TEXT NOT NULL,
  volume          REAL DEFAULT 0.8,
  loop            BOOLEAN DEFAULT TRUE,
  fade_zone_width REAL DEFAULT 5.0,
  overlap_mode    TEXT DEFAULT 'mix',      -- 'mix' | 'opaque'
  order           INTEGER DEFAULT 0,       -- placement order
  icon            TEXT DEFAULT '◈',        -- diamond for Areas
  color           TEXT DEFAULT '#ff6b6b',  -- red-ish
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_areas_soundscape ON areas(soundscape_id);
```

**Impact:** None (new table, no changes to existing tables)

---

### 4. Audio Engine Classes (Client-Side)

**File:** `spatial_audio.js` (EXTENDED)

**New Class:** `AreaSoundSource`
```javascript
class AreaSoundSource {
  constructor(audioContext, areaConfig) {
    this.area = areaConfig;      // Area data
    this.audioContext = audioContext;
    this.gainNode = null;
    this.source = null;
    this.isPlaying = false;
    this.currentVolume = 0;
  }
  
  async start()                  // Create audio source, start muted
  async stop()                   // Fade out, dispose
  setVolume(volume)              // Smooth volume transition
  updatePosition(listenerPos)    // Recalculate volume based on position
}
```

**Key Difference from GpsSoundSource:**
- **No panner node** (no spatialization)
- Volume based on **point-in-polygon + fade zone**
- No distance-based air absorption (optional enhancement)

**Extended:** `GPSUtils` (in `spatial_audio.js`)
```javascript
GPSUtils = {
  // ... existing methods ...
  
  // NEW: Polygon helpers
  pointInPolygon(lat, lng, polygon)     // Ray casting algorithm
  distanceToEdge(lat, lng, polygon)     // Min distance to any edge
  polygonBounds(polygon)                // Bounding box for pre-check
}
```

**Impact:** Additive (new classes/methods, no changes to existing GpsSoundSource)

---

### 5. Application Layer (Client-Side)

**File:** `spatial_audio_app.js` (EXTENDED)

**New Class:** `AreaManager`
```javascript
class AreaManager {
  constructor(audioContext, listener) {
    this.audioContext = audioContext;
    this.listener = listener;
    this.areas = new Map();            // Map<areaId, AreaSoundSource>
    this.activeAreas = new Set();      // Areas listener is inside
  }
  
  // Lifecycle
  loadAreas(areas)                     // Load Area configs
  update(listenerPos, heading)         // Check positions, update volumes
  dispose()                            // Stop all, free memory
  
  // Internal
  _calculateAreaVolume(area, listenerPos)
  _mixAreas(activeAreas)               // Handle overlap modes
  _getDirectionOfTravel()              // Heading + movement vector
}
```

**Extended:** `Listener` class (in `spatial_audio_app.js`)
```javascript
class Listener {
  // ... existing properties ...
  
  // NEW: Direction tracking
  update(lat, lon, heading)            // Track movement vector
  getHeading()                         // Compass heading
  getMovementVector()                  // {direction, speed}
}
```

**Impact:** Additive (new AreaManager class, Listener extended with direction tracking)

---

### 6. Domain Model (Client-Side)

**File:** `soundscape.js` (EXTENDED)

**Extended:** `SoundScape` class
```javascript
class SoundScape {
  constructor(id, name) {
    // ... existing properties ...
    this.waypoints = new Map();        // existing
    this.areas = new Map();            // NEW: Map<id, AreaConfig>
  }
  
  // NEW: Area management
  addArea(areaConfig) { ... }
  updateArea(areaId, updates) { ... }
  deleteArea(areaId) { ... }
  getAreas() { return Array.from(this.areas.values()); }
  
  // EXTENDED: Export/Import
  toJSON() {
    return {
      // ... existing ...
      waypoints: Array.from(this.waypoints.values()),
      areas: Array.from(this.areas.values())     // NEW
    };
  }
  
  static fromJSON(json) {
    const soundscape = new SoundScape(json.id, json.name);
    // ... existing waypoint loading ...
    if (json.areas) {
      json.areas.forEach(area => soundscape.addArea(area));
    }
    return soundscape;
  }
}
```

**Impact:** Additive (new areas Map, backward compatible - old soundscapes without areas work fine)

---

### 6B. Offline Support (Client-Side)

**File:** `download_manager.js` (EXTENDED)

**Extended:** `OfflineDownloadManager` class
```javascript
class OfflineDownloadManager {
  // ... existing methods ...
  
  // EXTENDED: Download soundscape with Areas (Session 2+)
  async downloadSoundscape(soundscapeId, soundscapeName, waypoints, soundscapeData = null) {
    // Extract unique sound URLs from waypoints AND areas
    const waypointUrls = waypoints.map(wp => wp.soundUrl).filter(url => url);
    const areaUrls = (soundscapeData?.areas || []).map(a => a.soundUrl).filter(url => url);
    const allUrls = [...new Set([...waypointUrls, ...areaUrls])];  // Deduplicate
    
    // ... rest of existing download logic unchanged ...
  }
}
```

**File:** `sw.js` (NO CHANGES REQUIRED)

**Current Behavior:** Service Worker already uses cache-first strategy for all requests. Area audio files will be:
1. Cached by `OfflineDownloadManager` in `soundscape-{id}` cache (same as waypoints)
2. Served by Service Worker's existing fetch handler (no changes needed)

**Key Point:** The offline architecture is **already Area-ready**. Areas just need to:
- Include Area audio URLs in the download queue (Session 2 change to `download_manager.js`)
- Use `CachedSampleSource` for playback (same as waypoints, Session 3)

**Impact:** Additive (one method signature extension, backward compatible)

---

### 7. API Client (Client-Side)

**File:** `api-client.js` (EXTENDED)

**Extended:** `ApiClient` class
```javascript
class ApiClient {
  // ... existing methods ...
  
  // NEW: Area sync
  async syncAreas(soundScapeId, areas) {
    return await this.request(`/soundscapes/${soundscapeId}/areas`, {
      method: 'PUT',
      body: JSON.stringify({ areas })
    });
  }
  
  async saveArea(soundScapeId, area) {
    return await this.request(`/soundscapes/${soundscapeId}/areas`, {
      method: 'POST',
      body: JSON.stringify({ area })
    });
  }
  
  async deleteArea(soundScapeId, areaId) {
    return await this.request(`/soundscapes/${soundscapeId}/areas/${areaId}`, {
      method: 'DELETE'
    });
  }
}
```

**Impact:** Additive (new methods, no changes to existing waypoint sync)

---

### 8. Server Routes (Server-Side)

**File:** `api/routes/areas.js` (NEW)
```javascript
const express = require('express');
const router = express.Router();
const AreaRepository = require('../repositories/AreaRepository');

router.get('/soundscapes/:soundscapeId/areas', async (req, res) => {
  const repo = new AreaRepository(req.db);
  const areas = await repo.findBySoundscape(req.params.soundscapeId);
  res.json({ areas });
});

router.post('/soundscapes/:soundscapeId/areas', async (req, res) => {
  // Create/update area
});

router.delete('/soundscapes/:soundscapeId/areas/:id', async (req, res) => {
  // Delete area
});

module.exports = router;
```

**File:** `api/server.js` (EXTENDED)
```javascript
const areasRoutes = require('./routes/areas');  // NEW
app.use('/api', areasRoutes);                   // NEW
```

**Impact:** Additive (new route file, one-line registration in server.js)

---

## Existing Code Impact

### Zero Impact (New Files Only)
- `api/models/Area.js`
- `api/repositories/AreaRepository.js`
- `api/migrations/003_create_areas_table.sql`
- `api/routes/areas.js`
- `AreaSoundSource` class in `spatial_audio.js`
- `AreaManager` class in `spatial_audio_app.js`

### Additive Changes (Backward Compatible)

| File | Change | Impact |
|------|--------|--------|
| `spatial_audio.js` | Add `GPSUtils.pointInPolygon()`, `distanceToEdge()` | None (new static methods) |
| `spatial_audio_app.js` | Extend `Listener` with direction tracking | None (new methods, existing code unchanged) |
| `soundscape.js` | Add `areas` Map to `SoundScape` | None (old soundscapes without areas work) |
| `api-client.js` | Add `syncAreas()`, `saveArea()`, `deleteArea()` | None (new methods) |
| `download_manager.js` | Include Area URLs in `downloadSoundscape()` | None (parameter already optional) |
| `api/server.js` | Register areas routes | None (one-line addition) |

### UI Integration (Opt-In)

| File | Change | Impact |
|------|--------|--------|
| `map_editor.html` | Add "Add Area" button, polygon drawing UI | None (hidden behind new button) |
| `map_shared.js` | Integrate `AreaManager` into update loop | Low (gated behind feature flag or class check) |
| `map_player.html` | Area visual feedback (boundary highlight) | Low (CSS classes, optional rendering) |

### No Changes Required

| File | Reason |
|------|--------|
| `sw.js` | Service Worker already handles all audio via Cache API |
| `CachedSampleSource` | Works for Areas without modification (any audio source) |

---

## Design Patterns

### 1. **Repository Pattern** (Existing)
Areas follow the same Data Mapper pattern as Waypoints:
- `Area` model (domain object)
- `AreaRepository` (database operations)
- Snake_case ↔ camelCase conversion in `_toEntity()` / `_toRow()`

### 2. **Strategy Pattern** (Overlap Handling)
```javascript
class AreaMixer {
  static mix(activeAreas) {
    // Crossfade all areas
  }
  
  static opaque(activeAreas) {
    // Only top-most opaque area plays
  }
}
```

### 3. **Observer Pattern** (Position Updates)
`AreaManager` subscribes to listener position updates:
```javascript
// In MapAppShared
this.audioApp.listener.onPositionUpdate((pos) => {
  this.areaManager.update(pos);  // Recalculate volumes
});
```

### 4. **Factory Pattern** (Sound Source Creation)
```javascript
class SoundSourceFactory {
  static create(sourceType, config, audioContext) {
    switch(sourceType) {
      case 'waypoint': return new GpsSoundSource(config, audioContext);
      case 'area': return new AreaSoundSource(config, audioContext);
    }
  }
}
```

### 5. **Composite Pattern** (Area Overlap Mixing)
```javascript
class AreaMixer {
  mix(activeAreas) {
    // Treat multiple areas as a single "mixed" audio source
    const mixedVolume = this.calculateMix(activeAreas);
    return mixedVolume;
  }
}
```

---

## Database Schema Comparison

### Waypoints Table (Existing)
```sql
waypoints (
  id, soundscape_id, name,
  lat, lon,              -- Point location
  sound_url, volume, loop,
  activation_radius,     -- Circular activation zone
  icon, color, sort_order
)
```

### Areas Table (New)
```sql
areas (
  id, soundscape_id, name,
  polygon,               -- JSONB array [{lat, lng}, ...]
  sound_url, volume, loop,
  fade_zone_width,       -- Linear fade zone (meters)
  overlap_mode,          -- 'mix' | 'opaque'
  order,                 -- Placement order for opaque priority
  icon, color, sort_order
)
```

**Key Differences:**
- `polygon` (JSONB) vs `lat/lon` (point)
- `fade_zone_width` vs `activation_radius`
- `overlap_mode` + `order` for overlap handling

---

## Class Interaction Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      MapAppShared                             │
│  - waypoints: Map<id, Waypoint>                              │
│  - areas: Map<id, Area>                                      │
│  - audioApp: SpatialAudioApp                                 │
└─────────────────────┬────────────────────────────────────────┘
                      │ update()
                      ▼
┌──────────────────────────────────────────────────────────────┐
│                   SpatialAudioApp                             │
│  - listener: Listener                                        │
│  - waypointManager: WaypointManager                          │
│  - areaManager: AreaManager (NEW)                            │
└─────────────────────┬────────────────────────────────────────┘
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ WaypointManager  │    │  AreaManager     │
│ - loadSounds()   │    │ - loadAreas()    │
│ - update()       │    │ - update()       │
│ - dispose()      │    │ - mixAreas()     │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ GpsSoundSource   │    │ AreaSoundSource  │
│ - pannerNode     │    │ - gainNode only  │
│ - distanceFilter │    │ - no panning     │
│ - start()        │    │ - start()        │
│ - update()       │    │ - setVolume()    │
└──────────────────┘    └──────────────────┘
```

---

## Testing Strategy

### Unit Tests (New Files)
```javascript
// test/area.test.js
describe('GPSUtils.pointInPolygon', () => { ... });
describe('Area.toJSON/fromJSON', () => { ... });
describe('AreaMixer.mix', () => { ... });
describe('AreaMixer.opaque', () => { ... });
```

### Integration Tests (Existing Files Extended)
```javascript
// test/soundscape.test.js
it('exports/imports areas with waypoints', () => { ... });

// test/api-client.test.js
it('syncs areas to server', async () => { ... });
```

### Manual Testing Checklist
- [ ] Draw Area in editor, save, reload
- [ ] Walk into Area on phone, verify fade
- [ ] Overlap two Areas (mix mode), verify crossfade
- [ ] Overlap two Areas (opaque mode), verify masking
- [ ] Waypoint spatialization still works with Areas active

---

## Performance Considerations

### Point-in-Polygon Optimization
```javascript
function isPointInPolygon(lat, lng, polygon) {
  // 1. Bounding box pre-check (fast rejection)
  if (!inBounds(lat, lng, polygon.bounds)) return false;
  
  // 2. Ray casting (only if in bounds)
  return rayCast(lat, lng, polygon);
}
```

### Spatial Indexing (Future Enhancement)
For 10+ Areas, consider:
- Quadtree for Area lookup
- Cache active Areas between frames (coherence)

### Audio Source Caching
- Preload Area audio when in preload zone (like waypoints)
- Keep disposed Areas in LRU cache for quick reload

---

## Migration Path

### Phase 1: Database (Session 1)
```bash
# Run migration
node api/migrate.js 003_create_areas_table.sql

# Verify
psql -c "SELECT * FROM areas LIMIT 1;"
```

### Phase 2: Server API (Session 2)
```javascript
// Add to api/server.js
const areasRoutes = require('./routes/areas');
app.use('/api', areasRoutes);

// Test with curl
curl http://localhost:3000/api/soundscapes/test-123/areas
```

### Phase 3: Client Models (Session 2)
```javascript
// Extend SoundScape class
// Test: export/import soundscape with areas
```

### Phase 4: Audio Engine (Session 3)
```javascript
// Add AreaManager, AreaSoundSource
// Test: Area plays audio when inside polygon
```

### Phase 5: UI Integration (Sessions 4-6)
```javascript
// Add editor drawing tools
// Test: draw, edit, save Areas
```

---

## Rollback Plan

If issues arise at any session:

| Session | Rollback Action |
|---------|-----------------|
| 1 (Models) | Delete new files, no DB changes yet |
| 2 (Storage) | Comment out Area code in SoundScape, skip migration |
| 3 (Audio) | Don't instantiate AreaManager |
| 4-5 (Editor) | Hide "Add Area" button via CSS |
| 6 (Player) | Don't call areaManager.update() |

**All sessions are independently reversible.**

---

## Summary

**New Files:** 7 (models, repositories, routes, migrations, classes)  
**Modified Files:** 6 (additive changes only)  
**New Tables:** 1 (areas)  
**Breaking Changes:** 0  
**Backward Compatible:** 100%  
**Offline Ready:** ✅ (Service Worker already supports Areas)

The architecture maintains **strict separation** between Waypoints and Areas, allowing parallel development and testing without impacting existing functionality.

---

## Offline Support Details

### How Areas Use Existing Offline Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│              Offline Download Flow (Feature 15)              │
└─────────────────────────────────────────────────────────────┘

User clicks "Download" on soundscape_picker.html
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  OfflineDownloadManager.downloadSoundscape()                │
│  - Extracts URLs from waypoints                             │
│  - Extracts URLs from areas (NEW in Session 2)              │
│  - Deduplicates combined URL list                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Cache API: soundscape-{id}                                 │
│  - Stores all audio files (waypoints + areas)               │
│  - localStorage: offline_soundscape_full_{id}               │
│    (metadata including areas array)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Service Worker (sw.js) - NO CHANGES NEEDED                 │
│  - Cache-first strategy for all requests                    │
│  - Intercepts audio file requests                           │
│  - Serves from soundscape-{id} cache if available           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  CachedSampleSource (spatial_audio.js)                      │
│  - Works for both waypoints and areas                       │
│  - No modification needed                                   │
└─────────────────────────────────────────────────────────────┘
```

### Session 2: Offline Support Implementation

**Change in `download_manager.js`:**
```javascript
async downloadSoundscape(soundscapeId, soundscapeName, waypoints, soundscapeData = null) {
    // EXTENDED: Include Area audio URLs
    const waypointUrls = waypoints.map(wp => wp.soundUrl).filter(url => url);
    const areaUrls = (soundscapeData?.areas || []).map(a => a.soundUrl).filter(url => url);
    
    // Combine and deduplicate (same audio file might be used in both)
    const allUrls = [...new Set([...waypointUrls, ...areaUrls])];
    
    // ... rest of download logic unchanged ...
}
```

**What This Enables:**
1. ✅ Download soundscape with Areas → all audio cached
2. ✅ Go offline → Service Worker serves cached audio
3. ✅ Walk into Area offline → audio plays from cache
4. ✅ Mixed waypoint+Area soundscapes work offline

**No Service Worker Changes Required:**
- Current SW already caches all audio in `soundscape-{id}` caches
- Current SW already uses cache-first strategy
- Current `CachedSampleSource` already works with any audio source

---

**Created:** 2026-03-23  
**Updated:** 2026-03-23 (Added offline support details)  
**Author:** Spatial Audio AR Team

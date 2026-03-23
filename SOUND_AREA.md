# Feature: Sound Areas (Polygons)

**Status:** 📋 Planned  
**Priority:** High  
**Estimated Effort:** ~8-10 hours

---

## Overview

A **Sound Area** is a polygon-shaped zone that plays audio at a consistent volume (no spatial panning) when the listener is inside. Unlike waypoints which are point sources with 3D spatialization, Areas provide zone-based audio with smooth boundary transitions.

---

## Core Requirements

### 1. Polygon Geometry
- Support polygons with **any number of vertices** (3+)
- Stored as ordered array of lat/lng coordinates: `[{lat, lng}, {lat, lng}, ...]`
- Closed polygon (first and last points connected)
- Convex or concave shapes supported

### 2. Audio Behavior
- **No panning**: Audio plays at consistent volume regardless of listener position within Area
- **Fade Zone**: Smooth volume transition at boundaries (configurable width, similar to waypoints)
- **Overlap Modes** (per-Area setting):
  - **Mix (default)**: Crossfade between overlapping Areas
    - Equal mixing: Smaller Area inside larger Area → volumes mixed equally
    - Weighted by distance from boundary (optional)
  - **Opaque**: Last-placed Area masks underlying Areas (no mixing)
    - Underlying Area(s) are muted when inside opaque Area
- **Sound Source Agnostic**: Support all source types (oscillators, MP3s, streams, etc.)

### 3. Direction Awareness
- Track listener's **heading** (compass direction)
- Track **movement vector** (speed + direction)
- Use for:
  - Predicting boundary crossings
  - Smoothing fade zone transitions
  - Hysteresis to prevent rapid on/off cycling

### 4. Map Editor Integration
- **Drawing Mode**: Click to place vertices, close polygon to finish
- **Edit Mode**: Drag handles at each vertex to reshape
- **Visual Feedback**:
  - Highlight Area when listener is inside
  - Show fade zone boundary (optional toggle)
  - Display Area name/label
- **Operations**: Add, delete, duplicate, reorder vertices

---

## Data Model

```javascript
{
  id: "area_001",
  type: "area",  // vs "waypoint"
  name: "Forest Ambience",
  polygon: [
    { lat: 47.6062, lng: -122.3321 },
    { lat: 47.6065, lng: -122.3318 },
    { lat: 47.6063, lng: -122.3315 },
    { lat: 47.6060, lng: -122.3318 }
  ],
  audio: {
    sourceType: "stream",  // | "oscillator" | "mp3" | "url"
    sourceUrl: "https://...",
    loop: true,
    volume: 0.8,
    // ... existing audio config
  },
  fadeZone: {
    width: 5.0,  // meters
    curve: "linear"  // | "easeIn" | "easeOut" | "easeInOut"
  },
  behavior: {
    // Future: timeline, triggers, etc.
  },
  overlapMode: "mix",  // | "opaque" - default is "mix"
  metadata: {
    createdAt: "...",
    updatedAt: "...",
    version: 1
  }
}
```

---

## Technical Implementation

### Point-in-Polygon Detection

Use **ray casting algorithm** for hit testing:

```javascript
function isPointInPolygon(lat, lng, polygon) {
  // Ray casting: count intersections with polygon edges
  // Odd = inside, Even = outside
}
```

**Optimization:**
- Bounding box pre-check before full polygon test
- Spatial index for multiple Areas (quadtree or simple grid)

### Fade Zone Calculation

```javascript
function calculateAreaVolume(listenerPos, area) {
  if (!isPointInPolygon(listenerPos, area.polygon)) {
    return 0;
  }
  
  const distanceToBoundary = distanceToNearestEdge(listenerPos, area.polygon);
  
  if (distanceToBoundary > area.fadeZone.width) {
    return 1.0;  // Full volume (deep inside)
  }
  
  // Interpolate volume based on distance into fade zone
  return mapRange(distanceToBoundary, 0, area.fadeZone.width, 0, 1);
}
```

### Overlap Crossfade

```javascript
function mixAreas(areas, listenerPos) {
  const activeAreas = areas
    .map(area => ({
      area,
      volume: calculateAreaVolume(listenerPos, area),
      priority: area.priority || 0,
      overlapMode: area.overlapMode || 'mix',
      order: area.order || 0  // placement order
    }))
    .filter(a => a.volume > 0);
  
  if (activeAreas.length === 0) return 0;
  if (activeAreas.length === 1) return activeAreas[0].volume;
  
  // Separate opaque and mix areas
  const opaqueAreas = activeAreas.filter(a => a.overlapMode === 'opaque');
  const mixAreas = activeAreas.filter(a => a.overlapMode === 'mix');
  
  // Opaque mode: only the highest-order (last placed) opaque Area plays
  if (opaqueAreas.length > 0) {
    const topOpaque = opaqueAreas.sort((a, b) => b.order - a.order)[0];
    return topOpaque.volume;  // Mask all others
  }
  
  // Mix mode: crossfade all mix Areas
  // Equal mixing for nested Areas (smaller inside larger)
  const total = mixAreas.reduce((sum, a) => sum + a.volume, 0);
  return Math.min(1.0, total);  // Or normalize: each.volume / total
}
```

### Direction Tracking

```javascript
// In position update loop
let lastPosition = null;
let heading = 0;
let speed = 0;

function updateListener(lat, lng) {
  if (lastPosition) {
    heading = calculateHeading(lastPosition, {lat, lng});
    speed = calculateSpeed(lastPosition, {lat, lng}, deltaTime);
  }
  lastPosition = {lat, lng};
}
```

---

## UI/UX Design

### Map Editor (Drawing Mode)
1. Click "Add Area" button
2. Click map to place vertices
3. Click first vertex (or double-click) to close polygon
4. Area appears with visual handles

### Map Editor (Edit Mode)
- **Select Area**: Click to select
- **Move Vertex**: Drag handle
- **Add Vertex**: Double-click edge
- **Delete Vertex**: Select vertex + Delete key
- **Delete Area**: Select + Delete key (or context menu)

### Player View
- Area boundary visible (optional, toggle in settings)
- Visual feedback when inside Area (highlight/glow)
- Debug overlay shows:
  - Current Area(s) active
  - Volume level
  - Distance to boundary

---

## Integration Points

| Existing System | Integration |
|-----------------|-------------|
| `map_editor.html` | Polygon drawing/editing UI |
| `spatial_audio.js` | Area volume calculation, no panning |
| `spatial_audio_app.js` | Area audio source management |
| `api-client.js` | Area CRUD operations |
| Lazy loading system | Area preload/dispose zones |
| Offline mode (SW) | Area audio caching |

---

## Testing Checklist

- [ ] Point-in-polygon detection (convex & concave shapes)
- [ ] Fade zone smoothness (entering/exiting)
- [ ] Overlap crossfade (2+ Areas)
- [ ] Direction tracking accuracy
- [ ] Polygon editing (add/move/delete vertices)
- [ ] All audio source types work
- [ ] Performance with many Areas (10+)
- [ ] Mobile GPS drift handling
- [ ] Offline mode compatibility

---

## Future Enhancements

- **Nested Areas**: Hole/punch-out support (donut shapes)
- **Dynamic Areas**: Time-based activation/deactivation
- **Area Triggers**: Enter/exit events for behaviors
- **Gradient Volumes**: Non-uniform volume within Area
- **3D Areas**: Altitude-based zones (multi-floor buildings)

---

## Related Documents

- `FEATURES.md` - Feature catalog
- `DISTANCE_ENVELOPE_BEHAVIOR.md` - Similar fade zone logic
- `LAZY_LOADING_DESIGN.md` - Zone-based audio management
- `map_editor.html` - Existing editor implementation

---

## Implementation Plan

**Strategy:** Incremental sessions that don't break existing code. Each session builds on the previous but is independently testable.

### Session 1: Data Model & Utilities (~1.5h)
**Goal:** Add Area model without touching existing waypoint code
- [ ] Create `api/models/Area.js` (mirror Waypoint.js structure)
- [ ] Create `api/repositories/AreaRepository.js` (polygon CRUD)
- [ ] Add `area` table migration SQL
- [ ] Create `GPSUtils.pointInPolygon()` helper in `spatial_audio.js`
- [ ] Create `GPSUtils.distanceToEdge()` helper
- [ ] **Test:** Unit tests for utilities, verify existing code unchanged

### Session 2: Area Storage & Sync (~1.5h)
**Goal:** Area persistence in SoundScape without breaking waypoint flow
- [ ] Add `areas` array to `SoundScape` class (`soundscape.js`)
- [ ] Add Area import/export in `SoundScape.toJSON()/fromJSON()`
- [ ] Add Area sync to `api-client.js` (`syncAreas()`, `saveArea()`, `deleteArea()`)
- [ ] **Offline Support:** Extend `OfflineDownloadManager.downloadSoundscape()` to include Area audio URLs
- [ ] **Test:** Export/import soundscape with Areas, verify waypoints still work, verify offline download includes Area audio

### Session 3: Area Audio Engine (~2.5h)
**Goal:** Area audio playback without affecting waypoint spatialization
- [ ] Create `AreaSoundSource` class in `spatial_audio.js` (no panning, volume-only)
- [ ] Add `AreaManager` in `spatial_audio_app.js` (lifecycle: create/start/stop/update)
- [ ] Implement `calculateAreaVolume()` with fade zone
- [ ] Implement `mixAreas()` with overlap modes (mix/opaque)
- [ ] Add direction tracking (heading, movement vector)
- [ ] **Test:** Area plays audio when inside, fades at boundary, waypoints still pan correctly

### Session 4: Map Editor - Drawing (~2h)
**Goal:** Draw polygons in editor without breaking waypoint placement
- [ ] Add "Add Area" button to editor UI (separate from "Add Waypoint")
- [ ] Implement drawing mode: click vertices, double-click to close
- [ ] Render polygon with Leaflet (`L.polygon()`)
- [ ] Store Area markers separate from waypoint markers
- [ ] **Test:** Draw Areas, verify waypoint creation still works

### Session 5: Map Editor - Editing (~2h)
**Goal:** Edit polygon vertices without affecting waypoint editing
- [ ] Add vertex handles (draggable markers)
- [ ] Implement drag-to-reshape
- [ ] Add vertex operations: add (double-click edge), delete (right-click)
- [ ] Add Area popup with config (volume, fade zone, overlap mode)
- [ ] **Test:** Edit Areas, verify waypoint editing unchanged

### Session 6: Player Integration (~1.5h)
**Goal:** Area playback in player without breaking existing lazy loading
- [ ] Integrate `AreaManager` into `MapAppShared` (or `MapPlayerApp`)
- [ ] Add Area lazy loading (preload/dispose zones like waypoints)
- [ ] Add Area visual feedback (highlight when inside)
- [ ] **Test:** Walk into Areas on phone, verify fade zones work, waypoints still lazy-load

### Session 7: Polish & Testing (~1h)
**Goal:** Final integration testing
- [ ] Test overlap scenarios (mix vs opaque modes)
- [ ] Test direction tracking accuracy
- [ ] Performance test with 10+ Areas
- [ ] Mobile GPS drift handling
- [ ] Offline mode compatibility
- [ ] **Test:** Full end-to-end on PC and phone

**Total Estimated Time:** ~12 hours

---

## Session Checkpoints

| Session | Existing Code Impact | Rollback Plan |
|---------|---------------------|---------------|
| 1: Data Model | None (new files only) | Delete new files |
| 2: Storage | `SoundScape` class (additive) | Comment out Area code |
| 3: Audio Engine | None (new classes) | Don't instantiate AreaManager |
| 4: Editor Drawing | None (separate button/mode) | Hide Area button |
| 5: Editor Editing | None (separate markers) | Disable Area editing |
| 6: Player | Lazy loading (parallel system) | Don't start AreaManager |
| 7: Polish | None | N/A |

---

**Created:** 2026-03-23  
**Last Updated:** 2026-03-23 (Added implementation plan)
